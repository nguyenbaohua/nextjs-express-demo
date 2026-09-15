/*
 * ============================================================================
 * TRANG DANH SÁCH TASK  —  URL: "/"
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO FILE NÀY TẠO RA URL "/"?
 * ---------------------------------------------------------------------------
 * Vì nó tên `page.tsx` và nằm ngay tại `src/app/`. Quy tắc:
 *
 *   src/app/page.tsx              →  /
 *   src/app/todos/[id]/page.tsx   →  /todos/1, /todos/2, ...
 *
 * Thư mục tạo ra đoạn đường dẫn, file `page.tsx` biến đoạn đó thành trang xem
 * được. Thư mục KHÔNG có `page.tsx` thì không tạo ra URL nào (ví dụ `app/todos/`
 * không có page.tsx nên "/todos" là 404).
 *
 * ---------------------------------------------------------------------------
 * SERVER COMPONENT — khái niệm cốt lõi cần hiểu
 * ---------------------------------------------------------------------------
 *
 * Để ý component dưới đây có chữ `async`, và nó `await` một lời gọi API. Trong
 * React thuần bạn KHÔNG làm được vậy — component không được phép là async.
 *
 * Ở đây làm được vì đây là SERVER COMPONENT. Mọi component trong thư mục `app/`
 * mặc định là Server Component, trừ khi bạn ghi "use client" ở đầu file.
 *
 * Server Component chạy thế nào:
 *   1. Người dùng gõ địa chỉ vào trình duyệt.
 *   2. SERVER chạy hàm này, `await getTodos()` gọi thẳng backend Express.
 *   3. Server dựng ra HTML hoàn chỉnh, đã có sẵn dữ liệu.
 *   4. Trình duyệt nhận HTML đó và hiện ngay.
 *
 * Điểm khác biệt lớn nhất so với React truyền thống:
 *
 *   React thuần            :  tải trang trống → tải JS → gọi API → mới thấy dữ liệu
 *   Server Component       :  nhận HTML đã có dữ liệu ngay từ đầu
 *
 * Vì hàm này chạy trên server nên KHÔNG có `useState`, `useEffect`, `onClick`
 * ở đây. Cần tương tác thì tách ra Client Component (xem AddTodoForm, TodoItem).
 *
 * Lợi ích kèm theo: code gọi API (`lib/api.ts`) không bao giờ được gửi xuống
 * trình duyệt, nên URL backend và logic bên trong đều được giấu kín.
 */

import AddTodoForm from "@/components/AddTodoForm";
import TodoItem from "@/components/TodoItem";
import UserMenu from "@/components/UserMenu";
import { getTodos } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import type { Todo } from "@/lib/types";
import styles from "./page.module.css";

/*
 * Ghi chú về đường dẫn import:
 *
 * `@/` là bí danh trỏ tới thư mục `src/`, khai báo trong `tsconfig.json` (mục
 * `paths`). Nhờ nó ta viết `@/components/TodoItem` thay vì đếm dấu chấm kiểu
 * `../../components/TodoItem`.
 *
 * Còn `./page.module.css` là CSS MODULE. Đuôi `.module.css` khiến Next.js tự
 * đổi tên class thành duy nhất khi build (`.page` → `.page-module__tweZVG__page`).
 * Nhờ vậy class `.title` ở file này không bao giờ đụng độ với `.title` ở file
 * khác. Trong JSX ta dùng qua object: `styles.title`.
 */

/**
 * `export default` là bắt buộc: Next.js tìm export mặc định của `page.tsx` để
 * biết phải render cái gì. Tên hàm đặt gì cũng được, chỉ cần default export.
 */
export default async function TodoListPage() {
  /*
   * Đọc thông tin người dùng từ cookie phiên đăng nhập, để hiện email lên đầu trang.
   *
   * Về lý thuyết `user` không thể là `null` ở đây, vì `proxy.ts` đã chặn người
   * chưa đăng nhập từ trước. Nhưng ta vẫn xử lý trường hợp `null` (chỉ hiện
   * `<UserMenu>` khi có dữ liệu) thay vì dùng dấu `!` để ép TypeScript im lặng.
   *
   * Lý do: proxy là lớp TRẢI NGHIỆM chứ không phải lớp bảo mật — matcher có thể
   * bị cấu hình sai, cookie có thể hỏng giữa chừng. Nếu điều "không thể xảy ra"
   * ấy xảy ra thật, ta muốn trang chỉ thiếu mất thanh email, chứ không muốn cả
   * trang sập.
   */
  const user = await getSessionUser();

  /*
   * Vì sao dùng `let` và try/catch thay vì `await` thẳng?
   *
   * Backend là một tiến trình riêng, hoàn toàn có thể chưa chạy. Nếu để lỗi nổi
   * lên, người dùng gặp màn hình lỗi đỏ của Next.js — không nói được gì hữu ích.
   *
   * Bắt lỗi ở đây cho phép hiện một hộp thông báo tử tế mà form thêm task vẫn
   * còn nguyên trên màn hình.
   */
  let todos: Todo[] = [];
  let loadError: string | null = null;

  try {
    /*
     * Đây là dòng đáng chú ý nhất file: gọi API NGAY TRONG component, không cần
     * `useEffect`, không cần state `loading`, không cần thư viện như React Query.
     *
     * Vì code này chạy trên server, `await` chỉ đơn giản là chờ — Next.js không
     * gửi HTML đi cho tới khi có dữ liệu.
     */
    todos = await getTodos();
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Không tải được danh sách task";
  }

  /*
   * Chia nhóm ngay tại server. Việc này gần như miễn phí và giúp Client Component
   * không phải nhận thêm logic nào.
   */
  const pendingTodos = todos.filter((todo) => !todo.isDone);
  const doneTodos = todos.filter((todo) => todo.isDone);

  return (
    <main className={styles.page}>
      {/* Thanh hiện email + nút đăng xuất. Xem UserMenu.tsx — nó là Server Component. */}
      {user ? <UserMenu user={user} /> : null}

      <header className={styles.header}>
        <h1 className={styles.title}>Todo List</h1>
        <p className={styles.subtitle}>
          {loadError
            ? "Không tải được dữ liệu"
            : `${pendingTodos.length} task chưa xong · ${doneTodos.length} task đã xong`}
        </p>
      </header>

      {/*
        * AddTodoForm là CLIENT Component (nó có "use client").
        *
        * Một Server Component ĐƯỢC PHÉP render Client Component bên trong — đó
        * là cách ghép hai thế giới lại. Điều ngược lại thì không: Client
        * Component không import được Server Component.
        *
        * Cách nghĩ đúng: giữ phần lớn cây giao diện ở server, chỉ "nhúng" những
        * mảnh cần tương tác dưới dạng Client Component. Càng ít JavaScript gửi
        * xuống trình duyệt càng tốt.
        */}
      <AddTodoForm />

      {/*
        * JSX không có `if`. Muốn render có điều kiện thì dùng toán tử ba ngôi
        * `điều kiện ? A : null`.
        *
        * Có thể viết `điều kiện && <div/>` cho ngắn, nhưng cách đó có bẫy: nếu
        * điều kiện là số 0, React sẽ in ra chữ "0" trên màn hình. Dùng `? :` với
        * `null` thì không bao giờ dính bẫy đó.
        */}
      {loadError ? (
        // `role="alert"` báo cho trình đọc màn hình đọc ngay thông báo này.
        <div className={styles.errorBox} role="alert">
          <p className={styles.errorTitle}>Không tải được danh sách task</p>
          <p className={styles.errorMessage}>{loadError}</p>
        </div>
      ) : null}

      {/* Trạng thái rỗng: chỉ hiện khi tải THÀNH CÔNG mà thật sự chưa có task nào. */}
      {!loadError && todos.length === 0 ? (
        <p className={styles.empty}>Chưa có task nào. Thêm task đầu tiên ở ô phía trên.</p>
      ) : null}

      {pendingTodos.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Chưa xong ({pendingTodos.length})</h2>
          <ul className={styles.list}>
            {/*
              * `.map()` biến mảng dữ liệu thành mảng phần tử JSX — cách lặp
              * chuẩn của React.
              *
              * `key` là BẮT BUỘC và phải ổn định, duy nhất. React dùng nó để
              * biết phần tử nào là phần tử nào giữa hai lần render. Dùng `id`
              * của database là chuẩn nhất.
              *
              * ĐỪNG dùng chỉ số mảng làm key: khi bạn xóa task đầu tiên, mọi
              * chỉ số dịch đi một bậc, React tưởng toàn bộ danh sách đã đổi và
              * có thể gán nhầm trạng thái từ dòng này sang dòng khác.
              */}
            {pendingTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </section>
      ) : null}

      {doneTodos.length > 0 ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Đã xong ({doneTodos.length})</h2>
          <ul className={styles.list}>
            {doneTodos.map((todo) => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
