/*
 * ============================================================================
 * "APP" EXPRESS — trái tim của backend, nơi lắp ráp dây chuyền xử lý request
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * EXPRESS LÀ GÌ?
 * ---------------------------------------------------------------------------
 * Node.js đã có sẵn khả năng dựng web server, nhưng nó rất thô: bạn phải tự đọc
 * `req.url`, tự viết `if/else` để phân biệt "/api/todos" với "/api/users", tự
 * gom từng mẩu dữ liệu POST rồi tự `JSON.parse`, tự set từng header...
 *
 * Express là lớp bọc mỏng lên trên, cho bạn hai thứ quan trọng:
 *   1. ROUTING  — khai báo "GET /api/todos thì chạy hàm này" một cách gọn gàng.
 *   2. MIDDLEWARE — chia việc xử lý thành nhiều chặng nối tiếp nhau.
 *
 * ---------------------------------------------------------------------------
 * MIDDLEWARE LÀ GÌ? (khái niệm quan trọng nhất của Express)
 * ---------------------------------------------------------------------------
 * Hãy hình dung một request đi vào backend như một lá đơn đi qua nhiều cửa
 * trong toà nhà hành chính. Mỗi cửa là một MIDDLEWARE — một hàm có dạng:
 *
 *     function (req, res, next) { ... }
 *
 *   - `req`  : lá đơn đi vào  (URL, header, body, params...)
 *   - `res`  : cái phong bì để trả lời (dùng `res.json(...)` để gửi đi)
 *   - `next` : "xong việc của tôi rồi, chuyển sang cửa tiếp theo"
 *
 * Mỗi middleware có đúng hai lựa chọn:
 *   a) TRẢ LỜI luôn  → gọi `res.json()` / `res.send()`. Dây chuyền DỪNG tại đó.
 *   b) ĐI TIẾP       → gọi `next()`. Request sang middleware kế bên dưới.
 *
 * Quên cả hai (không trả lời, cũng không `next()`) là lỗi kinh điển của người
 * mới: trình duyệt sẽ quay vòng vòng cho tới khi hết giờ chờ.
 *
 * ---------------------------------------------------------------------------
 * THỨ TỰ `app.use(...)` LÀ THỨ TỰ CHẠY — KHÔNG PHẢI CHUYỆN NGẪU NHIÊN
 * ---------------------------------------------------------------------------
 * Express xếp middleware thành một HÀNG ĐỢI theo đúng thứ tự bạn khai báo.
 * Đổi chỗ hai dòng là đổi hành vi của cả app. Ví dụ nếu đặt `notFound` lên trên
 * `todoRoutes`, thì MỌI request đều bị trả 404 — vì nó bị chặn ngay từ cửa đầu.
 *
 * Dây chuyền của dự án này, đọc từ trên xuống:
 *
 *     Request
 *        │
 *        ├─▶ cors()            cho phép trình duyệt gọi từ tên miền khác
 *        ├─▶ express.json()    đọc body JSON thành object
 *        ├─▶ /api/todos ...    các route nghiệp vụ  ── trả lời tại đây (thường)
 *        ├─▶ notFound          không route nào khớp → 404
 *        └─▶ errorHandler      có lỗi ném ra ở bất cứ đâu → gom về đây
 */

import cors from "cors";
import express from "express";
import { errorHandler } from "./middlewares/errorHandler";
import { notFound } from "./middlewares/notFound";
import authRoutes from "./routes/auth.routes";
import todoRoutes from "./routes/todo.routes";

/*
 * `express()` tạo ra đối tượng ứng dụng. Tạm hiểu nó là "toà nhà rỗng" — bên
 * dưới ta sẽ lắp từng cửa vào.
 */
const app = express();

/*
 * ---------------------------------------------------------------------------
 * CỬA 1: CORS — vì sao thiếu dòng này trình duyệt sẽ chặn frontend?
 * ---------------------------------------------------------------------------
 * Trình duyệt có luật an toàn tên là "Same-Origin Policy": trang web ở
 * http://localhost:3001 (frontend Next.js) KHÔNG được phép đọc kết quả từ
 * http://localhost:3000 (backend Express), vì khác cổng nghĩa là khác "origin".
 *
 * Luật này sinh ra để bảo vệ bạn: nếu không có nó, một trang web độc hại có thể
 * lén gọi API ngân hàng bằng cookie đăng nhập của bạn rồi đọc số dư.
 *
 * CORS là cách backend nói: "tôi ĐỒNG Ý cho origin kia đọc dữ liệu của tôi".
 * Cụ thể, `cors()` gắn thêm header `Access-Control-Allow-Origin` vào mỗi phản
 * hồi; trình duyệt thấy header đó thì mới cho JavaScript đọc kết quả.
 *
 * Ba điều dễ hiểu nhầm:
 *   1. CORS là luật của TRÌNH DUYỆT. Gọi bằng Postman hay `curl` không bao giờ
 *      dính lỗi CORS, dù backend không cài gì cả.
 *   2. Request VẪN tới được backend và VẪN chạy (todo vẫn bị xoá thật!).
 *      Trình duyệt chỉ chặn ở bước cuối: không cho JS đọc phản hồi.
 *   3. `cors()` gọi trần như thế này nghĩa là "cho phép TẤT CẢ origin". Tiện khi
 *      học, nhưng lên production nên siết lại:
 *          app.use(cors({ origin: "https://ten-mien-that.com" }));
 *
 * Ghi chú: trong dự án này frontend Next.js gọi Express từ phía SERVER (không
 * phải từ trình duyệt), nên thực tế ít chạm CORS. Nhưng vẫn nên bật để bạn có
 * thể thử API bằng JavaScript ngay trong console của trình duyệt.
 */
app.use(cors());

/*
 * ---------------------------------------------------------------------------
 * CỬA 2: ĐỌC BODY JSON
 * ---------------------------------------------------------------------------
 * Khi frontend gửi `POST /api/todos` với body `{"content":"Học Express"}`, dữ
 * liệu đó KHÔNG tự nhiên xuất hiện trong `req.body`. Nó đến từ mạng dưới dạng
 * một dòng byte chảy từ từ (stream), có thể chia làm nhiều mẩu.
 *
 * `express.json()` làm ba việc:
 *   1. Kiểm tra header `Content-Type` có phải `application/json` không.
 *   2. Nếu phải: gom hết các mẩu byte lại, `JSON.parse` thành object.
 *   3. Gán kết quả vào `req.body` rồi gọi `next()`.
 *
 * Không có dòng này thì `req.body` là `undefined` — lỗi "kinh điển tập 2" của
 * người mới học Express. Nếu form gửi kiểu HTML thuần (không phải JSON) thì cần
 * thêm `app.use(express.urlencoded({ extended: true }))`.
 */
app.use(express.json());

/*
 * ---------------------------------------------------------------------------
 * CỬA 3: GẮN CÁC ROUTE NGHIỆP VỤ
 * ---------------------------------------------------------------------------
 * `app.use("/api/todos", todoRoutes)` gọi là MOUNT (gắn) một router vào một
 * tiền tố đường dẫn.
 *
 * Ý nghĩa: "mọi URL bắt đầu bằng /api/todos, hãy đưa cho `todoRoutes` xử lý;
 * và khi đưa, hãy CẮT BỎ phần tiền tố đi".
 *
 * Nhờ việc cắt bỏ đó, bên trong file routes bạn chỉ cần viết `router.get("/")`
 * chứ không phải lặp lại `"/api/todos"` ở từng dòng.
 *
 *     Trình duyệt gọi          Router bên trong nhìn thấy
 *     ----------------------   --------------------------
 *     GET  /api/todos          GET  /
 *     GET  /api/todos/7        GET  /7        → khớp "/:id"
 *     PATCH /api/todos/7/done  PATCH /7/done  → khớp "/:id/done"
 *
 * Muốn thêm nhóm chức năng mới (ví dụ user), bạn chỉ cần viết thêm một file
 * router rồi thêm một dòng `app.use("/api/users", userRoutes)` ở đây.
 */
/*
 * Hai nhóm route, và sự khác nhau giữa chúng là điều đáng chú ý nhất ở file này:
 *
 *   /api/auth   — phần lớn CÔNG KHAI. Phải vậy, vì đây là những cánh cửa dành
 *                 cho người CHƯA có token: đăng ký, xác thực email, đăng nhập.
 *
 *   /api/todos  — TOÀN BỘ cần token. Bên trong `todo.routes.ts` có một dòng
 *                 `router.use(requireAuth)` chắn ngang trước mọi route.
 *
 * Ranh giới "chỗ nào cần đăng nhập" vì thế nằm gọn trong hai file router, không
 * rải rác khắp các controller — đọc là thấy ngay toàn cảnh.
 */
app.use("/api/auth", authRoutes);
app.use("/api/todos", todoRoutes);

/*
 * ---------------------------------------------------------------------------
 * CỬA 4 & 5: HAI CHỐT CHẶN CUỐI — BẮT BUỘC ĐỂ SAU CÙNG
 * ---------------------------------------------------------------------------
 * `notFound` là "lưới hứng": request chạy tới đây nghĩa là đã đi qua hết mọi
 * route mà không ai nhận → chắc chắn URL sai → trả 404.
 *
 * `errorHandler` là chốt đặc biệt: nó có BỐN tham số `(err, req, res, next)`.
 * Express nhận diện middleware xử lý lỗi bằng cách ĐẾM SỐ THAM SỐ. Bốn tham số
 * thì nó chỉ được gọi khi ở đâu đó có ai gọi `next(err)` — còn ba tham số thì
 * chạy bình thường. Đây là quy ước lạ nhưng bạn buộc phải nhớ.
 *
 * Nhờ hai cửa này mà toàn bộ controller phía trên được viết rất gọn: hễ có lỗi
 * thì chỉ cần `next(err)` và quên nó đi, mọi thứ được xử lý tập trung một chỗ.
 */
app.use(notFound);
app.use(errorHandler);

/*
 * Chỉ export ứng dụng, KHÔNG gọi `listen` ở đây — lý do đã giải thích trong
 * `index.ts` (để test có thể dùng app mà không cần mở cổng mạng thật).
 */
export default app;
