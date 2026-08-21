import { Router } from "express";
import * as todoController from "../controllers/todo.controller";

const router = Router();

router.get("/", todoController.getAllTodos);
router.get("/:id", todoController.getTodoById);
router.post("/", todoController.createTodo);
router.delete("/:id", todoController.deleteTodo);
router.put("/:id", todoController.updateTodoContent);
router.patch("/:id/done", todoController.markTodoDone);
router.patch("/:id/undone", todoController.markTodoUndone);

export default router;
