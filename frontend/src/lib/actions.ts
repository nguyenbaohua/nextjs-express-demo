"use server";

import { revalidatePath } from "next/cache";
import * as api from "./api";
import { ROUTES } from "./constants";
import type { FormState } from "./types";

/**
 * Gom lỗi về một chuỗi hiển thị được. Backend đã trả message tiếng Việt sẵn
 * (validate của zod, 404 của Prisma), nên chỉ cần lấy `message` ra.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof api.ApiError ? err.message : "Đã có lỗi xảy ra";
}

/** Làm mới cả trang danh sách lẫn trang chi tiết vì cả hai đều đọc cùng một todo. */
function revalidateTodo(id: number) {
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.todoDetail(id));
}

export async function createTodoAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Nội dung không được để trống" };
  }

  try {
    await api.createTodo(content);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  revalidatePath(ROUTES.home);
  return null;
}

export async function updateTodoContentAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get("id"));
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Nội dung không được để trống" };
  }

  try {
    await api.updateTodoContent(id, content);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  revalidateTodo(id);
  return null;
}

export async function toggleTodoDoneAction(id: number, isDone: boolean) {
  await api.setTodoDone(id, isDone);
  revalidateTodo(id);
}

export async function deleteTodoAction(id: number) {
  await api.deleteTodo(id);
  revalidatePath(ROUTES.home);
}
