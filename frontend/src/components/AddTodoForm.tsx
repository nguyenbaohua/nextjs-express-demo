"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTodoAction } from "@/lib/actions";
import buttonStyles from "./button.module.css";
import styles from "./AddTodoForm.module.css";

export default function AddTodoForm() {
  const [state, formAction, isPending] = useActionState(createTodoAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Thêm xong (không có lỗi trả về) thì dọn ô nhập để gõ task tiếp theo ngay.
  useEffect(() => {
    if (!isPending && !state) {
      formRef.current?.reset();
    }
  }, [isPending, state]);

  return (
    <form ref={formRef} action={formAction} className={styles.form}>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          name="content"
          placeholder="Bạn cần làm gì?"
          autoComplete="off"
          maxLength={255}
          aria-label="Nội dung task mới"
        />
        <button type="submit" className={`${buttonStyles.button} ${buttonStyles.primary}`} disabled={isPending}>
          {isPending ? "Đang thêm..." : "Thêm task"}
        </button>
      </div>

      {state ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
