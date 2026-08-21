/*
 * ============================================================================
 * MỘT DÒNG TRONG DANH SÁCH TASK
 * ============================================================================
 *
 * Component này minh hoạ cách gọi Server Action TỪ SỰ KIỆN (onChange, onClick)
 * thay vì từ form. Đối chiếu với AddTodoForm.tsx dùng cách form + useActionState.
 *
 * Khi nào dùng cách nào?
 *   - Có ô nhập liệu, người dùng gõ rồi submit  → form + useActionState
 *   - Chỉ là một cú bấm (tick, xóa, thích...)   → sự kiện + useTransition
 *
 * ---------------------------------------------------------------------------
 * ĐỂ Ý MỘT ĐIỀU: KHÔNG CÓ `useState` NÀO GIỮ DỮ LIỆU TODO
 * ---------------------------------------------------------------------------
 * Trạng thái checkbox lấy thẳng từ `todo.isDone` — tức là từ props do server
 * truyền xuống. Sau khi Server Action chạy xong, `revalidatePath` khiến server
 * render lại và gửi `todo` mới về, checkbox tự đổi theo.
 *
 * Đây là khác biệt tư duy lớn nhất so với React truyền thống: server là NGUỒN
 * SỰ THẬT DUY NHẤT, client không giữ bản sao dữ liệu.
 */

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteTodoAction, toggleTodoDoneAction } from "@/lib/actions";
import { ROUTES } from "@/lib/constants";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./TodoItem.module.css";

/**
 * `{ todo }: { todo: Todo }` là cú pháp nhận props của React kèm khai báo kiểu.
 *
 * Object `todo` này đi từ Server Component (app/page.tsx) sang. Nó phải
 * "serialize" được — chuyển thành JSON rồi khôi phục lại ở phía client. Object
 * dữ liệu thuần thì luôn được; hàm hay class instance thì không.
 */
export default function TodoItem({ todo }: { todo: Todo }) {
  /*
   * -------------------------------------------------------------------------
   * `useTransition` — quản lý trạng thái chờ cho Server Action
   * -------------------------------------------------------------------------
   *
   * Trả về:
   *   isPending       → `true` trong lúc việc bên trong đang chạy
   *   startTransition → hàm để bọc công việc đó lại
   *
   * Có thể coi đây là bản "thủ công" của `useActionState`: dùng khi bạn gọi
   * Server Action từ sự kiện chứ không qua form.
   *
   * Ngoài việc cho ta `isPending`, nó còn báo cho React biết đây là cập nhật
   * KHÔNG khẩn cấp, nhờ đó giao diện vẫn phản hồi mượt trong lúc chờ.
   */
  const [isPending, startTransition] = useTransition();

  /*
   * State này chỉ để hiện thông báo lỗi — không giữ dữ liệu todo.
   * `<string | null>` nói rằng nó là chuỗi lỗi, hoặc `null` khi không có lỗi.
   */
  const [error, setError] = useState<string | null>(null);

  /**
   * Hàm dùng chung cho cả tick lẫn xóa, vì hai việc đó cùng một khuôn:
   * xóa lỗi cũ → bọc trong transition → bắt lỗi nếu có.
   *
   * Tham số là một HÀM chứ không phải kết quả, để lời gọi thật chỉ xảy ra BÊN
   * TRONG `startTransition`. Nếu truyền vào kết quả (`run(toggle(...))`) thì
   * action đã chạy mất rồi, `isPending` sẽ không hoạt động đúng.
   */
  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch {
        /*
         * Server Action gọi qua mạng nên có thể thất bại (mất mạng, backend
         * sập). Bắt lỗi tại đây và hiện ngay dưới dòng task — người dùng thấy
         * lỗi đúng chỗ họ vừa bấm, thay vì cả trang nhảy sang màn hình lỗi.
         */
        setError("Thao tác thất bại, vui lòng thử lại");
      }
    });
  }

  return (
    <li className={`${styles.item} ${todo.isDone ? styles.done : ""}`}>
      {/*
        * "Controlled input": `checked` lấy từ props, `onChange` báo lên server.
        *
        * Trong React, một khi đã đặt `checked` thì BẮT BUỘC phải có `onChange`,
        * nếu không ô tick sẽ đứng im và React cảnh báo trong console.
        *
        * Điểm thú vị: ở đây `onChange` không hề gọi `setState` nào. Nó gọi
        * Server Action, server ghi database rồi render lại, và giá trị mới quay
        * về qua props. Vòng tròn dữ liệu đi qua server chứ không quẩn trong
        * trình duyệt.
        */}
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={todo.isDone}
        disabled={isPending}
        onChange={(event) => run(() => toggleTodoDoneAction(todo.id, event.target.checked))}
        // Nhãn cho trình đọc màn hình, nói rõ bấm vào sẽ xảy ra chuyện gì.
        aria-label={todo.isDone ? `Đánh dấu chưa xong: ${todo.content}` : `Đánh dấu đã xong: ${todo.content}`}
      />

      <div className={styles.body}>
        {/*
          * `ROUTES.todoDetail(todo.id)` cho ra "/todos/1".
          *
          * <Link> ở đây có thêm một lợi ích: khi dòng này lọt vào tầm nhìn,
          * Next.js âm thầm tải trước trang chi tiết. Người dùng bấm vào là hiện
          * gần như tức thì.
          */}
        <Link href={ROUTES.todoDetail(todo.id)} className={styles.content}>
          {todo.content}
        </Link>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {/*
        * `type="button"` là bắt buộc.
        *
        * Mặc định của <button> là `type="submit"`. Nút này nằm trong <li>, hiện
        * tại không có form nào bao ngoài nên chưa sao — nhưng nếu sau này bạn
        * bọc danh sách vào một form, nút xóa sẽ vô tình submit form đó. Ghi rõ
        * `type="button"` là thói quen tốt để tránh cái bẫy này.
        */}
      <button
        type="button"
        className={`${buttonStyles.button} ${buttonStyles.danger} ${buttonStyles.small}`}
        disabled={isPending}
        onClick={() => run(() => deleteTodoAction(todo.id))}
      >
        Xóa
      </button>
    </li>
  );
}
