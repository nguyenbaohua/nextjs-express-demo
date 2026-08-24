"use server";

/*
 * ============================================================================
 * SERVER ACTIONS CHO ĐĂNG KÝ / ĐĂNG NHẬP / ĐĂNG XUẤT
 * ============================================================================
 *
 * Dòng `"use server"` ở đầu file đánh dấu mọi hàm export ở đây là SERVER ACTION.
 *
 * Server Action là tính năng cho phép form trong trình duyệt gọi thẳng một hàm
 * chạy trên server, không cần bạn tự viết API endpoint và cũng không cần `fetch`.
 * Next.js tự lo phần truyền dữ liệu qua lại.
 *
 * Với phần đăng nhập, tính năng này đặc biệt hợp, vì mật khẩu đi thẳng từ form
 * tới code server mà không phải đi qua một đoạn JavaScript nào trong trình duyệt.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO ĐĂNG NHẬP PHẢI LÀ SERVER ACTION MÀ KHÔNG THỂ LÀ SERVER COMPONENT?
 * ----------------------------------------------------------------------------
 * Vì đăng nhập cần GHI COOKIE, và Next.js chỉ cho ghi cookie từ Server Action
 * hoặc Route Handler.
 *
 * Lý do rất vật lý: Server Component chạy trong lúc HTML đang được sinh ra và gửi
 * dần về trình duyệt. Mà `Set-Cookie` là một HTTP header, và header thì luôn phải
 * đi TRƯỚC nội dung. Tới lúc component render thì phần header đã gửi đi mất rồi —
 * không thể chèn thêm gì nữa. Đây không phải hạn chế Next.js tự đặt ra, mà là
 * cách giao thức HTTP vận hành.
 */

import { redirect } from "next/navigation";
import * as api from "./api";
import { clearSession, saveOAuthState, saveSession } from "./auth";
import { ROUTES } from "./constants";
import { createOAuthState, GOOGLE_LOGIN_ERROR_CODES, GOOGLE_REDIRECT_URI } from "./oauth";
import type { AuthFormState } from "./types";

/*
 * Đổi lỗi bất kỳ thành câu tiếng Việt để hiện lên form.
 *
 * `api.ApiError` mang theo thông báo do backend gửi về — đã được dịch sẵn sang
 * tiếng Việt trong `auth.service.ts`, nên hiển thị thẳng cho người dùng được.
 * Lỗi thuộc loại khác (mất mạng, backend chưa chạy) thì dùng câu chung chung.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof api.ApiError ? err.message : "Đã có lỗi xảy ra";
}

/*
 * ----------------------------------------------------------------------------
 * CHỐNG LỖ HỔNG "OPEN REDIRECT"
 * ----------------------------------------------------------------------------
 *
 * Sau khi đăng nhập, ta muốn đưa người dùng về đúng trang họ định vào lúc bị
 * chặn. Đường dẫn đó đến từ tham số `?next=` trên URL — tức là DỮ LIỆU DO NGƯỜI
 * DÙNG CUNG CẤP, và không được tin.
 *
 * Kịch bản tấn công nếu tin nó:
 *
 *   Kẻ xấu gửi cho nạn nhân link:
 *       https://app-cua-ban.com/login?next=https://app-cua-ban.evil.com
 *
 *   Nạn nhân nhìn tên miền đầu, thấy đúng trang quen thuộc, yên tâm đăng nhập.
 *   Xong xuôi thì bị ném sang trang giả mạo trông y hệt, kèm dòng "phiên đăng
 *   nhập hết hạn, vui lòng nhập lại mật khẩu". Và họ nhập.
 *
 *   Sức mạnh của đòn này nằm ở chỗ link ban đầu THẬT SỰ trỏ tới trang thật —
 *   nên mọi lời khuyên kiểu "hãy kiểm tra tên miền trước khi bấm" đều vô dụng.
 *
 * Cách chặn: chỉ chấp nhận đường dẫn NỘI BỘ. Muốn vậy phải qua đủ hai điều kiện:
 *
 *   1. Bắt đầu bằng "/"     → loại "https://evil.com" và "javascript:alert(1)"
 *   2. KHÔNG bắt đầu "//"   → điều kiện tinh vi và hay bị bỏ sót nhất
 *
 * Vì sao "//" lại nguy hiểm? Vì "//evil.com" là một URL hợp lệ theo chuẩn, gọi là
 * "protocol-relative URL": trình duyệt hiểu là "sang evil.com, giữ nguyên giao
 * thức http hay https đang dùng". Nó bắt đầu bằng "/" nên lọt qua điều kiện 1 một
 * cách hoàn hảo. Rất nhiều bộ lọc chỉ kiểm tra điều kiện 1 và dính đúng chỗ này.
 */
function safeRedirectPath(raw: string): string {
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  // Bất cứ thứ gì đáng ngờ đều bị thay bằng trang chủ — mặc định an toàn.
  return ROUTES.home;
}

/**
 * Đăng ký tài khoản mới.
 *
 * Thành công thì `redirect` sang trang xác thực, có kèm email trên URL để form
 * bên đó điền sẵn — người dùng đỡ phải gõ lại.
 */
export async function registerAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!email || !password) {
    return { error: "Vui lòng nhập đầy đủ email và mật khẩu" };
  }

  /*
   * Kiểm tra hai ô mật khẩu khớp nhau — việc này CHỈ frontend làm được.
   *
   * Backend không hề biết có ô "nhập lại mật khẩu"; với nó chỉ có một mật khẩu
   * duy nhất. Ô thứ hai tồn tại thuần tuý để người dùng không tự khoá mình ra
   * ngoài vì một lỗi gõ phím — và vì thế nó thuộc về tầng giao diện.
   *
   * Đây là một trong số ít trường hợp mà kiểm tra ở frontend KHÔNG phải là bản
   * sao thừa thãi của kiểm tra ở backend.
   */
  if (password !== confirmPassword) {
    return { error: "Mật khẩu nhập lại không khớp" };
  }

  try {
    await api.register(email, password);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  /*
   * ⚠️ `redirect()` phải gọi NGOÀI khối try/catch.
   *
   * Đây là một cái bẫy rất hay gặp trong Next.js: `redirect()` hoạt động bằng
   * cách NÉM RA một exception đặc biệt để Next.js bắt lấy và biến thành lệnh
   * chuyển trang. Nếu gọi nó bên trong `try`, khối `catch` của bạn sẽ tóm nhầm
   * exception đó và chuyển hướng lặng lẽ không xảy ra.
   *
   * Triệu chứng khi mắc lỗi này: bấm nút, không có lỗi gì cả, nhưng trang cũng
   * không chuyển đi đâu. Cực kỳ khó đoán nếu chưa biết trước.
   */
  redirect(`${ROUTES.confirm}?email=${encodeURIComponent(email)}`);
}

/**
 * Xác thực tài khoản bằng mã 6 số.
 */
export async function confirmAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!email || !code) {
    return { error: "Vui lòng nhập email và mã xác thực" };
  }

  try {
    await api.confirmRegistration(email, code);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  redirect(`${ROUTES.login}?confirmed=1&email=${encodeURIComponent(email)}`);
}

/**
 * Gửi lại mã xác thực.
 *
 * Action này KHÔNG chuyển trang — người dùng vẫn đang đứng ở form nhập mã. Nó
 * trả về `{ success: true, message }` để form hiện một dòng báo tin ngay tại chỗ.
 * Đây là lý do `AuthFormState` cần nhánh "thành công" chứ không chỉ nhánh lỗi.
 */
export async function resendCodeAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Vui lòng nhập email" };
  }

  try {
    await api.resendCode(email);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  return { success: true, message: "Đã gửi lại mã. Kiểm tra hộp thư (cả mục Spam)." };
}

/**
 * Đăng nhập.
 *
 * Đây là hàm quan trọng nhất file. Ba việc, đúng thứ tự:
 *   1. Gọi backend đổi email + mật khẩu lấy token
 *   2. Cất token vào cookie httpOnly
 *   3. Chuyển về trang chủ
 */
export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeRedirectPath(String(formData.get("next") ?? ""));

  if (!email || !password) {
    return { error: "Vui lòng nhập đầy đủ email và mật khẩu" };
  }

  try {
    const session = await api.login(email, password);
    /*
     * Tới đây `session` đang giữ cả ba token trong bộ nhớ của SERVER Next.js.
     * Nó chưa từng đi qua trình duyệt và cũng sẽ không bao giờ đi — `saveSession`
     * cất chúng vào cookie `httpOnly`, thứ mà JavaScript phía client không đọc
     * được. Xem `auth.ts` để hiểu vì sao đó là chỗ cất an toàn nhất.
     */
    await saveSession(session);
  } catch (err) {
    /*
     * Ở đây có một cám dỗ cần tránh: đừng ghi `console.log(password)` để gỡ lỗi.
     * Log thường được thu thập và lưu trữ nhiều tháng, và mật khẩu lọt vào log là
     * một sự cố bảo mật thật sự — nhiều công ty lớn đã từng dính.
     */
    return { error: toErrorMessage(err) };
  }

  // Về đúng trang người dùng định vào lúc bị chặn (đã lọc ở `safeRedirectPath`).
  redirect(nextPath);
}

/**
 * Bắt đầu luồng đăng nhập bằng Google — NỬA ĐẦU của câu chuyện.
 *
 * ----------------------------------------------------------------------------
 * ĐIỀU LẠ NHẤT CỦA HÀM NÀY: NÓ KHÔNG ĐĂNG NHẬP AI CẢ
 * ----------------------------------------------------------------------------
 *
 * Đọc tên hàm dễ tưởng nó làm việc đăng nhập. Không hề. Nó chỉ chuẩn bị hành lý
 * rồi tiễn người dùng ra cửa:
 *
 *   1. Sinh một chuỗi `state` ngẫu nhiên
 *   2. Cất `state` + nơi cần quay về vào cookie tạm
 *   3. Hỏi backend "cho tôi xin URL Hosted UI"
 *   4. `redirect()` — người dùng rời khỏi website của bạn
 *
 * Việc đăng nhập thật sự xảy ra ở NỬA SAU, tại Route Handler
 * `app/api/auth/callback/google/route.ts`, vài chục giây sau, khi người dùng
 * quay về. Hai nửa đó là hai request HTTP hoàn toàn tách biệt, không dùng chung
 * biến nào, không dùng chung bộ nhớ nào.
 *
 * Đây chính là điểm khiến OAuth khó hình dung lúc mới học: một "hành động" của
 * người dùng bị cắt làm đôi bởi một chuyến đi vòng qua hai website khác. Nếu bạn
 * thấy rối, hãy nhớ: KHÔNG có gì nối hai nửa đó ngoài cái cookie ở bước 2.
 *
 * So sánh cho rõ:
 *
 *   `loginAction` (email + mật khẩu)  — một request, xong việc ngay trong hàm.
 *   `loginWithGoogleAction`           — mở đầu một hành trình, kết thúc ở nơi khác.
 */
export async function loginWithGoogleAction(formData: FormData) {
  /*
   * Lọc `next` bằng đúng hàm `safeRedirectPath` mà `loginAction` dùng.
   *
   * Vì sao lọc NGAY BÂY GIỜ mà không đợi lúc quay về?
   *   Vì lọc sớm thì thứ được cất vào cookie đã là dữ liệu SẠCH. Nửa sau của
   *   luồng cứ thế dùng, không phải kiểm lại và cũng không có cơ hội quên kiểm.
   *
   * Nguyên tắc: LÀM SẠCH DỮ LIỆU NGAY TẠI CỬA VÀO, đừng để dữ liệu bẩn đi sâu
   * vào trong hệ thống rồi mới xử lý — vì càng đi sâu càng nhiều nhánh, và chỉ
   * cần một nhánh quên kiểm là thủng.
   */
  const nextPath = safeRedirectPath(String(formData.get("next") ?? ""));

  /*
   * Sinh `state` và cất vào cookie TRƯỚC KHI gọi backend.
   *
   * Thứ tự này quan trọng: nếu gọi backend trước rồi mới ghi cookie, mà giữa hai
   * bước đó có lỗi xảy ra, ta sẽ chuyển hướng người dùng đi với một `state` mà
   * chính ta không nhớ — họ quay về sẽ bị từ chối một cách bí ẩn.
   *
   * Ghi cookie trước thì tình huống xấu nhất chỉ là một cookie thừa nằm đó 10
   * phút rồi tự hết hạn. Vô hại.
   */
  const state = createOAuthState();
  await saveOAuthState({ state, next: nextPath });

  let authorizeUrl: string;
  try {
    const result = await api.getGoogleAuthorizeUrl(GOOGLE_REDIRECT_URI, state);
    authorizeUrl = result.url;
  } catch (err) {
    /*
     * Thất bại ở đây gần như luôn là lỗi CẤU HÌNH chứ không phải lỗi người dùng:
     * quên điền `COGNITO_DOMAIN`, hoặc backend chưa chạy. Backend đã soạn sẵn câu
     * tiếng Việt chỉ rõ nguyên nhân, nên ta hiện thẳng câu đó lên form.
     *
     * Hàm này KHÔNG dùng `useActionState` (nó chuyển hướng chứ không trả state về
     * form), nên đường duy nhất để báo lỗi là đưa người dùng về /login kèm một mã
     * lỗi trên URL. Xem `oauth.ts` để hiểu vì sao truyền MÃ chứ không truyền câu.
     */
    console.error("[google-login] Không lấy được URL đăng nhập:", err);
    redirect(`${ROUTES.login}?error=${GOOGLE_LOGIN_ERROR_CODES.failed}`);
  }

  /*
   * Tạm biệt. Từ giây này người dùng đang ở trên website của Amazon, rồi của
   * Google. App của ta không biết chuyện gì đang xảy ra với họ cho tới khi họ
   * quay về `/api/auth/callback/google`.
   *
   * ⚠️ Nhắc lại cái bẫy kinh điển đã nói ở đầu file: `redirect()` phải nằm NGOÀI
   * try/catch, vì nó hoạt động bằng cách ném ra một exception đặc biệt. Gọi nó
   * bên trong `try` thì `catch` sẽ nuốt mất và chẳng có chuyện chuyển trang nào
   * xảy ra cả.
   */
  redirect(authorizeUrl);
}

/**
 * Đăng xuất: xoá cookie rồi về trang đăng nhập.
 *
 * Hàm này nhận 0 tham số nên gắn thẳng vào `<form action={logoutAction}>` được,
 * không cần `useActionState`.
 *
 * Nhắc lại điều đã nói trong `auth.ts`: xoá cookie KHÔNG làm token mất hiệu lực
 * bên phía Cognito — nó vẫn hợp lệ cho tới khi hết một giờ. Với ứng dụng này thì
 * chấp nhận được; với ứng dụng nhạy cảm hơn thì cần gọi thêm `GlobalSignOut`.
 */
export async function logoutAction() {
  await clearSession();
  redirect(ROUTES.login);
}
