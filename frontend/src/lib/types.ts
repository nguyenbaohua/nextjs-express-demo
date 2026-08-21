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
