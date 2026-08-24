/*
 * ============================================================================
 * AUTH SERVICE — nơi thật sự nói chuyện với AWS Cognito
 * ============================================================================
 *
 * Giống `todo.service.ts` với database, file này là tầng duy nhất chạm vào
 * Cognito. Controller ở trên chỉ biết gọi `login(email, password)` và nhận về
 * dữ liệu sạch — nó không cần biết Cognito tồn tại.
 *
 * Mỗi hàm ở đây theo đúng một khuôn:
 *   1. Dựng một "Command" (mô tả việc muốn làm)
 *   2. `cognitoClient.send(command)` — gửi đi và chờ
 *   3. Bắt lỗi, dịch mã lỗi của AWS sang câu tiếng Việt + mã HTTP hợp lý
 *
 * Bước 3 là phần đáng giá nhất. Cognito trả lỗi kiểu
 * `CodeMismatchException: Invalid verification code provided, please try again.`
 * — đúng nhưng vô dụng với người dùng cuối. Việc của tầng này là dịch nó thành
 * câu mà người dùng đọc là biết phải làm gì.
 */

import {
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  cognitoConfig,
  cognitoClient,
  hostedUiConfig,
  idTokenVerifier,
  secretHash,
} from "../lib/cognito";
import { AppError } from "../utils/AppError";

/*
 * ----------------------------------------------------------------------------
 * DỊCH LỖI CỦA AWS SANG TIẾNG NGƯỜI
 * ----------------------------------------------------------------------------
 *
 * SDK của AWS ném ra Error có thuộc tính `.name` là mã lỗi, ví dụ
 * "UsernameExistsException". Ta tra bảng để đổi sang thông báo tiếng Việt.
 *
 * Một quyết định BẢO MẬT quan trọng nằm ở bảng này, để ý dòng
 * `UserNotFoundException`: nó trả về đúng câu như khi sai mật khẩu.
 *
 * Vì sao cố tình mập mờ? Nếu phân biệt rõ "email này chưa đăng ký" và "mật khẩu
 * sai", ta vô tình biến trang đăng nhập thành công cụ tra cứu: kẻ xấu nhập một
 * danh sách email và biết chính xác email nào có tài khoản ở đây. Đó gọi là
 * "user enumeration". Với ngân hàng hay ứng dụng y tế, chỉ riêng việc biết một
 * người CÓ tài khoản đã là rò rỉ thông tin.
 *
 * Đây là ví dụ điển hình của đánh đổi giữa trải nghiệm và bảo mật — và trong
 * chuyện đăng nhập, bảo mật thắng.
 */
const COGNITO_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  UsernameExistsException: {
    status: 409,
    message: "Email này đã được đăng ký. Hãy đăng nhập hoặc dùng email khác.",
  },
  InvalidPasswordException: {
    status: 400,
    message: "Mật khẩu chưa đủ mạnh. Cần ít nhất 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.",
  },
  InvalidParameterException: {
    status: 400,
    message: "Dữ liệu gửi lên không hợp lệ.",
  },
  NotAuthorizedException: {
    status: 401,
    message: "Email hoặc mật khẩu không đúng.",
  },
  UserNotFoundException: {
    // Cố ý giống hệt NotAuthorizedException — xem giải thích ở trên.
    status: 401,
    message: "Email hoặc mật khẩu không đúng.",
  },
  UserNotConfirmedException: {
    status: 403,
    message: "Tài khoản chưa được xác thực. Hãy nhập mã 6 số đã gửi tới email của bạn.",
  },
  CodeMismatchException: {
    status: 400,
    message: "Mã xác thực không đúng.",
  },
  ExpiredCodeException: {
    status: 400,
    message: "Mã xác thực đã hết hạn. Hãy bấm gửi lại mã.",
  },
  TooManyRequestsException: {
    status: 429,
    message: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  },
  LimitExceededException: {
    status: 429,
    message: "Đã vượt quá giới hạn. Vui lòng thử lại sau ít phút.",
  },
};

/*
 * Nhận lỗi bất kỳ, trả về AppError để `errorHandler` biết đường xử lý.
 *
 * Với mã lỗi không có trong bảng, ta trả về câu chung chung 500 nhưng vẫn
 * `console.error` chi tiết ra log. Người dùng không cần biết nội tình hệ thống,
 * còn bạn thì cần — nên thông tin đầy đủ đi vào log, không đi vào response.
 */
function toAppError(err: unknown): AppError {
  const name = err instanceof Error ? err.name : "";
  const known = COGNITO_ERROR_MESSAGES[name];
  if (known) {
    return new AppError(known.status, known.message);
  }
  console.error("[cognito] Lỗi chưa được xử lý:", err);
  return new AppError(500, "Không kết nối được dịch vụ xác thực. Vui lòng thử lại.");
}

/*
 * ----------------------------------------------------------------------------
 * ĐĂNG KÝ
 * ----------------------------------------------------------------------------
 *
 * Gửi email + mật khẩu lên Cognito. Nếu hợp lệ, Cognito tạo tài khoản ở trạng
 * thái UNCONFIRMED và tự gửi mã 6 số về email đó.
 *
 * Lưu ý: hàm này KHÔNG trả về token. Người dùng chưa đăng nhập được cho tới khi
 * xác thực email xong. Bước xác thực đó tồn tại để chặn người ta đăng ký bằng
 * email của người khác, và để bạn chắc chắn liên lạc được với họ sau này.
 */
export async function register(email: string, password: string) {
  try {
    await cognitoClient.send(
      new SignUpCommand({
        ClientId: cognitoConfig.clientId,
        SecretHash: secretHash(email),
        Username: email,
        Password: password,
        /*
         * `UserAttributes` là các thông tin kèm theo tài khoản. Ta khai báo email
         * ở đây vì lúc tạo User Pool đã đặt email là thuộc tính bắt buộc.
         *
         * Trông thừa vì `Username` cũng chính là email — nhưng với Cognito, tên
         * đăng nhập và thuộc tính email là hai thứ tách biệt, và mã xác thực được
         * gửi tới THUỘC TÍNH email chứ không phải tới tên đăng nhập.
         */
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );
  } catch (err) {
    throw toAppError(err);
  }
}

/*
 * ----------------------------------------------------------------------------
 * XÁC THỰC EMAIL
 * ----------------------------------------------------------------------------
 * Đổi trạng thái tài khoản từ UNCONFIRMED sang CONFIRMED bằng mã 6 số.
 * Sau bước này người dùng mới đăng nhập được.
 */
export async function confirmRegistration(email: string, code: string) {
  try {
    await cognitoClient.send(
      new ConfirmSignUpCommand({
        ClientId: cognitoConfig.clientId,
        SecretHash: secretHash(email),
        Username: email,
        ConfirmationCode: code,
      }),
    );
  } catch (err) {
    throw toAppError(err);
  }
}

/*
 * Gửi lại mã xác thực — cho trường hợp email vào Spam hoặc mã đã quá 24 giờ.
 */
export async function resendConfirmationCode(email: string) {
  try {
    await cognitoClient.send(
      new ResendConfirmationCodeCommand({
        ClientId: cognitoConfig.clientId,
        SecretHash: secretHash(email),
        Username: email,
      }),
    );
  } catch (err) {
    throw toAppError(err);
  }
}

/*
 * ----------------------------------------------------------------------------
 * ĐĂNG NHẬP
 * ----------------------------------------------------------------------------
 *
 * `InitiateAuth` với luồng `USER_PASSWORD_AUTH` nghĩa là: "đây là email và mật
 * khẩu, kiểm giúp tôi". Đây chính là luồng bạn đã tick trong AWS Console — nếu
 * quên tick, chỗ này sẽ báo `USER_PASSWORD_AUTH flow not enabled for this client`.
 *
 * Điều đáng nói: mật khẩu đi từ trình duyệt → Next.js → Express → Cognito. Nó ĐI
 * QUA server của bạn. Trách nhiệm kèm theo là tuyệt đối không ghi nó ra log,
 * không lưu lại, không gửi đi đâu khác. Ở đây ta chỉ chuyển tiếp rồi quên ngay.
 *
 * (Luồng Hosted UI mà tài liệu setup có nhắc tới thì tránh được chuyện này hoàn
 * toàn: người dùng nhập mật khẩu thẳng trên trang của AWS, server của bạn không
 * bao giờ nhìn thấy nó. An toàn hơn, nhưng đổi lại bạn không tuỳ biến được giao
 * diện và luồng code khó nhìn thấy hơn khi mới học.)
 */
export async function login(email: string, password: string) {
  let response;
  try {
    response = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: cognitoConfig.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          /*
           * Cognito từ chối request nếu SECRET_HASH có mặt mà client không có
           * secret. Nên khi `secretHash()` trả về undefined, ta phải KHÔNG gửi
           * trường này chứ không phải gửi giá trị rỗng.
           *
           * Cú pháp `...(x ? { KEY: x } : {})` đọc là: nếu x có giá trị thì rải
           * thêm khoá KEY vào object, không thì rải một object rỗng (tức không
           * thêm gì). Đây là cách thêm khoá có điều kiện gọn nhất trong JS.
           */
          ...(secretHash(email) ? { SECRET_HASH: secretHash(email)! } : {}),
        },
      }),
    );
  } catch (err) {
    throw toAppError(err);
  }

  /*
   * `AuthenticationResult` vắng mặt khi Cognito muốn thêm một bước nữa — ví dụ
   * yêu cầu nhập mã MFA, hay bắt đổi mật khẩu tạm. Lúc đó nó trả về
   * `ChallengeName` thay vì token.
   *
   * Ta đã chọn "No MFA" nên bình thường sẽ không rơi vào đây. Nhưng vẫn phải xử
   * lý: bỏ qua nghĩa là dòng dưới sẽ nổ `undefined` với thông báo khó hiểu.
   * Kiểm tra rồi báo lỗi rõ ràng luôn tốt hơn để chương trình tự sập.
   */
  const result = response.AuthenticationResult;
  if (!result?.AccessToken || !result.IdToken || !result.RefreshToken) {
    throw new AppError(
      501,
      "Tài khoản này cần thêm bước xác thực mà ứng dụng chưa hỗ trợ (ví dụ MFA).",
    );
  }

  /*
   * Đọc ID token để lấy email và username.
   *
   * Vì sao phải verify lại token mà chính ta vừa nhận trực tiếp từ Cognito?
   * Ở đây thì đúng là hơi thừa. Nhưng `idTokenVerifier.verify()` vừa kiểm chữ ký
   * vừa giải mã và cho ra object đã có kiểu dữ liệu — nên dùng nó vẫn gọn hơn tự
   * tay tách chuỗi base64. Và quan trọng hơn: nó tạo thói quen ĐÚNG. Tự giải mã
   * token mà không kiểm chữ ký là một trong những lỗi bảo mật phổ biến nhất khi
   * làm việc với JWT — không nên tập thói quen đó, dù chỉ ở chỗ vô hại.
   */
  const idClaims = await idTokenVerifier.verify(result.IdToken);

  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
    /*
     * `ExpiresIn` là số GIÂY token còn sống (mặc định 3600 = 1 giờ), không phải
     * mốc thời gian. Frontend cần con số này để biết khi nào phải gia hạn.
     */
    expiresIn: result.ExpiresIn ?? 3600,
    user: {
      sub: idClaims.sub,
      email: String(idClaims.email ?? ""),
      /*
       * `cognito:username` là TÊN ĐĂNG NHẬP THẬT bên trong Cognito.
       *
       * Khi User Pool cấu hình đăng nhập bằng email, Cognito tự sinh cho mỗi tài
       * khoản một username dạng UUID, còn email chỉ là "bí danh" (alias). Ta phải
       * lưu lại tên thật này vì hàm `refreshTokens()` bên dưới cần nó — đọc phần
       * giải thích ở đó để hiểu vì sao đây là một cái bẫy khó chịu.
       */
      username: String(idClaims["cognito:username"] ?? idClaims.sub),
      /*
       * Đánh dấu phiên này được tạo bằng luồng email + mật khẩu.
       *
       * Từ khi có thêm đăng nhập bằng Google, hai luồng gia hạn token KHÁC NHAU
       * (xem `refreshTokensWithHostedUi` ở cuối file). Frontend lưu nhãn này vào
       * cookie rồi gửi trả lại khi cần gia hạn, để backend biết phải đi đường nào.
       *
       * `as const` khiến TypeScript hiểu kiểu là chuỗi hằng `"cognito"` chứ không
       * phải `string` chung chung — nhờ vậy nếu chỗ nào gõ nhầm thành "cognitoo"
       * thì báo lỗi ngay lúc viết code.
       */
      provider: "cognito" as const,
    },
  };
}

/*
 * ----------------------------------------------------------------------------
 * GIA HẠN TOKEN
 * ----------------------------------------------------------------------------
 *
 * Access token sống 1 giờ. Nếu hết hạn là bắt đăng nhập lại thì không ai chịu
 * nổi. Refresh token (sống 30 ngày) tồn tại để đổi lấy access token mới mà không
 * cần mật khẩu.
 *
 * 🔴 CÁI BẪY LỚN NHẤT CỦA TOÀN BỘ FILE NÀY nằm ở tham số `username`.
 *
 * Với luồng USER_PASSWORD_AUTH, SECRET_HASH được tính từ chuỗi bạn gửi trong
 * `USERNAME` — tức là email. Nhưng luồng REFRESH_TOKEN_AUTH KHÔNG có tham số
 * USERNAME nào cả. Cognito tự tra ra chủ nhân của refresh token, rồi tính
 * SECRET_HASH bằng TÊN ĐĂNG NHẬP THẬT của người đó (chuỗi UUID), chứ không phải
 * bằng email.
 *
 * Hệ quả: nếu ở đây bạn truyền email vào, SECRET_HASH sẽ sai và Cognito trả lỗi
 * `Unable to verify secret hash for client` — một thông báo chẳng gợi ý gì về
 * nguyên nhân thật. Đây là lý do hàm `login()` phải cất công trả về `username`
 * để frontend lưu lại và gửi kèm vào đây.
 */
export async function refreshTokens(refreshToken: string, username: string) {
  let response;
  try {
    response = await cognitoClient.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: cognitoConfig.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken,
          ...(secretHash(username) ? { SECRET_HASH: secretHash(username)! } : {}),
        },
      }),
    );
  } catch (err) {
    throw toAppError(err);
  }

  const result = response.AuthenticationResult;
  if (!result?.AccessToken || !result.IdToken) {
    throw new AppError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  /*
   * Để ý: response KHÔNG chứa refresh token mới.
   *
   * Đó là chủ ý của Cognito — refresh token cũ vẫn dùng tiếp cho tới khi hết
   * hạn 30 ngày. Nên frontend phải GIỮ NGUYÊN refresh token đang có, chỉ thay
   * access token và ID token. Nếu vô tình ghi đè bằng `undefined`, người dùng sẽ
   * bị đá ra ngoài sau đúng một giờ và bạn sẽ rất khó hiểu vì sao.
   */
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    expiresIn: result.ExpiresIn ?? 3600,
  };
}

/*
 * ============================================================================
 * ĐĂNG NHẬP BẰNG GOOGLE — luồng OAuth 2.0 Authorization Code
 * ============================================================================
 *
 * Phần còn lại của file này phục vụ đúng một tính năng: bấm nút "Đăng nhập bằng
 * Google" là vào được app, và nếu chưa có tài khoản thì Cognito TỰ TẠO luôn.
 *
 * ----------------------------------------------------------------------------
 * TOÀN CẢNH: 8 BƯỚC, ĐỌC MỘT LẦN LÀ HÌNH DUNG ĐƯỢC
 * ----------------------------------------------------------------------------
 *
 *   1. Người dùng bấm nút Google trên trang /login của bạn.
 *
 *   2. Server Next.js sinh một chuỗi ngẫu nhiên `state`, cất vào cookie, rồi đá
 *      trình duyệt sang Hosted UI của Cognito (URL do `buildGoogleAuthorizeUrl`
 *      bên dưới dựng ra).
 *
 *   3. Cognito thấy tham số `identity_provider=Google` nên không hiện form của
 *      nó, mà chuyển thẳng sang trang đăng nhập của Google.
 *
 *   4. Người dùng nhập tài khoản Google — TRÊN TRANG CỦA GOOGLE. Mật khẩu Google
 *      không bao giờ đi qua app của bạn. Đây là toàn bộ lý do OAuth tồn tại.
 *
 *   5. Google gật đầu, trả kết quả về cho Cognito (địa chỉ `/oauth2/idpresponse`
 *      — chính là cái bạn phải dán vào GCP Console ở bước cấu hình).
 *
 *   6. 🔴 CHỖ NÀY LÀ CÁI BẠN MUỐN: Cognito tra trong User Pool xem đã có người
 *      dùng nào ứng với tài khoản Google này chưa. CHƯA CÓ thì nó TẠO MỚI ngay
 *      lập tức, với username dạng `Google_115482...`. Không cần một dòng code
 *      nào từ phía bạn. Từ lần thứ hai trở đi thì nó dùng lại user cũ.
 *
 *   7. Cognito đá trình duyệt về `redirect_uri` của app bạn, kèm một `code` trên
 *      URL. `code` này CHƯA phải token — nó chỉ là một cái phiếu dùng-một-lần,
 *      sống khoảng 5 phút.
 *
 *   8. Backend (hàm `loginWithGoogle` bên dưới) đổi `code` đó lấy 3 token thật.
 *      Từ đây trở đi mọi thứ giống hệt luồng email + mật khẩu.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO PHẢI QUA HAI CHẶNG (`code` RỒI MỚI TỚI TOKEN)? SAO KHÔNG TRẢ TOKEN LUÔN?
 * ----------------------------------------------------------------------------
 *
 * Đây là câu hỏi hay nhất của toàn bộ OAuth, và câu trả lời rất gọn:
 *
 *   Bước 7 đi qua THANH ĐỊA CHỈ CỦA TRÌNH DUYỆT. Mà URL thì bị ghi vào lịch sử
 *   duyệt web, bị log lại ở server, bị gửi kèm trong header `Referer` khi người
 *   dùng bấm sang trang khác... Ném thẳng token vào đó là rải token khắp nơi.
 *
 *   Còn bước 8 là một request THẲNG TỪ SERVER SANG SERVER, có kèm client secret.
 *   Không đi qua trình duyệt, không ai nhìn thấy.
 *
 * Nên `code` được thiết kế để CỐ TÌNH ÍT GIÁ TRỊ: ai nhặt được nó cũng vô dụng,
 * vì muốn đổi ra token còn phải có client secret — thứ chỉ nằm trong backend/.env
 * của bạn. Đúng kiểu "chìa khoá và ổ khoá phải có đủ đôi".
 *
 * (Ngày xưa OAuth có luồng "implicit" trả token thẳng lên URL cho tiện. Nó đã bị
 * khuyến cáo LOẠI BỎ chính vì lý do trên. Nếu bạn đọc bài hướng dẫn cũ nào bảo
 * dùng `response_type=token`, đó là kiến thức đã lỗi thời.)
 */

/**
 * Trả về origin của Hosted UI, hoặc ném lỗi rõ ràng nếu chưa cấu hình.
 *
 * Ba hàm bên dưới đều cần giá trị này nên tách ra dùng chung. Mã 501 (Not
 * Implemented) được chọn có chủ ý: nó nghĩa là "server hiểu yêu cầu nhưng chưa
 * cài đặt tính năng này" — mô tả đúng tình huống "bạn quên điền COGNITO_DOMAIN"
 * hơn hẳn 500 (lỗi bất ngờ) hay 400 (client gửi sai).
 */
function requireHostedUiOrigin(): string {
  if (!hostedUiConfig.origin) {
    throw new AppError(
      501,
      "Chưa bật đăng nhập bằng Google: thiếu biến COGNITO_DOMAIN trong backend/.env. Xem hướng dẫn tại .note/google-login-setup.md",
    );
  }
  return hostedUiConfig.origin;
}

/*
 * ----------------------------------------------------------------------------
 * BƯỚC 2 — DỰNG URL ĐỂ ĐÁ NGƯỜI DÙNG SANG GOOGLE
 * ----------------------------------------------------------------------------
 *
 * Hàm này không gọi mạng, không chờ đợi gì cả. Nó chỉ NỐI CHUỖI. Toàn bộ "phép
 * màu" của bước này nằm ở việc ghép đúng các tham số theo chuẩn OAuth 2.0.
 *
 * Vì sao việc nối chuỗi tầm thường này lại đặt ở BACKEND mà không để frontend tự
 * làm cho nhanh?
 *
 *   Vì để giữ nguyên nguyên tắc đã tuyên bố ở đầu `lib/cognito.ts`: BACKEND LÀ
 *   NƠI DUY NHẤT BIẾT VỀ COGNITO. Nếu frontend tự dựng URL, nó phải biết thêm
 *   domain Hosted UI và Client ID — tức là kiến thức về Cognito rò rỉ sang một
 *   tầng khác, và mai này đổi nhà cung cấp thì phải sửa hai nơi.
 *
 *   Cái giá phải trả là một lời gọi HTTP nội bộ thêm. Rẻ, và đổi lại ranh giới
 *   giữa các tầng vẫn sạch.
 */
export function buildGoogleAuthorizeUrl(redirectUri: string, state: string): string {
  const origin = requireHostedUiOrigin();

  /*
   * `URLSearchParams` tự lo việc mã hoá ký tự đặc biệt (dấu `:`, `/`, khoảng
   * trắng...) sang dạng `%3A`, `%2F`...
   *
   * Đừng bao giờ tự nối chuỗi kiểu `"?redirect_uri=" + uri`. `redirect_uri` của
   * ta chứa `http://localhost:3001/...` — đầy ký tự phải mã hoá. Quên mã hoá thì
   * Cognito nhận được một URL cụt và trả về `redirect_mismatch`, một lỗi rất mất
   * thời gian để lần ra.
   */
  const params = new URLSearchParams({
    /*
     * `response_type=code` — xin về "phiếu", không xin token.
     * Xem phần giải thích dài ở đầu mục này để hiểu vì sao đây là lựa chọn duy
     * nhất đúng cho một web app có backend.
     */
    response_type: "code",

    /** App nào đang hỏi. Client ID không phải bí mật, để lộ trên URL là bình thường. */
    client_id: cognitoConfig.clientId,

    /*
     * Đăng nhập xong thì quay về đâu.
     *
     * ⚠️ Chuỗi này phải TRÙNG TỪNG KÝ TỰ với một trong các "Allowed callback
     * URLs" bạn khai trong AWS Console. Thừa/thiếu một dấu `/` ở cuối cũng bị
     * từ chối với lỗi `redirect_mismatch`.
     *
     * Đây cũng chính là lớp phòng thủ khiến việc nhận `redirectUri` từ frontend
     * trở nên an toàn: kẻ xấu có gọi API này với `redirectUri` trỏ về trang của
     * hắn thì Cognito vẫn chặn, vì địa chỉ đó không nằm trong danh sách đã khai.
     * Người gác cổng cuối cùng luôn là Cognito, không phải code của ta.
     */
    redirect_uri: redirectUri,

    /*
     * `scope` — xin quyền đọc những thông tin gì.
     *
     *   openid  — BẮT BUỘC. Có nó thì Cognito mới phát ID token (thứ chứa danh
     *             tính người dùng). Thiếu nó thì luồng vẫn chạy nhưng không có
     *             ID token, và ta mất đường lấy email.
     *   email   — xin địa chỉ email, để hiển thị "Đang đăng nhập: an@gmail.com".
     *   profile — xin tên và ảnh đại diện. Dự án này chưa dùng tới, nhưng xin sẵn
     *             thì sau muốn hiện avatar khỏi phải bắt người dùng đăng nhập lại.
     *
     * Nguyên tắc: XIN ÍT NHẤT CÓ THỂ. Mỗi quyền xin thêm là một dòng nữa trong
     * màn hình "Ứng dụng này muốn truy cập..." mà người dùng nhìn thấy — xin
     * nhiều quá thì họ chột dạ và bấm Huỷ.
     */
    scope: "openid email profile",

    /*
     * 🔒 `state` — LÁ CHẮN CHỐNG CSRF. Đừng bao giờ bỏ tham số này.
     *
     * Nó là một chuỗi ngẫu nhiên do ta sinh ra, Cognito không đọc mà chỉ giữ hộ
     * rồi trả lại y nguyên ở bước 7. Frontend đã cất bản sao trong cookie, nên
     * lúc nhận về chỉ cần so hai bên có khớp không.
     *
     * Chặn được kiểu tấn công nào? "Login CSRF":
     *
     *   Kẻ xấu tự đăng nhập Google của HẮN, lấy được cái `code` của hắn, rồi lừa
     *   bạn bấm vào link `https://app-cua-ban.com/api/auth/callback/google?code=<code_cua_han>`.
     *   Nếu app không kiểm gì, bạn sẽ bị đăng nhập vào TÀI KHOẢN CỦA HẮN mà không
     *   hề biết. Sau đó bạn nhập thông tin gì, lưu ghi chú gì — hắn mở tài khoản
     *   mình ra là thấy hết.
     *
     *   Có `state` thì đòn này gãy: `code` của hắn đi kèm `state` của hắn, mà
     *   cookie trên máy bạn giữ `state` khác → không khớp → từ chối.
     *
     * Phần sinh và kiểm `state` nằm ở frontend (`lib/auth.ts` và route handler
     * `app/api/auth/callback/google/route.ts`), vì cookie là chuyện của frontend.
     */
    state,

    /*
     * `identity_provider=Google` — đi thẳng sang Google, bỏ qua màn hình chọn của
     * Cognito.
     *
     * Bỏ tham số này đi thì Hosted UI hiện ra một trang có cả ô email/mật khẩu
     * lẫn nút "Continue with Google". Với dự án này ta đã có form đăng nhập riêng
     * đẹp hơn, nên chỉ mượn Hosted UI đúng phần Google → chỉ định luôn cho gọn.
     *
     * Người dùng vì thế gần như không kịp nhìn thấy trang của AWS: bấm nút là
     * nhảy thẳng tới màn hình chọn tài khoản Google quen thuộc.
     */
    identity_provider: hostedUiConfig.googleProviderName,
  });

  return `${origin}/oauth2/authorize?${params.toString()}`;
}

/*
 * ----------------------------------------------------------------------------
 * GỌI ENDPOINT /oauth2/token CỦA HOSTED UI
 * ----------------------------------------------------------------------------
 *
 * Hàm dùng chung cho hai việc: đổi `code` lấy token (bước 8) và gia hạn token.
 * Hai việc đó chỉ khác nhau ở mấy tham số trong body.
 *
 * ⚠️ ĐIỂM KHÁC BIỆT LỚN NHẤT SO VỚI PHẦN TRÊN CỦA FILE NÀY:
 *
 * Ở đây ta dùng `fetch` trần chứ KHÔNG dùng `cognitoClient` của AWS SDK. Không
 * phải vì lười — mà vì SDK không có lệnh nào cho endpoint này cả.
 *
 * Lý do: `/oauth2/token` không phải API riêng của AWS. Nó là endpoint CHUẨN của
 * OAuth 2.0, giống hệt ở Google, GitHub, Facebook... Nó nhận dữ liệu dạng
 * `application/x-www-form-urlencoded` (kiểu form HTML thời xưa) chứ không phải
 * JSON. Đổi lại: hiểu đoạn code này là bạn hiểu luôn cách tích hợp OAuth với
 * BẤT KỲ nhà cung cấp nào khác.
 */
async function requestHostedUiToken(
  body: Record<string, string>,
): Promise<{
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const origin = requireHostedUiOrigin();

  /*
   * CHỨNG MINH "TÔI LÀ APP CLIENT HỢP LỆ" — HTTP Basic Authentication.
   *
   * Khi app client có client secret, chuẩn OAuth quy định gửi cặp
   * `client_id:client_secret` dưới dạng base64 trong header `Authorization`.
   *
   * Chú ý: base64 KHÔNG PHẢI MÃ HOÁ. Nó chỉ là cách viết lại chuỗi cho an toàn
   * khi truyền qua HTTP header — ai chặn được gói tin cũng giải ngược ra được
   * trong một giây. Thứ bảo vệ nó là HTTPS ở tầng dưới, chứ không phải base64.
   * Đây là hiểu lầm cực kỳ phổ biến, nhớ kỹ chỗ này.
   *
   * Nếu app client KHÔNG có secret (public client) thì bỏ header này, và
   * `client_id` trong body là đủ.
   */
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (cognitoConfig.clientSecret) {
    const basic = Buffer.from(
      `${cognitoConfig.clientId}:${cognitoConfig.clientSecret}`,
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  let res: Response;
  try {
    res = await fetch(`${origin}/oauth2/token`, {
      method: "POST",
      headers,
      /*
       * `URLSearchParams` khi đưa vào `body` sẽ tự động được serialize thành
       * `a=1&b=2` — đúng định dạng `x-www-form-urlencoded` mà endpoint này đòi.
       * Gửi JSON vào đây sẽ nhận về `invalid_request`.
       */
      body: new URLSearchParams({
        client_id: cognitoConfig.clientId,
        ...body,
      }),
    });
  } catch (err) {
    /*
     * Lỗi ở tầng mạng: sai domain, mất mạng, DNS không phân giải được.
     * Nguyên nhân thường gặp nhất khi mới cấu hình: `COGNITO_DOMAIN` gõ sai.
     */
    console.error("[cognito] Không gọi được /oauth2/token:", err);
    throw new AppError(
      502,
      "Không kết nối được tới Cognito Hosted UI. Kiểm tra lại biến COGNITO_DOMAIN trong backend/.env.",
    );
  }

  /*
   * Endpoint này luôn trả JSON, kể cả khi lỗi. Nhưng vẫn phải bọc try/catch:
   * nếu domain tồn tại mà không phải Hosted UI (ví dụ bạn dán nhầm domain khác),
   * ta sẽ nhận về HTML và `res.json()` sẽ nổ.
   */
  let payload: Record<string, unknown>;
  try {
    payload = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new AppError(502, "Cognito trả về dữ liệu không đọc được. Kiểm tra lại COGNITO_DOMAIN.");
  }

  if (!res.ok) {
    throw toOAuthError(payload);
  }

  return payload as {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
}

/*
 * Dịch lỗi của endpoint OAuth sang tiếng Việt.
 *
 * Đây là bản song song với `COGNITO_ERROR_MESSAGES` ở đầu file, nhưng cho một
 * "phương ngữ" khác: các API kia trả lỗi dạng `{ name: "CodeMismatchException" }`
 * của AWS SDK, còn endpoint này trả `{ error: "invalid_grant" }` theo chuẩn
 * OAuth. Hai bảng, vì hai nguồn lỗi khác hẳn nhau.
 *
 * Chú ý là các thông báo dưới đây chia làm hai nhóm rất khác nhau:
 *   - Lỗi của NGƯỜI DÙNG (invalid_grant) → nói họ thử lại.
 *   - Lỗi của LẬP TRÌNH VIÊN (invalid_client, unauthorized_client) → chỉ thẳng
 *     ra chỗ cấu hình sai, vì người dùng cuối không tự sửa được. Khi bạn đang
 *     dựng tính năng này, đây chính là mấy câu bạn sẽ gặp nhiều nhất.
 */
function toOAuthError(payload: Record<string, unknown>): AppError {
  const code = typeof payload.error === "string" ? payload.error : "";

  const table: Record<string, { status: number; message: string }> = {
    invalid_grant: {
      status: 401,
      message: "Phiên đăng nhập Google đã hết hạn hoặc mã đã được dùng rồi. Vui lòng bấm đăng nhập lại.",
    },
    invalid_client: {
      status: 500,
      message: "Cognito từ chối app client. Kiểm tra COGNITO_CLIENT_ID và COGNITO_CLIENT_SECRET trong backend/.env.",
    },
    unauthorized_client: {
      status: 500,
      message: "App client chưa được bật 'Authorization code grant'. Vào AWS Console → App client → Login pages → Edit để bật.",
    },
    invalid_request: {
      status: 400,
      message: "Yêu cầu gửi lên Cognito thiếu tham số. Thường do redirect URI không khớp với 'Allowed callback URLs'.",
    },
    unsupported_grant_type: {
      status: 500,
      message: "Cognito không hỗ trợ kiểu cấp quyền này. Kiểm tra lại cấu hình OAuth của app client.",
    },
  };

  const known = table[code];
  if (known) {
    return new AppError(known.status, known.message);
  }

  console.error("[cognito] Lỗi OAuth chưa được xử lý:", payload);
  return new AppError(500, "Đăng nhập bằng Google thất bại. Vui lòng thử lại.");
}

/*
 * ----------------------------------------------------------------------------
 * BƯỚC 8 — ĐỔI `code` LẤY TOKEN
 * ----------------------------------------------------------------------------
 *
 * Đây là hàm quan trọng nhất của tính năng. Sau khi nó chạy xong, ta có đúng bộ
 * ba token giống hệt luồng email + mật khẩu, và mọi phần còn lại của hệ thống
 * (requireAuth, cột userId, gia hạn token...) hoạt động y như cũ.
 *
 * ⚠️ `code` CHỈ DÙNG ĐƯỢC ĐÚNG MỘT LẦN. Gọi hàm này hai lần với cùng một `code`
 * thì lần thứ hai nhận `invalid_grant`. Điều này gây bối rối trong lúc dev vì
 * React Strict Mode hay việc bấm F5 ở trang callback đều có thể khiến hàm chạy
 * hai lượt. Nếu bạn thấy lỗi "mã đã được dùng rồi" ngay lần thử đầu, gần như
 * chắc chắn là chuyện này chứ không phải cấu hình sai.
 */
export async function loginWithGoogle(code: string, redirectUri: string) {
  const tokens = await requestHostedUiToken({
    /** Khai báo "tôi đang đổi một authorization code" (bước 8, không phải gia hạn). */
    grant_type: "authorization_code",
    code,
    /*
     * `redirect_uri` xuất hiện LẦN THỨ HAI ở đây, và phải giống hệt lần đầu.
     *
     * Nghe rất thừa: ta có redirect gì đâu, request này là server-to-server mà?
     * Đúng, nó không dùng để chuyển hướng. Nó là một phép ĐỐI CHIẾU: Cognito
     * kiểm xem người đang đổi `code` có phải chính là kẻ đã xin `code` không.
     * Đây là quy định của chuẩn OAuth 2.0 (RFC 6749), không phải AWS bịa ra.
     */
    redirect_uri: redirectUri,
  });

  if (!tokens.access_token || !tokens.id_token || !tokens.refresh_token) {
    throw new AppError(502, "Cognito không trả về đủ token. Kiểm tra scope 'openid' trong cấu hình.");
  }

  /*
   * Kiểm chữ ký ID token rồi đọc thông tin người dùng ra.
   *
   * Ở đây việc verify KHÔNG hề thừa như trong hàm `login()` phía trên: token này
   * vừa đi qua endpoint HTTP thường chứ không qua AWS SDK, nên tự kiểm chữ ký là
   * bước xác nhận thật sự rằng nó do đúng User Pool của ta phát ra.
   */
  const idClaims = await idTokenVerifier.verify(tokens.id_token);

  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in ?? 3600,
    user: {
      /*
       * ⚠️ ĐIỀU CẦN HIỂU RÕ VỀ `sub` CỦA NGƯỜI DÙNG GOOGLE
       *
       * `sub` này là ID mà COGNITO cấp, KHÔNG phải ID của Google. Nó là thứ được
       * lưu vào cột `Todo.userId`, nên mọi ghi chú vẫn được phân tách đúng chủ.
       *
       * Nhưng có một hệ quả dễ gây bất ngờ: nếu bạn từng đăng ký bằng email
       * `an@gmail.com` theo luồng thường, rồi hôm sau bấm đăng nhập bằng Google
       * cũng với `an@gmail.com`, Cognito coi đó là HAI NGƯỜI KHÁC NHAU — hai
       * user riêng, hai `sub` riêng, và danh sách todo cũng riêng.
       *
       * Đó không phải lỗi, mà là hành vi mặc định có chủ đích: Cognito không dám
       * tự gộp hai tài khoản chỉ vì trùng email, bởi làm vậy sẽ mở ra một lỗ hổng
       * chiếm tài khoản (kẻ xấu tạo tài khoản Google với email trùng của bạn ở
       * một nhà cung cấp lỏng lẻo là chiếm được tài khoản thật).
       *
       * Cognito có tính năng gộp thủ công tên là "linking" (API
       * `AdminLinkProviderForUser`), nhưng nó cần AWS credentials và phải tự tay
       * quyết định khi nào gộp là an toàn — vượt ngoài phạm vi dự án học này.
       */
      sub: idClaims.sub,
      /*
       * Email đến từ Google, được Cognito ánh xạ vào thuộc tính `email` của user.
       *
       * Nếu chỗ này ra chuỗi rỗng, gần như chắc chắn bạn quên bước "Map
       * attributes" khi thêm Google làm identity provider trong AWS Console —
       * xem mục tương ứng trong .note/google-login-setup.md.
       */
      email: String(idClaims.email ?? ""),
      /*
       * Với người dùng Google, `cognito:username` có dạng `Google_115482938...`
       * (tiền tố là tên provider, phần sau là ID của Google).
       *
       * Ta vẫn lưu lại cho nhất quán với luồng thường, nhưng để ý: luồng gia hạn
       * của phiên Google (`refreshTokensWithHostedUi`) KHÔNG cần tới nó. Xem giải
       * thích ngay bên dưới.
       */
      username: String(idClaims["cognito:username"] ?? idClaims.sub),
      /** Nhãn để frontend biết phải gia hạn phiên này bằng đường nào. */
      provider: "google" as const,
    },
  };
}

/*
 * ----------------------------------------------------------------------------
 * GIA HẠN TOKEN CHO PHIÊN GOOGLE
 * ----------------------------------------------------------------------------
 *
 * So sánh hàm này với `refreshTokens()` ở phía trên file là thấy ngay điều thú
 * vị nhất của cả bài: cùng một việc "đổi refresh token lấy access token mới",
 * nhưng làm qua endpoint OAuth thì ĐƠN GIẢN HƠN HẲN.
 *
 *   `refreshTokens()`  (InitiateAuth)  → phải truyền `username` để tính
 *                                        SECRET_HASH, và truyền sai một chút là
 *                                        dính lỗi `Unable to verify secret hash
 *                                        for client` chẳng gợi ý gì.
 *
 *   Hàm này        (/oauth2/token)     → chỉ cần refresh token. Danh tính app đã
 *                                        nằm trong header `Authorization: Basic`
 *                                        rồi, nên không cần SECRET_HASH, không
 *                                        cần biết username là gì.
 *
 * Vì sao không chuyển luôn cả luồng email + mật khẩu sang dùng endpoint này cho
 * gọn? Vì endpoint `/oauth2/token` chỉ tồn tại khi bạn đã tạo Hosted UI domain.
 * Luồng cũ phải chạy được kể cả khi chưa cấu hình Google — nên hai đường sống
 * song song, và đó chính là lý do ta cần lưu nhãn `provider` trong phiên.
 */
export async function refreshTokensWithHostedUi(refreshToken: string) {
  const tokens = await requestHostedUiToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  if (!tokens.access_token || !tokens.id_token) {
    throw new AppError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  }

  /*
   * Giống hệt luồng cũ: response KHÔNG chứa refresh token mới. Refresh token cũ
   * vẫn dùng tiếp cho tới khi hết hạn 30 ngày, nên frontend phải GIỮ NGUYÊN nó.
   */
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    expiresIn: tokens.expires_in ?? 3600,
  };
}
