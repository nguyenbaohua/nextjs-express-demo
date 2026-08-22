/*
 * ============================================================================
 * CONTROLLER — người "tiếp tân" đứng giữa thế giới HTTP và nghiệp vụ
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CHIA THÀNH NHIỀU TẦNG (route → controller → service)?
 * ---------------------------------------------------------------------------
 * Với app todo nhỏ xíu này, viết tất cả vào một file cũng chạy. Nhưng cách chia
 * tầng dưới đây là chuẩn mực ở dự án thật, và lý do rất thực tế:
 *
 *     routes/       Bản đồ URL. Chỉ trỏ, không làm gì.
 *     controllers/  BIẾT về HTTP: đọc req, chọn mã status, gửi res.
 *                   KHÔNG biết database là Postgres hay MongoDB.
 *     services/     BIẾT về database và nghiệp vụ.
 *                   KHÔNG biết HTTP là gì (không có req, res ở đây).
 *
 * Ranh giới đó đáng giá ở chỗ:
 *   - Đổi database (Prisma → thứ khác)? Chỉ sửa `services/`.
 *   - Thêm giao diện dòng lệnh hay hàng đợi công việc? Gọi thẳng `services/`,
 *     không cần giả lập request HTTP.
 *   - Viết test cho nghiệp vụ? Test service là hàm thuần, dễ hơn nhiều so với
 *     phải dựng cả server.
 *
 * ---------------------------------------------------------------------------
 * MỌI HÀM Ở ĐÂY ĐỀU CÙNG MỘT KHUÔN 4 BƯỚC
 * ---------------------------------------------------------------------------
 *     1. Validate  — dùng zod bóc dữ liệu từ `req.params` / `req.body`.
 *     2. Gọi service — giao việc thật cho tầng dưới.
 *     3. Trả lời   — `res.json(...)` với mã status phù hợp.
 *     4. Có lỗi    — `next(err)` đẩy về `errorHandler`.
 *
 * Đọc hiểu một hàm là hiểu cả bảy. Sự nhàm chán ở đây là CỐ Ý: code dễ đoán thì
 * dễ bảo trì.
 *
 * ---------------------------------------------------------------------------
 * BA THAM SỐ `req`, `res`, `next`
 * ---------------------------------------------------------------------------
 *   req  — mọi thứ khách gửi lên:
 *            req.params  đoạn động trong URL   → { id: "7" }  (luôn là chuỗi!)
 *            req.body    dữ liệu JSON gửi kèm  → { content: "..." }
 *            req.query   phần sau dấu ?        → /todos?done=true
 *            req.headers thông tin phụ         → Content-Type, Authorization...
 *   res  — công cụ trả lời. `res.json(x)` tự chuyển `x` sang JSON, tự đặt header
 *          `Content-Type: application/json`, rồi GỬI ĐI và ĐÓNG kết nối.
 *          Gọi `res.json` hai lần trong một request là lỗi.
 *   next — chuyển tiếp. `next()` sang middleware kế; `next(err)` nhảy thẳng tới
 *          middleware xử lý lỗi, bỏ qua mọi middleware thường ở giữa.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN `try/catch` QUANH CODE BẤT ĐỒNG BỘ?
 * ---------------------------------------------------------------------------
 * Express 4 KHÔNG hiểu Promise. Nếu một hàm `async` ném lỗi mà bạn không bắt,
 * Express không hề hay biết: request treo lơ lửng cho tới khi trình duyệt bỏ
 * cuộc, và trong log chỉ hiện "UnhandledPromiseRejection".
 *
 * Dự án này dùng Express 5, phiên bản đã tự động bắt Promise bị reject và
 * chuyển tới error handler — nên về lý thuyết có thể bỏ `try/catch` đi. Nhưng ở
 * đây vẫn viết đầy đủ, vì:
 *   - Ý đồ hiện rõ trên màn hình, người đọc không phải nhớ đặc tính ngầm của
 *     framework.
 *   - Code giữ nguyên được nếu dự án phải lùi về Express 4, và cực kỳ nhiều tài
 *     liệu / dự án ngoài kia vẫn là Express 4 — bạn nên quen với khuôn này.
 *   - Khi cần, chỗ `catch` là nơi sẵn sàng để thêm xử lý riêng.
 *
 * ---------------------------------------------------------------------------
 * "PHONG BÌ" `{ success, data }`
 * ---------------------------------------------------------------------------
 * Mọi phản hồi của API này đều được gói trong một hình dạng cố định:
 *
 *     { "success": true,  "data": ... }                  ← thành công
 *     { "success": false, "message": "..." }             ← thất bại
 *
 * Nhờ đó frontend chỉ cần viết MỘT hàm bóc phong bì dùng chung cho mọi lời gọi
 * (xem `frontend/src/lib/api.ts`), thay vì mỗi endpoint xử lý một kiểu.
 */

import { NextFunction, Request, Response } from "express";
import * as todoService from "../services/todo.service";
import { createTodoSchema, todoIdParamSchema, updateTodoContentSchema } from "../schemas/todo.schema";

/**
 * GET /api/todos — lấy toàn bộ danh sách.
 *
 * Hàm đơn giản nhất: không có tham số nào để validate. Tham số `req` vẫn phải
 * khai báo dù không dùng, vì Express truyền đối số theo VỊ TRÍ — bỏ `req` đi thì
 * `res` sẽ nhảy lên vị trí đầu và nhận nhầm giá trị.
 *
 * `await` ở đây nghĩa là: tạm dừng hàm này, nhường CPU cho việc khác, tới khi
 * database trả kết quả thì chạy tiếp. Nhờ vậy một tiến trình Node duy nhất phục
 * vụ được hàng nghìn request cùng lúc — nó không ngồi chờ không.
 *
 * `res.json(...)` mặc định gửi kèm mã status 200 (OK).
 */
export async function getAllTodos(req: Request, res: Response, next: NextFunction) {
  try {
    const todos = await todoService.getAllTodos();
    res.json({ success: true, data: todos });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/todos/:id — lấy một todo theo id.
 *
 * Dòng `todoIdParamSchema.parse(req.params)` làm hai việc cùng lúc:
 *   1. KIỂM TRA: id có phải số nguyên dương không? Không thì `parse` NÉM lỗi
 *      ngay lập tức, các dòng dưới không chạy, `catch` bắt được và đẩy sang
 *      `errorHandler` → khách nhận 400 kèm mô tả rõ ràng.
 *   2. CHUYỂN ĐỔI: trả về object mới với `id` đã là SỐ (nhờ `z.coerce`).
 *      Bước này bắt buộc, vì cột `id` trong Postgres là số nguyên; đưa chuỗi
 *      "7" xuống Prisma sẽ lỗi kiểu.
 *
 * Nói cách khác: sau dòng này, dữ liệu vừa sạch vừa đúng kiểu. Mọi tầng bên
 * dưới được phép tin tưởng tuyệt đối. Đây gọi là "validate ở biên".
 */
export async function getTodoById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.getTodoById(id);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/todos — tạo todo mới.
 *
 * Lần này dữ liệu nằm ở `req.body` chứ không phải URL. Nhớ rằng `req.body` chỉ
 * có giá trị nhờ middleware `express.json()` đã chạy trước đó trong `app.ts`.
 *
 * Chú ý `res.status(201)` thay vì 200 mặc định. 201 nghĩa là "Created — đã tạo
 * xong tài nguyên mới". Với con người thì 200 hay 201 đều là "thành công", nhưng
 * mã đúng giúp client và công cụ giám sát hiểu chính xác chuyện gì đã xảy ra.
 *
 * Vài mã status hay gặp:
 *   200 OK          — thành công (đọc / sửa)
 *   201 Created     — đã tạo mới
 *   400 Bad Request — khách gửi dữ liệu sai (lỗi validate của zod)
 *   404 Not Found   — không có tài nguyên đó
 *   500 Server Error— lỗi của chính server (lỗi của bạn, không phải của khách)
 */
export async function createTodo(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = createTodoSchema.parse(req.body);
    const todo = await todoService.createTodo(content);
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/todos/:id — xoá todo.
 *
 * Bản ghi đã bị xoá nên không còn `data` để gửi về, ta trả `message` thay thế.
 * (Một lựa chọn khác cũng phổ biến là trả về mã 204 No Content — không có body
 * nào cả. Dự án này chọn cách giữ nguyên hình dạng phong bì cho nhất quán.)
 *
 * Việc "không tìm thấy id để xoá" được phát hiện ở tầng service, nơi bắt mã lỗi
 * P2025 của Prisma và ném ra `AppError(404, ...)`.
 */
export async function deleteTodo(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    await todoService.deleteTodo(id);
    res.json({ success: true, message: "Đã xóa todo" });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/todos/:id — sửa nội dung todo.
 *
 * Hàm duy nhất phải validate HAI nguồn: id từ URL và content từ body. Cứ gọi
 * `parse` lần lượt; hễ cái nào hỏng là lỗi được ném ra ngay tại đó.
 */
export async function updateTodoContent(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const { content } = updateTodoContentSchema.parse(req.body);
    const todo = await todoService.updateTodoContent(id, content);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/todos/:id/done — đánh dấu đã hoàn thành.
 *
 * Không cần đọc body: chính ĐƯỜNG DẪN đã nói lên ý định, nên controller chỉ việc
 * truyền hằng `true` xuống service.
 */
export async function markTodoDone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.setTodoDone(id, true);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/todos/:id/undone — bỏ đánh dấu hoàn thành.
 *
 * Giống hệt hàm trên, chỉ khác đúng chữ `false`. Hai controller riêng nhưng dùng
 * chung một hàm service — logic không hề bị lặp lại.
 */
export async function markTodoUndone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.setTodoDone(id, false);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}
