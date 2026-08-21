import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import styles from "./not-found.module.css";

export default function TodoNotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Không tìm thấy task</h1>
      <p className={styles.message}>Task này có thể đã bị xóa hoặc đường dẫn không đúng.</p>
      <Link href={ROUTES.home} className={styles.link}>
        ← Về danh sách task
      </Link>
    </main>
  );
}
