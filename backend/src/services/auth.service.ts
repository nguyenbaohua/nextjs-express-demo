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
import { cognitoConfig, cognitoClient, idTokenVerifier, secretHash } from "../lib/cognito";
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
