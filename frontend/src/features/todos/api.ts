/*
 * ============================================================================
 * GỌI API TODO — ánh xạ 1-1 với route của backend Express
 * ============================================================================
 *
 * Xem `backend/src/routes/todo.routes.ts` để đối chiếu. Mỗi hàm ở đây tương ứng
 * đúng một dòng bên đó.
 *
 * Toàn bộ dùng `request` (có kèm token), vì mọi route `/api/todos` bên backend
 * đều nằm sau `router.use(requireAuth)`.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO CÁC HÀM NÀY KHÔNG CÓ `async`?
 * ----------------------------------------------------------------------------
 * Vì không cần. `request()` đã trả về một Promise rồi, ta chỉ việc trả thẳng
 * Promise đó ra. Thêm `async`/`await` vào sẽ tạo thêm một lớp Promise bọc ngoài
 * — chạy vẫn đúng, nhưng thừa một bước và nói sai ý đồ với người đọc.
 *
 * Quy tắc: chỉ dùng `async` khi bạn thật sự cần `await` một thứ gì đó BÊN TRONG
 * hàm. Nếu chỉ chuyển tiếp một Promise, hãy `return` nó.
 */

import { request } from "@/shared/api/http";
import type { Todo } from "./types";

/** GET /api/todos — lấy toàn bộ todo của người đang đăng nhập, mới nhất trước. */
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
 * DELETE /api/todos/:id — xoá todo.
 *
 * Kiểu trả về là `unknown` vì backend chỉ trả `{ success, message }`, không có
 * `data` nào đáng dùng. `unknown` buộc người gọi phải kiểm tra trước khi dùng —
 * an toàn hơn `any`, thứ mà TypeScript sẽ cho qua mọi thao tác mà không hỏi gì.
 */
export function deleteTodo(id: number) {
  return request<unknown>(`/todos/${id}`, { method: "DELETE" });
}
