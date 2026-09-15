"use client";

/*
 * ============================================================================
 * FORM XÁC THỰC EMAIL
 * ============================================================================
 *
 * Người dùng nhập mã 6 số mà Cognito vừa gửi tới hộp thư.
 *
 * Điểm đáng chú ý về mặt kỹ thuật: trang này có HAI hành động khác nhau — "xác
 * thực" và "gửi lại mã". Nên nó dùng HAI `useActionState` riêng biệt.
 *
 * Vì sao không gộp chung một state? Vì hai hành động có kết quả khác loại nhau:
 * gửi lại mã thành công thì hiện dòng xanh "đã gửi", còn xác thực thành công thì
 * chuyển hẳn sang trang khác. Gộp chung sẽ dẫn tới cảnh dòng "Đã gửi lại mã" còn
 * treo trên màn hình trong khi người dùng đang đọc thông báo lỗi mã sai — hai
 * mẩu tin mâu thuẫn nhau xuất hiện cùng lúc.
 *
 * Tách riêng thì mỗi hành động tự quản trạng thái của nó, không giẫm chân nhau.
 */

import { useActionState } from "react";
import { confirmAction, resendCodeAction } from "@/lib/auth-actions";
import buttonStyles from "./button.module.css";
import styles from "./AuthForm.module.css";

export default function ConfirmForm({ defaultEmail }: { defaultEmail?: string }) {
  const [confirmState, confirmFormAction, isConfirming] = useActionState(confirmAction, null);
  const [resendState, resendFormAction, isResending] = useActionState(resendCodeAction, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Xác thực email</h1>
      <p className={styles.subtitle}>
        Nhập mã 6 số vừa được gửi tới email của bạn. Nếu không thấy, hãy kiểm tra cả thư mục Spam.
      </p>

      <form action={confirmFormAction} className={styles.form}>
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
            /*
             * `defaultValue` chứ KHÔNG phải `value`.
             *
             * Khác biệt này quan trọng trong React: dùng `value` thì ô nhập trở
             * thành "controlled" và giá trị bị khoá cứng — người dùng gõ mà chữ
             * không thay đổi, trừ khi ta viết thêm `onChange` để tự cập nhật.
             * Dùng `defaultValue` thì đây chỉ là giá trị KHỞI TẠO, sau đó trình
             * duyệt tự quản. Đúng thứ ta cần: điền sẵn cho tiện, nhưng vẫn sửa
             * được nếu người dùng gõ nhầm email lúc đăng ký.
             */
            defaultValue={defaultEmail}
            disabled={isConfirming}
            placeholder="ban@example.com"
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="code">
            Mã xác thực
          </label>
          <input
            className={`${styles.input} ${styles.codeInput}`}
            id="code"
            name="code"
            /*
             * `inputMode="numeric"` bật bàn phím SỐ trên điện thoại. Không đổi gì
             * trên máy tính, nhưng trên di động thì khác biệt rất rõ — người dùng
             * không phải chuyển bàn phím thủ công.
             *
             * Dùng `type="text"` + `inputMode` thay vì `type="number"` là cố ý:
             * ô number có mũi tên tăng/giảm vô nghĩa với mã xác thực, và nó còn
             * cắt mất số 0 ở đầu — mà mã "012345" thì hoàn toàn có thể xảy ra.
             */
            inputMode="numeric"
            /*
             * `pattern` để trình duyệt tự chặn trước khi gửi. Backend vẫn kiểm tra
             * lại bằng zod — kiểm tra ở trình duyệt chỉ để phản hồi nhanh, không
             * bao giờ được coi là lớp bảo vệ, vì ai cũng xoá được thuộc tính này
             * trong DevTools.
             */
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            required
            disabled={isConfirming}
            placeholder="000000"
          />
        </div>

        {confirmState?.error ? (
          <p className={styles.error} role="alert">
            {confirmState.error}
          </p>
        ) : null}

        <button
          type="submit"
          className={`${buttonStyles.button} ${buttonStyles.primary}`}
          disabled={isConfirming}
        >
          {isConfirming ? "Đang xác thực..." : "Xác thực"}
        </button>
      </form>

      {/*
        Form thứ hai, hoàn toàn tách biệt, chỉ để gửi lại mã.

        Phải là một <form> RIÊNG chứ không phải một nút nằm trong form trên. Nếu
        đặt chung, bấm "Gửi lại mã" sẽ kích hoạt luôn phần kiểm tra `required` của
        ô mã — người dùng chưa nhận được mã thì lấy gì mà điền, và họ sẽ bị chặn
        bởi chính cái nút đáng ra phải giúp họ thoát khỏi tình trạng đó.
      */}
      <form action={resendFormAction} style={{ marginTop: 16 }}>
        <input type="hidden" name="email" value={defaultEmail ?? ""} />
        <button type="submit" className={styles.linkButton} disabled={isResending}>
          {isResending ? "Đang gửi..." : "Không nhận được mã? Gửi lại"}
        </button>
      </form>

      {resendState?.error ? (
        <p className={styles.error} role="alert" style={{ marginTop: 12 }}>
          {resendState.error}
        </p>
      ) : null}

      {resendState?.success ? (
        <p className={styles.success} role="status" style={{ marginTop: 12 }}>
          {resendState.message}
        </p>
      ) : null}
    </div>
  );
}
