/*
 * ============================================================================
 * TẦNG GỌI API — nơi duy nhất nói chuyện với backend Express
 * ============================================================================
 *
 * ĐIỀU QUAN TRỌNG NHẤT CẦN HIỂU VỀ FILE NÀY:
 *
 * File này chỉ chạy TRÊN SERVER, không bao giờ chạy trong trình duyệt.
 *
 * Vì sao? Vì nó chỉ được import bởi Server Component (page.tsx) và Server Action
 * (actions.ts) — cả hai đều là code phía server. Next.js phân tích cây import và
 * chỉ gửi xuống trình duyệt những file thực sự cần cho phía client.
 *
 * Hệ quả rất có lợi:
 *   1. `process.env.API_BASE_URL` đọc được ở đây. Nếu file này chạy ở trình
 *      duyệt thì không đọc được, vì Next.js chỉ lộ ra trình duyệt các biến có
 *      tiền tố `NEXT_PUBLIC_`. Ta cố tình KHÔNG dùng tiền tố đó để URL backend
 *      không lộ ra ngoài.
 *   2. Trình duyệt không bao giờ gọi thẳng Express. Luồng là:
 *         trình duyệt → server Next.js → Express → PostgreSQL
 *      Sau này muốn thêm token xác thực thì thêm ở đây, người dùng không thấy.
 */

import { DEFAULT_API_BASE_URL } from "./constants";
import type { ApiResponse, Todo } from "./types";

/*
 * Đọc cấu hình MỘT LẦN khi module được nạp, thay vì đọc lại mỗi request.
 *
 * `??` là toán tử "nullish coalescing": lấy vế trái, trừ khi vế trái là
 * `null`/`undefined` thì lấy vế phải. Ở đây nghĩa là: dùng biến môi trường,
 * chưa đặt thì dùng giá trị mặc định.
 *
 * Biến này đến từ file `.env.local` — Next.js tự động đọc file đó, bạn không cần
 * cài thêm thư viện như `dotenv`.
 */
const BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

/**
 * Lớp lỗi riêng, mang theo mã HTTP status.
 *
 * Vì sao cần? Vì `Error` thường chỉ có `message`, mà nơi gọi cần phân biệt được
 * "404 — không tìm thấy todo" với "500 — server sập". Trang chi tiết dựa vào
 * `err.status === 404` để hiện trang "không tìm thấy" thay vì màn hình lỗi
 * (xem app/todos/[id]/page.tsx).
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Hàm dùng chung cho mọi lời gọi API: gọi backend rồi bóc phần `data` ra khỏi
 * "phong bì" `{ success, data }`.
 *
 * Nhờ hàm này mà các hàm bên dưới (getTodos, createTodo...) chỉ còn một dòng.
 *
 * ---------------------------------------------------------------------------
 * VỀ `cache: "no-store"` — đây là khái niệm Next.js quan trọng nhất ở file này
 * ---------------------------------------------------------------------------
 *
 * Next.js thay thế hàm `fetch` gốc bằng phiên bản riêng có thêm khả năng cache.
 * Bạn vẫn viết `fetch(...)` như bình thường, nhưng nó có thêm tuỳ chọn.
 *
 * `cache: "no-store"` nghĩa là: TUYỆT ĐỐI không lưu lại kết quả, mỗi lần gọi là
 * một lần hỏi backend thật.
 *
 * Vì sao cần với app todo? Vì dữ liệu thay đổi liên tục. Nếu Next.js cache lại,
 * bạn thêm một task mới nhưng trang vẫn hiện danh sách cũ — trông như app bị lỗi.
 *
 * Tác dụng phụ: khi một trang có `fetch` kiểu `no-store`, Next.js đánh dấu trang
 * đó là "dynamic" — render lại ở mỗi request thay vì dựng sẵn HTML lúc build.
 * Chạy `npm run build` bạn sẽ thấy dấu `ƒ` (Dynamic) bên cạnh `/` và `/todos/[id]`.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  /*
   * try/catch thứ nhất: bắt lỗi TẦNG MẠNG.
   *
   * `fetch` chỉ ném lỗi khi không kết nối được (backend chưa chạy, sai cổng, đứt
   * mạng). Còn nếu backend trả về 404 hay 500 thì `fetch` coi là THÀNH CÔNG —
   * nó kết nối được mà. Đây là điểm gây bất ngờ cho người mới. Vì vậy phải kiểm
   * tra `res.ok` riêng ở dưới.
   */
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      // `...init?.headers` đặt sau để lời gọi cụ thể có thể ghi đè header mặc định.
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(503, "Không kết nối được tới server. Kiểm tra backend đã chạy chưa.");
  }

  let body: ApiResponse<T> | null = null;

  /*
   * try/catch thứ hai: bắt lỗi PARSE JSON.
   *
   * Nếu backend sập giữa chừng và trả về một trang HTML lỗi thay vì JSON,
   * `res.json()` sẽ ném lỗi. Ta nuốt lỗi đó và để `body = null`, rồi xử lý
   * thống nhất ở dưới — như vậy nơi gọi luôn nhận được `ApiError` gọn gàng
   * thay vì một lỗi cú pháp JSON khó hiểu.
   */
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  /*
   * Kiểm tra hai lớp:
   *   - `!res.ok`        → mã HTTP không thuộc 2xx
   *   - `!body?.success` → backend tự báo thất bại trong phong bì
   *
   * Backend đã viết message tiếng Việt sẵn (lỗi validate của zod, lỗi 404 của
   * Prisma), nên ta dùng lại luôn thay vì tự chế thông báo mới.
   */
  if (!res.ok || !body?.success) {
    const message = body && !body.success ? body.message : "Đã có lỗi xảy ra";
    throw new ApiError(res.status, message);
  }

  // Tới đây TypeScript đã biết chắc `body.success === true`, nên `body.data` hợp lệ.
  return body.data;
}

/*
 * ---------------------------------------------------------------------------
 * Các hàm dưới đây ánh xạ 1-1 với route của backend Express
 * (xem backend/src/routes/todo.routes.ts).
 *
 * Chúng không có `async`/`await` vì không cần: `request()` đã trả về Promise,
 * chỉ việc trả thẳng Promise đó ra. Thêm `async` cũng chạy đúng nhưng thừa.
 * ---------------------------------------------------------------------------
 */

/** GET /api/todos — lấy toàn bộ todo, backend sắp xếp mới nhất trước. */
export function getTodos() {
  return request<Todo[]>("/todos");
}

/** GET /api/todos/:id — lấy một todo. Ném ApiError với status 404 nếu không có. */
export function getTodoById(id: number) {
  return request<Todo>(`/todos/${id}`);
}

/** POST /api/todos — tạo todo mới. */
export function createTodo(content: string) {
  return request<Todo>("/todos", { method: "POST", body: JSON.stringify({ content }) });
}

/** PUT /api/todos/:id — sửa nội dung todo. */
export function updateTodoContent(id: number, content: string) {
  return request<Todo>(`/todos/${id}`, { method: "PUT", body: JSON.stringify({ content }) });
}

/**
 * PATCH /api/todos/:id/done hoặc /undone — đổi trạng thái hoàn thành.
 *
 * Backend tách thành hai route riêng thay vì nhận `{ isDone: true }` trong body,
 * nên ở đây ta ghép đường dẫn tuỳ theo tham số `isDone`.
 */
export function setTodoDone(id: number, isDone: boolean) {
  return request<Todo>(`/todos/${id}/${isDone ? "done" : "undone"}`, { method: "PATCH" });
}

/**
 * DELETE /api/todos/:id — xóa todo.
 *
 * Kiểu trả về là `unknown` vì backend chỉ trả `{ success, message }`, không có
 * `data` nào đáng dùng. `unknown` buộc người gọi phải kiểm tra trước khi dùng —
 * an toàn hơn `any`, thứ mà TypeScript sẽ cho qua mọi thao tác.
 */
export function deleteTodo(id: number) {
  return request<unknown>(`/todos/${id}`, { method: "DELETE" });
}
