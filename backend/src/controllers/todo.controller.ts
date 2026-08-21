import { NextFunction, Request, Response } from "express";
import * as todoService from "../services/todo.service";
import { createTodoSchema, todoIdParamSchema, updateTodoContentSchema } from "../schemas/todo.schema";

export async function getAllTodos(req: Request, res: Response, next: NextFunction) {
  try {
    const todos = await todoService.getAllTodos();
    res.json({ success: true, data: todos });
  } catch (err) {
    next(err);
  }
}

export async function getTodoById(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.getTodoById(id);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

export async function createTodo(req: Request, res: Response, next: NextFunction) {
  try {
    const { content } = createTodoSchema.parse(req.body);
    const todo = await todoService.createTodo(content);
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

export async function deleteTodo(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    await todoService.deleteTodo(id);
    res.json({ success: true, message: "Đã xóa todo" });
  } catch (err) {
    next(err);
  }
}

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

export async function markTodoDone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.setTodoDone(id, true);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}

export async function markTodoUndone(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = todoIdParamSchema.parse(req.params);
    const todo = await todoService.setTodoDone(id, false);
    res.json({ success: true, data: todo });
  } catch (err) {
    next(err);
  }
}
