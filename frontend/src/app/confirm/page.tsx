/*
 * ============================================================================
 * TRANG /confirm — nhập mã 6 số Cognito gửi về email
 * ============================================================================
 *
 * Người dùng tới đây bằng hai đường:
 *   1. Vừa đăng ký xong → `registerAction` chuyển sang, kèm `?email=...`
 *   2. Tự gõ URL, khi đăng nhập bị báo "tài khoản chưa được xác thực"
 *
 * Ở đường thứ hai thì không có `?email=`, nên ô email để trống và người dùng tự
 * điền — đó là lý do ô đó vẫn phải sửa được chứ không khoá cứng.
 */

import ConfirmForm from "@/components/ConfirmForm";
import styles from "@/components/AuthForm.module.css";

export default async function ConfirmPage(props: PageProps<"/confirm">) {
  const searchParams = await props.searchParams;
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;

  return (
    <main className={styles.page}>
      <ConfirmForm defaultEmail={email} />
    </main>
  );
}
