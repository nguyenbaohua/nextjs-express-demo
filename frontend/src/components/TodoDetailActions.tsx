/*
 * ============================================================================
 * NÚT ĐỔI TRẠNG THÁI + NÚT XÓA (ở trang chi tiết)
 * ============================================================================
 *
 * Component này giới thiệu thêm một khái niệm mới: ĐIỀU HƯỚNG BẰNG CODE.
 *
 * Với <Link>, người dùng bấm thì chuyển trang. Nhưng ở đây ta cần chuyển trang
 * SAU KHI một việc khác hoàn tất (xóa xong mới quay về danh sách). Trường hợp
 * đó cần hook `useRouter`.
 */

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTodoAction, toggleTodoDoneAction } from "@/lib/actions";
import { ROUTES } from "@/lib/constants";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./TodoDetailActions.module.css";

export default function TodoDetailActions({ todo }: { todo: Todo }) {
  /*
   * CHÚ Ý ĐƯỜNG DẪN IMPORT: "next/navigation", KHÔNG phải "next/router".
   *
   * `next/router` là của Pages Router — kiến trúc cũ của Next.js. Rất nhiều bài
   * hướng dẫn trên mạng vẫn dùng nó và sẽ không chạy trong dự án này.
   *
   * Dự án này dùng App Router (thư mục `app/`), nên mọi hook điều hướng đều đến
   * từ "next/navigation": useRouter, usePathname, useSearchParams, redirect...
   *
   * `useRouter` là hook, mà hook chỉ chạy được trong Client Component — thêm một
   * lý do file này cần "use client".
   */
  const router = useRouter();

  // Giống TodoItem.tsx: quản lý trạng thái chờ và lỗi cho Server Action.
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        /*
         * Truyền `!todo.isDone` — tức là ĐẢO trạng thái hiện tại.
         *
         * `todo.isDone` đến từ server, nên nó luôn là giá trị mới nhất, không
         * phải bản sao có thể đã cũ trong state của client.
         */
        await toggleTodoDoneAction(todo.id, !todo.isDone);
      } catch {
        setError("Không cập nhật được trạng thái, vui lòng thử lại");
      }
    });
  }

  function handleDelete() {
    /*
     * `window.confirm` là hộp thoại có sẵn của trình duyệt.
     *
     * Gọi được `window` ở đây vì đây là Client Component. Trong Server
     * Component thì `window` không tồn tại (Node.js không có nó) và code sẽ nổ
     * lỗi — đây là lỗi kinh điển của người mới học Next.js.
     *
     * Xóa là thao tác không hoàn tác được nên hỏi lại một câu là hợp lý.
     * (App thật thường thay bằng hộp thoại tự thiết kế cho đẹp, nhưng
     * `confirm` thì không tốn dòng code nào.)
     */
    if (!window.confirm("Xóa task này?")) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteTodoAction(todo.id);

        /*
         * Xóa xong PHẢI rời khỏi trang này.
         *
         * Vì task không còn trong database nữa; ở lại thì lần tải sau sẽ ra
         * trang "không tìm thấy". Chuyển về danh sách là hợp lý nhất.
         *
         * `router.push()` thêm một mục vào lịch sử trình duyệt, nên nút Back
         * vẫn quay lại được (và sẽ thấy trang "không tìm thấy" — chấp nhận được).
         * Nếu muốn thay thế hẳn mục hiện tại thì dùng `router.replace()`.
         *
         * Ghi chú kỹ thuật: Server Action có thể tự gọi `redirect()` của
         * Next.js, nhưng làm vậy thì lỗi điều hướng lại lọt vào khối `catch` ở
         * đây và bị hiểu nhầm thành lỗi thật. Điều hướng từ phía client như thế
         * này rõ ràng và dễ đoán hơn.
         */
        router.push(ROUTES.home);
      } catch {
        setError("Không xóa được task, vui lòng thử lại");
      }
    });
  }

  return (
    <div className={styles.actions}>
      {/*
        * Chữ trên nút đổi theo trạng thái hiện tại, để người dùng biết bấm vào
        * sẽ ra kết quả gì (chứ không phải mô tả trạng thái đang có).
        */}
      <button type="button" className={buttonStyles.button} disabled={isPending} onClick={handleToggle}>
        {todo.isDone ? "Đánh dấu chưa xong" : "Đánh dấu đã xong"}
      </button>

      <button
        type="button"
        className={`${buttonStyles.button} ${buttonStyles.danger}`}
        disabled={isPending}
        onClick={handleDelete}
      >
        Xóa task
      </button>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
