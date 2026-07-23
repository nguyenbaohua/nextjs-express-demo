import { z } from "zod";

export const createTodoSchema = z.object({
  content: z.string().trim().min(1, "content không được để trống"),
});

export const updateTodoContentSchema = z.object({
  content: z.string().trim().min(1, "content không được để trống"),
});

export const todoIdParamSchema = z.object({
  id: z.coerce.number().int().positive("id không hợp lệ"),
});
