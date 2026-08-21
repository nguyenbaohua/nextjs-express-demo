import { DEFAULT_API_BASE_URL } from "./constants";
import type { ApiResponse, Todo } from "./types";

const BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Gọi backend Express và bóc phần `data` ra khỏi envelope `{ success, data }`.
 *
 * Luôn dùng `cache: "no-store"`: dữ liệu todo thay đổi liên tục nên mọi request
 * phải lấy bản mới nhất, không được phục vụ từ cache của Next.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;

  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(503, "Không kết nối được tới server. Kiểm tra backend đã chạy chưa.");
  }

  let body: ApiResponse<T> | null = null;

  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    body = null;
  }

  if (!res.ok || !body?.success) {
    const message = body && !body.success ? body.message : "Đã có lỗi xảy ra";
    throw new ApiError(res.status, message);
  }

  return body.data;
}

export function getTodos() {
  return request<Todo[]>("/todos");
}

export function getTodoById(id: number) {
  return request<Todo>(`/todos/${id}`);
}

export function createTodo(content: string) {
  return request<Todo>("/todos", { method: "POST", body: JSON.stringify({ content }) });
}

export function updateTodoContent(id: number, content: string) {
  return request<Todo>(`/todos/${id}`, { method: "PUT", body: JSON.stringify({ content }) });
}

export function setTodoDone(id: number, isDone: boolean) {
  return request<Todo>(`/todos/${id}/${isDone ? "done" : "undone"}`, { method: "PATCH" });
}

export function deleteTodo(id: number) {
  return request<unknown>(`/todos/${id}`, { method: "DELETE" });
}
