"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateTodoContentAction } from "@/lib/actions";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./EditTodoForm.module.css";

export default function EditTodoForm({ todo }: { todo: Todo }) {
  const [state, formAction, isPending] = useActionState(updateTodoContentAction, null);
  const [content, setContent] = useState(todo.content);
  const [justSaved, setJustSaved] = useState(false);
  const hasSubmitted = useRef(false);

  const isDirty = content.trim() !== todo.content;

  // Hiện "Đã lưu" trong 2 giây sau mỗi lần submit thành công rồi tự ẩn đi.
  // Cần cờ hasSubmitted để không hiện nhầm ngay lần render đầu tiên.
  useEffect(() => {
    if (isPending) {
      hasSubmitted.current = true;
      return;
    }

    if (!hasSubmitted.current || state) return;

    hasSubmitted.current = false;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [isPending, state]);

  return (
    <form action={formAction} className={styles.form}>
      <input type="hidden" name="id" value={todo.id} />

      <label className={styles.label} htmlFor="content">
        Nội dung
      </label>
      <textarea
        id="content"
        name="content"
        className={styles.textarea}
        value={content}
        maxLength={255}
        onChange={(event) => setContent(event.target.value)}
      />

      <div className={styles.footer}>
        <button
          type="submit"
          className={`${buttonStyles.button} ${buttonStyles.primary}`}
          disabled={isPending || !isDirty || !content.trim()}
        >
          {isPending ? "Đang lưu..." : "Lưu thay đổi"}
        </button>

        {state ? (
          <span className={styles.error} role="alert">
            {state.error}
          </span>
        ) : null}
        {!state && justSaved && !isDirty ? <span className={styles.saved}>Đã lưu</span> : null}
      </div>
    </form>
  );
}
