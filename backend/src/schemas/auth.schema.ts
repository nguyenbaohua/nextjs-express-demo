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
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO VALIDATE LÀ VIỆC BẮT BUỘC, KHÔNG PHẢI VIỆC "NÊN LÀM"
 * ----------------------------------------------------------------------------
 *
 * Câu cần nhớ: **TypeScript chỉ tồn tại lúc bạn viết code. Lúc chạy, nó biến
 * mất hoàn toàn.** Mọi khai báo kiểu bị xoá sạch khi biên dịch sang JavaScript.
 *
 * Nên viết `const { email } = req.body as { email: string }` chỉ là một lời hứa
 * suông với trình biên dịch. Lúc chạy thật, `email` có thể là số, là `null`, là
 * một mảng, hoặc không tồn tại — và code của bạn sẽ nổ ở một chỗ xa tít phía
 * sau, với thông báo lỗi chẳng liên quan gì tới nguyên nhân thật.
 *
 * zod lấp đúng khoảng trống đó: kiểm tra THẬT lúc chạy, đồng thời cho TypeScript
 * biết kiểu dữ liệu SAU khi kiểm.
 */

import { z } from "zod";

/*
 * ----------------------------------------------------------------------------
 * LUẬT CHO MẬT KHẨU MỚI
 * ----------------------------------------------------------------------------
 *
 * Backend này tự quản lý mật khẩu, nên ĐÂY là nơi DUY NHẤT định nghĩa "thế nào
 * là mật khẩu hợp lệ". Không có dịch vụ nào phía sau kiểm lại — file này vừa là
 * cửa vào, vừa là luật. (Ô `minLength` bên `RegisterForm.tsx` chỉ để báo lỗi sớm
 * cho người dùng; xoá nó trong DevTools là qua mặt được, còn luật ở đây thì không.)
 *
 * Vì sao chỉ đặt luật tối thiểu 8 ký tự, mà không bắt phải có chữ hoa, số và ký
 * tự đặc biệt như nhiều trang web hay làm?
 *
 * Vì các luật đó phản tác dụng, và điều này đã được nghiên cứu kỹ. Khuyến nghị
 * hiện hành của NIST (cơ quan tiêu chuẩn Hoa Kỳ, tài liệu SP 800-63B) nói thẳng:
 * ĐỪNG áp luật thành phần ký tự.
 *
 * Lý do rất con người: bắt phải có chữ hoa và số thì người ta không nghĩ ra mật
 * khẩu mạnh hơn, họ chỉ biến "matkhau" thành "Matkhau1!" — thêm đúng hai bit
 * khó đoán, mà lại khó nhớ hơn hẳn nên cuối cùng họ ghi ra giấy dán màn hình,
 * hoặc dùng lại đúng mật khẩu đó ở mọi trang.
 *
 * Trong khi "con meo ngoi tren mai nha" dài 27 ký tự, dễ nhớ vô cùng, và khó
 * đoán hơn "Matkhau1!" hàng tỷ lần. Luật thành phần ký tự sẽ TỪ CHỐI nó.
 *
 * Nên luật đúng đắn là: đặt sàn ĐỘ DÀI, đừng ép thành phần.
 *
 * `.max(256)` không phải để ép người dùng, mà để CHỐNG TẤN CÔNG: bcrypt tốn CPU
 * theo độ dài đầu vào, nên nếu cho gửi chuỗi 100MB thì chỉ vài request là đủ
 * làm nghẽn server. Đây là một dạng từ chối dịch vụ rẻ tiền mà rất hay bị bỏ
 * sót — hễ có hàm nào tốn CPU, hãy đặt trần cho đầu vào của nó.
 *
 * (Một lưu ý kỹ thuật: bcrypt chỉ dùng 72 byte đầu tiên, phần sau bị bỏ qua
 * lặng lẽ. Đặt trần 256 vẫn hợp lý để thông báo lỗi thân thiện, nhưng đừng
 * tưởng mật khẩu 200 ký tự thì an toàn hơn 72 ký tự.)
 */
const passwordSchema = z
  .string()
  .min(8, "Mật khẩu phải có ít nhất 8 ký tự")
  .max(256, "Mật khẩu quá dài");

const emailSchema = z
  .string()
  .trim()
  /*
   * `.toLowerCase()` KHÔNG chỉ để cho đẹp.
   *
   * Postgres so sánh chuỗi CÓ phân biệt hoa thường, nên "An@Gmail.com" và
   * "an@gmail.com" là hai giá trị khác nhau với cột `User.email @unique`. Không
   * chuẩn hoá thì cùng một người đăng ký được hai tài khoản, và tệ hơn: hôm nay
   * gõ chữ hoa đăng ký, mai gõ chữ thường thì không đăng nhập được — mà họ
   * chẳng hiểu vì sao vì mắt thường nhìn hai chuỗi đó là một.
   *
   * ⚠️ Thứ tự các bước rất quan trọng, và đây là chỗ hay viết sai:
   *
   *     .trim() → .toLowerCase() → .email()
   *
   * `.email()` phải đứng CUỐI. Nếu kiểm định dạng trước rồi mới cắt khoảng
   * trắng, thì chuỗi " an@gmail.com" bị từ chối oan dù chỉ thừa một dấu cách mà
   * người dùng vô tình copy vào. Chuẩn hoá trước, kiểm tra sau.
   *
   * Lợi ích kép của việc chuẩn hoá ngay tại cửa vào: từ sau dòng `.parse()`,
   * MỌI tầng bên trong đều chắc chắn nhận được email đã sạch và viết thường.
   * Tầng service không cần và không nên `.toLowerCase()` lại lần nữa.
   */
  .toLowerCase()
  .email("Email không hợp lệ");

/** POST /api/auth/register — tạo tài khoản mới. */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/** POST /api/auth/login — đổi email + mật khẩu lấy cặp token. */
export const loginSchema = z.object({
  email: emailSchema,
  /*
   * Lúc ĐĂNG NHẬP chỉ cần mật khẩu không rỗng — cố ý KHÔNG dùng `passwordSchema`.
   *
   * Vì sao? Giả sử mai này bạn nâng sàn độ dài từ 8 lên 12 ký tự. Những tài
   * khoản đã tạo trước đó có mật khẩu 8 ký tự vẫn phải đăng nhập được chứ. Áp
   * luật "mật khẩu mới" lên hành động "đăng nhập" sẽ khoá chính người dùng hợp
   * lệ ra ngoài, và họ không có cách nào tự sửa.
   *
   * Quy tắc rút ra: luật về ĐỘ MẠNH chỉ áp lúc TẠO hoặc ĐỔI mật khẩu, không bao
   * giờ áp lúc KIỂM TRA mật khẩu.
   *
   * `.min(1)` vẫn cần, để chặn body `{"password": ""}` đi xuống tận bcrypt một
   * cách vô nghĩa.
   */
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

/**
 * POST /api/auth/refresh và POST /api/auth/logout.
 *
 * Hai API khác nhau dùng chung một schema, vì cả hai đều chỉ cần đúng một thứ:
 * refresh token. Dùng chung là hợp lý ở đây — nhưng hãy cẩn thận với thói quen
 * đó: hai schema TÌNH CỜ giống nhau hôm nay có thể cần rẽ hướng khác nhau ngày
 * mai, và lúc đó việc tách ra sẽ phiền hơn là để riêng từ đầu. Chỉ gộp khi
 * chúng giống nhau vì cùng MỘT LÝ DO, như trường hợp này.
 *
 * Chú ý ta KHÔNG kiểm độ dài hay định dạng hex của token. Cố tình như vậy: token
 * hợp lệ hay không thì tầng service tra database sẽ biết, và đó mới là câu trả
 * lời đáng tin. Thêm `.length(128)` ở đây chỉ tạo ra một luật thứ hai phải nhớ
 * cập nhật mỗi khi đổi `REFRESH_TOKEN_BYTES` — một cái bẫy chờ sẵn cho tương lai.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Thiếu refresh token"),
});
