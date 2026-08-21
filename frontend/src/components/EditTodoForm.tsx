/*
 * ============================================================================
 * FORM SỬA NỘI DUNG TASK (ở trang chi tiết)
 * ============================================================================
 *
 * Component này phức tạp nhất dự án vì nó là "controlled form": React nắm giữ
 * nội dung đang gõ trong state, thay vì để trình duyệt tự lo như AddTodoForm.
 *
 * Vì sao ở đây cần controlled mà form thêm task thì không?
 *
 * Vì ta cần BIẾT người dùng đã sửa gì để khoá nút "Lưu thay đổi" khi nội dung
 * chưa đổi. Muốn biết thì phải theo dõi từng ký tự → phải có state.
 *
 * Bài học rút ra: chỉ dùng controlled input khi thật sự cần phản ứng theo từng
 * ký tự (kiểm tra tức thì, khoá nút, đếm ký tự, gợi ý...). Còn lại thì
 * uncontrolled đơn giản hơn và nhanh hơn.
 */

"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateTodoContentAction } from "@/lib/actions";
import type { Todo } from "@/lib/types";
import buttonStyles from "./button.module.css";
import styles from "./EditTodoForm.module.css";

export default function EditTodoForm({ todo }: { todo: Todo }) {
  // Giống AddTodoForm: nối form với Server Action. Xem giải thích chi tiết ở file đó.
  const [state, formAction, isPending] = useActionState(updateTodoContentAction, null);

  /*
   * Nội dung đang gõ. Khởi tạo bằng nội dung hiện tại của task.
   *
   * LƯU Ý: giá trị truyền vào `useState` chỉ có tác dụng ở LẦN RENDER ĐẦU TIÊN.
   * Những lần sau, dù `todo.content` có đổi, state này vẫn giữ giá trị cũ.
   *
   * Đó chính là lý do trang chi tiết phải viết `<EditTodoForm key={todo.id} />`
   * — đổi `key` buộc React tạo lại component từ đầu, nhờ vậy state được khởi
   * tạo lại theo task mới. (Xem app/todos/[id]/page.tsx.)
   */
  const [content, setContent] = useState(todo.content);

  // Cờ để hiện chữ "Đã lưu" một lát rồi tự ẩn.
  const [justSaved, setJustSaved] = useState(false);

  /*
   * Vì sao dùng `useRef` mà không dùng `useState` cho cờ này?
   *
   * Vì đây là dữ liệu ta chỉ cần GHI NHỚ, không cần hiển thị. Đổi giá trị ref
   * KHÔNG làm component render lại — dùng state ở đây sẽ gây một lần render
   * thừa vô ích.
   *
   * Quy tắc: cần vẽ lại màn hình khi giá trị đổi → useState. Chỉ cần nhớ để
   * dùng sau → useRef.
   */
  const hasSubmitted = useRef(false);

  /*
   * "Dirty" là thuật ngữ quen thuộc: nội dung đã bị sửa so với bản đã lưu chưa.
   *
   * Đây là GIÁ TRỊ DẪN XUẤT — tính ra từ state có sẵn, không cần state riêng.
   * Người mới hay tạo thêm `const [isDirty, setIsDirty] = useState(false)` rồi
   * phải nhớ cập nhật ở mọi chỗ; làm vậy sớm muộn cũng lệch. Cứ tính lại mỗi
   * lần render là luôn đúng.
   *
   * `.trim()` để người dùng gõ thêm vài dấu cách không bị tính là đã sửa.
   */
  const isDirty = content.trim() !== todo.content;

  /*
   * Hiện "Đã lưu" trong 2 giây sau mỗi lần lưu thành công.
   *
   * Vì sao cần cờ `hasSubmitted`? Vì ngay lần render đầu tiên, `isPending` đã
   * là `false` và `state` đã là `null` — đúng y hệt trạng thái "vừa lưu xong".
   * Không có cờ này thì chữ "Đã lưu" sẽ hiện ra ngay khi mở trang, dù người
   * dùng chưa làm gì cả.
   *
   * Cách hoạt động:
   *   - Bắt đầu submit → isPending = true  → đánh dấu hasSubmitted
   *   - Submit xong    → isPending = false → nếu đã đánh dấu và không lỗi thì hiện
   *
   * `return () => clearTimeout(timer)` là HÀM DỌN DẸP của useEffect. React gọi
   * nó trước khi chạy effect lần sau, hoặc khi component bị gỡ khỏi màn hình.
   * Không dọn thì `setJustSaved` có thể chạy sau khi component đã biến mất.
   */
  useEffect(() => {
    if (isPending) {
      hasSubmitted.current = true;
      return;
    }

    if (!hasSubmitted.current || state) return;

    hasSubmitted.current = false;
    setJustSaved(true);
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [isPending, state]);

  return (
    <form action={formAction} className={styles.form}>
      {/*
        * Input ẩn để gửi kèm `id` của task.
        *
        * Server Action đọc nó bằng `formData.get("id")`. Đây là cách chuẩn để
        * đính thêm dữ liệu vào form mà người dùng không cần nhìn thấy.
        *
        * (Cách khác là dùng `formAction.bind(null, todo.id)`, nhưng input ẩn dễ
        * hiểu hơn cho người mới.)
        */}
      <input type="hidden" name="id" value={todo.id} />

      {/*
        * `htmlFor` chính là thuộc tính `for` của HTML — trong JSX phải đổi tên
        * vì `for` là từ khoá của JavaScript. Tương tự, `class` phải viết thành
        * `className`.
        *
        * Nối <label> với <textarea> qua id giúp bấm vào chữ "Nội dung" là con
        * trỏ nhảy vào ô nhập, và trình đọc màn hình đọc đúng nhãn.
        */}
      <label className={styles.label} htmlFor="content">
        Nội dung
      </label>

      {/*
        * Bộ đôi kinh điển của controlled input: `value` + `onChange`.
        *
        * Luồng chạy: người dùng gõ → onChange bắn ra → setContent → component
        * render lại → value đổi theo. Nếu thiếu `onChange`, ô nhập sẽ bị "đơ"
        * vì `value` luôn bị đặt về state cũ.
        *
        * Vẫn có `name="content"` để Server Action đọc được lúc submit.
        */}
      <textarea
        id="content"
        name="content"
        className={styles.textarea}
        value={content}
        maxLength={255}
        onChange={(event) => setContent(event.target.value)}
      />

      <div className={styles.footer}>
        {/*
          * Nút bị khoá trong ba trường hợp:
          *   isPending   → đang lưu, tránh bấm hai lần
          *   !isDirty    → chưa sửa gì, lưu cũng vô nghĩa
          *   !content    → nội dung rỗng, backend sẽ từ chối
          *
          * Khoá nút là cách nhắc nhở nhẹ nhàng, không cần hiện thông báo lỗi.
          */}
        <button
          type="submit"
          className={`${buttonStyles.button} ${buttonStyles.primary}`}
          disabled={isPending || !isDirty || !content.trim()}
        >
          {isPending ? "Đang lưu..." : "Lưu thay đổi"}
        </button>

        {state ? (
          <span className={styles.error} role="alert">
            {state.error}
          </span>
        ) : null}

        {/*
          * Điều kiện hiện "Đã lưu": không có lỗi, vừa lưu xong, và nội dung
          * hiện tại vẫn khớp bản đã lưu. Vế `!isDirty` để chữ này biến mất ngay
          * khi người dùng gõ tiếp — tránh hiểu nhầm là thay đổi mới cũng đã lưu.
          */}
        {!state && justSaved && !isDirty ? <span className={styles.saved}>Đã lưu</span> : null}
      </div>
    </form>
  );
}
