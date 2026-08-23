/*
 * ============================================================================
 * SCHEMA XÁC THỰC — cửa kiểm soát dữ liệu vào của các API auth
 * ============================================================================
 *
 * Giống `todo.schema.ts`, các schema zod ở đây làm hai việc cùng lúc:
 *   1. Lúc chạy: kiểm tra dữ liệu client gửi lên, sai thì ném lỗi 400
 *   2. Lúc viết code: TypeScript suy ra kiểu từ schema, nên sau `.parse()` bạn
 *      có object đã đúng kiểu, không cần ép kiểu thủ công
 *
 * Nguyên tắc bao trùm: KHÔNG BAO GIỜ TIN DỮ LIỆU TỪ CLIENT. Ai cũng có thể gửi
 * bất cứ thứ gì tới API của bạn bằng `curl` — trình duyệt không phải là hàng rào.
 */

import { z } from "zod";

/*
 * Vì sao lại kiểm tra mật khẩu ở đây khi Cognito cũng đã kiểm rồi?
 *
 * Hai lý do:
 *
 *   1. Trải nghiệm. Kiểm ở đây thì người dùng nhận được câu tiếng Việt rõ ràng
 *      ngay lập tức, thay vì một chuỗi lỗi tiếng Anh từ AWS.
 *
 *   2. Tiết kiệm. Bắt lỗi tại chỗ thì khỏi phải đi một vòng ra Internet chỉ để
 *      nhận về lời từ chối.
 *
 * Nhưng lưu ý: Cognito vẫn là NGƯỜI GÁC CỔNG CUỐI CÙNG. Ta cố ý chỉ kiểm phần
 * đơn giản nhất (độ dài 8 ký tự) chứ không sao chép toàn bộ password policy của
 * Cognito sang đây — vì hai bản luật sao chép nhau kiểu gì cũng có ngày lệch
 * nhau, và khi đó rất khó lần ra bên nào mới đúng.
 */
const passwordSchema = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .max(256, "Mật khẩu quá dài");

const emailSchema = z
  .string()
  .trim()
  /*
   * .toLowerCase() KHÔNG chỉ để cho đẹp.
   *
   * Cognito coi "An@Gmail.com" và "an@gmail.com" là hai người khác nhau. Nếu
   * không chuẩn hoá, người dùng đăng ký bằng chữ hoa rồi hôm sau gõ chữ thường
   * sẽ không đăng nhập được, và họ sẽ chẳng hiểu vì sao. Chuẩn hoá ngay tại cửa
   * vào là cách rẻ nhất để tránh cả một loại bug.
   */
  .toLowerCase()
  .email("Email không hợp lệ");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  /*
   * Lúc ĐĂNG NHẬP chỉ cần mật khẩu không rỗng — cố ý không dùng `passwordSchema`.
   *
   * Vì sao? Giả sử mai này bạn nới password policy, những tài khoản cũ có mật
   * khẩu 6 ký tự vẫn phải đăng nhập được. Áp luật "mật khẩu mới" lên hành động
   * "đăng nhập" sẽ khoá chính người dùng hợp lệ ra ngoài.
   *
   * Quy tắc rút ra: luật về ĐỘ MẠNH mật khẩu chỉ áp lúc TẠO/ĐỔI mật khẩu, không
   * bao giờ áp lúc kiểm tra.
   */
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

export const confirmSchema = z.object({
  email: emailSchema,
  /*
   * Mã xác thực của Cognito luôn là 6 chữ số.
   * regex `^\d{6}$` đọc là: từ đầu chuỗi, đúng 6 ký tự số, rồi hết chuỗi.
   */
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Mã xác thực gồm 6 chữ số"),
});

export const resendCodeSchema = z.object({
  email: emailSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Thiếu refresh token"),
});
