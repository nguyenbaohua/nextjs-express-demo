/*
 * ============================================================================
 * ROUTE HANDLER — NƠI NGƯỜI DÙNG QUAY VỀ SAU KHI ĐĂNG NHẬP GOOGLE
 * ============================================================================
 *
 * Đây là NỬA SAU của luồng đăng nhập Google. Nửa đầu là `loginWithGoogleAction`
 * trong `lib/auth-actions.ts` — đọc file đó trước sẽ dễ hiểu file này hơn nhiều.
 *
 * ----------------------------------------------------------------------------
 * "ROUTE HANDLER" LÀ GÌ, VÀ VÌ SAO KHÔNG DÙNG page.tsx?
 * ----------------------------------------------------------------------------
 *
 * Trong Next.js App Router có hai loại file tạo ra một URL:
 *
 *   page.tsx   → trả về GIAO DIỆN. Người dùng mở là thấy nội dung.
 *   route.ts   → trả về HTTP RESPONSE THUẦN. Không giao diện, không HTML.
 *
 * Ở đây ta cần loại thứ hai, vì trang này người dùng KHÔNG BAO GIỜ NHÌN THẤY.
 * Họ chỉ ghé qua trong khoảng 200 mili giây: Cognito ném họ tới đây kèm một
 * `code`, ta đổi lấy token, rồi đá họ đi tiếp. Dựng cả một giao diện cho một
 * điểm dừng chân như vậy là thừa — và tệ hơn, nó sẽ nhấp nháy một trang trắng
 * giữa chừng.
 *
 * Tên hàm `GET` (viết hoa) là quy ước của Next.js: nó khớp với động từ HTTP.
 * Cognito quay về bằng cách chuyển hướng trình duyệt, mà chuyển hướng thì luôn
 * sinh ra request GET — nên ta chỉ cần định nghĩa `GET`, không cần `POST`.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO PHẢI LÀ ROUTE HANDLER MÀ KHÔNG THỂ LÀ SERVER ACTION?
 * ----------------------------------------------------------------------------
 *
 * Vì đây là lời gọi đến từ BÊN NGOÀI. Cognito không biết Server Action là gì —
 * nó chỉ biết chuyển hướng trình duyệt tới một URL bình thường. Server Action
 * thì ngược lại, chỉ gọi được từ chính app của bạn.
 *
 * Nói cách khác: Server Action là cửa trong nhà, Route Handler là cửa ra đường.
 * Với những thứ mà thế giới bên ngoài phải gọi vào được (webhook của cổng thanh
 * toán, callback OAuth, ping từ dịch vụ giám sát...), luôn là Route Handler.
 *
 * ----------------------------------------------------------------------------
 * BA TÌNH HUỐNG PHẢI XỬ LÝ, THEO ĐÚNG THỨ TỰ
 * ----------------------------------------------------------------------------
 *
 *   1. URL có `?error=...`  → người dùng bấm "Huỷ", HOẶC cấu hình phía ta sai
 *   2. `state` không khớp   → nghi ngờ tấn công, hoặc cookie đã hết hạn
 *   3. Mọi thứ ổn           → đổi `code` lấy token và lưu phiên
 *
 * Thứ tự này không tuỳ tiện: kiểm tra rẻ và chắc chắn nhất đặt trước, việc tốn
 * kém nhất (gọi mạng ra Cognito) đặt sau cùng. Không có lý do gì phải gọi mạng
 * cho một request mà ta đã biết chắc là hỏng.
 */

import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import * as api from "@/lib/api";
import { clearOAuthState, readOAuthState, saveSession } from "@/lib/auth";
import { ROUTES } from "@/lib/constants";
import { GOOGLE_LOGIN_ERROR_CODES, GOOGLE_REDIRECT_URI } from "@/lib/oauth";

/** Dựng đường dẫn về trang đăng nhập kèm mã lỗi để hiện thông báo. */
function loginPageWithError(code: string): string {
  return `${ROUTES.login}?error=${code}`;
}

export async function GET(request: NextRequest) {
  /*
   * `request.nextUrl` là bản URL đã được Next.js phân tích sẵn — tiện hơn tự
   * `new URL(request.url)`. Ba tham số ta quan tâm đều nằm trên query string do
   * Cognito gắn vào lúc chuyển hướng.
   */
  const params = request.nextUrl.searchParams;
  const errorParam = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  /*
   * Đọc cookie `state` RỒI XOÁ NGAY, trước mọi nhánh xử lý phía dưới.
   *
   * Đặt lệnh xoá ở đây — chứ không rải vào từng nhánh — là một quyết định có chủ
   * ý. Luồng này có ít nhất bốn lối thoát (huỷ, sai state, lỗi mạng, thành công),
   * và nếu mỗi lối phải tự nhớ xoá cookie thì chỉ cần quên MỘT chỗ là để lại một
   * `state` còn hiệu lực nằm chờ bị dùng lại.
   *
   * Nguyên tắc chung: việc dọn dẹp nên nằm ở chỗ KHÔNG THỂ BỊ BỎ QUA, không nên
   * phụ thuộc vào việc lập trình viên nhớ lặp lại nó ở mọi nhánh.
   */
  const saved = await readOAuthState();
  await clearOAuthState();

  /*
   * --------------------------------------------------------------------------
   * TÌNH HUỐNG 1 — Cognito trả về lỗi thay vì `code`
   * --------------------------------------------------------------------------
   *
   * Ở đây có HAI loại lỗi hoàn toàn khác nhau, và việc gộp chúng làm một là một
   * cái bẫy đã cắn chính dự án này một lần — nên đọc kỹ đoạn dưới.
   *
   *   `error=access_denied` → NGƯỜI DÙNG ĐỔI Ý. Họ bấm "Huỷ" ở màn hình chọn
   *       tài khoản Google. Không có gì hỏng cả. Đưa họ về trang đăng nhập với
   *       một câu nhẹ nhàng, không ghi log, không báo động.
   *
   *   mọi `error` khác → LỖI CỦA CHÚNG TA. Cognito từ chối chính cái request mà
   *       backend dựng ra, thường vì cấu hình app client trong AWS Console chưa
   *       khớp với code. Người dùng không làm gì sai và cũng không tự sửa được.
   *
   * 🔍 VÌ SAO PHẢI TÁCH RA, VÀ VÌ SAO PHẢI GHI LOG `error_description`?
   *
   * Bản đầu tiên của file này gộp cả hai vào một câu `if` rồi trả về cùng mã
   * `google_denied`. Hậu quả: khi app client thiếu scope `profile`, Cognito trả
   * `error=invalid_request&error_description=invalid_scope`, nhưng màn hình lại
   * hiện "Bạn đã huỷ đăng nhập bằng Google" — một câu SAI SỰ THẬT, vì người dùng
   * còn chưa kịp nhìn thấy màn hình Google để mà huỷ. Thông tin duy nhất chỉ ra
   * nguyên nhân thật (`invalid_scope`) nằm ngay trên URL nhưng bị vứt đi, không
   * log lại. Mất khá nhiều thời gian mới lần ra.
   *
   * Bài học chung: khi một dịch vụ bên ngoài đã chịu khó nói cho bạn biết nó
   * hỏng ở đâu, ĐỪNG NUỐT MẤT CÂU ĐÓ. Người dùng không cần đọc nó, nhưng log thì
   * cần — đó là khác biệt giữa "sửa trong 30 giây" và "mò cả buổi".
   */
  if (errorParam) {
    if (errorParam === "access_denied") {
      redirect(loginPageWithError(GOOGLE_LOGIN_ERROR_CODES.denied));
    }

    console.error(
      `[google-login] Cognito từ chối request: error=${errorParam}` +
        ` error_description=${params.get("error_description") ?? "(không có)"}`,
    );
    redirect(loginPageWithError(GOOGLE_LOGIN_ERROR_CODES.failed));
  }

  /*
   * --------------------------------------------------------------------------
   * TÌNH HUỐNG 2 — 🔒 ĐỐI CHIẾU `state`: DÒNG QUAN TRỌNG NHẤT CỦA CẢ FILE
   * --------------------------------------------------------------------------
   *
   * Bốn điều kiện, thiếu một là từ chối:
   *
   *   !code        → không có gì để đổi lấy token
   *   !state       → URL thiếu state, không thể là do Cognito gửi đúng cách
   *   !saved       → cookie không còn (đã quá 10 phút, hoặc request này không hề
   *                  bắt đầu từ app của ta)
   *   khác nhau    → có cookie, có state, nhưng KHÔNG KHỚP
   *
   * Trường hợp cuối cùng mới là trường hợp đáng sợ: nó nghĩa là ai đó đang cố ép
   * trình duyệt của bạn hoàn tất một phiên đăng nhập mà bạn không khởi xướng —
   * đòn "login CSRF" đã mô tả kỹ trong `backend/src/services/auth.service.ts`.
   *
   * Chú ý là ta gộp cả bốn vào MỘT câu `if` và trả về CÙNG một thông báo, thay vì
   * tách ra báo lỗi chi tiết từng trường hợp. Cố ý đấy: nói rõ "state của bạn sai"
   * là mách cho kẻ tấn công biết chính xác hắn đang vướng ở đâu. Với người dùng
   * thật thì bốn trường hợp này đằng nào cũng chỉ có một cách xử lý — bấm đăng
   * nhập lại.
   */
  if (!code || !state || !saved || saved.state !== state) {
    redirect(loginPageWithError(GOOGLE_LOGIN_ERROR_CODES.state));
  }

  /*
   * --------------------------------------------------------------------------
   * TÌNH HUỐNG 3 — mọi thứ hợp lệ, đổi `code` lấy token
   * --------------------------------------------------------------------------
   *
   * Hai dòng dưới đây là toàn bộ phần "đăng nhập" thật sự. Để ý là chúng KHÔNG
   * có gì riêng cho Google cả: `saveSession()` chính là hàm mà luồng email + mật
   * khẩu vẫn dùng, không sửa một chữ.
   *
   * Đó là phần thưởng cho quyết định thiết kế ở backend — cho endpoint Google trả
   * về đúng hình dạng dữ liệu với endpoint đăng nhập thường. Chỗ khác biệt giữa
   * hai luồng được nhốt gọn trong backend, còn frontend thì không phải rẽ nhánh.
   *
   * `success` phải khai báo NGOÀI try/catch vì hai lý do: nó được dùng ở dưới, và
   * `redirect()` thì tuyệt đối không được gọi bên trong `try`.
   */
  let success = false;
  try {
    const session = await api.loginWithGoogle(code, GOOGLE_REDIRECT_URI);
    await saveSession(session);
    success = true;
  } catch (err) {
    /*
     * Tới được đây nghĩa là `state` đã khớp — request hợp lệ, nhưng việc đổi
     * `code` thất bại. Nguyên nhân hầu như luôn nằm ở phía ta chứ không phải phía
     * người dùng: sai `COGNITO_CLIENT_SECRET`, callback URL khai thiếu trong AWS
     * Console, backend không chạy, hoặc `code` đã bị dùng (thường do bấm F5 ở
     * trang này).
     *
     * Vì thế: ghi log ĐẦY ĐỦ cho lập trình viên, nhưng chỉ hiện câu chung chung
     * cho người dùng. Chi tiết kỹ thuật đi vào log, không đi vào màn hình — đúng
     * nguyên tắc đã áp dụng xuyên suốt dự án.
     */
    console.error("[google-login] Đổi code lấy token thất bại:", err);
  }

  if (!success) {
    redirect(loginPageWithError(GOOGLE_LOGIN_ERROR_CODES.failed));
  }

  /*
   * Xong. Đưa người dùng về đúng trang họ định vào lúc bị chặn.
   *
   * `saved.next` đã được lọc chống "open redirect" từ nửa đầu của luồng, trong
   * `loginWithGoogleAction`. Không cần lọc lại — nhưng nếu bạn không chắc chuỗi
   * này đã sạch, hãy lọc thêm một lần: kiểm tra thừa thì tốn vài micro giây, còn
   * quên kiểm thì mở ra một lỗ hổng.
   */
  redirect(saved.next);
}
