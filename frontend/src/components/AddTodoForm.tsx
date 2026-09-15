/*
 * ============================================================================
 * FORM THÊM TASK  —  CLIENT COMPONENT đầu tiên bạn gặp
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * "use client" NGHĨA LÀ GÌ?
 * ---------------------------------------------------------------------------
 *
 * Dòng đó đánh dấu RANH GIỚI. Từ file này trở xuống (kể cả các component mà nó
 * import), code sẽ được gửi xuống trình duyệt và chạy ở đó.
 *
 * Một hiểu lầm rất phổ biến cần gỡ ngay:
 *
 *   "use client" KHÔNG có nghĩa là "chỉ chạy ở client".
 *
 * Component này vẫn được render TRƯỚC trên server để tạo HTML ban đầu (nhờ vậy
 * người dùng thấy form ngay, kể cả khi JavaScript chưa tải xong). Sau đó
 * JavaScript tải về và "gắn điện" cho HTML đó — quá trình gọi là HYDRATION.
 *
 * Nói cho gọn:
 *   Server Component  →  chạy 1 lần trên server. Chấm hết.
 *   Client Component  →  chạy trên server (dựng HTML) RỒI chạy tiếp ở trình duyệt.
 *
 * ---------------------------------------------------------------------------
 * KHI NÀO CẦN "use client"?
 * ---------------------------------------------------------------------------
 * Khi component cần một trong những thứ sau — chúng chỉ tồn tại ở trình duyệt:
 *
 *   - Hook giữ state hay hiệu ứng: useState, useEffect, useRef, useActionState...
 *   - Sự kiện người dùng: onClick, onChange, onSubmit...
 *   - API của trình duyệt: window, document, localStorage...
 *
 * Component này cần `useActionState`, `useEffect`, `useRef` → phải là Client.
 *
 * ---------------------------------------------------------------------------
 * NGUYÊN TẮC THỰC HÀNH
 * ---------------------------------------------------------------------------
 * Đẩy "use client" xuống càng SÂU trong cây component càng tốt. Nếu bạn đặt nó
 * ở `layout.tsx`, TOÀN BỘ app thành client và bạn mất hết lợi ích của Server
 * Component. Ở đây ta chỉ biến đúng cái form thành client, còn trang danh sách
 * bao quanh nó vẫn là Server Component.
 */

"use client";

import { useActionState, useEffect, useRef } from "react";
import { createTodoAction } from "@/lib/actions";
import buttonStyles from "./button.module.css";
import styles from "./AddTodoForm.module.css";

/*
 * Import hai file CSS Module cùng lúc, đặt tên khác nhau để phân biệt:
 *   - `buttonStyles` : style nút bấm dùng chung cho nhiều component
 *   - `styles`       : style riêng của form này
 *
 * Đây là cách tái sử dụng CSS với CSS Modules: tách phần dùng chung ra file
 * riêng rồi import vào nơi nào cần.
 */

export default function AddTodoForm() {
  /*
   * -------------------------------------------------------------------------
   * `useActionState` — hook nối form với Server Action
   * -------------------------------------------------------------------------
   *
   * Đưa vào:
   *   1. Server Action cần gọi        (createTodoAction)
   *   2. Trạng thái ban đầu           (null = chưa submit lần nào)
   *
   * Nhận về một mảng ba phần tử:
   *   state      → giá trị action trả về lần gần nhất. Ở đây là `null` (thành
   *                công) hoặc `{ error: "..." }` (thất bại).
   *   formAction → hàm đã được bọc lại, dùng để gắn vào thuộc tính `action`.
   *   isPending  → `true` trong lúc đang chờ server trả lời.
   *
   * `isPending` là thứ đáng giá nhất: bạn KHÔNG phải tự viết
   * `const [loading, setLoading] = useState(false)` rồi bật/tắt thủ công và
   * nhớ tắt cả trong nhánh lỗi. React lo hết.
   */
  const [state, formAction, isPending] = useActionState(createTodoAction, null);

  /*
   * `useRef` giữ một tham chiếu tới phần tử DOM thật.
   *
   * Khác `useState` ở chỗ: thay đổi giá trị của ref KHÔNG làm component render
   * lại. Dùng ref khi bạn cần "chạm tay" vào DOM — như gọi `.reset()`, `.focus()`
   * hay `.scrollIntoView()`.
   *
   * `<HTMLFormElement>` cho TypeScript biết ref này trỏ vào thẻ <form>, nhờ đó
   * nó gợi ý đúng các phương thức có sẵn.
   */
  const formRef = useRef<HTMLFormElement>(null);

  /*
   * -------------------------------------------------------------------------
   * `useEffect` — chạy một đoạn code SAU KHI component đã render xong
   * -------------------------------------------------------------------------
   *
   * Ở đây dùng để dọn ô nhập sau khi thêm task thành công, cho người dùng gõ
   * task tiếp theo ngay mà không phải tự xóa.
   *
   * Mảng `[isPending, state]` ở cuối là DEPENDENCY ARRAY: effect chỉ chạy lại
   * khi một trong hai giá trị đó thay đổi. Thiếu mảng này thì effect chạy sau
   * MỌI lần render — thường dẫn tới vòng lặp vô tận.
   *
   * Điều kiện `!isPending && !state` nghĩa là: đã chờ xong VÀ không có lỗi.
   *
   * `formRef.current?.reset()` — dấu `?.` là "optional chaining": nếu
   * `current` là `null` (component chưa gắn vào DOM) thì bỏ qua thay vì nổ lỗi.
   */
  useEffect(() => {
    if (!isPending && !state) {
      formRef.current?.reset();
    }
  }, [isPending, state]);

  return (
    /*
     * Chú ý: `action={formAction}` chứ KHÔNG phải `onSubmit={...}`.
     *
     * Thuộc tính `action` vốn là của HTML thuần (thường là một URL). React mở
     * rộng nó để nhận cả hàm. Cách viết này có hai cái lợi:
     *
     *   1. React tự gom dữ liệu form thành `FormData` và truyền vào action.
     *      Không cần `onChange` cho từng ô nhập, không cần `preventDefault()`.
     *
     *   2. Hoạt động ngay cả khi JavaScript chưa tải xong — trình duyệt sẽ
     *      submit theo kiểu HTML truyền thống, React xử lý lại sau khi
     *      hydration hoàn tất. Tính chất này gọi là "progressive enhancement".
     */
    <form ref={formRef} action={formAction} className={styles.form}>
      <div className={styles.row}>
        {/*
          * `name="content"` là thuộc tính QUAN TRỌNG NHẤT ở đây.
          *
          * Nó chính là khoá để đọc dữ liệu bên trong Server Action:
          *     formData.get("content")
          *
          * Input không có `name` sẽ không được gửi đi. Đây là lỗi hay gặp nhất
          * khi làm việc với form kiểu này.
          *
          * Đây là "uncontrolled input" — không có `value` và `onChange`, React
          * để trình duyệt tự quản lý nội dung. Đơn giản và nhanh hơn, phù hợp
          * khi bạn chỉ cần lấy giá trị lúc submit.
          */}
        <input
          className={styles.input}
          type="text"
          name="content"
          placeholder="Bạn cần làm gì?"
          autoComplete="off"
          maxLength={255}
          // `aria-label` thay cho thẻ <label> vì thiết kế này không có nhãn nhìn thấy được.
          aria-label="Nội dung task mới"
        />
        {/*
          * Khoá nút trong lúc chờ để tránh người dùng bấm hai lần tạo ra hai task.
          * Đổi luôn chữ trên nút để họ biết hệ thống đang xử lý.
          */}
        <button type="submit" className={`${buttonStyles.button} ${buttonStyles.primary}`} disabled={isPending}>
          {isPending ? "Đang thêm..." : "Thêm task"}
        </button>
      </div>

      {/*
        * `state` chính là thứ Server Action trả về. Có giá trị nghĩa là có lỗi.
        *
        * Đây là điểm hay của `useActionState`: lỗi từ server đi thẳng về đây
        * mà bạn không phải tự viết state, tự try/catch, tự truyền qua lại.
        */}
      {state ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
