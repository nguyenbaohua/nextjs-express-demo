"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTodoAction, toggleTodoDoneAction } from "@/lib/actions";
import { ROUTES } from "@/lib/constants";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./TodoDetailActions.module.css";

export default function TodoDetailActions({ todo }: { todo: Todo }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        await toggleTodoDoneAction(todo.id, !todo.isDone);
      } catch {
        setError("Không cập nhật được trạng thái, vui lòng thử lại");
      }
    });
  }

  function handleDelete() {
    if (!window.confirm("Xóa task này?")) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteTodoAction(todo.id);
        // Task không còn tồn tại nên không thể ở lại trang chi tiết.
        router.push(ROUTES.home);
      } catch {
        setError("Không xóa được task, vui lòng thử lại");
      }
    });
  }

  return (
    <div className={styles.actions}>
      <button type="button" className={buttonStyles.button} disabled={isPending} onClick={handleToggle}>
        {todo.isDone ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
      </button>

      <button
        type="button"
        className={`${buttonStyles.button} ${buttonStyles.danger}`}
        disabled={isPending}
        onClick={handleDelete}
      >
        Xóa task
      </button>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
