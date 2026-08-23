/*
 * ============================================================================
 * THANH NGƯỜI DÙNG — hiện email + nút Đăng xuất
 * ============================================================================
 *
 * Chú ý: file này KHÔNG có `"use client"`. Nó là Server Component, dù có một nút
 * bấm được.
 *
 * Nghe có vẻ mâu thuẫn, nhưng đây là một trong những chỗ đẹp nhất của React
 * Server Components: nút "Đăng xuất" nằm trong một `<form>` bình thường, và
 * `action` của form trỏ thẳng tới một Server Action.
 *
 * Không cần `onClick`, không cần `useState`, không cần `fetch`. Nghĩa là:
 *
 *   - Không một dòng JavaScript nào của component này bị gửi xuống trình duyệt
 *   - Nút vẫn HOẠT ĐỘNG kể cả khi JavaScript bị tắt hoàn toàn, vì nó chỉ là một
 *     form HTML gửi POST như thời web mới ra đời
 *
 * Đây là "progressive enhancement" (nâng cấp tiệm tiến) — thứ mà React từng đánh
 * mất trong nhiều năm và nay lấy lại được nhờ Server Actions.
 */

import { logoutAction } from "@/lib/auth-actions";
import type { SessionUser } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./UserMenu.module.css";

export default function UserMenu({ user }: { user: SessionUser }) {
  return (
    <div className={styles.bar}>
      <div className={styles.info}>
        <span className={styles.label}>Đang đăng nhập</span>
        {/*
          `title` khiến trình duyệt hiện đầy đủ email khi rê chuột lên. Cần thiết
          vì email dài bị CSS cắt bớt thành "abc...".
        */}
        <span className={styles.email} title={user.email}>
          {user.email}
        </span>
      </div>

      {/*
        `action={logoutAction}` — gắn thẳng Server Action vào form.

        Được phép vì `logoutAction` không nhận tham số nào. Nếu action cần tham số
        thì phải dùng `logoutAction.bind(null, someValue)` hoặc truyền qua
        `<input type="hidden">`, như cách `LoginForm` làm với `next`.
      */}
      <form action={logoutAction}>
        <button type="submit" className={`${buttonStyles.button} ${buttonStyles.small}`}>
          Đăng xuất
        </button>
      </form>
    </div>
  );
}
