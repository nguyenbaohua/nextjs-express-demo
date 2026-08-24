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

/*
 * ============================================================================
 * PHẦN DÀNH RIÊNG CHO ĐĂNG NHẬP BẰNG GOOGLE (federated login)
 * ============================================================================
 *
 * ----------------------------------------------------------------------------
 * Ý TƯỞNG CỐT LÕI — đọc kỹ đoạn này là hiểu toàn bộ tính năng
 * ----------------------------------------------------------------------------
 *
 * Backend của chúng ta KHÔNG nói chuyện trực tiếp với Google. Một dòng code nào
 * gọi tới `googleapis.com` cũng không có.
 *
 * Thay vào đó, ta khai báo Google làm "Identity Provider" (nhà cung cấp danh
 * tính) NGAY BÊN TRONG Cognito User Pool. Từ đó Cognito đứng ra làm người trung
 * gian: nó đi hỏi Google, nhận kết quả, rồi phát ra token của CHÍNH NÓ cho ta.
 *
 *   Trình duyệt → Cognito Hosted UI → Google → Cognito → app của bạn
 *
 * Ba cái lợi rất lớn của cách này:
 *
 *   1. Backend chỉ phải biết MỘT nhà cung cấp danh tính là Cognito. Mai này thêm
 *      Facebook, Apple, GitHub... thì code backend KHÔNG đổi một dòng nào — chỉ
 *      thêm cấu hình trong AWS Console.
 *
 *   2. Token nhận được vẫn là JWT do Cognito ký, y hệt token của luồng email +
 *      mật khẩu. Nghĩa là `requireAuth`, `accessTokenVerifier`, cột `userId`
 *      trong database... tất cả dùng lại nguyên xi, không sửa gì.
 *
 *   3. 🔴 QUAN TRỌNG NHẤT, và cũng là điều bạn yêu cầu: NGƯỜI DÙNG ĐƯỢC TỰ ĐỘNG
 *      TẠO TRONG USER POOL ngay lần đầu đăng nhập bằng Google. Bạn không phải
 *      viết bất kỳ dòng code "tạo tài khoản" nào cả — Cognito tự làm. Vào AWS
 *      Console → User pool → tab Users sẽ thấy một user mới tên dạng
 *      `Google_115482...`, cột "Identity provider" ghi là Google.
 *
 * ----------------------------------------------------------------------------
 * HOSTED UI LÀ GÌ, VÀ VÌ SAO LẦN NÀY TA BẮT BUỘC PHẢI DÙNG NÓ?
 * ----------------------------------------------------------------------------
 *
 * Hosted UI là trang đăng nhập DO AWS DỰNG SẴN, nằm trên tên miền của AWS:
 *
 *     https://<domain>.auth.<region>.amazoncognito.com
 *
 * Ở luồng email + mật khẩu, ta cố tình KHÔNG dùng Hosted UI: ta tự làm form đẹp
 * theo ý mình rồi gọi thẳng API `InitiateAuth`.
 *
 * Với Google thì KHÔNG có lựa chọn đó. Vì sao?
 *
 *   Bản chất của OAuth là: người dùng phải TỰ TAY nhập mật khẩu Google TRÊN
 *   TRANG CỦA GOOGLE. Đó chính là điểm mấu chốt khiến OAuth an toàn — mật khẩu
 *   Google không bao giờ đi qua tay bạn, nên bạn không thể làm lộ nó dù muốn.
 *
 *   Mà muốn quay về được sau khi người dùng bấm "Cho phép" ở trang Google, phải
 *   có một địa chỉ CỐ ĐỊNH, ĐÃ ĐĂNG KÝ TRƯỚC để Google trả kết quả về. Địa chỉ
 *   đó chính là Hosted UI của Cognito (`/oauth2/idpresponse`).
 *
 * Nói ngắn gọn: luồng email + mật khẩu là "app hỏi hộ người dùng", còn luồng
 * Google là "người dùng tự đi khai báo ở nơi khác rồi mang giấy chứng nhận về".
 * Hai bản chất khác nhau, nên hai luồng kỹ thuật khác nhau.
 *
 * ----------------------------------------------------------------------------
 * BIẾN MÔI TRƯỜNG `COGNITO_DOMAIN`
 * ----------------------------------------------------------------------------
 *
 * Đây là biến DUY NHẤT phải thêm vào backend/.env cho tính năng này.
 *
 * Nó KHÔNG nằm trong danh sách bắt buộc của `readRequiredEnv()` ở đầu file. Chủ ý
 * đấy: thiếu nó thì luồng email + mật khẩu vẫn chạy bình thường, chỉ riêng nút
 * "Đăng nhập bằng Google" báo lỗi. Bắt cả server chết vì một tính năng phụ chưa
 * cấu hình là phản ứng quá đà.
 *
 * 👉 Cách tạo domain và lấy giá trị này: đọc `.note/google-login-setup.md`.
 */

/**
 * Chuẩn hoá `COGNITO_DOMAIN` thành một origin đầy đủ dạng `https://...`.
 *
 * Hàm này tồn tại thuần tuý vì lòng tốt với người dùng. Trong AWS Console, tuỳ
 * bạn đứng ở màn hình nào mà chỗ hiển thị domain sẽ cho ra ba dạng khác nhau, và
 * ai cũng có thể copy nhầm dạng:
 *
 *     todo-app-demo                                            ← chỉ phần prefix
 *     todo-app-demo.auth.ap-southeast-1.amazoncognito.com      ← host đầy đủ
 *     https://todo-app-demo.auth.ap-southeast-1.amazoncognito.com  ← có cả scheme
 *
 * Cả ba dạng đều được chấp nhận ở đây. Nếu không xử lý, người học sẽ dán dạng
 * đầu tiên rồi nhận về lỗi `fetch failed` hoặc `ENOTFOUND` — một thông báo chẳng
 * nói gì về nguyên nhân thật.
 *
 * Quy tắc rút ra: ở ranh giới giữa CON NGƯỜI và chương trình, hãy rộng rãi với
 * dữ liệu vào. Chỗ đáng khắt khe là ranh giới giữa chương trình với chương trình.
 */
function readHostedUiOrigin(region: string): string | undefined {
  const raw = process.env.COGNITO_DOMAIN?.trim();

  if (!raw) {
    return undefined;
  }

  // Bỏ "https://" ở đầu và mọi dấu "/" ở cuối, nếu người dùng lỡ dán vào.
  const host = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  /*
   * Có dấu chấm nghĩa là đã là host đầy đủ. Không có dấu chấm nghĩa là người dùng
   * chỉ dán phần prefix, ta tự ghép nốt phần đuôi theo đúng công thức của AWS.
   *
   * (Nếu bạn dùng custom domain kiểu `auth.tenmiencuaban.com` thì nó có dấu chấm,
   * nên rơi vào nhánh đầu và được giữ nguyên — vẫn đúng.)
   */
  const fullHost = host.includes(".")
    ? host
    : `${host}.auth.${region}.amazoncognito.com`;

  return `https://${fullHost}`;
}

export const hostedUiConfig = {
  /**
   * Origin của Hosted UI, ví dụ `https://todo-app-demo.auth.ap-southeast-1.amazoncognito.com`.
   * `undefined` nghĩa là chưa cấu hình → tính năng đăng nhập Google tắt.
   */
  origin: readHostedUiOrigin(cognitoConfig.region),

  /**
   * TÊN của identity provider Google bên trong User Pool.
   *
   * ⚠️ Với các provider dựng sẵn (Google, Facebook, Apple, Amazon), Cognito ĐẶT
   * SẴN tên và bạn KHÔNG đổi được — nó luôn là đúng chuỗi `"Google"`, viết hoa
   * chữ G. Gõ thành `"google"` chữ thường sẽ nhận lỗi
   * `Identity provider not supported`.
   *
   * (Chỉ khi bạn tự thêm một provider dạng SAML hay OIDC thì mới được tự đặt tên.)
   */
  googleProviderName: "Google",
} as const;
