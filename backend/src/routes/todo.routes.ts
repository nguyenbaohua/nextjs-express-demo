/*
 * ============================================================================
 * BẢNG ĐỊNH TUYẾN (ROUTES) — tấm bản đồ "URL nào gọi hàm nào"
 * ============================================================================
 *
 * File này cố tình giữ cực ngắn và KHÔNG chứa logic. Đọc nó, bạn nắm được toàn
 * bộ khả năng của API chỉ trong vài giây. Đây là điểm mạnh của việc tách file.
 *
 * ---------------------------------------------------------------------------
 * MỘT ROUTE GỒM BA PHẦN
 * ---------------------------------------------------------------------------
 *
 *     router.get      (   "/:id"   ,   todoController.getTodoById   )
 *            └─┬─┘        └──┬──┘         └────────┬────────┘
 *          PHƯƠNG THỨC    ĐƯỜNG DẪN            HÀM XỬ LÝ
 *
 * Express so khớp CẢ HAI: phương thức và đường dẫn. `GET /7` và `DELETE /7`
 * cùng đường dẫn nhưng khác phương thức nên chạy hai hàm khác nhau.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO PHẢI CÓ NHIỀU PHƯƠNG THỨC (GET/POST/PUT/PATCH/DELETE)?
 * ---------------------------------------------------------------------------
 * Về kỹ thuật, bạn hoàn toàn có thể làm mọi thứ bằng POST. Nhưng dùng đúng
 * phương thức là một quy ước (gọi là REST) giúp người khác — và cả các công cụ
 * như trình duyệt, proxy, cache — đoán được ý định của bạn:
 *
 *   GET    Đọc dữ liệu. KHÔNG được thay đổi gì. Gọi 100 lần vẫn an toàn.
 *   POST   Tạo mới. Gọi 2 lần → tạo ra 2 bản ghi (nên trình duyệt hỏi lại khi
 *          bạn F5 một trang vừa POST).
 *   PUT    Thay thế TOÀN BỘ bản ghi bằng dữ liệu mới bạn gửi lên.
 *   PATCH  Sửa MỘT PHẦN bản ghi.
 *   DELETE Xoá.
 *
 * ---------------------------------------------------------------------------
 * `:id` — THAM SỐ ĐỘNG TRONG ĐƯỜNG DẪN
 * ---------------------------------------------------------------------------
 * Dấu hai chấm nói với Express: "chỗ này là chỗ trống, khớp với bất cứ đoạn nào".
 * Giá trị khớp được được cất vào `req.params` theo đúng tên bạn đặt:
 *
 *     GET /api/todos/7   →   req.params = { id: "7" }
 *
 * NHỚ KỸ: giá trị luôn là CHUỖI `"7"`, không phải số `7`, vì URL vốn chỉ là văn
 * bản. Đây là lý do trong `schemas/todo.schema.ts` ta phải dùng `z.coerce.number()`
 * để ép về số trước khi đưa xuống database.
 *
 * ---------------------------------------------------------------------------
 * THỨ TỰ ROUTE CÓ QUAN TRỌNG KHÔNG?
 * ---------------------------------------------------------------------------
 * Có. Express duyệt từ trên xuống và DỪNG ở route khớp đầu tiên. Vấn đề chỉ nảy
 * sinh khi hai route có thể cùng khớp một URL, ví dụ nếu bạn thêm:
 *
 *     router.get("/:id",   ...)   ← "/search" cũng khớp, vì :id nhận mọi thứ!
 *     router.get("/search", ...)  ← không bao giờ chạy tới
 *
 * Quy tắc an toàn: đặt các đường dẫn CỐ ĐỊNH lên trên các đường dẫn có tham số.
 * Trong file này chưa gặp vấn đề đó vì các route đều phân biệt được rõ ràng.
 */

import { Router } from "express";
import * as todoController from "../controllers/todo.controller";

/*
 * `Router()` tạo ra một "mini-app" Express: nó cũng có `.get`, `.post`,
 * `.use`... y hệt `app`, nhưng đứng độc lập và chỉ hoạt động khi được gắn vào
 * app thật (xem `app.use("/api/todos", todoRoutes)` trong `app.ts`).
 *
 * Nhờ vậy mỗi nhóm chức năng có file router riêng, app chính không phình to.
 */
const router = Router();

/*
 * Chú ý: ta viết `todoController.getAllTodos` — KHÔNG có cặp ngoặc `()` phía sau.
 *
 * Đây là điểm rất dễ sai. Ta đang TRAO cho Express bản thân hàm đó để nó cất đi
 * và gọi sau, mỗi khi có request. Nếu viết `getAllTodos()` thì JavaScript sẽ
 * chạy hàm NGAY LẬP TỨC lúc khởi động server, rồi đưa cho Express cái *kết quả*
 * — sai hoàn toàn.
 *
 * Đường dẫn dưới đây đã được cắt bỏ tiền tố `/api/todos`, nên `"/"` thực chất
 * chính là `/api/todos`.
 */

// GET /api/todos — lấy toàn bộ todo (mới nhất lên đầu).
router.get("/", todoController.getAllTodos);

// GET /api/todos/7 — lấy một todo. Không có thì trả 404.
router.get("/:id", todoController.getTodoById);

// POST /api/todos — tạo todo mới. Nội dung nằm trong body: { "content": "..." }
router.post("/", todoController.createTodo);

// DELETE /api/todos/7 — xoá vĩnh viễn.
router.delete("/:id", todoController.deleteTodo);

// PUT /api/todos/7 — sửa nội dung. Body: { "content": "nội dung mới" }
router.put("/:id", todoController.updateTodoContent);

/*
 * Hai route đổi trạng thái hoàn thành.
 *
 * Ở đây dự án chọn cách "một hành động — một đường dẫn" (`/done`, `/undone`)
 * thay vì cách phổ biến hơn là `PATCH /:id` với body `{ "isDone": true }`.
 *
 * Đánh đổi giữa hai cách:
 *   - Cách này: URL tự nói lên ý định, không cần body, client gọi rất gọn.
 *     Nhược điểm là mỗi thao tác lại đẻ thêm một đường dẫn mới.
 *   - Cách kia: đúng "chuẩn REST" hơn, một route sửa được nhiều trường, nhưng
 *     phải validate body cẩn thận hơn.
 *
 * Cả hai đều chấp nhận được. Chỉ cần nhất quán trong cùng một dự án.
 * Lưu ý cả hai đều gọi chung `setTodoDone` ở tầng service, chỉ khác tham số
 * `true`/`false` — không có code nào bị lặp.
 */
// PATCH /api/todos/7/done   — đánh dấu đã xong.
router.patch("/:id/done", todoController.markTodoDone);
// PATCH /api/todos/7/undone — bỏ đánh dấu.
router.patch("/:id/undone", todoController.markTodoUndone);

/*
 * `export default` để `app.ts` import được với tên bất kỳ (`todoRoutes`).
 * Một file chỉ được có duy nhất một `export default`.
 */
export default router;
