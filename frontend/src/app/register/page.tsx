/*
 * ============================================================================
 * TRANG /register
 * ============================================================================
 *
 * Trang đơn giản nhất dự án: không đọc tham số URL nào, không lấy dữ liệu gì,
 * chỉ dựng khung rồi giao hết cho `<RegisterForm />`.
 *
 * Để ý là nó KHÔNG có `async`, khác với `app/login/page.tsx`. Lý do rất đơn
 * giản: nó chẳng có gì để `await` cả. Thêm `async` vào vẫn chạy đúng nhưng thừa,
 * và nó nói sai với người đọc rằng ở đây có việc gì đó phải chờ.
 */

import RegisterForm from "@/features/auth/components/RegisterForm";
import styles from "@/features/auth/components/AuthForm.module.css";

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <RegisterForm />
    </main>
  );
}
