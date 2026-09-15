"use client";

/*
 * ============================================================================
 * FORM ĐĂNG KÝ
 * ============================================================================
 *
 * Cấu trúc giống hệt `LoginForm`, khác ở ba điểm:
 *   1. Có thêm ô "Nhập lại mật khẩu"
 *   2. `autoComplete="new-password"` thay vì `"current-password"`
 *   3. Thành công thì chuyển sang trang đăng nhập, không phải trang chủ
 *
 * ----------------------------------------------------------------------------
 * VỀ Ô "NHẬP LẠI MẬT KHẨU" — vì sao nó chỉ tồn tại ở frontend?
 * ----------------------------------------------------------------------------
 * Backend không hề biết ô này tồn tại. `POST /api/auth/register` chỉ nhận đúng
 * một trường `password`.
 *
 * Nghe như một chỗ "thiếu validate", nhưng không phải. Ô thứ hai giải quyết một
 * vấn đề thuần tuý về CON NGƯỜI: mật khẩu bị che khi gõ, nên người dùng không tự
 * kiểm tra được mình có gõ nhầm hay không — và gõ nhầm mật khẩu lúc đăng ký thì
 * họ tự khoá mình ra ngoài vĩnh viễn, không có cách nào biết mình đã gõ gì.
 *
 * Vì nó là vấn đề của giao diện, nó được giải quyết ở giao diện. Đây là một
 * trong số rất ít ngoại lệ của luật "mọi kiểm tra ở frontend đều phải lặp lại ở
 * backend" — vì chẳng có gì để lặp lại cả.
 */

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "../actions";
import { ROUTES } from "@/shared/config/constants";
import buttonStyles from "@/shared/components/button.module.css";
import styles from "./AuthForm.module.css";

export default function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Tạo tài khoản</h1>
      <p className={styles.subtitle}>Chỉ cần email và mật khẩu là xong.</p>

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
             * cũ vào. Một thuộc tính nhỏ, nhưng nó trực tiếp khiến người dùng của
             * bạn có mật khẩu mạnh hơn.
             */
            autoComplete="new-password"
            required
            /*
             * `minLength` cho trình duyệt chặn ngay tại chỗ, người dùng biết lỗi
             * trước cả khi bấm nút.
             *
             * ⚠️ Nhưng nó KHÔNG phải là lớp bảo vệ: xoá thuộc tính này trong
             * DevTools là qua mặt được, và `curl` thì chẳng bao giờ thấy nó.
             *
             * Luật thật nằm ở `backend/src/schemas/auth.schema.ts` — và con số 8
             * ở đây phải khớp với con số bên đó. Đây là kiểu trùng lặp chấp nhận
             * được: một bản để phục vụ trải nghiệm, một bản để thực thi luật.
             * Nhưng phải hiểu rõ bản nào là bản thật.
             */
            minLength={8}
            disabled={isPending}
            placeholder="••••••••"
          />
          <p className={styles.hint}>Tối thiểu 8 ký tự. Càng dài càng mạnh.</p>
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
