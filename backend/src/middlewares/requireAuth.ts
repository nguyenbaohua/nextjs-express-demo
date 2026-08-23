/*
 * ============================================================================
 * requireAuth — NGƯỜI GÁC CỔNG
 * ============================================================================
 *
 * Đây là toàn bộ phần "chỉ thấy ghi chú của chính mình" ở phía backend, gói gọn
 * trong một middleware.
 *
 * Middleware là một hàm nằm CHẮN GIỮA request và controller. Nó có ba lựa chọn:
 *   - gọi `next()`  → cho đi tiếp
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
 */

import { NextFunction, Request, Response } from "express";
import { accessTokenVerifier } from "../lib/cognito";
import { AppError } from "../utils/AppError";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  /*
   * BƯỚC 1 — Lấy token ra khỏi header.
   *
   * Quy ước chuẩn (RFC 6750) là header có dạng:
   *     Authorization: Bearer eyJraWQiOiJ...
   *
   * "Bearer" nghĩa đen là "người mang" — bất kỳ ai CẦM được token này đều dùng
   * được nó, y như tờ tiền mặt. Không có bước nào kiểm tra xem người gửi có đúng
   * là chủ nhân hay không.
   *
   * Đó chính là lý do ở frontend ta cất token vào cookie `httpOnly`: cờ đó khiến
   * JavaScript trong trình duyệt KHÔNG đọc được cookie, nên kể cả khi trang web
   * dính mã độc (tấn công XSS), kẻ tấn công cũng không lấy được token ra.
   */
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    /*
     * Dùng `next(error)` chứ không `res.status(401).json(...)`.
     *
     * Lý do: để errorHandler là nơi DUY NHẤT định dạng response lỗi. Nhờ vậy mọi
     * lỗi trong ứng dụng đều có cùng một hình dạng `{ success: false, message }`,
     * và frontend chỉ cần viết một chỗ xử lý cho tất cả.
     */
    return next(new AppError(401, "Bạn cần đăng nhập để thực hiện thao tác này."));
  }

  // Cắt bỏ 7 ký tự "Bearer " ở đầu để lấy phần token.
  const token = header.slice("Bearer ".length).trim();

  try {
    /*
     * BƯỚC 2 — Kiểm token.
     *
     * Một dòng này làm rất nhiều việc (xem giải thích chi tiết ở lib/cognito.ts):
     * kiểm chữ ký bằng khoá công khai của Cognito, kiểm hạn dùng, kiểm token do
     * đúng user pool phát ra, kiểm đúng loại "access", kiểm đúng app client.
     *
     * Lần gọi đầu tiên có đi tải bộ khoá công khai (JWKS) về, hơi chậm một chút.
     * Từ lần thứ hai trở đi thư viện dùng bản đã cache trong bộ nhớ — không có
     * request nào ra Internet nữa. Đó là lý do cách làm này chịu tải tốt.
     */
    const claims = await accessTokenVerifier.verify(token);

    /*
     * BƯỚC 3 — Gắn danh tính vào request.
     *
     * Từ đây trở đi, mọi controller phía sau đọc `req.user.sub` là biết chắc chắn
     * mình đang phục vụ ai. Con số đó ĐẾN TỪ CHỮ KÝ CỦA COGNITO, không phải từ
     * dữ liệu client tự khai — đó là toàn bộ điểm mấu chốt.
     *
     * Hãy hình dung phương án tệ: cho client gửi `userId` trong body request.
     * Khi đó ai cũng có thể sửa một con số trong DevTools để đọc todo của người
     * khác. Với `sub` lấy từ token đã ký, muốn giả mạo thì phải giả được chữ ký
     * của AWS — điều mà mật mã học đảm bảo là bất khả thi.
     */
    req.user = {
      sub: claims.sub,
      username: String(claims.username ?? claims.sub),
    };

    next();
  } catch {
    /*
     * Verify thất bại có thể vì: token hết hạn, token bị sửa, token của user pool
     * khác, hoặc chuỗi gửi lên chẳng phải JWT.
     *
     * Ta cố ý gộp tất cả thành MỘT thông báo chung. Nói rõ "token hết hạn" hay
     * "chữ ký sai" chỉ giúp ích cho người đang dò tìm cách tấn công. Còn frontend
     * thì chỉ cần biết một điều: 401 nghĩa là đi làm mới token hoặc đá về trang
     * đăng nhập.
     */
    next(new AppError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn."));
  }
}
