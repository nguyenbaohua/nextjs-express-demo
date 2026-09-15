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
 * Next.js tự lo phần truyền dữ liệu qua lại (giải thích đầy đủ cơ chế nằm ở đầu
 * file `features/todos/actions.ts`).
 *
 * Với phần đăng nhập, tính năng này đặc biệt hợp: mật khẩu đi thẳng từ form tới
 * code server mà không phải đi qua một đoạn JavaScript nào trong trình duyệt.
 * Không có `fetch` nào để ai đó chặn lại đọc, không có biến nào để một script lạ
 * lục lọi.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO ĐĂNG NHẬP PHẢI LÀ SERVER ACTION MÀ KHÔNG THỂ LÀ SERVER COMPONENT?
 * ----------------------------------------------------------------------------
 * Vì đăng nhập cần GHI COOKIE, và Next.js chỉ cho ghi cookie từ Server Action,
 * Route Handler, hoặc `proxy.ts`.
 *
 * Lý do rất vật lý: Server Component chạy trong lúc HTML đang được sinh ra và gửi
 * dần về trình duyệt. Mà `Set-Cookie` là một HTTP header, và header thì luôn phải
 * đi TRƯỚC nội dung. Tới lúc component render thì phần header đã gửi đi mất rồi —
 * không thể chèn thêm gì nữa.
 *
 * Đây không phải hạn chế Next.js tự đặt ra, mà là cách giao thức HTTP vận hành.
 * Hiểu được điều đó thì bạn không còn phải học thuộc "chỗ nào ghi được cookie" —
 * bạn tự suy ra được.
 */

import { redirect } from "next/navigation";
import * as api from "./api";
import { ApiError } from "@/shared/api/http";
import { ROUTES } from "@/shared/config/constants";
import { clearSession, getRefreshToken, saveSession } from "@/shared/lib/session";
import type { AuthFormState } from "./types";

/*
 * Đổi lỗi bất kỳ thành câu tiếng Việt để hiện lên form.
 *
 * `ApiError` mang theo thông báo do backend gửi về — đã được viết sẵn bằng tiếng
 * Việt trong `auth.service.ts`, nên hiển thị thẳng cho người dùng được. Lỗi thuộc
 * loại khác (mất mạng, backend chưa chạy) thì dùng câu chung chung.
 *
 * ⚠️ Cẩn thận với thói quen này trong dự án thật: hiển thị thẳng message từ
 * server chỉ an toàn khi bạn KIỂM SOÁT được mọi message server có thể trả về.
 * Nếu backend lỡ để lọt một thông báo kỹ thuật ("column users.password_hash does
 * not exist"), bạn vừa tiết lộ cấu trúc database cho người lạ.
 *
 * Ở đây thì an toàn, vì mọi message của backend đều do ta tự viết trong
 * `AppError`. Lỗi không lường trước rơi vào nhánh 500 và trả về câu chung chung.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Đã có lỗi xảy ra";
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
 * Thành công thì `redirect` sang trang đăng nhập, có kèm email trên URL để form
 * bên đó điền sẵn — người dùng đỡ phải gõ lại.
 *
 * Vì sao không tự đăng nhập luôn cho tiện? Hai lý do: luồng đơn giản hơn để học,
 * và quan trọng hơn — nó buộc người dùng gõ lại mật khẩu ngay lập tức, giúp họ
 * phát hiện sớm nếu vừa gõ nhầm thứ mình tưởng.
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
   * Đây là một trong số RẤT ÍT trường hợp mà kiểm tra ở frontend không phải là
   * bản sao thừa thãi của kiểm tra ở backend. Mọi luật khác (email hợp lệ, mật
   * khẩu đủ dài) đều phải được backend kiểm lại, vì `curl` không đi qua form của
   * bạn.
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
   *
   * `encodeURIComponent` để ký tự `+` hay `&` trong email không phá vỡ URL —
   * "a+b@gmail.com" là một địa chỉ hoàn toàn hợp lệ và khá phổ biến.
   */
  redirect(`${ROUTES.login}?registered=1&email=${encodeURIComponent(email)}`);
}

/**
 * Đăng nhập.
 *
 * Đây là hàm quan trọng nhất file. Ba việc, đúng thứ tự:
 *   1. Gọi backend đổi email + mật khẩu lấy cặp token
 *   2. Cất token vào cookie httpOnly
 *   3. Chuyển về trang người dùng định vào
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
     * Tới đây `session` đang giữ cả hai token trong bộ nhớ của SERVER Next.js.
     * Chúng chưa từng đi qua trình duyệt và cũng sẽ không bao giờ đi —
     * `saveSession` cất chúng vào cookie `httpOnly`, thứ mà JavaScript phía
     * client không đọc được. Xem `shared/lib/session.ts` để hiểu vì sao đó là
     * chỗ cất an toàn nhất.
     */
    await saveSession(session);
  } catch (err) {
    /*
     * Ở đây có một cám dỗ cần tránh: đừng ghi `console.log(password)` để gỡ lỗi.
     *
     * Log thường được thu thập về một hệ thống tập trung mà cả đội đọc được, và
     * được giữ hàng tháng. Mật khẩu lọt vào log là một sự cố bảo mật thật sự —
     * nhiều công ty rất lớn đã từng phải công khai xin lỗi vì đúng chuyện này.
     *
     * Muốn gỡ lỗi thì log `email` (không nhạy cảm) và mã lỗi. Chừng đó đủ để
     * lần ra vấn đề mà không tạo ra một vấn đề khác.
     */
    return { error: toErrorMessage(err) };
  }

  // Về đúng trang người dùng định vào lúc bị chặn (đã lọc ở `safeRedirectPath`).
  redirect(nextPath);
}

/**
 * Đăng xuất: báo backend xoá phiên, xoá cookie, rồi về trang đăng nhập.
 *
 * Hàm này nhận 0 tham số nên gắn thẳng vào `<form action={logoutAction}>` được,
 * không cần `useActionState`.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO GỌI BACKEND TRƯỚC RỒI MỚI XOÁ COOKIE?
 * ---------------------------------------------------------------------------
 * Vì cần refresh token để gọi, mà token đó nằm trong cookie. Xoá trước thì không
 * còn gì để gửi đi.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHỐI `try/catch` KHÔNG LÀM GÌ KHI LỖI?
 * ---------------------------------------------------------------------------
 * Vì đây là một trong số ít chỗ mà nuốt lỗi im lặng là ĐÚNG.
 *
 * Giả sử backend đang sập. Người dùng bấm "Đăng xuất". Bạn có hai lựa chọn:
 *
 *   a) Báo lỗi và GIỮ NGUYÊN phiên đăng nhập. Người dùng đang ở máy tính công
 *      cộng, muốn thoát ra, và bạn từ chối — vì một lý do chẳng liên quan gì tới
 *      họ. Đây là lựa chọn tệ.
 *
 *   b) Xoá cookie bằng mọi giá. Phiên ở phía database còn sót lại, nhưng trình
 *      duyệt này không còn giữ gì cả, và refresh token đằng nào cũng tự hết hạn
 *      sau 30 ngày.
 *
 * Ta chọn (b). Nguyên tắc rút ra: với những thao tác mà người dùng muốn "thoát
 * ra" hoặc "huỷ bỏ", hãy luôn ưu tiên làm cho bằng được phần bạn kiểm soát
 * được, thay vì chặn họ lại vì một phần bạn không kiểm soát được.
 */
export async function logoutAction() {
  const refreshToken = await getRefreshToken();

  if (refreshToken) {
    try {
      await api.logout(refreshToken);
    } catch {
      // Cố ý bỏ qua — lý do ở khối comment phía trên.
    }
  }

  await clearSession();
  redirect(ROUTES.login);
}
