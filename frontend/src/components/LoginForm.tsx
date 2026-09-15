"use client";

/*
 * ============================================================================
 * FORM ĐĂNG NHẬP
 * ============================================================================
 *
 * `"use client"` đánh dấu đây là Client Component — nó chạy trong trình duyệt.
 * Cần vậy vì form này có trạng thái tương tác: hiện chữ "Đang đăng nhập...",
 * hiện lỗi, khoá nút khi đang gửi. Server Component không làm được những việc đó.
 *
 * Nhưng để ý điều này: dù component chạy ở trình duyệt, MẬT KHẨU KHÔNG HỀ ĐI QUA
 * JavaScript của ta. Nó nằm trong `<input>`, rồi trình duyệt gói cả form gửi
 * thẳng tới Server Action. Ta không đọc, không lưu, không chạm vào nó.
 *
 * Đó là điểm khác biệt lớn so với cách viết cũ (`useState` cho từng ô + `fetch`
 * thủ công): ít code hơn, và mật khẩu đi qua ít nơi hơn.
 */

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/lib/auth-actions";
import { ROUTES } from "@/lib/constants";
import buttonStyles from "./button.module.css";
import GoogleLoginButton from "./GoogleLoginButton";
import styles from "./AuthForm.module.css";

export default function LoginForm({
  defaultEmail,
  justConfirmed,
  nextPath,
  googleError,
}: {
  /** Email điền sẵn — có khi người dùng vừa xác thực xong và được chuyển sang đây. */
  defaultEmail?: string;
  /** `true` khi vừa xác thực email thành công, để hiện lời chúc mừng. */
  justConfirmed?: boolean;
  /** Trang người dùng định vào trước khi bị đá về đây. Đăng nhập xong sẽ quay lại đó. */
  nextPath?: string;
  /**
   * Câu báo lỗi của luồng đăng nhập Google, nếu vừa có một lượt thất bại.
   *
   * Vì sao lỗi này đến từ PROP mà không nằm trong `state` của `useActionState`?
   *
   *   Vì `useActionState` chỉ giữ kết quả của action gắn với form NÀY, trong
   *   CHÍNH lần render này. Còn lỗi Google phát sinh ở một request hoàn toàn
   *   khác (Route Handler `/api/auth/callback/google`), sau khi người dùng đã đi
   *   một vòng qua Google rồi quay về. Tới lúc trang này render lại thì component
   *   đã bị huỷ và dựng mới từ đầu — mọi state của React đã bay sạch.
   *
   *   Thứ duy nhất sống sót qua một lần chuyển trang là URL và cookie. Nên lỗi
   *   được truyền qua `?error=` trên URL, trang cha đọc ra rồi đưa xuống đây.
   */
  googleError?: string;
}) {
  /*
   * `useActionState` nối form với Server Action và trả về ba thứ:
   *
   *   state      — giá trị action trả về (ở đây là `{ error }` hoặc null)
   *   formAction — hàm để gắn vào thuộc tính `action` của <form>
   *   isPending  — `true` trong lúc đang chờ server trả lời
   *
   * `isPending` là thứ tiện nhất: không có nó bạn sẽ phải tự quản một biến
   * `loading` bằng `useState` và nhớ tắt nó ở cả nhánh thành công lẫn nhánh lỗi —
   * mà quên nhánh lỗi là bug kinh điển khiến nút kẹt ở trạng thái "Đang tải...".
   *
   * Tham số thứ hai `null` là giá trị khởi tạo của `state`.
   */
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Đăng nhập</h1>
      <p className={styles.subtitle}>Đăng nhập để xem danh sách công việc của bạn.</p>

      {justConfirmed ? (
        <p className={styles.success} style={{ marginBottom: 16 }}>
          Xác thực email thành công. Bạn có thể đăng nhập ngay.
        </p>
      ) : null}

      {/*
        Lỗi của luồng Google hiện Ở TRÊN form, tách khỏi ô báo lỗi của form bên
        dưới. Chủ ý: hai lỗi này thuộc về hai hành động khác nhau, đặt chung một
        chỗ sẽ khiến người dùng tưởng mình vừa nhập sai email hoặc mật khẩu.
      */}
      {googleError ? (
        <p className={styles.error} style={{ marginBottom: 16 }} role="alert">
          {googleError}
        </p>
      ) : null}

      <form action={formAction} className={styles.form}>
        {/*
          Ô ẩn mang theo đường dẫn người dùng định vào lúc bị chặn.

          `type="hidden"` nghĩa là người dùng không thấy và không sửa được trên
          giao diện — nhưng ai mở DevTools vẫn sửa được thoải mái. Vì thế
          `loginAction` KHÔNG tin giá trị này mà kiểm tra lại trước khi chuyển
          hướng; xem phần chống "open redirect" trong `auth-actions.ts`.

          Đây là minh hoạ rất gọn cho một nguyên tắc: "ẩn" không phải là "an toàn".
        */}
        <input type="hidden" name="next" value={nextPath ?? ""} />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <input
            className={styles.input}
            id="email"
            /*
             * `name` là thứ QUAN TRỌNG NHẤT ở đây, không phải `id`.
             *
             * Server Action nhận dữ liệu qua `formData.get("email")` — chuỗi
             * "email" đó khớp với `name`, không phải `id`. Đổi `name` mà quên sửa
             * bên action thì ô nhập trở thành rỗng, âm thầm, không báo lỗi gì.
             * (`id` chỉ để `<label htmlFor>` trỏ tới, phục vụ khả năng tiếp cận.)
             */
            name="email"
            type="email"
            /*
             * `autoComplete="email"` và `"current-password"` bên dưới báo cho
             * trình duyệt và trình quản lý mật khẩu biết ô này chứa gì, để chúng
             * điền tự động đúng chỗ. Người dùng dùng 1Password hay Chrome
             * password manager sẽ thấy khác biệt ngay.
             */
            autoComplete="email"
            required
            defaultValue={defaultEmail}
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
            /*
             * `type="password"` che ký tự khi gõ. Đây là điều tối thiểu, và cũng
             * là toàn bộ những gì frontend cần làm với mật khẩu — không đọc giá
             * trị, không lưu vào state, không log ra console.
             */
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            placeholder="••••••••"
          />
        </div>

        {/*
          `role="alert"` báo cho trình đọc màn hình đọc to thông báo này ngay khi
          nó xuất hiện. Người khiếm thị sẽ biết đăng nhập thất bại thay vì ngồi
          chờ một trang không bao giờ chuyển.
        */}
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
          {isPending ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>

      {/*
        Nút Google nằm NGOÀI thẻ <form> phía trên, và bắt buộc phải vậy: HTML
        không cho phép lồng form trong form. Bản thân `GoogleLoginButton` đã có
        <form> riêng trỏ tới một Server Action khác.
      */}
      <GoogleLoginButton nextPath={nextPath} />

      <p className={styles.footer}>
        Chưa có tài khoản?{" "}
        <Link className={styles.link} href={ROUTES.register}>
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
