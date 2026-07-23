import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";

const PRISMA_NOT_FOUND = "P2025";

function notFoundError(id: number) {
  return new AppError(404, `Không tìm thấy todo với id ${id}`);
}

export async function getAllTodos() {
  return prisma.todo.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createTodo(content: string) {
  return prisma.todo.create({ data: { content } });
}

export async function deleteTodo(id: number) {
  try {
    return await prisma.todo.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}

export async function updateTodoContent(id: number, content: string) {
  try {
    return await prisma.todo.update({ where: { id }, data: { content } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}

export async function setTodoDone(id: number, isDone: boolean) {
  try {
    return await prisma.todo.update({ where: { id }, data: { isDone } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === PRISMA_NOT_FOUND) {
      throw notFoundError(id);
    }
    throw err;
  }
}
