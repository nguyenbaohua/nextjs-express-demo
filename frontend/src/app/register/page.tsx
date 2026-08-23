/*
 * ============================================================================
 * TRANG /register
 * ============================================================================
 *
 * Trang đơn giản nhất trong ba trang xác thực: không đọc tham số URL nào, chỉ
 * dựng khung rồi giao hết cho `<RegisterForm />`.
 */

import RegisterForm from "@/components/RegisterForm";
import styles from "@/components/AuthForm.module.css";

export default function RegisterPage() {
  return (
    <main className={styles.page}>
      <RegisterForm />
    </main>
  );
}
