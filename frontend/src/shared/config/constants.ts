/*
 * ============================================================================
 * HẰNG SỐ DÙNG CHUNG
 * ============================================================================
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO FILE NÀY NẰM Ở `shared/` CHỨ KHÔNG PHẢI TRONG MỘT `feature/`?
 * ----------------------------------------------------------------------------
 *
 * Dự án tổ chức theo nghiệp vụ (xem `.claude/nextjs-folder-structure.md`), và
 * quy tắc phân chia là:
 *
 *     features/   — thứ chỉ một nghiệp vụ cần
 *     shared/     — thứ NHIỀU nghiệp vụ cùng cần, hoặc là hạ tầng kỹ thuật
 *
 * Và có một luật về CHIỀU PHỤ THUỘC, quan trọng hơn cả việc chia thư mục:
 *
 *     features/  ──được phép import──▶  shared/
 *     shared/    ──KHÔNG BAO GIỜ────▶  features/
 *
 * Vì sao luật đó đáng giữ? Vì nếu `shared/` import ngược vào `features/`, bạn
 * tạo ra một vòng tròn: gỡ một feature ra thì `shared/` gãy, mà `shared/` gãy
 * thì mọi feature còn lại cùng gãy theo. Lúc đó "chia theo feature" chỉ còn là
 * hình thức — thực chất mọi thứ vẫn dính chặt vào nhau.
 *
 * Giữ đúng một chiều thì mỗi feature xoá đi được mà không ai hề hấn gì. Đó mới
 * là thước đo thật của một cấu trúc thư mục tốt.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO KHÔNG NHÉT MỌI THỨ VÀO .env?
 * ----------------------------------------------------------------------------
 * Quy ước của dự án này (xem CLAUDE.md ở thư mục gốc): `.env` chỉ giữ những giá
 * trị THỰC SỰ khác nhau giữa các môi trường (dev / staging / production) hoặc là
 * bí mật. Còn những thứ cố định như đường dẫn route thì để trong file hằng số,
 * vì như vậy TypeScript kiểm tra được cho bạn, còn biến môi trường thì không.
 */

/**
 * Dùng khi biến môi trường `API_BASE_URL` không được đặt.
 *
 * Có giá trị mặc định để người mới clone repo về chạy được ngay mà chưa cần tạo
 * file `.env.local`. Xem cách dùng ở `shared/api/http.ts`.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:3000/api";

/**
 * Gom mọi đường dẫn của app vào một chỗ.
 *
 * Trong Next.js, route được sinh ra từ CẤU TRÚC THƯ MỤC (xem `app/page.tsx` và
 * `app/todos/[id]/page.tsx`). Nghĩa là URL "/todos/5" tồn tại chỉ vì có thư mục
 * `app/todos/[id]/`. Không có file cấu hình route nào cả.
 *
 * Nhược điểm của cơ chế đó: nếu bạn đổi tên thư mục, mọi chuỗi "/todos/..." rải
 * rác trong code sẽ hỏng ÂM THẦM — không có lỗi biên dịch nào, chỉ có những link
 * dẫn tới trang 404 mà bạn chỉ phát hiện khi tự bấm vào. Gom vào đây thì chỉ
 * phải sửa một chỗ.
 *
 * `as const` bảo TypeScript coi object này là bất biến, giúp gợi ý code chính
 * xác hơn (`ROUTES.home` có kiểu `"/"` chứ không phải `string`).
 */
export const ROUTES = {
  home: "/",
  todoDetail: (id: number | string) => `/todos/${id}`,
  login: "/login",
  register: "/register",
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
 * chẳng ai phát hiện ra.
 *
 * Khi phải chọn giữa hai kiểu sai sót, hãy chọn kiểu sai sót ỒN ÀO.
 */
export const PUBLIC_ROUTES: readonly string[] = [ROUTES.login, ROUTES.register];

/**
 * Tên các cookie giữ phiên đăng nhập.
 *
 * Gom vào một chỗ vì chuỗi tên cookie xuất hiện ở nhiều file (`session.ts`,
 * `proxy.ts`). Gõ sai một ký tự ở một trong hai chỗ đó sẽ tạo ra bug kiểu "đăng
 * nhập xong vẫn bị đá ra" — loại bug rất mất thời gian để tìm, vì code trông
 * hoàn toàn đúng và không có lỗi nào được báo.
 */
export const COOKIE = {
  /** Access token (JWT) — gửi kèm mỗi request tới API. Sống 1 giờ. */
  accessToken: "access_token",
  /** Refresh token — dùng để xin cặp token mới. Sống 30 ngày. */
  refreshToken: "refresh_token",
  /** Thông tin hiển thị (id, email) dưới dạng JSON. */
  user: "session_user",
} as const;

/**
 * Số giây trừ hao khi đặt hạn cho cookie access token.
 *
 * Backend nói token sống 3600 giây, ta cho cookie sống 3540 giây — hết sớm hơn
 * token thật một phút.
 *
 * Vì sao phải trừ hao? Vì cách nhận biết "token hết hạn" của ta là "cookie đã
 * biến mất". Nếu hai mốc trùng khít nhau, sẽ có những request rơi đúng vào khe
 * hở: cookie vẫn còn nên ta cứ gửi đi, nhưng token thì vừa hết hạn nên backend
 * trả 401. Cho cookie chết trước một phút thì khe hở đó biến mất.
 *
 * Đây là kỹ thuật rất phổ biến khi làm việc với token, thường gọi là "clock
 * skew buffer" — trừ hao cho cả độ trễ mạng lẫn chênh lệch đồng hồ giữa hai máy.
 * Đồng hồ hai máy chủ không bao giờ khớp nhau tuyệt đối, và mọi hệ thống phân
 * tán đều phải tính đến điều đó ở đâu đó.
 */
export const TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 60;

/**
 * Hạn của cookie refresh token: 30 ngày.
 *
 * Phải khớp với `REFRESH_TOKEN_TTL_SECONDS` bên `backend/src/lib/constants.ts`.
 *
 * ⚠️ Đây là một chỗ trùng lặp mà ta buộc phải chấp nhận: hai chương trình chạy
 * ở hai tiến trình khác nhau, không chia sẻ code, nên không có cách nào để một
 * hằng số tồn tại ở đúng một nơi.
 *
 * Nếu hai giá trị lệch nhau thì sao? Không sập, nhưng sai lặng lẽ:
 *   - cookie hết hạn TRƯỚC  → người dùng bị bắt đăng nhập lại sớm hơn cần thiết
 *   - cookie hết hạn SAU    → proxy vẫn cố gia hạn bằng một token đã chết trong
 *                             database, tốn một request thừa rồi mới đá ra
 *
 * Cách xử lý trong dự án thật: để backend trả về hạn của refresh token trong
 * response đăng nhập, y như cách nó đã làm với `expiresIn` của access token.
 * Khi đó chỉ còn MỘT nguồn sự thật. Ở đây ta giữ hằng số cho dễ đọc, nhưng bạn
 * cần nhận ra vì sao cách kia tốt hơn.
 */
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
