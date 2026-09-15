/*
 * ============================================================================
 * PHIÊN ĐĂNG NHẬP — cất token vào đâu và lấy ra thế nào
 * ============================================================================
 *
 * File này chỉ chạy trên SERVER Next.js. Nó là nơi DUY NHẤT đọc/ghi các cookie
 * chứa token.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO FILE NÀY Ở `shared/lib/` MÀ KHÔNG Ở `features/auth/`?
 * ----------------------------------------------------------------------------
 *
 * Câu hỏi rất đáng đặt ra, vì nhìn qua thì nó rõ ràng thuộc về nghiệp vụ "auth".
 *
 * Lý do nằm ở CHIỀU PHỤ THUỘC. `shared/api/http.ts` cần đọc access token để gắn
 * vào mỗi request — mà `http.ts` là hạ tầng dùng chung cho MỌI feature.
 *
 * Nếu để file này trong `features/auth/`, ta sẽ có `shared/ → features/auth/`,
 * đúng cái chiều mà `shared/config/constants.ts` đã giải thích là phải tránh:
 * gỡ feature auth ra thì hạ tầng gãy, và mọi feature khác gãy theo.
 *
 * Cách phân định cho rõ, và đây là ranh giới đáng nhớ:
 *
 *     shared/lib/session.ts      — CƠ CHẾ. "Token cất vào cookie ra sao"
 *     features/auth/actions.ts   — NGHIỆP VỤ. "Đăng nhập, đăng ký, đăng xuất"
 *
 * Cơ chế thì trung lập và ai cũng dùng được; nghiệp vụ thì thuộc về một feature.
 * Khi phân vân một file nên nằm đâu, hãy hỏi: "nếu xoá feature này đi, file đó
 * còn có ý nghĩa không?". Còn → `shared/`. Không → `features/`.
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
 * Một ứng dụng React thuần (chạy hoàn toàn trong trình duyệt) KHÔNG có lựa chọn
 * này, vì không có tầng server nào để giấu token. Đó là một lợi thế kiến trúc
 * cụ thể mà Next.js đem lại, chứ không phải chuyện sở thích.
 */

import { cookies } from "next/headers";
import {
  COOKIE,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
} from "@/shared/config/constants";

/**
 * Hình dạng phiên đăng nhập mà backend trả về sau `/login` và `/refresh`.
 *
 * Đặt ở đây (chứ không ở `features/auth/types.ts`) vì `saveSession` cần tới nó,
 * và đúng theo luật chiều phụ thuộc: `shared/` không được import từ `features/`.
 */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  /** Số GIÂY access token còn sống (backend đặt là 3600 = 1 giờ). */
  expiresIn: number;
  user: SessionUser;
};

/** Thông tin người dùng đủ để hiển thị lên giao diện. */
export type SessionUser = {
  /** `User.id` trong database backend — chính là giá trị ở cột `Todo.userId`. */
  id: string;
  /** Email, dùng để hiển thị "Đang đăng nhập: ...". */
  email: string;
};

/*
 * Thuộc tính chung cho cả ba cookie.
 *
 * `httpOnly: true`  — JavaScript trong trình duyệt không đọc được (lý do ở trên).
 *
 * `sameSite: "lax"` — trình duyệt không gửi cookie này kèm theo request xuất phát
 *                     từ website khác. Đây là lá chắn chống CSRF: nếu một trang
 *                     độc hại tạo form POST nhắm vào app của bạn, cookie phiên
 *                     sẽ không đi kèm, nên request đó không mang danh tính ai cả.
 *                     "lax" (thay vì "strict") vẫn cho cookie đi kèm khi người
 *                     dùng BẤM VÀO LINK từ nơi khác — cần thiết để link chia sẻ
 *                     qua chat hay email không đưa họ tới một trang "chưa đăng
 *                     nhập" một cách khó hiểu.
 *
 * `secure`          — chỉ gửi cookie qua HTTPS. Bật tự động theo môi trường:
 *                     `NODE_ENV` là "production" khi chạy `next build && next
 *                     start`, và "development" khi chạy `next dev`. Nhờ vậy bạn
 *                     không phải nhớ bật/tắt bằng tay khi triển khai — và đó
 *                     chính là điểm mấu chốt, vì thứ phải nhớ bằng tay là thứ sẽ
 *                     có ngày bị quên.
 *
 * `path: "/"`       — cho phép cookie được gửi kèm ở MỌI đường dẫn của site.
 *                     Không đặt thì trình duyệt lấy path của trang đã tạo ra
 *                     cookie (ví dụ "/login"), và cookie sẽ không được gửi khi
 *                     người dùng ở trang chủ.
 */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/**
 * Lưu phiên đăng nhập vào cookie sau khi đăng nhập (hoặc gia hạn) thành công.
 *
 * ⚠️ Chỉ gọi được từ Server Action hoặc Route Handler. Next.js KHÔNG cho ghi
 * cookie từ Server Component, vì lúc component render thì phần header của HTTP
 * response đã được gửi đi rồi — không thể thêm `Set-Cookie` vào nữa. Đây là
 * cách HTTP vận hành, không phải hạn chế Next.js tự đặt ra.
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
   * không cần đọc đồng hồ, không sợ lệch múi giờ, không có chỗ nào để viết sai.
   *
   * Nguyên tắc chung đáng học từ đây: hãy tìm cách BIẾN MỘT PHÉP TÍNH THÀNH MỘT
   * SỰ THẬT CÓ SẴN. Code không viết ra thì không thể có bug.
   *
   * Trừ đi `TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS` để cookie chết trước token một
   * phút (xem giải thích trong `shared/config/constants.ts`).
   */
  const accessTokenMaxAge = Math.max(
    session.expiresIn - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS,
    /*
     * `Math.max(..., 1)` phòng trường hợp backend trả về `expiresIn` nhỏ hơn cả
     * phần trừ hao. Nếu để `maxAge` ra số âm, trình duyệt hiểu là "xoá cookie
     * ngay lập tức" và người dùng đăng nhập xong lại bị đá ra tức thì — một bug
     * trông rất bí ẩn nếu bạn không biết quy tắc đó.
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
   * Cookie thứ ba giữ thông tin hiển thị: id và email.
   *
   * Vì sao lưu riêng thay vì mỗi lần cần lại giải mã access token?
   *
   *   1. Giải mã JWT đúng cách thì phải kiểm chữ ký, mà khoá ký (`JWT_SECRET`)
   *      chỉ backend mới có — frontend không được và không nên biết nó.
   *   2. Đọc một chuỗi JSON nhỏ nhanh hơn nhiều so với xử lý JWT.
   *   3. Access token chết sau một giờ, còn cookie này sống 30 ngày. Nhờ vậy
   *      trong lúc proxy đang gia hạn, giao diện vẫn biết người dùng là ai.
   *
   * Cookie này cũng để `httpOnly`. Không phải vì email là bí mật, mà vì đơn giản
   * là frontend không có nhu cầu đọc nó bằng JavaScript — mọi chỗ hiển thị email
   * đều là Server Component. Không mở cái gì mình không cần dùng, đó là nguyên
   * tắc "đặc quyền tối thiểu" (least privilege).
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
 * Xoá cookie KHÔNG làm access token hết hiệu lực. Nó vẫn là một JWT có chữ ký
 * hợp lệ cho tới khi hết một giờ của nó. Nếu ai đó đã kịp sao chép token ra
 * ngoài trước đó, họ vẫn dùng được cho tới lúc đó.
 *
 * Đây là bản chất của JWT: nó "không trạng thái" (stateless). Backend kiểm token
 * bằng chữ ký chứ không tra cứu vào một danh sách phiên nào, nên cũng không có
 * danh sách nào để gạch tên. Đổi lại là tốc độ — chính là lý do ta chọn JWT cho
 * access token ngay từ đầu.
 *
 * Nhưng phần REFRESH token thì KHÁC, và đó là lý do `logoutAction` không chỉ
 * xoá cookie mà còn gọi `POST /api/auth/logout`: refresh token được lưu trong
 * bảng `Session` của database, nên xoá hàng đó là thu hồi được thật. Sau một
 * giờ, khi access token chết, người dùng không còn cách nào gia hạn nữa.
 *
 * Nói cách khác: đăng xuất có hiệu lực NGAY với trình duyệt (cookie mất), và
 * hiệu lực HOÀN TOÀN sau tối đa một giờ (không gia hạn được nữa). Với ứng dụng
 * todo thì đủ; với ứng dụng ngân hàng thì phải rút access token xuống vài phút.
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
 * Lấy refresh token — dùng khi đăng xuất, để báo backend xoá phiên.
 */
export async function getRefreshToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE.refreshToken)?.value ?? null;
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
 *
 * ⚠️ Lưu ý về mức độ tin cậy: đừng dùng dữ liệu từ cookie này cho bất cứ quyết
 * định nào quan trọng. Người dùng sửa được `email` trong đó thành bất cứ thứ gì.
 * Nó CHỈ để hiển thị. Danh tính thật luôn được backend đọc lại từ chữ ký của
 * access token ở mỗi request — xem `backend/src/middlewares/requireAuth.ts`.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const raw = store.get(COOKIE.user)?.value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionUser;

    /*
     * Kiểm cả HÌNH DẠNG chứ không chỉ "parse được".
     *
     * `JSON.parse('"xin chao"')` chạy ngon lành và trả về một chuỗi — nhưng chuỗi
     * đó không có `.email`, và giao diện sẽ render ra `undefined`.
     *
     * Bài học: `JSON.parse` chỉ đảm bảo CÚ PHÁP hợp lệ, không đảm bảo hình dạng
     * dữ liệu. Ở mọi ranh giới không đáng tin, phải kiểm cả hai.
     */
    if (typeof parsed?.id !== "string" || typeof parsed?.email !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
