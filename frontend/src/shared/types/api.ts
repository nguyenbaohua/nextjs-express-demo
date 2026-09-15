/*
 * ============================================================================
 * KIỂU DỮ LIỆU CHUNG CHO MỌI LỜI GỌI API
 * ============================================================================
 *
 * File này chỉ chứa `type` của TypeScript — tức là "mô tả hình dạng dữ liệu".
 * Sau khi build, toàn bộ file này BIẾN MẤT, không còn dòng JavaScript nào.
 * Type chỉ tồn tại lúc bạn code, để editor báo lỗi sớm cho bạn.
 *
 * Vì vậy đặt type ở file riêng là an toàn: nó không làm nặng bundle gửi xuống
 * trình duyệt. Đây cũng là lý do bạn nên dùng `import type { ... }` khi chỉ cần
 * kiểu — cú pháp đó nói rõ với bộ biên dịch rằng dòng import này có thể xoá
 * sạch, không cần giữ lại gì lúc chạy.
 *
 * Những kiểu ở đây thuộc về `shared/` vì chúng mô tả GIAO THỨC giữa frontend và
 * backend, không thuộc riêng nghiệp vụ nào. Kiểu của một `Todo` hay một
 * `SessionUser` thì ngược lại — chúng nằm trong feature tương ứng.
 */

/*
 * Backend luôn bọc dữ liệu trong một "phong bì" (envelope) có dạng:
 *   thành công → { "success": true,  "data": {...} }
 *   thất bại   → { "success": false, "message": "..." }
 *
 * Vì sao phải bọc thêm một lớp thay vì trả thẳng dữ liệu?
 *
 *   Vì nó khiến MỌI response có cùng một hình dạng, kể cả lỗi. Frontend chỉ cần
 *   viết ĐÚNG MỘT hàm bóc phong bì (`shared/api/http.ts`) dùng chung cho tất cả,
 *   thay vì mỗi lời gọi lại tự đoán xem lần này backend trả về cái gì.
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
  /** Danh sách lỗi từng trường, do zod bên backend sinh ra khi validate hỏng. */
  errors?: { path: string; message: string }[];
};

/**
 * "Union type": một `ApiResponse` hoặc là thành công, hoặc là thất bại.
 *
 * Điều hay ở đây là TypeScript đủ thông minh để THU HẸP KIỂU (narrowing):
 * sau khi bạn viết `if (body.success)` thì bên trong `if` nó biết chắc có
 * `body.data`, còn bên trong `else` nó biết chắc có `body.message`.
 *
 * Cơ chế này gọi là "discriminated union" — phân biệt nhờ một trường chung có
 * giá trị cố định khác nhau (ở đây là `success: true` / `success: false`).
 *
 * Vì sao nó đáng dùng? Vì nó khiến những trạng thái KHÔNG THỂ TỒN TẠI trở thành
 * không thể VIẾT RA được. Với kiểu này, bạn không thể vô tình tạo một object vừa
 * có `data` vừa có `message`, và cũng không thể quên kiểm tra `success` trước
 * khi đọc `data` — trình biên dịch sẽ chặn ngay.
 *
 * Nguyên tắc rút ra: hãy thiết kế kiểu dữ liệu sao cho trạng thái sai là thứ
 * KHÔNG BIỂU DIỄN ĐƯỢC, thay vì viết code để kiểm tra rồi xử lý nó.
 */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/**
 * Kết quả trả về cho các form dùng `useActionState`.
 *
 * Quy ước ở dự án này:
 *   - `null`             → chưa submit lần nào, hoặc submit thành công
 *   - `{ error: "..." }` → submit thất bại, kèm thông báo để hiện lên màn hình
 */
export type FormState = { error: string } | null;
