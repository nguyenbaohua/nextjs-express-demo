/*
 * ============================================================================
 * TRANG CHI TIẾT TASK  —  URL: "/todos/1", "/todos/2", ...
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * DYNAMIC SEGMENT — thư mục đặt tên trong ngoặc vuông
 * ---------------------------------------------------------------------------
 *
 * File này nằm ở `src/app/todos/[id]/page.tsx`. Cặp ngoặc vuông trong tên thư
 * mục `[id]` là cú pháp của Next.js, nghĩa là "đoạn này khớp với bất cứ giá trị
 * nào".
 *
 *   /todos/1     → params.id === "1"
 *   /todos/42    → params.id === "42"
 *   /todos/abc   → params.id === "abc"   (vẫn khớp! xem phần kiểm tra bên dưới)
 *
 * Một file duy nhất phục vụ vô hạn URL. Tên thư mục `[id]` cũng chính là tên
 * thuộc tính bạn nhận được — đổi thành `[todoId]` thì phải đọc `params.todoId`.
 *
 * ---------------------------------------------------------------------------
 * ĐÂY CŨNG LÀ SERVER COMPONENT
 * ---------------------------------------------------------------------------
 * Giống app/page.tsx: `async`, gọi API trực tiếp, không có state. Phần tương tác
 * được tách ra hai Client Component ở cuối file (EditTodoForm, TodoDetailActions).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import EditTodoForm from "@/components/EditTodoForm";
import TodoDetailActions from "@/components/TodoDetailActions";
import { ApiError, getTodoById } from "@/lib/api";
import { ROUTES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import styles from "./page.module.css";

/**
 * `PageProps<"/todos/[id]">` là kiểu Next.js TỰ SINH khi chạy `next dev` /
 * `next build`. Bạn đưa cho nó đường dẫn route, nó suy ra `params` có đúng
 * những trường nào. Gõ sai đường dẫn là TypeScript báo lỗi ngay.
 *
 * Không cần import — kiểu này là biến toàn cục, sinh vào `.next/types/`.
 */
export default async function TodoDetailPage(props: PageProps<"/todos/[id]">) {
  /*
   * VÌ SAO PHẢI `await props.params`?
   *
   * Đây là thay đổi khiến nhiều người quen Next.js cũ bị vấp. Ở các phiên bản
   * trước, `params` là object thường, đọc thẳng `props.params.id` là xong.
   *
   * Từ Next.js 15 trở đi, `params` là một PROMISE. Lý do: nó cho phép Next.js
   * bắt đầu render phần tĩnh của trang TRƯỚC khi biết giá trị tham số, rồi mới
   * chèn phần phụ thuộc tham số vào sau. Nhờ vậy trang hiện ra sớm hơn.
   *
   * Cái giá phải trả là bạn phải `await` nó. Quên `await` thì `id` sẽ là
   * `undefined` — một lỗi rất hay gặp.
   */
  const { id } = await props.params;

  /*
   * `params` LUÔN là chuỗi, vì nó lấy từ URL mà URL thì chỉ có chữ.
   * Backend cần số nên phải chuyển đổi.
   *
   * `Number("abc")` cho ra `NaN` chứ không ném lỗi — nên bắt buộc phải kiểm tra.
   */
  const todoId = Number(id);

  /*
   * Chặn sớm các URL vô nghĩa: "/todos/abc", "/todos/-5", "/todos/1.5".
   * Làm vậy đỡ tốn một lời gọi mạng chỉ để nhận về lỗi.
   *
   * `notFound()` là hàm của Next.js. Nó KHÔNG trả về gì cả — nó ném ra một lỗi
   * đặc biệt mà Next.js bắt được, rồi Next.js đi tìm file `not-found.tsx` gần
   * nhất để render thay. Ở đây là `app/todos/[id]/not-found.tsx`.
   *
   * Vì nó ném lỗi nên mọi dòng code phía sau sẽ không chạy — không cần `return`.
   * TypeScript cũng hiểu điều này (kiểu trả về của nó là `never`).
   */
  if (!Number.isInteger(todoId) || todoId <= 0) {
    notFound();
  }

  /*
   * Không khai báo kiểu cho `todo` mà để TypeScript tự suy ra từ `getTodoById`.
   * Cần `let` vì phép gán nằm trong khối `try`.
   */
  let todo;

  try {
    todo = await getTodoById(todoId);
  } catch (err) {
    /*
     * Phân biệt hai loại lỗi — đây là lý do `lib/api.ts` tạo lớp `ApiError`
     * mang theo mã status:
     *
     *   404  → id không tồn tại trong database. Không phải sự cố, chỉ là người
     *          dùng gõ nhầm. Hiện trang "không tìm thấy" cho thân thiện.
     *
     *   khác → backend sập, mất mạng, lỗi thật. Ném tiếp cho Next.js xử lý; lúc
     *          đó lập trình viên cần thấy lỗi chứ không nên che giấu.
     */
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className={styles.page}>
      {/*
        * <Link> là phiên bản nâng cấp của thẻ <a>, nhập từ "next/link".
        *
        * Khác biệt so với <a href="/"> thường:
        *
        *   1. KHÔNG tải lại toàn bộ trang. Next.js chỉ lấy phần nội dung thay
        *      đổi rồi ghép vào — layout, vị trí cuộn, state đều được giữ.
        *      Cảm giác nhanh như app một trang.
        *
        *   2. PREFETCH: khi link lọt vào tầm nhìn của người dùng, Next.js âm
        *      thầm tải trước trang đích. Lúc bấm thì nội dung đã sẵn sàng.
        *
        * Quy tắc: dùng <Link> cho link nội bộ, dùng <a> cho link ra ngoài.
        */}
      <Link href={ROUTES.home} className={styles.backLink}>
        ← Danh sách task
      </Link>

      <article className={styles.card}>
        <header className={styles.header}>
          {/*
            * Ghép class động: `styles.badge` luôn có, cộng thêm một trong hai
            * class màu tuỳ trạng thái. Đây là cách làm class có điều kiện với
            * CSS Modules (không có thư viện nào can thiệp).
            */}
          <span className={`${styles.badge} ${todo.isDone ? styles.badgeDone : styles.badgePending}`}>
            {todo.isDone ? "Đã xong" : "Chưa xong"}
          </span>
          <h1 className={styles.title}>{todo.content}</h1>
        </header>

        {/*
          * Truyền cả object `todo` xuống Client Component.
          *
          * Dữ liệu đi từ Server Component sang Client Component phải
          * "serialize" được — chuyển thành JSON rồi khôi phục lại. Object thường
          * như thế này thì được. Nếu bạn thử truyền một hàm hay một class
          * instance, Next.js sẽ báo lỗi ngay lúc build.
          */}
        <TodoDetailActions todo={todo} />

        <div className={styles.divider} />

        {/*
          * `key={todo.id}` ở đây KHÔNG phải để lặp danh sách — mà là một mẹo.
          *
          * Khi `key` đổi, React vứt bỏ component cũ và tạo mới hoàn toàn, kèm
          * theo đó là XÓA SẠCH state bên trong.
          *
          * Cần thế vì EditTodoForm giữ nội dung đang gõ trong `useState`. Nếu
          * người dùng đi từ /todos/1 sang /todos/2, React thấy vẫn là
          * EditTodoForm ở cùng vị trí nên tái sử dụng — và ô nhập sẽ còn dính
          * nội dung của task số 1. Đổi `key` là cách sửa gọn nhất.
          */}
        <EditTodoForm key={todo.id} todo={todo} />

        {/*
          * <dl>/<dt>/<dd> là thẻ HTML chuẩn cho danh sách "nhãn - giá trị".
          * Dùng đúng thẻ ngữ nghĩa giúp trình đọc màn hình hiểu được cấu trúc,
          * tốt hơn là <div> lồng <div>.
          */}
        <dl className={styles.meta}>
          <dt className={styles.metaLabel}>Mã task</dt>
          <dd>#{todo.id}</dd>
          <dt className={styles.metaLabel}>Ngày tạo</dt>
          <dd>{formatDateTime(todo.createdAt)}</dd>
          <dt className={styles.metaLabel}>Cập nhật lần cuối</dt>
          <dd>{formatDateTime(todo.updatedAt)}</dd>
        </dl>
      </article>
    </main>
  );
}
