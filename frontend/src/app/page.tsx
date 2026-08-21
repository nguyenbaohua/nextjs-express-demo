import AddTodoForm from "@/components/AddTodoForm";
import TodoItem from "@/components/TodoItem";
import { getTodos } from "@/lib/api";
import type { Todo } from "@/lib/types";
import styles from "./page.module.css";

export default async function TodoListPage() {
  let todos: Todo[] = [];
  let loadError: string | null = null;

  // Backend là service riêng nên có thể chưa chạy: hiện thông báo thay vì để trang lỗi trắng.
  try {
    todos = await getTodos();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Không tải được danh sách task";
  }

  const pendingTodos = todos.filter((todo) => !todo.isDone);
  const doneTodos = todos.filter((todo) => todo.isDone);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Todo List</h1>
        <p className={styles.subtitle}>
          {loadError
            ? "Không tải được dữ liệu"
            : `${pendingTodos.length} task chưa xong · ${doneTodos.length} task đã xong`}
        </p>
      </header>

      <AddTodoForm />

      {loadError ? (
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>Không tải được danh sách task</p>
          <p className={styles.errorMessage}>{loadError}</p>
        </div>
      ) : null}

      {!loadError && todos.length === 0 ? (
        <p className={styles.empty}>Chưa có task nào. Thêm task đầu tiên ở ô phía trên.</p>
      ) : null}

      {pendingTodos.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Chưa xong ({pendingTodos.length})</h2>
          <ul className={styles.list}>
            {pendingTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </section>
      ) : null}

      {doneTodos.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Đã xong ({doneTodos.length})</h2>
          <ul className={styles.list}>
            {doneTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
