/*
 * ============================================================================
 * requireAuth — NGƯỜI GÁC CỔNG
 * ============================================================================
 *
 * Đây là toàn bộ phần "chỉ thấy ghi chú của chính mình" ở phía backend, gói gọn
 * trong một middleware.
 *
 * Middleware là một hàm nằm CHẮN GIỮA request và controller. Nó có ba lựa chọn:
 *   - gọi `next()`    → cho đi tiếp
 *   - gọi `next(err)` → chuyển sang errorHandler
 *   - tự trả response → dừng luôn tại đây
 *
 * `requireAuth` dùng hai lựa chọn đầu: token hợp lệ thì cho đi tiếp kèm theo
 * thông tin người dùng, không hợp lệ thì đẩy sang errorHandler với mã 401.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO ĐẶT Ở MIDDLEWARE MÀ KHÔNG VIẾT TRONG TỪNG CONTROLLER?
 * ----------------------------------------------------------------------------
 * Vì bảo mật mà phải nhớ làm thủ công thì sớm muộn cũng có ngày quên. Hôm nay
 * bạn viết 7 controller và kiểm tra đủ 7 chỗ; ba tháng sau thêm route thứ 8 lúc
 * đang vội, quên một dòng — thế là có một lỗ hổng mà không ai nhận ra.
 *
 * Gắn ở tầng router (`router.use(requireAuth)`) thì mọi route trong đó, kể cả
 * route thêm sau này, TỰ ĐỘNG được bảo vệ. Bảo mật nên là mặc định, không nên là
 * thứ phải nhớ.
 *
 * ----------------------------------------------------------------------------
 * ĐIỀU ĐÁNG CHÚ Ý NHẤT: HÀM NÀY KHÔNG CHẠM VÀO DATABASE
 * ----------------------------------------------------------------------------
 * Không có `prisma` trong file này. Toàn bộ thông tin cần thiết đã nằm sẵn bên
 * trong access token, và chữ ký là thứ đảm bảo nó không bị sửa.
 *
 * Đó chính là lời hứa của JWT, và là lý do nó đáng dùng cho access token: một
 * phép kiểm mật mã học trong RAM, vài chục micro-giây, không đi mạng, không đi
 * đĩa. Với một token đi kèm MỌI request thì khác biệt đó cộng dồn lại rất đáng
 * kể — và nó còn có nghĩa là API vẫn kiểm được token kể cả khi database đang
 * quá tải.
 *
 * Cái giá phải trả: token đã cấp thì không thu hồi được. Ta chấp nhận cái giá
 * đó bằng cách cho access token sống ngắn, và bù lại bằng refresh token có tra
 * database (xem `auth.service.ts`).
 */

import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { AppError } from "../utils/AppError";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  /*
   * BƯỚC 1 — Lấy token ra khỏi header.
   *
   * Quy ước chuẩn (RFC 6750) là header có dạng:
   *     Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
   *
   * "Bearer" nghĩa đen là "người mang" — bất kỳ ai CẦM được token này đều dùng
   * được nó, y như tờ tiền mặt. Không có bước nào kiểm tra xem người gửi có đúng
   * là chủ nhân hay không.
   *
   * Đó chính là lý do ở frontend ta cất token vào cookie `httpOnly`: cờ đó khiến
   * JavaScript trong trình duyệt KHÔNG đọc được cookie, nên kể cả khi trang web
   * dính mã độc (tấn công XSS), kẻ tấn công cũng không lấy được token ra.
   *
   * `?.` (optional chaining) xử lý gọn trường hợp header vắng mặt: nếu
   * `req.headers.authorization` là `undefined` thì cả biểu thức thành
   * `undefined` thay vì ném lỗi "cannot read property of undefined".
   */
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    /*
     * Dùng `next(error)` chứ không `res.status(401).json(...)`.
     *
     * Lý do: để errorHandler là nơi DUY NHẤT định dạng response lỗi. Nhờ vậy mọi
     * lỗi trong ứng dụng đều có cùng một hình dạng `{ success: false, message }`,
     * và frontend chỉ cần viết một chỗ xử lý cho tất cả.
     *
     * Thử tưởng tượng phương án ngược lại: mỗi middleware và mỗi controller tự
     * gọi `res.json` với định dạng riêng. Chỉ cần một chỗ quên trường `success`
     * là frontend có một nhánh lỗi im lặng không ai ngờ tới.
     */
    return next(new AppError(401, "Bạn cần đăng nhập để thực hiện thao tác này."));
  }

  // Cắt bỏ 7 ký tự "Bearer " ở đầu để lấy phần token.
  const token = header.slice("Bearer ".length).trim();

  try {
    /*
     * BƯỚC 2 — Kiểm chữ ký và hạn của token.
     *
     * Một dòng này làm hai việc, và cả hai đều bắt buộc:
     *   - Tính lại chữ ký từ header + payload bằng `JWT_SECRET`, so với chữ ký
     *     đi kèm. Khác nhau → token đã bị sửa hoặc do người khác ký → ném lỗi.
     *   - So `exp` trong payload với đồng hồ hiện tại. Quá hạn → ném lỗi.
     *
     * Nhắc lại cảnh báo ở `lib/jwt.ts`: đây phải là `verify`, tuyệt đối không
     * phải `decode`. `decode` chỉ bóc base64 ra đọc mà không kiểm chữ ký, nên ai
     * cũng tự chế được một token giả và đi thẳng vào tài khoản người khác.
     */
    const payload = verifyAccessToken(token);

    /*
     * BƯỚC 3 — Gắn danh tính vào request.
     *
     * Từ đây trở đi, mọi controller phía sau đọc `req.user.id` là biết chắc chắn
     * mình đang phục vụ ai. Và đây là điểm mấu chốt về mặt bảo mật:
     *
     *     GIÁ TRỊ NÀY ĐẾN TỪ CHỮ KÝ, KHÔNG ĐẾN TỪ DỮ LIỆU CLIENT TỰ KHAI.
     *
     * Hãy hình dung phương án tệ: cho client gửi `userId` trong body request.
     * Khi đó ai cũng có thể sửa một giá trị trong DevTools để đọc todo của người
     * khác — một lỗ hổng mà không dòng code nào phía sau cứu được.
     *
     * Với `id` lấy từ token đã kiểm chữ ký, muốn giả mạo thì phải đoán được
     * `JWT_SECRET`. Mật mã học đảm bảo điều đó là bất khả thi.
     *
     * Nguyên tắc rút ra, đáng mang theo suốt nghề: DANH TÍNH KHÔNG BAO GIỜ ĐƯỢC
     * ĐẾN TỪ THAM SỐ DO CLIENT GỬI. Nó phải được server tự suy ra từ một thứ đã
     * được kiểm chứng.
     */
    req.user = { id: payload.id, email: payload.email };

    next();
  } catch {
    /*
     * Verify thất bại có thể vì: token hết hạn, token bị sửa, token ký bằng
     * khoá khác, hoặc chuỗi gửi lên chẳng phải JWT.
     *
     * Ta cố ý gộp tất cả thành MỘT thông báo chung. Nói rõ "token hết hạn" hay
     * "chữ ký sai" chỉ giúp ích cho người đang dò tìm cách tấn công. Còn frontend
     * thì chỉ cần biết một điều: 401 nghĩa là đi làm mới token hoặc đá về trang
     * đăng nhập.
     *
     * Chú ý `catch` không có tham số — cú pháp hợp lệ từ ES2019, dùng khi bạn
     * thật sự không cần tới đối tượng lỗi. Viết vậy nói rõ với người đọc rằng
     * việc bỏ qua chi tiết lỗi ở đây là CHỦ Ý, không phải bỏ sót.
     */
    next(new AppError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."));
  }
}
