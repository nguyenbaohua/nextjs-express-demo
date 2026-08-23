/*
 * ============================================================================
 * PHIÊN ĐĂNG NHẬP — cất token vào đâu và lấy ra thế nào
 * ============================================================================
 *
 * File này chỉ chạy trên SERVER Next.js. Nó là nơi duy nhất đọc/ghi các cookie
 * chứa token.
 *
 * ----------------------------------------------------------------------------
 * CÂU HỎI LỚN: CẤT TOKEN Ở ĐÂU?
 * ----------------------------------------------------------------------------
 *
 * Có ba chỗ thường được nhắc tới, và chỉ một chỗ là đúng:
 *
 *   ❌ localStorage
 *      Rất phổ biến trong các bài hướng dẫn trên mạng, và rất tệ. JavaScript đọc
 *      được localStorage, nên chỉ cần MỘT đoạn script lạ chạy được trên trang của
 *      bạn là token bị lấy sạch. Script lạ đó có thể đến từ một thư viện npm bị
 *      cài mã độc, một quảng cáo nhúng, hay một lỗ hổng XSS trong chính code của
 *      bạn. Đây gọi là tấn công XSS, và localStorage không có phòng tuyến nào cả.
 *
 *   ❌ Biến trong bộ nhớ (React state)
 *      An toàn trước XSS hơn, nhưng mất sạch mỗi lần bấm F5. Người dùng sẽ phải
 *      đăng nhập lại mỗi lần tải lại trang.
 *
 *   ✅ Cookie httpOnly  ← ta chọn cách này
 *      Cờ `httpOnly` khiến JavaScript trong trình duyệt KHÔNG đọc được cookie —
 *      `document.cookie` không nhìn thấy nó. Chỉ trình duyệt và server trao đổi
 *      với nhau. Nên dù trang có dính XSS, kẻ tấn công cũng không lấy được token
 *      mang đi chỗ khác dùng.
 *
 * Cách này khả thi là nhờ kiến trúc sẵn có của dự án: trình duyệt chỉ nói chuyện
 * với server Next.js, và chính server Next.js mới gọi Express. Token nằm trong
 * cookie mà chỉ server đọc được, nên code chạy trong trình duyệt không bao giờ
 * cần — và không bao giờ được — chạm tới nó.
 *
 * ----------------------------------------------------------------------------
 * BA THUỘC TÍNH BẢO MẬT CỦA COOKIE
 * ----------------------------------------------------------------------------
 *
 *   httpOnly: true   → JavaScript không đọc được. Chống XSS.
 *
 *   sameSite: "lax"  → Trình duyệt không gửi cookie này kèm request xuất phát từ
 *                      website khác. Chống CSRF — kiểu tấn công mà một trang web
 *                      độc hại lén gửi request tới app của bạn, mượn danh phiên
 *                      đăng nhập đang mở của nạn nhân. "lax" vẫn cho phép gửi
 *                      cookie khi người dùng BẤM LINK từ trang khác sang, nên
 *                      không làm hỏng trải nghiệm thông thường.
 *
 *   secure: true     → Chỉ gửi cookie qua HTTPS. Bật ở production, TẮT ở máy dev
 *                      (vì localhost chạy HTTP, bật lên thì trình duyệt sẽ không
 *                      bao giờ gửi cookie và bạn sẽ ngồi gỡ lỗi rất lâu mà không
 *                      hiểu vì sao vừa đăng nhập xong đã bị đá ra).
 */

import { cookies } from "next/headers";
import {
  COOKIE,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
} from "./constants";
import type { AuthSession, SessionUser } from "./types";

/*
 * Thuộc tính chung cho cả ba cookie.
 *
 * `secure` bật tự động theo môi trường: `NODE_ENV` là "production" khi chạy
 * `next build && next start`, và là "development" khi chạy `next dev`. Nhờ vậy
 * bạn không phải nhớ bật/tắt bằng tay khi triển khai — và đó chính là điểm mấu
 * chốt, vì thứ phải nhớ bằng tay là thứ sẽ có ngày bị quên.
 */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  /*
   * `path: "/"` cho phép cookie được gửi kèm ở MỌI đường dẫn của site.
   * Không đặt thì trình duyệt lấy path của trang đã tạo ra cookie (ví dụ
   * "/login"), và cookie sẽ không được gửi khi người dùng ở trang chủ.
   */
  path: "/",
} as const;

/**
 * Lưu phiên đăng nhập vào cookie sau khi đăng nhập thành công.
 *
 * ⚠️ Chỉ gọi được từ Server Action hoặc Route Handler. Next.js KHÔNG cho ghi
 * cookie từ Server Component, vì lúc component render thì phần header của HTTP
 * response đã được gửi đi rồi — không thể thêm `Set-Cookie` vào nữa.
 */
export async function saveSession(session: AuthSession) {
  const store = await cookies();

  /*
   * HẠN CỦA COOKIE ACCESS TOKEN CHÍNH LÀ ĐỒNG HỒ ĐẾM NGƯỢC CỦA TA.
   *
   * Đây là mẹo đáng chú ý nhất trong file: thay vì lưu thêm một cookie kiểu
   * `expires_at` rồi tự so sánh thời gian ở khắp nơi, ta để hạn cookie trùng với
   * hạn token. Trình duyệt tự động xoá cookie khi hết hạn, nên câu hỏi "token còn
   * sống không?" trở thành "cookie còn đó không?" — một phép kiểm tra đơn giản,
   * không cần đọc đồng hồ, không sợ lệch múi giờ.
   *
   * Trừ đi `TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS` để cookie chết trước token một
   * phút (xem giải thích trong `constants.ts`).
   */
  const accessTokenMaxAge = Math.max(
    session.expiresIn - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
    /*
     * `Math.max(..., 1)` phòng trường hợp Cognito trả về `expiresIn` nhỏ hơn cả
     * phần trừ hao. Nếu để `maxAge` ra số âm, trình duyệt hiểu là "xoá cookie
     * ngay lập tức" và người dùng đăng nhập xong lại bị đá ra tức thì.
     */
    1,
  );

  store.set(COOKIE.accessToken, session.accessToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: accessTokenMaxAge,
  });

  store.set(COOKIE.refreshToken, session.refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });

  /*
   * Cookie thứ ba giữ thông tin hiển thị: email, sub, username.
   *
   * Vì sao lưu riêng thay vì mỗi lần cần lại giải mã ID token?
   *
   *   1. Giải mã JWT đúng cách thì phải kiểm chữ ký, mà kiểm chữ ký thì cần tải
   *      khoá công khai — việc đó thuộc về backend, không nên làm ở frontend.
   *   2. Đọc một chuỗi JSON nhỏ nhanh hơn nhiều so với xử lý JWT.
   *   3. `username` là thứ BẮT BUỘC phải có lúc gia hạn token (xem lời giải thích
   *      dài trong `backend/src/services/auth.service.ts`). Giữ sẵn ở đây thì
   *      `proxy.ts` lấy ra dùng được ngay.
   *
   * Cookie này cũng để `httpOnly`. Không phải vì email là bí mật, mà vì đơn giản
   * là frontend không có nhu cầu đọc nó bằng JavaScript — mọi trang hiển thị email
   * đều là Server Component. Không mở cái gì mình không cần dùng, đó là nguyên
   * tắc "đặc quyền tối thiểu".
   */
  store.set(COOKIE.user, JSON.stringify(session.user), {
    ...BASE_COOKIE_OPTIONS,
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

/**
 * Xoá phiên đăng nhập — dùng cho nút Đăng xuất.
 *
 * ----------------------------------------------------------------------------
 * MỘT SỰ THẬT VỀ "ĐĂNG XUẤT" MÀ ÍT NGƯỜI NÓI RÕ
 * ----------------------------------------------------------------------------
 * Xoá cookie KHÔNG làm token hết hiệu lực. Access token vẫn hợp lệ với Cognito
 * cho tới khi hết một giờ của nó. Nếu ai đó đã kịp sao chép token ra ngoài trước
 * đó, họ vẫn dùng được cho tới lúc đó.
 *
 * Đây là bản chất của JWT: nó "không trạng thái" (stateless). Backend kiểm token
 * bằng chữ ký chứ không tra cứu vào một danh sách phiên nào, nên cũng không có
 * danh sách nào để gạch tên. Đổi lại là tốc độ và khả năng chịu tải — chính là
 * lý do ta chọn cách này ngay từ đầu.
 *
 * Muốn thu hồi ngay lập tức thì phải dùng `GlobalSignOut` của Cognito (nó vô
 * hiệu hoá refresh token và các phiên), hoặc tự giữ một danh sách đen token. Cả
 * hai đều đánh đổi bằng việc thêm trạng thái và thêm phức tạp. Với ứng dụng todo
 * này, đánh đổi đó không đáng — nhưng với ứng dụng ngân hàng thì lại rất đáng.
 */
export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE.accessToken);
  store.delete(COOKIE.refreshToken);
  store.delete(COOKIE.user);
}

/**
 * Lấy access token để gắn vào header khi gọi API. Trả về `null` nếu chưa đăng
 * nhập hoặc token đã hết hạn (cookie tự biến mất).
 */
export async function getAccessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE.accessToken)?.value ?? null;
}

/**
 * Lấy thông tin người dùng để hiển thị lên giao diện.
 *
 * `try/catch` quanh `JSON.parse` không phải là thừa. Cookie là dữ liệu ĐẾN TỪ
 * TRÌNH DUYỆT, mà người dùng thì hoàn toàn có thể mở DevTools sửa nội dung cookie
 * thành chuỗi bậy bạ. Không bắt lỗi thì `JSON.parse` ném exception và cả trang
 * sập với màn hình lỗi 500 — chỉ vì một cookie hỏng.
 *
 * Trả `null` thay vì để nổ nghĩa là: cookie hỏng được coi như chưa đăng nhập, và
 * `proxy.ts` sẽ nhẹ nhàng đưa người dùng về trang đăng nhập. Hỏng thì hỏng êm.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE.user)?.value;

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
