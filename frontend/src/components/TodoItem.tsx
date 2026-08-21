"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteTodoAction, toggleTodoDoneAction } from "@/lib/actions";
import { ROUTES } from "@/lib/constants";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./TodoItem.module.css";

export default function TodoItem({ todo }: { todo: Todo }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        setError("Thao tác thất bại, vui lòng thử lại");
      }
    });
  }

  return (
    <li className={`${styles.item} ${todo.isDone ? styles.done : ""}`}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={todo.isDone}
        disabled={isPending}
        onChange={(event) => run(() => toggleTodoDoneAction(todo.id, event.target.checked))}
        aria-label={todo.isDone ? `Đánh dấu chưa xong: ${todo.content}` : `Đánh dấu đã xong: ${todo.content}`}
      />

      <div className={styles.body}>
        <Link href={ROUTES.todoDetail(todo.id)} className={styles.content}>
          {todo.content}
        </Link>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className={`${buttonStyles.button} ${buttonStyles.danger} ${buttonStyles.small}`}
        disabled={isPending}
        onClick={() => run(() => deleteTodoAction(todo.id))}
      >
        Xóa
      </button>
    </li>
  );
}
