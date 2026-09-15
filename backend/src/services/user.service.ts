/*
 * ============================================================================
 * USER SERVICE — nơi hai danh tính Cognito được gộp thành một con người
 * ============================================================================
 *
 * File này nhỏ nhưng là chỗ giải quyết một vấn đề khái niệm khá rối, nên đọc kỹ
 * phần dẫn nhập trước khi đọc code.
 *
 * ----------------------------------------------------------------------------
 * VẤN ĐỀ: MỘT NGƯỜI, HAI TÀI KHOẢN COGNITO
 * ----------------------------------------------------------------------------
 *
 * Chị An dùng email `an@gmail.com`. Chị ấy có thể vào app bằng hai đường:
 *
 *     Đường 1 — gõ email + mật khẩu   → Cognito tạo user, sub = "a4e8b1c2-..."
 *     Đường 2 — bấm nút Google        → Cognito tạo user, sub = "7b2e9d54-..."
 *
 * Với Cognito, đó là HAI NGƯỜI. Hai bản ghi trong tab Users, hai `sub` riêng.
 *
 * Đó là mặc định ĐÚNG của Cognito (tự động gộp theo email sẽ mở ra lỗ hổng chiếm
 * tài khoản — giải thích đầy đủ trong `prisma/schema.prisma`). Nhưng với app của
 * ta thì rõ ràng đó phải là MỘT người: cùng một danh sách công việc.
 *
 * ----------------------------------------------------------------------------
 * GIẢI PHÁP: MỘT TẦNG DANH TÍNH CỦA RIÊNG MÌNH
 * ----------------------------------------------------------------------------
 *
 * Ta không cố sửa Cognito. Ta thêm một tầng bên dưới nó — bảng `User` trong
 * database của chính mình — và tầng đó mới là nguồn sự thật về "ai là ai":
 *
 *     Cognito nói:  "người cầm token này có sub = 7b2e9d54"
 *     Bảng User nói: "sub 7b2e9d54 và sub a4e8b1c2 là cùng một người: User#9f3d"
 *     Bảng Todo nói: "todo này thuộc về User#9f3d"
 *
 * Cognito vẫn giữ nguyên vai trò của nó — trả lời câu hỏi "người này có đúng là
 * chủ tài khoản không?" — việc mà nó làm tốt và ta không muốn tự làm. Ta chỉ
 * giành lại quyền quyết định "hai tài khoản đó có phải cùng một người không",
 * vì đó là câu hỏi NGHIỆP VỤ của app chứ không phải câu hỏi bảo mật.
 *
 * ----------------------------------------------------------------------------
 * KHOÁ ĐỂ GỘP: EMAIL
 * ----------------------------------------------------------------------------
 *
 * Hai `sub` khác nhau, nhưng email thì giống nhau — nên email là thứ duy nhất
 * dùng để nhận ra "à, hai người này thật ra là một".
 *
 * Gộp theo email là chỗ đẻ ra rất nhiều lỗ hổng chiếm tài khoản trong thực tế,
 * nên phải nói rõ vì sao ở đây thì an toàn: CẢ HAI đường vào đều đã bắt người
 * dùng chứng minh họ sở hữu email đó (Cognito gửi mã 6 số; Google chỉ cấp email
 * mà chính nó sở hữu). Chi tiết đầy đủ nằm trong `prisma/schema.prisma`.
 */

import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

/**
 * Hai đường vào app. Cùng tập giá trị với `AuthProvider` bên frontend và với
 * `authProviderSchema` trong `schemas/auth.schema.ts`.
 */
export type AuthProvider = "cognito" | "google";

/*
 * ----------------------------------------------------------------------------
 * HÀM QUAN TRỌNG NHẤT CỦA FILE — VÀ CỦA CẢ TÍNH NĂNG LIÊN KẾT
 * ----------------------------------------------------------------------------
 *
 * Được gọi ở đúng MỘT thời điểm: ngay sau khi đăng nhập thành công (cả hai
 * luồng). Đó cũng là thời điểm DUY NHẤT ta có đủ hai mảnh thông tin cần thiết —
 * `sub` (từ token) và `email` (từ ID token) — để nối chúng lại với nhau.
 *
 * Ba bước, và THỨ TỰ LÀ TẤT CẢ:
 *
 *   1. Tìm theo `sub`   → "tôi đã gặp đúng tài khoản này rồi"
 *   2. Tìm theo `email` → "tôi đã gặp người này, nhưng qua đường khác" → LIÊN KẾT
 *   3. Không thấy gì    → người hoàn toàn mới → tạo hàng mới
 *
 * Vì sao tìm theo `sub` TRƯỚC mà không phải `email`?
 *
 *   Vì `sub` là thứ KHÔNG BAO GIỜ ĐỔI, còn email thì đổi được (người dùng đổi
 *   email chính trong tài khoản Google chẳng hạn). Định danh một thực thể thì
 *   luôn phải ưu tiên cái bất biến.
 *
 *   Đảo thứ tự lại sẽ sinh ra một cái bẫy: nếu ai đó đổi email, bước tìm theo
 *   email sẽ trượt và ta tạo cho họ một tài khoản mới toanh — họ mất sạch todo
 *   dù chẳng làm gì sai. Còn với thứ tự hiện tại, `sub` vẫn khớp và mọi thứ
 *   nguyên vẹn.
 */
export async function findOrLinkUser(params: {
  /** `sub` của Cognito ứng với đúng luồng đăng nhập vừa dùng. */
  sub: string;
  /** Email đọc từ ID token. */
  email: string;
  /** Luồng nào vừa được dùng — quyết định `sub` này được ghi vào cột nào. */
  provider: AuthProvider;
}) {
  const { sub, email, provider } = params;

  /*
   * --------------------------------------------------------------------------
   * CHẶN NGAY NẾU KHÔNG CÓ EMAIL — và đây là một cái chốt quan trọng
   * --------------------------------------------------------------------------
   *
   * Email là KHOÁ để gộp danh tính. Không có nó thì cả cơ chế này vô nghĩa.
   *
   * Chuyện gì xảy ra nếu ta cứ nhắm mắt cho qua với email rỗng?
   *
   *   Người dùng Google thứ nhất  → tạo hàng User với email = ""
   *   Người dùng Google thứ hai   → bước 2 tìm theo email "" và TÌM THẤY hàng
   *                                 của người thứ nhất → gắn `googleSub` của
   *                                 người thứ hai đè lên → 💥 HAI NGƯỜI LẠ DÙNG
   *                                 CHUNG MỘT TÀI KHOẢN VÀ THẤY TODO CỦA NHAU.
   *
   * Đó là lỗi rò rỉ dữ liệu nghiêm trọng, mà nguyên nhân chỉ là một ô cấu hình
   * bị bỏ trống trong AWS Console. Kiểu lỗi tệ nhất: âm thầm, không có thông báo
   * nào, và chỉ lộ ra khi đã có người thứ hai đăng nhập.
   *
   * Nên ta dừng ngay tại đây với một câu chỉ thẳng chỗ phải sửa. Thà đăng nhập
   * thất bại rõ ràng còn hơn đăng nhập "thành công" vào nhầm tài khoản người khác.
   *
   * Nguyên nhân thực tế gần như luôn là: quên bước "Map attributes" (`email` →
   * `email`) khi thêm Google làm identity provider — xem `.note/google-login-setup.md`.
   */
  if (!email) {
    throw new AppError(
      502,
      "Không đọc được email của tài khoản. Nếu đăng nhập bằng Google, hãy kiểm tra phần Map attributes (email → email) trong AWS Cognito. Xem .note/google-login-setup.md",
    );
  }

  /*
   * Chọn sẵn cột sẽ làm việc, để ba bước dưới khỏi phải rẽ nhánh `if` lặp lại.
   *
   * Đây là cách viết gọn hơn hẳn so với việc lặp lại `provider === "google" ? ...`
   * ở mỗi câu query. Và nó cũng chỉ ra một điều đáng suy nghĩ: nếu mai này thêm
   * nhà cung cấp thứ ba, mấy dòng này sẽ bắt đầu trông gượng gạo — đó chính là
   * lúc nên tách ra bảng `Identity` riêng (xem ghi chú trong `schema.prisma`).
   */
  const whereBySub = provider === "google" ? { googleSub: sub } : { cognitoSub: sub };
  const linkData = provider === "google" ? { googleSub: sub } : { cognitoSub: sub };

  /*
   * BƯỚC 1 — Đã gặp đúng tài khoản Cognito này rồi?
   *
   * Đây là đường chạy của 99% lần đăng nhập: người dùng cũ, quay lại như thường
   * lệ. Không ghi gì vào database cả, chỉ đọc.
   *
   * Dùng `findFirst` chứ không `findUnique` vì `whereBySub` là một object được
   * dựng động — TypeScript không đủ thông tin để chắc rằng nó luôn chứa một
   * trường `@unique`. Về mặt SQL thì hai hàm ra cùng một câu lệnh và cùng dùng
   * chỉ mục UNIQUE đã có, nên không mất mát gì về hiệu năng.
   */
  const bySub = await prisma.user.findFirst({ where: whereBySub });
  if (bySub) {
    return bySub;
  }

  /*
   * BƯỚC 2 — 🔗 CHỖ LIÊN KẾT XẢY RA.
   *
   * Tới được đây nghĩa là: `sub` này lạ, nhưng biết đâu email thì quen.
   *
   * Nếu tìm thấy, ta KHÔNG tạo hàng mới mà GẮN THÊM `sub` vào hàng đang có. Từ
   * giây phút đó, một hàng User ôm cả hai `sub`, và cả hai đường đăng nhập đều
   * dẫn về đúng một `User.id` — tức là đúng một danh sách todo.
   *
   * Đây chính là câu trả lời cho yêu cầu "đăng ký bằng email rồi, sau đó bấm
   * đăng nhập Google thì phải ra đúng tài khoản đó".
   *
   * Chú ý là việc liên kết diễn ra LẶNG LẼ, người dùng không thấy gì cả — họ chỉ
   * thấy todo của mình vẫn còn nguyên. Đó là trải nghiệm đúng: người dùng không
   * quan tâm bên trong có mấy tài khoản Cognito, họ chỉ biết mình có một tài
   * khoản.
   */
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    return prisma.user.update({
      where: { id: byEmail.id },
      data: linkData,
    });
  }

  /*
   * BƯỚC 3 — Người hoàn toàn mới.
   *
   * Cột của luồng KHÔNG được dùng sẽ để `null`, và cái `null` đó mang ý nghĩa
   * nghiệp vụ thật chứ không phải "chưa có dữ liệu":
   *
   *     cognitoSub = null  ⟺  người này chưa từng đặt mật khẩu
   *
   * Hàm `register()` trong `auth.service.ts` đọc đúng cái `null` này để chặn
   * việc đăng ký bằng email đã dùng để đăng nhập Google.
   *
   * Viết tường minh cả hai cột (thay vì rải `...linkData`) là cố ý: người đọc
   * nhìn một lượt là thấy ngay "một trong hai cột sẽ trống", không phải lần theo
   * biến để suy ra.
   */
  return prisma.user.create({
    data: {
      email,
      cognitoSub: provider === "cognito" ? sub : null,
      googleSub: provider === "google" ? sub : null,
    },
  });
}

/**
 * Tìm người dùng theo `sub` bất kỳ — không cần biết `sub` đó thuộc luồng nào.
 *
 * `requireAuth` dùng hàm này ở MỌI request có xác thực. Lý do nó phải "không cần
 * biết luồng nào": access token chỉ chứa `sub`, không hề nói `sub` này đến từ
 * đăng nhập mật khẩu hay từ Google. Nên ta tìm ở cả hai cột.
 *
 * `OR` của Prisma dịch thành `WHERE "cognitoSub" = $1 OR "googleSub" = $1`. Cả
 * hai cột đều có chỉ mục UNIQUE nên Postgres xử lý bằng phép hợp hai lần tra
 * chỉ mục, không quét toàn bảng.
 *
 * Trả `null` nếu không tìm thấy — tình huống này CÓ THỂ xảy ra thật: một access
 * token phát ra TRƯỚC khi bảng User tồn tại vẫn còn hợp lệ với Cognito thêm một
 * giờ nữa. `requireAuth` xử lý bằng cách trả 401, và người dùng chỉ cần đăng
 * nhập lại một lần là xong.
 */
export async function findUserBySub(sub: string) {
  return prisma.user.findFirst({
    where: {
      OR: [{ cognitoSub: sub }, { googleSub: sub }],
    },
  });
}

/**
 * Tìm theo email — dùng cho việc kiểm tra trước khi cho đăng ký.
 *
 * Tách thành hàm riêng thay vì để `auth.service.ts` gọi thẳng `prisma.user` là
 * có chủ ý: giữ đúng quy ước của dự án, mỗi bảng chỉ có MỘT service chạm vào.
 * Nhờ vậy mai này muốn đổi cách lưu người dùng (thêm cache, đổi ORM, tách sang
 * microservice) thì chỉ phải sửa file này.
 */
export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}
