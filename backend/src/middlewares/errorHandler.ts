/*
 * ============================================================================
 * ERROR HANDLER — chốt chặn cuối cùng, nơi mọi lỗi đổ về
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * QUY ƯỚC KỲ LẠ NHƯNG BẮT BUỘC PHẢI NHỚ: BỐN THAM SỐ
 * ---------------------------------------------------------------------------
 * Express phân biệt middleware thường và middleware xử lý lỗi bằng cách ĐẾM SỐ
 * THAM SỐ của hàm:
 *
 *     (req, res, next)        → 3 tham số → middleware THƯỜNG
 *     (err, req, res, next)   → 4 tham số → middleware XỬ LÝ LỖI
 *
 * Vì vậy tham số `next` ở đây PHẢI được khai báo, dù bên trong hàm không hề dùng
 * tới nó. Xoá đi cho "sạch" là hàm tụt xuống 3 tham số và Express sẽ coi nó như
 * middleware thường — nó sẽ không bao giờ được gọi khi có lỗi, và bạn sẽ ngồi
 * gãi đầu rất lâu. (Đây là một trong những cái bẫy nổi tiếng nhất của Express.)
 *
 * ---------------------------------------------------------------------------
 * NÓ ĐƯỢC GỌI KHI NÀO?
 * ---------------------------------------------------------------------------
 * Khi ở bất kỳ đâu trong dây chuyền có ai đó gọi `next(err)` — tức là truyền một
 * đối số vào `next`. Lúc đó Express BỎ QUA toàn bộ middleware thường còn lại và
 * nhảy thẳng tới middleware lỗi đầu tiên nó tìm thấy.
 *
 * Trong dự án này, luồng lỗi hoàn chỉnh là:
 *
 *     zod `.parse()` thất bại
 *     hoặc service `throw new AppError(404, ...)`
 *              │
 *              ▼
 *     `catch (err)` trong controller
 *              │  next(err)
 *              ▼
 *     ERROR HANDLER (file này)  →  res.json({ success: false, ... })
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO PHẢI GOM LỖI VỀ MỘT CHỖ?
 * ---------------------------------------------------------------------------
 * Vì nếu không, mỗi controller sẽ phải tự viết:
 *
 *     if (err instanceof ZodError)  return res.status(400).json(...);
 *     if (err instanceof AppError)  return res.status(err.statusCode).json(...);
 *     return res.status(500).json(...);
 *
 * Bảy controller là bảy lần lặp lại, và chỉ cần một chỗ quên là API trả về hình
 * dạng lỗi khác lạ, khiến frontend hiển thị sai. Gom về đây thì luật chỉ có một
 * bản duy nhất.
 *
 * ---------------------------------------------------------------------------
 * NGUYÊN TẮC PHÂN LOẠI: LỖI CỦA AI?
 * ---------------------------------------------------------------------------
 * Hàm này chia lỗi làm ba nhóm, theo đúng thứ tự từ cụ thể tới tổng quát:
 *
 *   1. ZodError  → 400. Lỗi của NGƯỜI GỬI: dữ liệu sai định dạng.
 *   2. AppError  → mã do chính mình đặt (thường 404). Lỗi NGHIỆP VỤ đã lường trước.
 *   3. Còn lại   → 500. Lỗi của SERVER: bug, database sập, thứ ta chưa lường tới.
 *
 * Thứ tự kiểm tra rất quan trọng: luôn xét trường hợp CỤ THỂ trước, trường hợp
 * tổng quát sau. Đảo lại thì nhánh chung sẽ nuốt hết, các nhánh riêng không bao
 * giờ chạy tới.
 */

import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  /*
   * Kiểu của `err` là `unknown` chứ không phải `Error`. Lý do: JavaScript cho
   * phép `throw` bất cứ giá trị nào — kể cả `throw "oops"` hay `throw 42`. Thư
   * viện bên thứ ba đôi khi làm vậy thật. `unknown` buộc ta phải kiểm tra bằng
   * `instanceof` trước khi đụng vào bất kỳ thuộc tính nào, nên không thể sập vì
   * đọc `.message` của một con số.
   */

  /*
   * --- NHÓM 1: LỖI VALIDATE (400 Bad Request) ---
   *
   * `err.issues` là mảng do Zod cung cấp, mỗi phần tử mô tả một trường bị sai.
   * Ta biến đổi nó thành dạng gọn hơn cho frontend:
   *
   *     [{ path: "content", message: "content không được để trống" }]
   *
   * `issue.path` vốn là MẢNG các đoạn đường dẫn, vì object có thể lồng nhau:
   * với dữ liệu `{ user: { email: "sai" } }` thì `path` là `["user","email"]`.
   * `.join(".")` ghép lại thành `"user.email"` — chuỗi dễ đọc và dễ dùng để tìm
   * đúng ô nhập liệu cần tô đỏ trên giao diện.
   *
   * Trả về CẢ MẢNG thay vì một câu duy nhất là chủ ý: form nhiều ô sai thì người
   * dùng nhìn thấy hết một lượt, không phải sửa từng cái rồi bấm gửi lại.
   */
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Dữ liệu không hợp lệ",
      errors: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
    /*
     * `return` trần (không kèm giá trị) chỉ để THOÁT khỏi hàm. Thiếu nó thì code
     * chạy tiếp xuống dưới và gọi `res.json()` lần thứ hai — Express sẽ ném lỗi
     * "Cannot set headers after they are sent to the client", vì phản hồi đã
     * được gửi đi và đóng lại rồi.
     */
    return;
  }

  /*
   * --- NHÓM 2: LỖI NGHIỆP VỤ ĐÃ LƯỜNG TRƯỚC ---
   *
   * `AppError` là lớp lỗi tự định nghĩa (xem `utils/AppError.ts`), mang theo sẵn
   * mã status. Nhờ vậy tầng service — nơi hiểu rõ nghiệp vụ nhất — được quyền
   * quyết định "chuyện này đáng trả về 404", mà vẫn không cần biết gì về `res`
   * hay HTTP. Ở đây chỉ việc lấy con số đó ra dùng.
   *
   * Không ghi log ở nhánh này: 404 là chuyện bình thường (người dùng mở lại link
   * cũ của một todo đã xoá), ghi log chỉ tổ làm nhiễu.
   */
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ success: false, message: err.message });
    return;
  }

  /*
   * --- NHÓM 3: LỖI KHÔNG LƯỜNG TRƯỚC (500 Internal Server Error) ---
   *
   * Tới được đây nghĩa là có chuyện BẤT THƯỜNG: một bug trong code, database mất
   * kết nối, hết bộ nhớ...
   *
   * `console.error(err)` in ra nguyên vẹn cả stack trace — đây là manh mối DUY
   * NHẤT để bạn tìm ra nguyên nhân, vì phản hồi gửi cho khách đã bị làm mờ đi.
   * (Dự án thật thường thay bằng thư viện log như pino/winston, hoặc dịch vụ
   * theo dõi lỗi như Sentry, để lỗi được lưu lại và cảnh báo kịp thời.)
   *
   * Vì sao KHÔNG gửi `err.message` thật về cho khách? Vì lý do AN NINH. Thông
   * điệp lỗi gốc có thể để lộ: tên bảng và cột trong database, đường dẫn thư mục
   * trên máy chủ, phiên bản thư viện đang dùng, thậm chí một phần chuỗi kết nối.
   * Đó đều là những thứ kẻ tấn công rất muốn biết. Nguyên tắc chung:
   *
   *     Lỗi chi tiết → ghi vào log (chỉ mình đọc)
   *     Lỗi chung chung → gửi cho khách
   *
   * Ngược lại, thông báo của `ZodError` và `AppError` ở trên thì gửi thẳng được,
   * vì đó là những câu do CHÍNH TA viết ra cho người dùng đọc.
   */
  console.error(err);
  res.status(500).json({ success: false, message: "Lỗi hệ thống" });
}
