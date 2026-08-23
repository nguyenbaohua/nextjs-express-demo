/*
 * ============================================================================
 * KIỂU DỮ LIỆU DÙNG CHUNG
 * ============================================================================
 *
 * File này chỉ chứa `type` của TypeScript — tức là "mô tả hình dạng dữ liệu".
 * Sau khi build, toàn bộ file này BIẾN MẤT, không còn dòng JavaScript nào.
 * Type chỉ tồn tại lúc bạn code, để editor báo lỗi sớm cho bạn.
 *
 * Vì vậy đặt type ở file riêng là an toàn: nó không làm nặng bundle gửi xuống
 * trình duyệt.
 */

/**
 * Một todo, đúng như backend Express trả về.
 *
 * Lưu ý `createdAt` và `updatedAt` là `string` chứ không phải `Date`.
 * Lý do: dữ liệu đi qua JSON, mà JSON không có kiểu ngày tháng — Prisma trả về
 * `Date`, `res.json()` biến nó thành chuỗi ISO ("2026-08-21T13:43:21.648Z"),
 * và frontend nhận được chuỗi đó. Muốn hiển thị đẹp thì tự parse (xem format.ts).
 */
export type Todo = {
  id: number;
  content: string;
  isDone: boolean;
  createdAt: string;
  updatedAt: string;
};

/*
 * Backend luôn bọc dữ liệu trong một "phong bì" (envelope) có dạng:
 *   thành công → { "success": true,  "data": {...} }
 *   thất bại   → { "success": false, "message": "..." }
 *
 * Hai type dưới đây mô tả hai trường hợp đó. Chúng KHÔNG export vì chỉ dùng nội
 * bộ trong file này để ghép thành `ApiResponse`.
 */
type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  message: string;
  errors?: { path: string; message: string }[];
};

/**
 * "Union type": một `ApiResponse` hoặc là thành công, hoặc là thất bại.
 *
 * Điều hay ở đây là TypeScript đủ thông minh để thu hẹp kiểu (narrowing):
 * sau khi bạn viết `if (body.success)` thì bên trong `if` nó biết chắc có
 * `body.data`, còn bên trong `else` nó biết chắc có `body.message`.
 * Cơ chế này gọi là "discriminated union" — phân biệt nhờ trường `success`.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Kết quả trả về cho các form dùng `useActionState` (xem AddTodoForm.tsx).
 *
 * Quy ước ở dự án này:
 *   - `null`             → chưa submit lần nào, hoặc submit thành công
 *   - `{ error: "..." }` → submit thất bại, kèm thông báo để hiện lên màn hình
 */
export type FormState = { error: string } | null;

/*
 * ============================================================================
 * KIỂU DỮ LIỆU CHO PHẦN ĐĂNG NHẬP
 * ============================================================================
 */

/**
 * Thông tin người dùng lấy từ Cognito, đủ để hiển thị và để gia hạn token.
 */
export type SessionUser = {
  /**
   * `sub` — ID vĩnh viễn của tài khoản trong Cognito.
   * Đây chính là giá trị nằm ở cột `Todo.userId` bên database.
   */
  sub: string;
  /** Email, dùng để hiển thị "Xin chào ..." trên giao diện. */
  email: string;
  /**
   * Tên đăng nhập THẬT bên trong Cognito (thường là một chuỗi UUID khi User Pool
   * cấu hình đăng nhập bằng email).
   *
   * Trông thừa vì đã có `sub`, nhưng bắt buộc phải giữ: luồng gia hạn token cần
   * đúng chuỗi này để tính SECRET_HASH. Lý do đầy đủ nằm trong
   * `backend/src/services/auth.service.ts`, hàm `refreshTokens`.
   */
  username: string;
};

/**
 * Những gì backend trả về sau khi đăng nhập thành công.
 *
 * Chú ý là KHÔNG có `idToken` ở đây. Backend có trả nó về, nhưng frontend không
 * cần: thông tin duy nhất ta muốn từ ID token là email, mà backend đã đọc sẵn và
 * đặt vào `user`. Không lưu thứ mình không dùng — mỗi token lưu thêm là thêm một
 * thứ có thể rò rỉ.
 */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  /** Số GIÂY access token còn sống (Cognito mặc định 3600 = 1 giờ). */
  expiresIn: number;
  user: SessionUser;
};

/**
 * Trạng thái trả về từ các form đăng nhập / đăng ký / xác thực.
 *
 * Khác với `FormState` của todo ở chỗ có thêm `success` và `message`, vì các form
 * này cần báo tin vui (`"Đã gửi lại mã"`) chứ không chỉ báo lỗi.
 */
export type AuthFormState =
  | { error: string; success?: never; message?: never }
  | { success: true; message: string; error?: never }
  | null;
