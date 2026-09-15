/*
 * ============================================================================
 * AUTH SERVICE — toàn bộ nghiệp vụ đăng ký / đăng nhập nằm ở đây
 * ============================================================================
 *
 * Nhắc lại ranh giới tầng (xem thêm `todo.service.ts`):
 *
 *   Tầng service ĐƯỢC biết:    Prisma, bcrypt, JWT, nghiệp vụ
 *   Tầng service KHÔNG biết:   `req`, `res`, mã HTTP status, header, cookie
 *
 * Cách tự kiểm tra xem mình có viết sai tầng không: tìm chữ `res.` trong file
 * này. Không có dòng nào — đúng như mong muốn.
 *
 * Vậy khi có lỗi thì service báo cho HTTP bằng cách nào? Bằng `AppError`, một
 * lớp lỗi mang theo con số status (xem `utils/AppError.ts`). Service chỉ nói
 * "mức độ nghiêm trọng của chuyện này là 401", còn việc gửi phản hồi là của
 * `errorHandler`.
 *
 * ----------------------------------------------------------------------------
 * BỐN VIỆC FILE NÀY LÀM
 * ----------------------------------------------------------------------------
 *
 *     register()  tạo tài khoản mới (băm mật khẩu trước khi lưu)
 *     login()     kiểm mật khẩu, cấp cặp token, mở một phiên
 *     refresh()   đổi refresh token cũ lấy cặp token mới (có XOAY VÒNG)
 *     logout()    đóng phiên — xoá hàng trong bảng Session
 *
 * ----------------------------------------------------------------------------
 * "CẶP TOKEN" LÀ GÌ VÀ VÌ SAO PHẢI LÀ MỘT CẶP?
 * ----------------------------------------------------------------------------
 *
 * Mỗi lần đăng nhập thành công, người dùng nhận về HAI thứ khác hẳn nhau:
 *
 *     ACCESS TOKEN                      REFRESH TOKEN
 *     JWT có chữ ký                     64 byte ngẫu nhiên
 *     sống 1 giờ                        sống 30 ngày
 *     gửi kèm MỌI request tới API       chỉ gửi khi cần gia hạn
 *     KHÔNG tra database khi kiểm       CÓ tra bảng Session khi kiểm
 *     không thu hồi được                thu hồi được (xoá hàng là xong)
 *
 * Sự chia đôi này là một đánh đổi được tính toán kỹ, không phải làm cho phức
 * tạp. Lý do đầy đủ nằm ở khối comment của `model Session` trong
 * `prisma/schema.prisma` — nếu chưa đọc thì nên đọc trước khi đọc tiếp file này.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken } from "../lib/jwt";
import { hashPassword, verifyPassword } from "../lib/password";
import { generateRefreshToken, hashRefreshToken } from "../lib/token";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../lib/constants";
import { AppError } from "../utils/AppError";

/*
 * ---------------------------------------------------------------------------
 * HÌNH DẠNG DỮ LIỆU TRẢ VỀ
 * ---------------------------------------------------------------------------
 *
 * `login()` và `refresh()` trả về CÙNG MỘT kiểu. Đó là chủ ý thiết kế, không
 * phải trùng hợp: frontend nhận được cùng một hình dạng dữ liệu ở cả hai tình
 * huống, nên phần lưu cookie viết một lần dùng chung được cho cả hai.
 *
 * Nguyên tắc đáng nhớ: khi hai hành động khác nhau dẫn tới cùng một KẾT QUẢ
 * (ở đây là "người dùng có một phiên hợp lệ"), hãy cho chúng trả về cùng một
 * kiểu. Chỗ khác biệt càng ít thì code gọi càng ít phải rẽ nhánh.
 */
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  /** Số GIÂY access token còn sống — frontend dùng để đặt hạn cho cookie. */
  expiresIn: number;
  user: { id: string; email: string };
};

/*
 * ---------------------------------------------------------------------------
 * HÀM NỘI BỘ: mở một phiên mới
 * ---------------------------------------------------------------------------
 *
 * Cả `login()` và `refresh()` đều cần làm đúng bốn việc này, nên tách riêng ra.
 * Không export — đây là chi tiết nội bộ, không phải API của module.
 *
 * Tách ra không chỉ để đỡ gõ lại. Quan trọng hơn: nó đảm bảo hai luồng KHÔNG
 * THỂ lệch nhau. Nếu mai bạn muốn ghi thêm địa chỉ IP vào mỗi phiên, bạn sửa
 * đúng một chỗ ở đây và cả hai luồng đều có. Còn nếu copy-paste hai bản, sớm
 * muộn sẽ có ngày sửa một bản và quên bản kia — mà bug loại đó chỉ xuất hiện ở
 * đúng một trong hai luồng nên rất lâu mới bị phát hiện.
 */
async function createSession(user: { id: string; email: string }): Promise<AuthSession> {
  /*
   * BƯỚC 1 — Ký access token.
   *
   * Chú ý payload chỉ có `id` và `email`, không có gì nhạy cảm. Bắt buộc phải
   * vậy: payload của JWT ai cũng đọc được (xem `lib/jwt.ts`).
   */
  const accessToken = signAccessToken({ id: user.id, email: user.email });

  /*
   * BƯỚC 2 — Sinh refresh token, và băm nó.
   *
   * Hai biến, hai số phận hoàn toàn khác nhau — đây là chỗ dễ viết nhầm nhất
   * trong cả file, nên để ý kỹ:
   *
   *     rawRefreshToken  → GỬI CHO CLIENT.  KHÔNG lưu vào database.
   *     tokenHash        → LƯU DATABASE.    KHÔNG gửi cho client.
   *
   * Lẫn lộn hai thứ này là một lỗ hổng thật: lưu nhầm `rawRefreshToken` vào DB
   * thì ai đọc trộm được bảng `Session` sẽ chiếm được mọi phiên đang hoạt động.
   */
  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);

  /*
   * BƯỚC 3 — Ghi phiên vào database.
   *
   * `Date.now()` trả về MILI-giây, còn hằng số của ta tính bằng GIÂY, nên phải
   * nhân 1000. Nhầm đơn vị ở đây là lỗi kinh điển và rất khó thấy: quên nhân
   * 1000 thì phiên hết hạn sau 30 GIÂY thay vì 30 NGÀY, và bạn sẽ ngồi tự hỏi
   * vì sao người dùng cứ bị đá ra liên tục.
   *
   * Mẹo tránh: hễ trộn `Date.now()` với một hằng số thời gian, hãy dừng lại
   * kiểm tra đơn vị của cả hai vế. JavaScript dùng mili-giây, còn gần như mọi
   * chuẩn khác (JWT, cookie Max-Age, HTTP header) dùng giây.
   */
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  /*
   * BƯỚC 4 — Trả về cho controller.
   *
   * `expiresIn` là số giây, không phải mốc thời gian. Frontend dùng nó để đặt
   * `Max-Age` cho cookie access token — và cookie cũng tính bằng giây, nên hai
   * bên khớp đơn vị, không phải quy đổi gì cả.
   *
   * Vì sao trả về số GIÂY CÒN LẠI thay vì MỐC HẾT HẠN? Vì mốc hết hạn phụ thuộc
   * vào đồng hồ của server, mà đồng hồ hai máy không bao giờ khớp tuyệt đối.
   * "Còn 3600 giây nữa" thì đúng với mọi đồng hồ.
   */
  return {
    accessToken,
    refreshToken: rawRefreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    user: { id: user.id, email: user.email },
  };
}

/**
 * ĐĂNG KÝ — tạo tài khoản mới.
 *
 * Lưu ý luồng này KHÔNG trả về token. Đăng ký xong, người dùng phải đăng nhập
 * như bình thường.
 *
 * Nhiều app chọn tự đăng nhập luôn cho tiện. Ta không làm vậy vì hai lý do:
 * luồng đơn giản hơn để học, và quan trọng hơn — nó buộc người dùng gõ lại mật
 * khẩu ngay lập tức, giúp họ phát hiện sớm nếu vừa gõ nhầm thứ mình tưởng.
 */
export async function register(email: string, password: string) {
  /*
   * ---------------------------------------------------------------------------
   * BƯỚC 1 — Băm mật khẩu TRƯỚC KHI chạm tới database.
   * ---------------------------------------------------------------------------
   * Thứ tự này quan trọng và đáng thành thói quen: mật khẩu dạng chữ thật chỉ
   * tồn tại trong RAM, trong đúng vài dòng code, rồi biến mất cùng lời gọi hàm.
   *
   * Nó không bao giờ được đi đâu xa hơn. Cụ thể là KHÔNG BAO GIỜ:
   *   - `console.log(password)` — log thường được gom về một hệ thống tập trung
   *     mà cả đội đọc được, và được giữ hàng tháng
   *   - gửi vào công cụ theo dõi lỗi (Sentry và tương tự)
   *   - lưu tạm vào một bảng nào đó "để debug"
   *
   * Rất nhiều vụ lộ mật khẩu lớn trong thực tế không đến từ database bị hack,
   * mà đến từ một dòng log bị bỏ quên.
   */
  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: { email, passwordHash },
      /*
       * `select` giới hạn những cột được trả về.
       *
       * Không có nó, Prisma trả về CẢ `passwordHash`. Object đó rồi sẽ được
       * `res.json()` gửi thẳng cho client — tức là ta vừa công bố chuỗi hash mật
       * khẩu qua mạng.
       *
       * Hash không phải mật khẩu, nhưng lộ nó vẫn tệ: kẻ tấn công mang về máy
       * mình dò cạn thoải mái, không giới hạn số lần thử, không ai phát hiện.
       *
       * Thói quen đáng có: hễ bảng nào chứa dữ liệu nhạy cảm, LUÔN dùng `select`
       * và liệt kê tường minh những gì được phép ra ngoài. Đây là cách làm theo
       * kiểu "danh sách cho phép" — quên thêm một cột thì hậu quả là thiếu dữ
       * liệu (thấy ngay), chứ không phải rò rỉ dữ liệu (không ai thấy).
       */
      select: { id: true, email: true },
    });

    return user;
  } catch (err) {
    /*
     * -------------------------------------------------------------------------
     * BẮT ĐÚNG MỘT LOẠI LỖI: EMAIL ĐÃ TỒN TẠI
     * -------------------------------------------------------------------------
     * `P2002` là mã Prisma dùng cho "vi phạm ràng buộc unique". Ở bảng này chỉ
     * có một cột unique là `email`, nên gặp P2002 tức là email đã có người dùng.
     *
     * Vì sao để database phát hiện, thay vì tự kiểm trước bằng `findUnique`?
     *
     *   Vì tự kiểm trước KHÔNG AN TOÀN. Hai request đăng ký cùng email chạy song
     *   song có thể CÙNG thấy "chưa ai dùng", rồi CÙNG quyết định tạo mới:
     *
     *       Request A: findUnique("an@x.com") → null   ┐
     *       Request B: findUnique("an@x.com") → null   ┤ cả hai đều thấy trống
     *       Request A: create(...)            → OK     │
     *       Request B: create(...)            → ???    ┘
     *
     *   Khe hở giữa lúc KIỂM và lúc GHI có tên riêng: TOCTOU (time-of-check to
     *   time-of-use). Không có cách nào đóng nó lại ở tầng code.
     *
     *   Chỉ database mới có cái nhìn cuối cùng. Ràng buộc `@unique` chặn được
     *   request đến sau, và đó là lý do ta để nó làm việc rồi bắt lỗi — thay vì
     *   cố phòng ngừa bằng một phép kiểm tra không bao giờ đủ tin cậy.
     *
     * Đây là một cách nghĩ rất đáng mang theo: THỬ VÀ XỬ LÝ THẤT BẠI thường
     * đúng đắn hơn KIỂM TRA RỒI MỚI LÀM, mỗi khi giữa hai bước đó có người khác
     * chen vào được.
     */
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(409, "Email này đã được đăng ký.");
    }

    /*
     * Lỗi khác (mất kết nối database chẳng hạn) thì ném tiếp lên trên, để
     * `errorHandler` trả 500 và in stack trace ra terminal.
     *
     * Đừng bao giờ nuốt lỗi lạ bằng một `catch` im lặng. Lỗi bạn không lường
     * trước chính là lỗi bạn cần nhìn thấy nhất.
     */
    throw err;
  }
}

/**
 * ĐĂNG NHẬP — kiểm mật khẩu rồi mở phiên mới.
 */
export async function login(email: string, password: string): Promise<AuthSession> {
  const user = await prisma.user.findUnique({ where: { email } });

  /*
   * ---------------------------------------------------------------------------
   * CHI TIẾT BẢO MẬT QUAN TRỌNG NHẤT CỦA CẢ FILE — ĐỌC KỸ
   * ---------------------------------------------------------------------------
   *
   * Hai trường hợp thất bại hoàn toàn khác nhau về bản chất:
   *
   *     (a) email không tồn tại
   *     (b) email có, nhưng mật khẩu sai
   *
   * và ta cố ý trả về ĐÚNG MỘT thông báo giống hệt nhau cho cả hai.
   *
   * VÌ SAO? Vì nếu phân biệt, API này biến thành một công cụ dò danh sách người
   * dùng. Kẻ tấn công thử lần lượt vài triệu email với mật khẩu bậy:
   *
   *     "Email không tồn tại"  → địa chỉ này KHÔNG dùng dịch vụ của bạn
   *     "Mật khẩu không đúng"  → địa chỉ này CÓ tài khoản ở đây ✓
   *
   * Hắn thu được một danh sách email có thật. Danh sách đó đáng giá: để gửi thư
   * lừa đảo nhắm đúng đối tượng, để thử lại mật khẩu lộ từ vụ rò rỉ của trang
   * khác (rất hiệu quả vì người ta dùng lại mật khẩu), hoặc chỉ để bán.
   *
   * Và với một số dịch vụ, riêng việc "ai đó có tài khoản ở đây" đã là thông tin
   * nhạy cảm — hãy nghĩ tới một ứng dụng sức khoẻ hay hẹn hò.
   *
   * ⚠️ Cái bẫy rất dễ sập: thông báo giống nhau là CHƯA ĐỦ. Thời gian phản hồi
   * cũng phải giống nhau. Nếu email không tồn tại thì ta trả lời ngay lập tức
   * (không chạy bcrypt), còn email có thật thì mất ~250ms để băm — kẻ tấn công
   * chỉ cần bấm giờ là phân biệt được, dù đọc thấy cùng một câu chữ.
   *
   * Cách xử lý triệt để: luôn chạy bcrypt, kể cả khi không tìm thấy user, bằng
   * cách so mật khẩu với một chuỗi hash giả. Dự án này KHÔNG làm vậy để code còn
   * dễ đọc, và vì đây là app học tập — nhưng bạn cần biết khe hở đó tồn tại và
   * có tên: timing attack. Trong một hệ thống thật, hãy bịt nó lại.
   */
  const invalidCredentials = new AppError(401, "Email hoặc mật khẩu không đúng.");

  if (!user) {
    throw invalidCredentials;
  }

  const isMatch = await verifyPassword(password, user.passwordHash);

  if (!isMatch) {
    throw invalidCredentials;
  }

  return createSession(user);
}

/**
 * GIA HẠN — đổi refresh token cũ lấy một cặp token hoàn toàn mới.
 *
 * Đây là hàm làm cho trải nghiệm đăng nhập trở nên dễ chịu. Không có nó, đúng
 * một giờ sau khi đăng nhập người dùng sẽ bị đá ra giữa chừng, kể cả khi đang
 * gõ dở một ghi chú.
 */
export async function refresh(rawRefreshToken: string): Promise<AuthSession> {
  /*
   * BƯỚC 1 — Băm token client gửi lên, rồi tra bằng chính chuỗi hash đó.
   *
   * Nhắc lại: database KHÔNG chứa token gốc. Ta không thể (và không cần) so
   * sánh chuỗi gốc với bất cứ thứ gì — ta băm rồi tìm hàng có cùng hash.
   *
   * `include: { user: true }` bảo Prisma kéo luôn hàng `User` liên quan, trong
   * CÙNG một câu SQL (thực chất là một phép JOIN). Không có nó, ta phải gọi
   * `prisma.user.findUnique` thêm một lần nữa — hai lần đi về database thay vì
   * một. Đây là cái lợi cụ thể của việc khai `@relation` trong schema.
   */
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  const invalidSession = new AppError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");

  if (!session) {
    throw invalidSession;
  }

  /*
   * BƯỚC 2 — Kiểm hạn BẰNG TAY.
   *
   * Khác hẳn access token: JWT tự mang `exp` bên trong và `jwt.verify` tự kiểm
   * hộ. Refresh token thì chỉ là một chuỗi ngẫu nhiên vô nghĩa, không mang theo
   * thông tin gì cả — nên hạn nằm ở cột `expiresAt` và ta phải tự so sánh.
   *
   * Đây chính là cái giá của "opaque token": đổi lại sự an toàn và khả năng thu
   * hồi, ta phải tự làm những việc mà JWT làm sẵn.
   *
   * Xoá hàng ngay tại chỗ là một kiểu dọn dẹp cơ hội (opportunistic cleanup):
   * không cần dựng hẳn một tác vụ chạy nền, cứ gặp rác thì hốt luôn. Nó không
   * dọn được những hàng mà chủ nhân không bao giờ quay lại, nhưng nó miễn phí.
   */
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    throw invalidSession;
  }

  /*
   * ---------------------------------------------------------------------------
   * BƯỚC 3 — XOAY VÒNG TOKEN (token rotation)
   * ---------------------------------------------------------------------------
   *
   * Xoá phiên cũ, rồi `createSession` tạo phiên mới với token mới. Nghĩa là mỗi
   * refresh token chỉ dùng được ĐÚNG MỘT LẦN.
   *
   * Vì sao không giữ nguyên token cũ cho đơn giản?
   *
   *   Vì refresh token sống 30 ngày. Nếu nó bị lộ mà không bao giờ đổi, kẻ tấn
   *   công dùng được suốt 30 ngày mà không ai hay biết — người dùng thật vẫn
   *   đăng nhập bình thường, không có dấu hiệu gì bất thường.
   *
   *   Có xoay vòng thì cửa sổ đó thu hẹp lại còn tới lần gia hạn kế tiếp. Sau
   *   đó token trong tay kẻ tấn công thành vô dụng.
   *
   * Và có một hệ quả đẹp hơn nữa: xoay vòng khiến việc DÙNG TRỘM TRỞ NÊN PHÁT
   * HIỆN ĐƯỢC. Nếu kẻ tấn công gia hạn trước, người dùng thật sẽ cầm một token
   * đã bị xoá và bị đá ra giữa phiên một cách khó hiểu. Hệ thống thật tận dụng
   * tín hiệu đó: giữ lại token đã dùng trong một danh sách, và hễ thấy ai đó
   * dùng lại một token cũ thì XOÁ SẠCH mọi phiên của người dùng đó — vì chắc
   * chắn có hai bên đang cùng giữ token, và ta không biết bên nào là thật.
   *
   * Dự án này dừng ở mức xoay vòng đơn giản. Phần phát hiện tái sử dụng để lại
   * như một bài tập, nhưng đáng biết là nó tồn tại và có tên: refresh token
   * reuse detection.
   *
   * ⚠️ Một điều cần thừa nhận: hai thao tác dưới đây (xoá + tạo) KHÔNG nằm
   * trong cùng một transaction. Nếu server sập đúng khoảng giữa, phiên cũ đã
   * mất mà phiên mới chưa có — người dùng phải đăng nhập lại. Hậu quả nhẹ và
   * xác suất cực thấp, nên ta chấp nhận để code dễ đọc. Cách làm đúng cho hệ
   * thống thật là bọc cả hai trong `prisma.$transaction(...)`.
   */
  await prisma.session.delete({ where: { id: session.id } });

  return createSession(session.user);
}

/**
 * ĐĂNG XUẤT — đóng đúng một phiên.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG NÉM LỖI KHI KHÔNG TÌM THẤY PHIÊN?
 * ---------------------------------------------------------------------------
 * `deleteMany` không phàn nàn khi không có hàng nào khớp — nó lặng lẽ xoá 0
 * hàng. Còn `delete` (số ít) sẽ ném lỗi P2025. Ta chọn `deleteMany` có chủ ý.
 *
 * Lý do: đăng xuất là một thao tác nên LUÔN THÀNH CÔNG. Người dùng bấm "đăng
 * xuất" vì họ muốn phiên kết thúc. Nếu token đã hết hạn, đã bị xoá, hoặc bị gõ
 * sai — thì trạng thái mong muốn ĐÃ ĐẠT ĐƯỢC rồi. Báo lỗi lúc đó vừa vô nghĩa
 * vừa đáng sợ: người dùng sẽ tưởng mình vẫn đang đăng nhập.
 *
 * Tính chất này có tên: IDEMPOTENT — gọi một lần hay mười lần đều cho ra cùng
 * một kết quả. Nó rất đáng có cho mọi thao tác kiểu "đảm bảo thứ này không còn
 * tồn tại", vì client có thể gửi lại request khi mạng chập chờn mà không sợ gì.
 *
 * ---------------------------------------------------------------------------
 * MỘT SỰ THẬT CẦN THỪA NHẬN VỀ ĐĂNG XUẤT
 * ---------------------------------------------------------------------------
 * Hàm này xoá refresh token, nhưng ACCESS TOKEN VẪN CÒN SỐNG tới khi hết hạn —
 * tối đa một giờ nữa. Không có cách nào thu hồi nó (xem `lib/jwt.ts`).
 *
 * Nghe đáng lo, nhưng trong thực tế thì chấp nhận được, vì frontend xoá cookie
 * ngay lập tức nên trình duyệt không còn chỗ nào để gửi kèm token nữa. Kẻ duy
 * nhất còn dùng được nó là người đã CÓ SẴN token trong tay từ trước — mà nếu
 * hắn có, thì bạn đã gặp vấn đề lớn hơn chuyện đăng xuất rồi.
 *
 * Khi nào một giờ là quá lâu? Khi làm ngân hàng, y tế, hoặc bất cứ đâu mà "đăng
 * xuất" phải có hiệu lực tức thì. Lúc đó bạn phải đánh đổi: hoặc rút tuổi thọ
 * access token xuống rất ngắn (5 phút), hoặc giữ một danh sách token bị thu hồi
 * và tra nó ở mỗi request — tức là từ bỏ chính cái lợi "không cần tra database"
 * đã khiến ta chọn JWT ngay từ đầu.
 *
 * Không có phương án nào miễn phí. Chọn theo cái giá bạn sẵn sàng trả.
 */
export async function logout(rawRefreshToken: string) {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  await prisma.session.deleteMany({ where: { tokenHash } });
}
