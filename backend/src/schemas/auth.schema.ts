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

/*
 * ----------------------------------------------------------------------------
 * NHÃN "PHIÊN NÀY ĐẾN TỪ ĐÂU"
 * ----------------------------------------------------------------------------
 *
 * Từ khi có đăng nhập bằng Google, hệ thống có HAI loại phiên, và mỗi loại gia
 * hạn token theo một cách khác nhau (xem `auth.service.ts`):
 *
 *   "cognito" — đăng nhập bằng email + mật khẩu → gia hạn qua InitiateAuth
 *   "google"  — đăng nhập qua Hosted UI         → gia hạn qua /oauth2/token
 *
 * `z.enum` chỉ chấp nhận đúng hai chuỗi này. Gửi lên "facebook" là bị từ chối
 * ngay tại cửa, không lọt vào tới service — đúng tinh thần "không tin dữ liệu từ
 * client" đã nói ở đầu file.
 */
export const authProviderSchema = z.enum(["cognito", "google"]);

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Thiếu refresh token"),
  /*
   * `.optional()` vì lý do rất thực tế: những người đang đăng nhập TỪ TRƯỚC khi
   * tính năng Google được thêm vào có cookie phiên không hề chứa trường này. Bắt
   * buộc phải có sẽ đá toàn bộ họ ra ngoài ngay lần gia hạn kế tiếp.
   *
   * Thiếu thì controller hiểu mặc định là "cognito" — đúng, vì trước đây chỉ có
   * đúng một luồng đó.
   *
   * Bài học chung: mỗi khi thêm một trường BẮT BUỘC vào dữ liệu đã tồn tại sẵn
   * ngoài thực tế, hãy nghĩ tới những bản ghi cũ chưa có trường đó.
   */
  provider: authProviderSchema.optional(),
  /*
   * `username` chỉ cần cho luồng "cognito". Việc kiểm tra "thiếu username khi
   * provider là cognito" nằm ở controller chứ không ở đây, vì zod diễn tả ràng
   * buộc kiểu "trường A bắt buộc TUỲ THEO giá trị trường B" khá rườm rà, mà
   * một câu `if` ở controller thì ai đọc cũng hiểu ngay.
   */
  username: z.string().trim().min(1).optional(),
});

/*
 * ----------------------------------------------------------------------------
 * SCHEMA CHO LUỒNG ĐĂNG NHẬP BẰNG GOOGLE
 * ----------------------------------------------------------------------------
 */

/*
 * `redirectUri` do frontend gửi lên, nên về nguyên tắc là dữ liệu KHÔNG ĐÁNG TIN.
 *
 * Ta chỉ kiểm hình thức tối thiểu (phải là URL http/https) chứ không cố kiểm
 * "URL này có phải của mình không". Vì sao dừng lại ở đó?
 *
 *   Vì Cognito mới là người gác cổng thật: nó đối chiếu `redirect_uri` với danh
 *   sách "Allowed callback URLs" mà bạn khai trong AWS Console, và từ chối thẳng
 *   nếu không khớp. Viết thêm một lớp kiểm tra ở đây chỉ tạo ra hai bộ luật có
 *   thể lệch nhau — đúng cái bẫy đã nói ở phần `passwordSchema` phía trên.
 *
 * `z.url()` là cú pháp của zod v4 (bản trước viết là `z.string().url()`).
 */
const redirectUriSchema = z
  .url("redirectUri không hợp lệ")
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "redirectUri phải bắt đầu bằng http:// hoặc https://",
  });

/** GET /api/auth/google/url — xin URL để đá người dùng sang Google. */
export const googleAuthorizeUrlSchema = z.object({
  redirectUri: redirectUriSchema,
  /*
   * Chuỗi ngẫu nhiên chống CSRF do frontend sinh ra.
   *
   * Đặt sàn 8 ký tự để chặn kiểu gọi ẩu `state=1` — một `state` đoán được thì
   * cũng như không có. Backend không sinh `state` hộ được, vì người phải CẤT nó
   * vào cookie và ĐỐI CHIẾU lúc quay về là frontend.
   */
  state: z.string().trim().min(8, "state quá ngắn"),
});

/** POST /api/auth/google/callback — đổi `code` lấy token. */
export const googleCallbackSchema = z.object({
  code: z.string().trim().min(1, "Thiếu authorization code"),
  redirectUri: redirectUriSchema,
});
