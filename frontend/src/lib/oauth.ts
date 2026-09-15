/*
 * ============================================================================
 * NHỮNG MẢNH GHÉP CỦA LUỒNG ĐĂNG NHẬP GOOGLE (phía frontend)
 * ============================================================================
 *
 * File này gom mấy thứ nhỏ mà cả ba nơi trong luồng Google đều cần: Server
 * Action bấm nút, Route Handler nhận kết quả, và trang /login hiện lỗi.
 *
 * ⚠️ File chỉ chạy trên SERVER. Nó đọc `process.env.APP_BASE_URL` — biến không có
 * tiền tố `NEXT_PUBLIC_` nên Next.js không gửi xuống trình duyệt.
 *
 * ----------------------------------------------------------------------------
 * NHẮC LẠI LUỒNG, LẦN NÀY NHÌN TỪ PHÍA FRONTEND
 * ----------------------------------------------------------------------------
 *
 *   [1] Người dùng bấm nút "Đăng nhập bằng Google"
 *        → Server Action `loginWithGoogleAction` (trong `auth-actions.ts`)
 *        → sinh `state`, cất vào cookie, xin URL từ backend, rồi `redirect()`
 *
 *   [2] Người dùng biến mất khỏi app: sang Cognito → sang Google → chọn tài
 *       khoản → quay lại Cognito
 *
 *   [3] Cognito trả về `/api/auth/callback/google?code=...&state=...`
 *        → Route Handler đối chiếu `state`, đổi `code` lấy token, lưu cookie
 *        → đưa người dùng về đúng trang họ định vào ban đầu
 *
 * Giữa [1] và [3], server của ta KHÔNG nhớ gì cả. Sợi dây duy nhất nối hai đầu
 * là cookie `oauth_state` nằm trong trình duyệt người dùng.
 */

import { ROUTES } from "./constants";

/**
 * Địa chỉ gốc của chính app Next.js này.
 *
 * Vì sao phải khai báo mà không tự đoán từ request?
 *
 *   Vì `redirect_uri` gửi lên Cognito phải TRÙNG TỪNG KÝ TỰ với "Allowed callback
 *   URLs" đã khai trong AWS Console. Nếu tự suy ra từ header `Host` của request,
 *   giá trị đó có thể đổi tuỳ theo cách truy cập (`localhost` hay `127.0.0.1`,
 *   có cổng hay không, sau proxy thì thành tên miền nội bộ...) — và mỗi lần khác
 *   một chút là dính `redirect_mismatch`.
 *
 *   Tệ hơn: header `Host` do TRÌNH DUYỆT gửi lên, tức là dữ liệu người dùng sửa
 *   được. Tin nó để dựng URL bảo mật là một thói quen xấu (lỗ hổng "host header
 *   injection").
 *
 * Nên ta khai báo tường minh. Đây là giá trị khác nhau giữa dev và production
 * (`http://localhost:3001` vs `https://app-that.com`) nên đúng chỗ của nó là
 * `.env` — theo đúng quy ước trong CLAUDE.md.
 */
const DEFAULT_APP_BASE_URL = "http://localhost:3001";

export const APP_BASE_URL = process.env.APP_BASE_URL ?? DEFAULT_APP_BASE_URL;

/**
 * Địa chỉ đầy đủ mà Cognito sẽ trả người dùng về sau khi đăng nhập Google xong.
 *
 * Ví dụ: `http://localhost:3001/api/auth/callback/google`
 *
 * 📋 ĐÂY CHÍNH LÀ CHUỖI BẠN PHẢI DÁN VÀO Ô "Allowed callback URLs" TRONG AWS
 * CONSOLE. Copy nguyên văn, đừng thêm dấu `/` ở cuối.
 *
 * Nó xuất hiện đúng hai lần trong code: lúc xin URL đăng nhập, và lúc đổi `code`
 * lấy token. Cả hai lần phải giống hệt nhau, nên gom thành một hằng số ở đây
 * thay vì gõ lại — gõ lại là có ngày lệch.
 */
export const GOOGLE_REDIRECT_URI = `${APP_BASE_URL}${ROUTES.googleCallback}`;

/**
 * Nội dung cookie `oauth_state`.
 *
 * Nó chở hai thứ đi cùng nhau qua chuyến du lịch sang Google:
 *   - `state` : chuỗi ngẫu nhiên để đối chiếu chống CSRF
 *   - `next`  : trang người dùng định vào lúc bị chặn, để đăng nhập xong đưa họ
 *               về đúng chỗ đó thay vì bỏ ở trang chủ
 *
 * Vì sao nhét `next` vào đây mà không gắn lên URL callback?
 *   Vì `redirect_uri` phải khớp tuyệt đối với danh sách đã khai bên Cognito —
 *   thêm bất kỳ tham số nào vào là hỏng. Cookie là chỗ duy nhất còn lại để mang
 *   theo thông tin phụ.
 */
export type OAuthState = {
  state: string;
  next: string;
};

/**
 * Sinh chuỗi `state` ngẫu nhiên.
 *
 * ⚠️ PHẢI dùng `crypto.randomUUID()` chứ KHÔNG được dùng `Math.random()`.
 *
 * Khác biệt không phải chuyện tiểu tiết: `Math.random()` là bộ sinh số giả ngẫu
 * nhiên "cho vui" — nó nhanh nhưng có thể ĐOÁN ĐƯỢC. Ai biết vài giá trị trước
 * đó thì suy ra được giá trị tiếp theo. Mà `state` đoán được thì lá chắn CSRF
 * coi như không tồn tại.
 *
 * `crypto.randomUUID()` lấy entropy từ hệ điều hành, được thiết kế cho đúng mục
 * đích bảo mật kiểu này, và cho ra chuỗi 36 ký tự.
 *
 * Quy tắc dễ nhớ: hễ một giá trị ngẫu nhiên có nhiệm vụ BẢO VỆ thứ gì đó (token,
 * state, mã OTP, khoá phiên...) thì luôn dùng `crypto`, không bao giờ dùng
 * `Math.random()`.
 */
export function createOAuthState(): string {
  return crypto.randomUUID();
}

/*
 * ----------------------------------------------------------------------------
 * MÃ LỖI → CÂU TIẾNG VIỆT
 * ----------------------------------------------------------------------------
 *
 * Khi luồng Google hỏng, Route Handler đá người dùng về `/login?error=<mã>` rồi
 * trang login tra bảng này để hiện câu tương ứng.
 *
 * 🔒 VÌ SAO TRUYỀN MÃ CHỨ KHÔNG TRUYỀN THẲNG CÂU THÔNG BÁO TRÊN URL?
 *
 * Vì mọi thứ trên URL đều do người dùng sửa được. Nếu trang login hiện thẳng nội
 * dung `?error=...`, kẻ xấu sẽ gửi cho nạn nhân một link kiểu:
 *
 *     /login?error=Tài khoản của bạn bị khoá, gọi ngay 0900xxxx để mở
 *
 * Câu đó xuất hiện trên đúng website thật của bạn, đúng font chữ, đúng khung
 * cảnh báo — nạn nhân không có lý do gì để nghi ngờ. Đây là kiểu lừa đảo gọi là
 * "text injection", và nó không cần tới XSS hay bất kỳ lỗ hổng kỹ thuật nào.
 *
 * Truyền MÃ thì đòn này gãy hoàn toàn: mã lạ không có trong bảng → hiện câu mặc
 * định. Kẻ tấn công chỉ chọn được MỘT TRONG NHỮNG CÂU DO BẠN VIẾT SẴN, và không
 * câu nào trong số đó có hại.
 *
 * Nguyên tắc rút ra: dữ liệu từ ngoài vào chỉ nên dùng để CHỌN trong tập đóng
 * bạn định sẵn, đừng bao giờ để nó TRỞ THÀNH nội dung hiển thị.
 */
export const GOOGLE_LOGIN_ERROR_CODES = {
  /**
   * CHỈ dùng cho `error=access_denied` — người dùng bấm "Huỷ" ở màn hình Google.
   *
   * ⚠️ Đừng dùng mã này cho các lỗi `error=...` khác mà Cognito trả về. Nói với
   * người dùng rằng họ đã huỷ, trong khi thật ra cấu hình của ta sai, là vừa sai
   * sự thật vừa khiến chính bạn đi tìm bug sai hướng. Chi tiết ở
   * `app/api/auth/callback/google/route.ts`.
   */
  denied: "google_denied",
  /** `state` không khớp hoặc cookie đã hết hạn → nghi ngờ CSRF, hoặc chỉ là chờ quá lâu. */
  state: "google_state",
  /** Cognito từ chối request, hoặc đổi `code` lấy token thất bại — hầu như luôn do cấu hình sai. */
  failed: "google_failed",
} as const;

const GOOGLE_LOGIN_ERROR_MESSAGES: Record<string, string> = {
  [GOOGLE_LOGIN_ERROR_CODES.denied]:
    "Bạn đã huỷ đăng nhập bằng Google. Hãy thử lại hoặc đăng nhập bằng email.",
  [GOOGLE_LOGIN_ERROR_CODES.state]:
    "Phiên đăng nhập Google không hợp lệ hoặc đã quá hạn. Vui lòng bấm đăng nhập lại.",
  [GOOGLE_LOGIN_ERROR_CODES.failed]:
    "Đăng nhập bằng Google thất bại. Vui lòng thử lại sau ít phút.",
};

/**
 * Tra mã lỗi trên URL ra câu tiếng Việt.
 *
 * Trả về `undefined` khi không có mã hoặc mã lạ — trang login sẽ không hiện gì,
 * đúng như khi mở trang bình thường.
 */
export function getGoogleLoginErrorMessage(code: string | undefined): string | undefined {
  if (!code) {
    return undefined;
  }
  return GOOGLE_LOGIN_ERROR_MESSAGES[code];
}
