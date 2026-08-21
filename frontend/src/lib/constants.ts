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
} as const;
