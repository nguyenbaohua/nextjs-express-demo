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
 * ----------------------------------------------------------------------------
 * NHƯNG MẬT KHẨU KHÔNG HỀ ĐI QUA JAVASCRIPT CỦA TA
 * ----------------------------------------------------------------------------
 * Đây là điểm đáng chú ý nhất của file, và nó không hiển nhiên chút nào.
 *
 * Dù component này chạy trong trình duyệt, ta KHÔNG đọc giá trị của ô mật khẩu ở
 * bất cứ đâu. Không có `useState` giữ nó, không có `onChange` nghe nó. Mật khẩu
 * nằm trong `<input>` do trình duyệt quản lý, rồi trình duyệt gói cả form gửi
 * thẳng tới Server Action.
 *
 * Vì sao điều đó đáng giá? Vì mọi biến JavaScript trên trang đều nằm trong tầm
 * với của một đoạn script lạ (thư viện npm bị cài mã độc, quảng cáo nhúng, lỗ
 * hổng XSS). Giá trị không bao giờ được đọc vào biến thì không có gì để đọc trộm.
 *
 * So sánh với cách viết cũ (`useState` cho từng ô + `fetch` thủ công): ít code
 * hơn, và mật khẩu đi qua ít nơi hơn. Hiếm khi có đánh đổi nào dễ chọn đến vậy.
 */

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { ROUTES } from "@/shared/config/constants";
import buttonStyles from "@/shared/components/button.module.css";
import styles from "./AuthForm.module.css";

export default function LoginForm({
  defaultEmail,
  justRegistered,
  nextPath,
}: {
  /** Email điền sẵn — thường vì người dùng vừa đăng ký xong và được chuyển sang đây. */
  defaultEmail?: string;
  /** `true` khi vừa đăng ký thành công, để hiện lời chúc mừng. */
  justRegistered?: boolean;
  /** Trang người dùng định vào trước khi bị đá về đây. Đăng nhập xong sẽ quay lại đó. */
  nextPath?: string;
}) {
  /*
   * `useActionState` nối form với Server Action và trả về ba thứ:
   *
   *   state      — giá trị action trả về (ở đây là `{ error }` hoặc `null`)
   *   formAction — hàm để gắn vào thuộc tính `action` của <form>
   *   isPending  — `true` trong lúc đang chờ server trả lời
   *
   * `isPending` là thứ tiện nhất: không có nó bạn sẽ phải tự quản một biến
   * `loading` bằng `useState` và nhớ tắt nó ở CẢ nhánh thành công LẪN nhánh lỗi —
   * mà quên nhánh lỗi là bug kinh điển khiến nút kẹt vĩnh viễn ở trạng thái
   * "Đang tải...". React lo giúp bạn chuyện đó.
   *
   * Tham số thứ hai `null` là giá trị khởi tạo của `state`.
   */
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Đăng nhập</h1>
      <p className={styles.subtitle}>Đăng nhập để xem danh sách công việc của bạn.</p>

      {justRegistered ? (
        <p className={styles.success} style={{ marginBottom: 16 }}>
          Tạo tài khoản thành công. Đăng nhập để bắt đầu.
        </p>
      ) : null}

      <form action={formAction} className={styles.form}>
        {/*
          Ô ẩn mang theo đường dẫn người dùng định vào lúc bị chặn.

          `type="hidden"` nghĩa là người dùng không thấy và không sửa được trên
          giao diện — nhưng ai mở DevTools vẫn sửa được thoải mái. Vì thế
          `loginAction` KHÔNG tin giá trị này mà kiểm tra lại trước khi chuyển
          hướng; xem phần chống "open redirect" trong `../actions.ts`.

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
             * điền tự động đúng chỗ. Người dùng 1Password hay trình quản lý mật
             * khẩu của Chrome sẽ thấy khác biệt ngay.
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
             * gần như là toàn bộ những gì frontend cần làm với mật khẩu — không
             * đọc giá trị, không lưu vào state, không log ra console.
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

          Một dòng thuộc tính, và nó là khác biệt giữa "dùng được" và "không dùng
          được" cho một nhóm người thật.
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

      <p className={styles.footer}>
        Chưa có tài khoản?{" "}
        <Link className={styles.link} href={ROUTES.register}>
          Đăng ký
        </Link>
      </p>
    </div>
  );
}
