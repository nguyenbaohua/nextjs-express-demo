/*
 * ============================================================================
 * CẦU NỐI TỚI AWS COGNITO
 * ============================================================================
 *
 * File này là nơi DUY NHẤT trong backend biết cách nói chuyện với Cognito. Mọi
 * chỗ khác chỉ gọi các hàm ở đây. Giữ nó gom một chỗ như vậy có hai cái lợi:
 * đọc code không phải nhảy lung tung, và sau này muốn đổi sang dịch vụ khác
 * (Auth0, Firebase Auth...) thì chỉ phải sửa đúng một file.
 *
 * File này lo ba việc:
 *   1. Đọc và kiểm tra cấu hình trong .env
 *   2. Tạo client để GỌI Cognito (đăng ký, đăng nhập)
 *   3. Tạo verifier để KIỂM TRA token do Cognito phát ra
 *
 * ----------------------------------------------------------------------------
 * BA LOẠI TOKEN — hiểu chỗ này là hiểu 80% phần xác thực
 * ----------------------------------------------------------------------------
 *
 * Đăng nhập thành công, Cognito trả về ba chuỗi ký tự dài loằng ngoằng. Chúng
 * KHÔNG thay thế cho nhau được, mỗi cái một nhiệm vụ:
 *
 *   ID token       — "người này LÀ AI".
 *                    Chứa email, tên, sub... Dùng để HIỂN THỊ (chào "Xin chào
 *                    an@gmail.com"). Sống 1 giờ.
 *
 *   Access token   — "người này ĐƯỢC LÀM GÌ".
 *                    Đây là cái gửi kèm mỗi request API. Backend kiểm cái này
 *                    để quyết định cho hay không cho. Sống 1 giờ.
 *
 *   Refresh token  — "vé đổi lấy hai cái trên khi chúng hết hạn".
 *                    Sống 30 ngày. Nhờ nó mà người dùng không phải đăng nhập
 *                    lại mỗi giờ. Đây là token QUÝ NHẤT: ai lấy được nó thì
 *                    coi như chiếm được tài khoản trong 30 ngày.
 *
 * Vì sao lại chia ba mà không dùng một token sống 30 ngày cho gọn?
 *   Vì access token đi ra đi vào mạng liên tục ở MỌI request → khả năng bị lộ
 *   cao. Cho nó sống ngắn thì kẻ trộm được cũng chỉ dùng được tối đa 1 giờ.
 *   Ngược lại refresh token hiếm khi được gửi đi (chỉ lúc gia hạn) → ít rủi ro
 *   hơn nên cho sống dài được. Đây là đánh đổi kinh điển giữa tiện lợi và an
 *   toàn, và cách giải quyết là tách đôi trách nhiệm.
 */

import { createHmac } from "node:crypto";
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";

/*
 * ----------------------------------------------------------------------------
 * ĐỌC CẤU HÌNH — và dừng ngay nếu thiếu
 * ----------------------------------------------------------------------------
 *
 * Hàm này đọc các biến môi trường bắt buộc. Thiếu bất kỳ biến nào, nó in ra một
 * thông báo rõ ràng rồi TẮT SERVER LUÔN.
 *
 * Nghe hơi phũ, nhưng đây là chủ ý. Nếu thiếu `COGNITO_CLIENT_ID` mà vẫn cho
 * server chạy, lỗi sẽ chỉ lộ ra lúc có người thật bấm nút đăng nhập — kèm một
 * thông báo khó hiểu từ AWS. Dừng ngay lúc khởi động, kèm câu tiếng Việt chỉ
 * đúng tên biến còn thiếu, dễ sửa hơn nhiều.
 *
 * Nguyên tắc chung: LỖI CẤU HÌNH NÊN NỔ CÀNG SỚM CÀNG TỐT ("fail fast"). Một
 * server chạy được nhưng cấu hình sai còn tệ hơn một server không chịu chạy, vì
 * nó tạo cảm giác mọi thứ vẫn ổn.
 *
 * Chi tiết nhỏ nhưng đáng để ý: hàm gom TẤT CẢ biến còn thiếu rồi mới báo một
 * lần, thay vì báo từng cái một. Nếu báo lần lượt, bạn sẽ phải chạy lại server
 * bốn lần để phát hiện ra mình thiếu bốn biến — kiểu vòng lặp sửa lỗi gây ức chế
 * mà hoàn toàn tránh được.
 *
 * `process.exit(1)` dừng chương trình với mã thoát 1 (theo quy ước Unix: 0 là
 * thành công, khác 0 là thất bại). Ta dùng nó thay vì `throw` để tránh in ra một
 * stack trace dài loằng ngoằng — ở đây stack trace chẳng giúp gì, vì lỗi không
 * nằm trong code mà nằm ở file .env.
 */
function readRequiredEnv() {
  const names = [
    "AWS_REGION",
    "COGNITO_USER_POOL_ID",
    "COGNITO_CLIENT_ID",
  ] as const;

  const missing = names.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.error(
      [
        "",
        "❌ Chưa cấu hình AWS Cognito. Thiếu các biến sau trong backend/.env:",
        ...missing.map((name) => `   - ${name}`),
        "",
        "👉 Hướng dẫn lấy từng giá trị trong AWS Console: .note/cognito-setup.md",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }

  return {
    region: process.env.AWS_REGION!,
    userPoolId: process.env.COGNITO_USER_POOL_ID!,
    clientId: process.env.COGNITO_CLIENT_ID!,
  };
}

const required = readRequiredEnv();

export const cognitoConfig = {
  region: required.region,
  userPoolId: required.userPoolId,
  clientId: required.clientId,
  /*
   * Client secret là tuỳ chọn, nên nó KHÔNG nằm trong danh sách bắt buộc ở trên.
   *
   * Nếu app client của bạn được tạo với "Generate a client secret" (đúng như
   * hướng dẫn trong .note/cognito-setup.md), biến này có giá trị và mọi request
   * gửi lên Cognito phải kèm SECRET_HASH.
   *
   * Nếu bạn lỡ tạo app client KHÔNG có secret, để trống biến này thì code vẫn
   * chạy — phần dưới tự bỏ qua SECRET_HASH. Cognito thì ngược lại rất khó tính:
   * gửi SECRET_HASH cho client không secret, hay quên gửi cho client có secret,
   * đều bị từ chối thẳng.
   *
   * `|| undefined` biến chuỗi rỗng thành `undefined`. Cần thiết vì một dòng
   * `COGNITO_CLIENT_SECRET=` trong .env cho ra chuỗi rỗng chứ không phải
   * undefined, mà chuỗi rỗng thì lọt qua phép kiểm tra `if (!secret)` kiểu khác
   * và sinh ra SECRET_HASH rác.
   */
  clientSecret: process.env.COGNITO_CLIENT_SECRET || undefined,
};

/*
 * ----------------------------------------------------------------------------
 * SECRET_HASH — chữ ký chứng minh "request này đúng là từ app của tôi"
 * ----------------------------------------------------------------------------
 *
 * Khi app client có client secret, Cognito bắt mọi request phải kèm một trường
 * tên `SECRET_HASH`. Nó không phải mật khẩu người dùng — nó là bằng chứng rằng
 * request đến từ server của bạn chứ không phải từ một kẻ nào đó chỉ tình cờ biết
 * Client ID (Client ID không phải bí mật, ai cũng có thể thấy).
 *
 * Công thức do AWS quy định, không được sáng tạo:
 *
 *     SECRET_HASH = base64( HMAC-SHA256( key = clientSecret,
 *                                        message = username + clientId ) )
 *
 * Giải thích HMAC cho dễ hình dung: nó trộn một "khoá bí mật" với một "thông
 * điệp" để ra một chuỗi có vẻ ngẫu nhiên. Ai không biết khoá thì không tạo ra
 * được chuỗi đúng, nhưng ai biết khoá thì kiểm tra được ngay. Giống như con dấu
 * giáp lai: làm giả rất khó, kiểm tra rất dễ.
 *
 * Điểm cực dễ sai: thứ tự phải là `username + clientId`, KHÔNG phải ngược lại.
 * Sai thứ tự thì Cognito trả về lỗi `Unable to verify secret hash for client`,
 * và thông báo đó chẳng nói gì về nguyên nhân thật cả.
 */
export function secretHash(username: string): string | undefined {
  if (!cognitoConfig.clientSecret) {
    return undefined;
  }
  return createHmac("sha256", cognitoConfig.clientSecret)
    .update(username + cognitoConfig.clientId)
    .digest("base64");
}

/*
 * ----------------------------------------------------------------------------
 * CLIENT — dùng để GỌI Cognito
 * ----------------------------------------------------------------------------
 *
 * Đây là đối tượng dùng để gửi lệnh lên Cognito: đăng ký, xác thực mã, đăng
 * nhập, gia hạn token.
 *
 * Chú ý là ta KHÔNG cấu hình AWS access key ở đây. Lý do: mấy API mà backend
 * này dùng (SignUp, ConfirmSignUp, InitiateAuth) là loại API công khai — chúng
 * được thiết kế để gọi được mà không cần tài khoản AWS, vì chính người dùng cuối
 * mới là đối tượng của chúng. Thứ bảo vệ chúng là cặp Client ID + Client secret.
 *
 * (Cognito cũng có nhóm API khác tên bắt đầu bằng `Admin...` — ví dụ
 * `AdminDeleteUser` — và nhóm đó thì BẮT BUỘC cần AWS credentials. Dự án này
 * không dùng tới.)
 */
export const cognitoClient = new CognitoIdentityProviderClient({
  region: cognitoConfig.region,
});

/*
 * ----------------------------------------------------------------------------
 * VERIFIER — dùng để KIỂM TRA token
 * ----------------------------------------------------------------------------
 *
 * Đây là nửa còn lại và là phần thú vị nhất của toàn bộ hệ thống.
 *
 * Câu hỏi: khi nhận được một access token từ client, làm sao backend biết nó
 * thật hay do người ta tự bịa ra?
 *
 * Cách ngây thơ: gọi sang Cognito hỏi "token này có hợp lệ không?". Chạy được,
 * nhưng tệ — mỗi request của người dùng đẻ thêm một request ra Internet, chậm
 * và Cognito sập là app sập theo.
 *
 * Cách Cognito thật sự dùng — MẬT MÃ BẤT ĐỐI XỨNG:
 *
 *   Cognito có một cặp khoá. Khoá RIÊNG (private key) nó giữ kín, dùng để KÝ
 *   token. Khoá CÔNG KHAI (public key) nó công bố cho cả thế giới, dùng để KIỂM
 *   chữ ký. Điều kỳ diệu của toán học ở đây là: có khoá công khai thì kiểm tra
 *   được chữ ký, nhưng KHÔNG tạo ra được chữ ký giả.
 *
 *   Nên backend chỉ cần tải khoá công khai về một lần, rồi tự kiểm mọi token
 *   ngay tại chỗ. Không cần hỏi ai. Sửa một ký tự trong token là chữ ký hỏng
 *   ngay lập tức.
 *
 *   Bộ khoá công khai đó nằm ở một URL cố định, gọi là JWKS (JSON Web Key Set):
 *   https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json
 *   Thư viện `aws-jwt-verify` tự tải và tự cache URL này giúp ta.
 *
 * Verifier kiểm 5 thứ, thiếu một là từ chối:
 *   1. Chữ ký có đúng khoá của user pool này không?
 *   2. Token còn hạn không? (trường `exp`)
 *   3. Token do ĐÚNG user pool này phát ra không? (`iss`)
 *   4. Token có đúng loại `access` không? (không cho xài ID token thay thế)
 *   5. Token có được phát cho ĐÚNG app client này không? (`client_id`)
 *
 * Điểm 4 quan trọng hơn vẻ ngoài của nó. Cả ID token lẫn access token đều do
 * cùng một user pool ký, nên nếu không ràng `tokenUse` thì một token dành cho
 * việc hiển thị lại được dùng để mở cửa API. Nêu rõ ý định luôn an toàn hơn là
 * để mặc định.
 */
export const accessTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId,
  tokenUse: "access",
  clientId: cognitoConfig.clientId,
});

/*
 * Verifier riêng cho ID token.
 *
 * Ta cần nó vì access token của Cognito KHÔNG chứa email — nó chỉ có `sub` và
 * `username`. Muốn hiện email người dùng lên giao diện thì phải đọc từ ID token.
 * Đây đúng là sự phân vai đã nói ở đầu file: access token để mở cửa, ID token để
 * biết mình đang tiếp ai.
 */
export const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId,
  tokenUse: "id",
  clientId: cognitoConfig.clientId,
});
