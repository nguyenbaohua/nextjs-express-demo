/*
 * ============================================================================
 * HẰNG SỐ DÙNG CHUNG
 * ============================================================================
 *
 * Vì sao không nhét mọi thứ vào .env?
 *
 * Quy ước của dự án này (xem CLAUDE.md ở thư mục gốc): `.env` chỉ giữ những giá
 * trị THỰC SỰ khác nhau giữa các môi trường (dev / staging / production) hoặc là
 * bí mật. Còn những thứ cố định như đường dẫn route thì để trong file hằng số,
 * vì như vậy TypeScript kiểm tra được cho bạn, còn biến môi trường thì không.
 */

/**
 * Dùng khi biến môi trường `API_BASE_URL` không được đặt.
 *
 * Có giá trị mặc định để người mới clone repo về chạy được ngay mà chưa cần tạo
 * file `.env.local`. Xem cách dùng ở `api.ts`.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

/**
 * Gom mọi đường dẫn của app vào một chỗ.
 *
 * Trong Next.js, route được sinh ra từ CẤU TRÚC THƯ MỤC (xem app/page.tsx và
 * app/todos/[id]/page.tsx). Nghĩa là URL "/todos/5" tồn tại chỉ vì có thư mục
 * `app/todos/[id]/`. Không có file cấu hình route nào cả.
 *
 * Nhược điểm: nếu bạn đổi tên thư mục, mọi chuỗi "/todos/..." rải rác trong code
 * sẽ hỏng âm thầm. Gom vào đây thì chỉ phải sửa một chỗ.
 *
 * `as const` bảo TypeScript coi object này là bất biến, giúp gợi ý code chính xác hơn.
 */
export const ROUTES = {
  home: "/",
  todoDetail: (id: number | string) => `/todos/${id}`,
  login: "/login",
  register: "/register",
  confirm: "/confirm",
  /**
   * Nơi Cognito trả người dùng về sau khi đăng nhập Google xong.
   *
   * Khác mọi route phía trên ở một điểm căn bản: đây KHÔNG phải một trang. Không
   * có file `page.tsx` nào ứng với nó, và mở bằng tay thì chẳng thấy gì cả. Nó là
   * một ROUTE HANDLER (file `app/api/auth/callback/google/route.ts`) — một
   * endpoint HTTP thuần, nhận `code` rồi chuyển hướng đi tiếp.
   *
   * ⚠️ Chuỗi này phải TRÙNG TỪNG KÝ TỰ với "Allowed callback URLs" khai trong AWS
   * Console. Sửa ở đây thì nhớ sửa cả bên đó, nếu không sẽ dính lỗi
   * `redirect_mismatch`.
   */
  googleCallback: "/api/auth/callback/google",
} as const;

/**
 * Những trang KHÔNG cần đăng nhập.
 *
 * `proxy.ts` dùng danh sách này để quyết định cho đi tiếp hay đá về trang đăng
 * nhập. Đặt ở đây thay vì viết thẳng trong proxy vì đây là một quyết định về
 * NGHIỆP VỤ ("trang nào công khai"), không phải chi tiết kỹ thuật của proxy.
 *
 * Chú ý: danh sách này là DANH SÁCH CHO PHÉP (allowlist) — mặc định mọi trang
 * đều cần đăng nhập, chỉ những trang liệt kê ở đây mới mở. Ngược lại với cách
 * làm "danh sách chặn" (chỉ liệt kê trang cần bảo vệ): quên thêm vào allowlist
 * thì hậu quả là một trang công khai bị khoá nhầm — người dùng báo ngay. Còn
 * quên thêm vào danh sách chặn thì hậu quả là dữ liệu riêng tư bị lộ, và có thể
 * chẳng ai phát hiện ra. Khi phải chọn, hãy chọn kiểu sai sót ồn ào.
 */
export const PUBLIC_ROUTES: readonly string[] = [ROUTES.login, ROUTES.register, ROUTES.confirm];

/**
 * Tên các cookie giữ phiên đăng nhập.
 *
 * Gom vào một chỗ vì chuỗi tên cookie xuất hiện ở nhiều file (`auth.ts`,
 * `api.ts`, `proxy.ts`). Gõ sai một ký tự ở một trong ba chỗ đó sẽ tạo ra bug
 * kiểu "đăng nhập xong vẫn bị đá ra" — rất mất thời gian để tìm.
 */
export const COOKIE = {
  /** Access token — gửi kèm mỗi request tới API. Sống 1 giờ. */
  accessToken: "access_token",
  /** Refresh token — dùng để xin access token mới. Sống 30 ngày. */
  refreshToken: "refresh_token",
  /** Thông tin hiển thị (email, sub, username, provider) dưới dạng JSON. */
  user: "session_user",
  /**
   * Cookie TẠM của luồng đăng nhập Google: giữ chuỗi `state` chống CSRF và
   * đường dẫn cần quay về sau khi đăng nhập.
   *
   * Khác hẳn ba cookie trên ở vòng đời: nó chỉ sống vài phút, đúng bằng khoảng
   * thời gian người dùng đi một vòng qua Google rồi quay lại, và bị XOÁ NGAY khi
   * dùng xong. Cookie phiên thì sống 30 ngày.
   *
   * Vì sao phải dùng cookie mà không giữ trong bộ nhớ server? Vì giữa lúc gửi đi
   * và lúc quay về, người dùng đã rời khỏi website của bạn hoàn toàn. Server
   * không có chỗ nào để nhớ "người vừa bấm nút là ai" — trừ khi tự dựng session
   * store, mà như thế thì phá vỡ tính không-trạng-thái của cả kiến trúc. Cookie
   * chính là "bộ nhớ" đi theo trình duyệt.
   */
  oauthState: "oauth_state",
} as const;

/**
 * Số giây trừ hao khi đặt hạn cho cookie access token.
 *
 * Cognito nói token sống 3600 giây, ta cho cookie sống 3540 giây — hết sớm hơn
 * token thật một phút.
 *
 * Vì sao phải trừ hao? Vì cách nhận biết "token hết hạn" của ta là "cookie đã
 * biến mất". Nếu hai mốc trùng khít nhau, sẽ có những request rơi đúng vào khe
 * hở: cookie vẫn còn nên ta cứ gửi đi, nhưng token thì vừa hết hạn nên backend
 * trả 401. Cho cookie chết trước một phút thì khe hở đó biến mất.
 *
 * Đây là kỹ thuật rất phổ biến khi làm việc với token, thường gọi là "clock
 * skew buffer" — trừ hao cho cả độ trễ mạng lẫn chênh lệch đồng hồ giữa hai máy.
 */
export const TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 60;

/** Hạn của cookie refresh token: 30 ngày, khớp với mặc định của Cognito. */
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Hạn của cookie `oauth_state`: 10 phút.
 *
 * Con số này là một đánh đổi:
 *   - Quá ngắn (1 phút) → người dùng phải chọn tài khoản Google, nhập mật khẩu,
 *     có khi còn nhập cả mã 2FA... chưa xong đã hết hạn và phải làm lại từ đầu.
 *   - Quá dài (1 ngày) → cửa sổ để kẻ tấn công lợi dụng `state` cũ mở rộng ra
 *     một cách không cần thiết.
 *
 * 10 phút đủ rộng rãi cho người thao tác chậm, mà vẫn đóng lại rất nhanh. Đây là
 * kiểu đánh đổi bạn sẽ gặp ở mọi giá trị timeout: chọn theo THỜI GIAN THAO TÁC
 * THẬT của con người, đừng chọn theo số tròn cho đẹp.
 */
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
