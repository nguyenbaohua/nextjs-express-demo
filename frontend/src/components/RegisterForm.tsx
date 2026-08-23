"use client";

/*
 * ============================================================================
 * FORM ĐĂNG KÝ
 * ============================================================================
 *
 * Cấu trúc giống hệt `LoginForm`, khác ở ba điểm:
 *   1. Có thêm ô "Nhập lại mật khẩu"
 *   2. `autoComplete="new-password"` thay vì "current-password"
 *   3. Thành công thì chuyển sang trang nhập mã xác thực, không phải trang chủ
 */

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/lib/auth-actions";
import { ROUTES } from "@/lib/constants";
import buttonStyles from "./button.module.css";
import styles from "./AuthForm.module.css";

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Tạo tài khoản</h1>
      <p className={styles.subtitle}>
        Dùng email thật — AWS Cognito sẽ gửi mã xác thực 6 số tới đó.
      </p>

      <form action={formAction} className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            className={styles.input}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={isPending}
            placeholder="ban@example.com"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Mật khẩu
          </label>
          <input
            className={styles.input}
            id="password"
            name="password"
            type="password"
            /*
             * `"new-password"` (khác với `"current-password"` ở trang đăng nhập)
             * báo cho trình quản lý mật khẩu biết đây là ô TẠO mật khẩu mới, để
             * nó gợi ý sinh một mật khẩu ngẫu nhiên mạnh thay vì cố điền mật khẩu
             * cũ vào.
             */
            autoComplete="new-password"
            required
            minLength={8}
            disabled={isPending}
            placeholder="••••••••"
          />
          <p className={styles.hint}>
            Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirmPassword">
            Nhập lại mật khẩu
          </label>
          <input
            className={styles.input}
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            disabled={isPending}
            placeholder="••••••••"
          />
        </div>

        {state?.error ? (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${buttonStyles.button} ${buttonStyles.primary}`}
          disabled={isPending}
        >
          {isPending ? "Đang tạo tài khoản..." : "Đăng ký"}
        </button>
      </form>

      <p className={styles.footer}>
        Đã có tài khoản?{" "}
        <Link className={styles.link} href={ROUTES.login}>
          Đăng nhập
        </Link>
      </p>
    </div>
  );
}
