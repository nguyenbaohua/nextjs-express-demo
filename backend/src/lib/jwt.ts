/*
 * ============================================================================
 * JWT — tấm hộ chiếu có chữ ký mà backend tự cấp cho người đã đăng nhập
 * ============================================================================
 *
 * ----------------------------------------------------------------------------
 * VẤN ĐỀ MÀ JWT SINH RA ĐỂ GIẢI QUYẾT
 * ----------------------------------------------------------------------------
 *
 * HTTP không có trí nhớ. Mỗi request đến server là một người lạ hoàn toàn —
 * server không hề biết request này với request trước đó có phải cùng một người
 * hay không. Vậy sau khi đăng nhập xong, làm sao những request SAU đó chứng
 * minh được "tôi là người vừa nhập đúng mật khẩu"?
 *
 * Có hai trường phái trả lời:
 *
 *   CÁCH 1 — SERVER GHI NHỚ (session truyền thống)
 *     Server cấp một mã phiên ngẫu nhiên, và tự ghi vào bộ nhớ hoặc database:
 *     "mã abc123 là của user số 7". Mỗi request tới, server tra bảng.
 *     → Ưu: xoá hàng trong bảng là đá người dùng ra ngay lập tức.
 *     → Nhược: mỗi request tốn một lần tra. Có nhiều máy chủ thì phải chia sẻ
 *              kho phiên giữa chúng (thường phải dựng thêm Redis).
 *
 *   CÁCH 2 — TOKEN TỰ MANG THÔNG TIN (JWT)  ← access token dùng cách này
 *     Server không nhớ gì cả. Nó đưa cho client một tờ giấy ghi sẵn "người này
 *     là user số 7", rồi KÝ TÊN vào tờ giấy đó. Mỗi request, client nộp lại tờ
 *     giấy; server chỉ cần kiểm chữ ký có phải của mình không.
 *     → Ưu: không tra database, không cần kho chung giữa các máy chủ.
 *     → Nhược: ĐÃ CẤP LÀ KHÔNG THU HỒI ĐƯỢC.
 *
 * Dự án này dùng CẢ HAI, mỗi cái cho đúng chỗ mạnh của nó:
 *
 *     access token  (file này)   → JWT, sống 1 giờ,  KHÔNG tra database
 *     refresh token (`token.ts`) → chuỗi ngẫu nhiên, CÓ tra bảng `Session`
 *
 * Đọc phần comment dài ở `model Session` trong `prisma/schema.prisma` để hiểu
 * vì sao sự kết hợp đó lại hợp lý.
 *
 * ----------------------------------------------------------------------------
 * MỘT JWT TRÔNG NHƯ THẾ NÀO?
 * ----------------------------------------------------------------------------
 *
 *     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI5ZjNkIiwiZW1ha...  .  4Xk2p...
 *     └──────────────┬──────────────────┘ └──────────────┬─────────┘     └───┬──┘
 *            HEADER (base64)                   PAYLOAD (base64)          CHỮ KÝ
 *        {"alg":"HS256","typ":"JWT"}     {"sub":"9f3d","email":"..."}
 *
 * ⚠️ HIỂU LẦM LỚN NHẤT VỀ JWT, ĐỌC KỸ CHỖ NÀY:
 *
 *     JWT KHÔNG ĐƯỢC MÃ HOÁ. NÓ CHỈ ĐƯỢC KÝ.
 *
 * base64 không phải mã hoá — nó chỉ là một cách viết lại dữ liệu cho an toàn
 * khi truyền qua mạng. Bất kỳ ai cầm token cũng đọc được payload trong 5 giây.
 * Bạn thử ngay được:
 *
 *     echo 'eyJzdWIiOiJhYmMiLCJlbWFpbCI6ImFuQGV4YW1wbGUuY29tIn0=' | base64 -d
 *
 * Hoặc dán token vào https://jwt.io và xem nội dung hiện ra.
 *
 * Hệ quả bắt buộc phải nhớ: KHÔNG BAO GIỜ đặt thông tin nhạy cảm vào payload.
 * Không mật khẩu, không số thẻ, không số căn cước. Chỉ những thứ mà lộ ra cũng
 * không sao — như `id` và `email` ở dưới đây.
 *
 * Vậy chữ ký để làm gì, nếu ai cũng đọc được? Để CHỐNG SỬA. Kẻ tấn công đọc
 * được `{"sub":"user-7"}` nhưng không thể đổi thành `{"sub":"user-1"}` rồi
 * dùng tiếp, vì hắn không có `JWT_SECRET` để ký lại. Sửa một ký tự trong
 * payload là chữ ký cũ không còn khớp, và `jwt.verify` ném lỗi.
 *
 * Tóm lại: JWT đảm bảo TÍNH TOÀN VẸN (không ai sửa được), KHÔNG đảm bảo TÍNH
 * BÍ MẬT (ai cũng đọc được).
 */

import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SECONDS } from "./constants";

/*
 * ---------------------------------------------------------------------------
 * KHOÁ BÍ MẬT — thứ quan trọng nhất của toàn bộ hệ thống đăng nhập
 * ---------------------------------------------------------------------------
 *
 * Ta dùng thuật toán HS256 (HMAC + SHA-256): ký và kiểm chữ ký bằng CÙNG MỘT
 * chuỗi bí mật. Ai có chuỗi này thì tự cấp được token cho bất kỳ ai — tức là
 * đăng nhập được vào mọi tài khoản mà không cần mật khẩu.
 *
 * Vì thế `JWT_SECRET` là bí mật hạng nhất, ngang hàng mật khẩu database:
 *   - Nằm trong `.env`, mà `.env` đã bị `.gitignore` chặn.
 *   - Dev và production PHẢI dùng hai giá trị khác nhau.
 *   - Sinh ngẫu nhiên, đừng tự nghĩ ra: `openssl rand -base64 48`
 *
 * (Có một họ thuật toán khác là RS256, dùng cặp khoá riêng/công khai: một bên
 * ký, nhiều bên kiểm. Cần khi hệ thống có nhiều dịch vụ cùng phải kiểm token mà
 * bạn không muốn phát khoá ký cho tất cả. Với một backend duy nhất như ở đây,
 * HS256 đơn giản hơn và đủ dùng.)
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KIỂM TRA NGAY LÚC NẠP FILE, CHỨ KHÔNG PHẢI LÚC DÙNG?
 * ---------------------------------------------------------------------------
 * Khối `if` dưới đây chạy đúng một lần, ngay khi Node nạp file này — tức là lúc
 * server khởi động, trước khi có bất kỳ request nào.
 *
 * Đây gọi là "fail fast": thiếu cấu hình thì SẬP NGAY với thông báo rõ ràng.
 *
 * Nếu thay vào đó ta chỉ kiểm lúc ký token, thì server vẫn khởi động bình
 * thường, mọi thứ trông ổn, và lỗi chỉ nổ ra khi người dùng đầu tiên bấm nút
 * đăng nhập — có khi là vài tiếng sau khi deploy, lúc bạn đã đóng máy đi ngủ.
 *
 * Nguyên tắc: phát hiện sai sót càng SỚM càng rẻ. Sớm nhất có thể là lúc khởi
 * động, và đó là chỗ nên đặt mọi kiểm tra về cấu hình.
 */
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error(
    "Thiếu biến môi trường JWT_SECRET. Xem backend/.env.example và tạo file backend/.env.",
  );
}

/**
 * Nội dung ta tự đặt vào payload của access token.
 *
 * Nguyên tắc chọn trường: CHỈ ĐƯA VÀO THỨ THỰC SỰ CẦN, vì ba lý do cộng lại
 *
 *   1. Ai cũng đọc được payload (xem phần đầu file) → càng ít càng đỡ lộ.
 *   2. Token đi kèm MỌI request → payload dài là tốn băng thông mọi lần gọi.
 *   3. Dữ liệu trong token bị ĐÓNG BĂNG tại thời điểm cấp. Nhét `role: "admin"`
 *      vào đây, rồi hạ quyền người đó xuống, thì token cũ vẫn nói "admin" cho
 *      tới khi hết hạn. Thông tin hay thay đổi thì phải tra database, đừng
 *      nhét vào token.
 *
 * Ở đây `id` là thứ thực sự cần (mọi câu query todo đều dùng nó), còn `email`
 * là tiện lợi (hiển thị "Xin chào ..." mà không phải tra database).
 */
export type AccessTokenPayload = {
  /** `User.id` — chính là giá trị ở cột `Todo.userId`. */
  id: string;
  /** Email, để hiển thị. */
  email: string;
};

/**
 * Ký một access token mới.
 *
 * Ngoài `id` và `email` của ta, thư viện tự thêm hai trường chuẩn vào payload:
 *
 *   `iat` (issued at) — thời điểm cấp
 *   `exp` (expiration) — thời điểm hết hạn, tính từ `expiresIn` bên dưới
 *
 * Cả hai là số giây kể từ 1/1/1970 (gọi là Unix timestamp), KHÔNG phải mili-giây
 * như `Date.now()` của JavaScript. Nhầm đơn vị ở đây là lỗi rất hay gặp: chia
 * hoặc nhân nhầm 1000 sẽ cho ra token hết hạn từ năm 1970 hoặc sống tới năm
 * 56000.
 *
 * `exp` được CHÍNH TOKEN mang theo và nằm trong phần đã ký, nên client không
 * sửa được để kéo dài tuổi thọ. `jwt.verify` tự đối chiếu `exp` với đồng hồ
 * hiện tại và ném `TokenExpiredError` nếu đã quá hạn — ta không phải tự so sánh
 * thời gian ở bất cứ đâu.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

/**
 * Kiểm chữ ký và hạn của một access token, trả về payload bên trong.
 *
 * Ném lỗi nếu token hỏng, bị sửa, ký bằng khoá khác, hoặc đã hết hạn. Người gọi
 * (`middlewares/requireAuth.ts`) bắt lỗi đó và trả 401.
 *
 * ⚠️ ĐỪNG BAO GIỜ DÙNG `jwt.decode()` THAY CHO `jwt.verify()`.
 *
 * `decode` chỉ bóc base64 ra đọc, KHÔNG kiểm chữ ký. Ai cũng tự chế được một
 * token với payload `{"id":"id-cua-nguoi-khac"}` và `decode` sẽ vui vẻ trả về
 * đúng như vậy. Đây là một lỗ hổng nghiêm trọng có thật, xuất hiện đủ thường
 * xuyên để đáng viết hẳn một cảnh báo ở đây.
 *
 * Quy tắc: `decode` chỉ dùng để gỡ lỗi hoặc để đọc token của người khác cấp mà
 * bạn không cần tin. Mọi quyết định về quyền truy cập phải đi qua `verify`.
 *
 * ---------------------------------------------------------------------------
 * VỀ CÂU `as AccessTokenPayload`
 * ---------------------------------------------------------------------------
 * `jwt.verify` khai báo trả về `string | JwtPayload` vì nó không thể biết bạn
 * đã nhét gì vào token. Ta ép kiểu để phần còn lại của code dùng cho tiện.
 *
 * Ép kiểu ở đây là an toàn — nhưng hãy hiểu đúng VÌ SAO nó an toàn. Không phải
 * vì ta tin client, mà vì chữ ký đã được kiểm TRƯỚC đó: token này chắc chắn do
 * chính `signAccessToken` ở trên tạo ra, và hàm đó luôn nhận vào đúng hình dạng
 * `AccessTokenPayload`.
 *
 * Nói cách khác, chữ ký hợp lệ là bằng chứng về nguồn gốc, và nguồn gốc là bằng
 * chứng về hình dạng. Nếu token đến từ một hệ thống khác mà bạn không kiểm soát
 * payload, thì phải validate bằng zod chứ không được ép kiểu như thế này.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET!) as AccessTokenPayload;
}
