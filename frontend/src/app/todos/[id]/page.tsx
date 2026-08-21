import Link from "next/link";
import { notFound } from "next/navigation";
import EditTodoForm from "@/components/EditTodoForm";
import TodoDetailActions from "@/components/TodoDetailActions";
import { ApiError, getTodoById } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import styles from "./page.module.css";

export default async function TodoDetailPage(props: PageProps<"/todos/[id]">) {
  const { id } = await props.params;
  const todoId = Number(id);

  if (!Number.isInteger(todoId) || todoId <= 0) {
    notFound();
  }

  let todo;

  try {
    todo = await getTodoById(todoId);
  } catch (err) {
    // Backend trả 404 khi id không tồn tại: dùng trang not-found thay vì màn hình lỗi.
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className={styles.page}>
      <Link href={ROUTES.home} className={styles.backLink}>
        ← Danh sách task
      </Link>

      <article className={styles.card}>
        <header className={styles.header}>
          <span className={`${styles.badge} ${todo.isDone ? styles.badgeDone : styles.badgePending}`}>
            {todo.isDone ? "Đã xong" : "Chưa xong"}
          </span>
          <h1 className={styles.title}>{todo.content}</h1>
        </header>

        <TodoDetailActions todo={todo} />

        <div className={styles.divider} />

        <EditTodoForm key={todo.id} todo={todo} />

        <dl className={styles.meta}>
          <dt className={styles.metaLabel}>Mã task</dt>
          <dd>#{todo.id}</dd>
          <dt className={styles.metaLabel}>Ngày tạo</dt>
          <dd>{formatDateTime(todo.createdAt)}</dd>
          <dt className={styles.metaLabel}>Cập nhật lần cuối</dt>
          <dd>{formatDateTime(todo.updatedAt)}</dd>
        </dl>
      </article>
    </main>
  );
}
