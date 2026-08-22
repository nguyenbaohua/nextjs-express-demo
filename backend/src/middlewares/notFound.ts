/*
 * ============================================================================
 * NOT FOUND — tấm lưới hứng những request không khớp route nào
 * ============================================================================
 *
 * Middleware này được gắn ở gần cuối `app.ts`, sau tất cả các route thật:
 *
 *     app.use("/api/todos", todoRoutes);
 *     app.use(notFound);        ← chỉ chạy khi các dòng trên không ai nhận việc
 *     app.use(errorHandler);
 *
 * Vì Express duyệt middleware theo đúng thứ tự khai báo, một request chạy được
 * tới đây có nghĩa là nó đã đi qua toàn bộ route mà không route nào khớp — chắc
 * chắn URL sai hoặc sai phương thức. Ta trả về 404 kèm mô tả rõ ràng.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG CÓ MIDDLEWARE NÀY THÌ SAO?
 * ---------------------------------------------------------------------------
 * Express vẫn trả về 404, nhưng dưới dạng một trang HTML mặc định
 * (`<pre>Cannot GET /api/todoss</pre>`). Frontend gọi `res.json()` trên đó sẽ
 * gặp lỗi parse JSON khó hiểu.
 *
 * Có middleware này thì MỌI phản hồi của API — thành công hay thất bại — đều là
 * JSON cùng một hình dạng `{ success, ... }`. Frontend chỉ cần viết một chỗ xử
 * lý duy nhất.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO HÀM NÀY KHÔNG CÓ THAM SỐ `next`?
 * ---------------------------------------------------------------------------
 * Vì nó là điểm cuối của luồng bình thường — luôn tự trả lời, không bao giờ
 * chuyển tiếp cho ai. Express cho phép khai báo ít tham số hơn (2 hay 3 tham số
 * đều được coi là middleware thường). Điều BẮT BUỘC chỉ là: middleware xử lý lỗi
 * phải có đúng 4 tham số.
 */

import { Request, Response } from "express";

export function notFound(req: Request, res: Response) {
  /*
   * Thông báo ghép từ hai thông tin lấy trong `req`:
   *
   *   `req.method`      — phương thức viết hoa: "GET", "POST", "PATCH"...
   *   `req.originalUrl` — đường dẫn ĐẦY ĐỦ như trình duyệt đã gửi, kể cả phần
   *                       `?query=...`. Phải dùng `originalUrl` chứ không phải
   *                       `req.url`, vì `req.url` đã bị Express cắt bỏ tiền tố
   *                       khi đi qua các router con — thông báo sẽ thiếu đầu.
   *
   * Kết quả người gõ nhầm sẽ nhận được:
   *     { "success": false, "message": "Không tìm thấy route GET /api/todoss" }
   *
   * In cả URL ra rất tiện khi gỡ lỗi: lỗi thường chỉ là thiếu chữ `s`, sai dấu
   * gạch chéo cuối, hoặc dùng nhầm GET cho một route POST.
   *
   * Lưu ý an toàn: chỉ nên phản chiếu lại URL, tuyệt đối không phản chiếu lại
   * nội dung body do khách gửi — trả nguyên văn dữ liệu của khách vào phản hồi
   * là mầm mống của lỗ hổng XSS nếu nội dung đó được hiển thị ở đâu đó.
   */
  res.status(404).json({ success: false, message: `Không tìm thấy route ${req.method} ${req.originalUrl}` });
}
