/*
 * ============================================================================
 * SERVER ACTIONS — cách Next.js xử lý việc GHI dữ liệu
 * ============================================================================
 *
 * Dòng "use server" ở ngay dưới đây là thứ đặc biệt nhất trong toàn bộ dự án.
 * Hãy đọc kỹ phần này, hiểu được nó là hiểu được 80% Next.js hiện đại.
 *
 * ---------------------------------------------------------------------------
 * TRƯỚC ĐÂY người ta làm thế nào?
 * ---------------------------------------------------------------------------
 * Muốn thêm một todo, bạn phải:
 *   1. Viết một API endpoint ở backend                (POST /api/todos)
 *   2. Ở frontend, viết fetch("/api/todos", {...})
 *   3. Tự bắt lỗi, tự quản lý trạng thái loading
 *   4. Tự cập nhật lại giao diện cho khớp dữ liệu mới
 *
 * ---------------------------------------------------------------------------
 * VỚI SERVER ACTION thì sao?
 * ---------------------------------------------------------------------------
 * Bạn viết một hàm async bình thường trong file có "use server". Ở component
 * phía client, bạn IMPORT hàm đó rồi GỌI NHƯ HÀM THƯỜNG:
 *
 *     await createTodoAction(state, formData);
 *
 * Nhưng hàm đó KHÔNG chạy trong trình duyệt. Next.js làm phép ở giữa:
 *   - Khi build, Next.js thấy "use server" và biết các hàm này thuộc về server.
 *   - Nó KHÔNG gửi code của các hàm này xuống trình duyệt. Thay vào đó nó gửi
 *     một "cái móc" — về bản chất là một ID bí mật.
 *   - Khi bạn gọi hàm ở client, trình duyệt gửi một request POST kèm ID đó và
 *     các tham số đã được mã hoá.
 *   - Server nhận, tra ID, chạy hàm thật, trả kết quả về.
 *
 * Nói cách khác: Next.js TỰ SINH RA cái API endpoint mà trước đây bạn phải tự
 * viết. Bạn được cảm giác "gọi hàm trực tiếp" nhưng vẫn an toàn vì code thật
 * nằm trên server.
 *
 * ---------------------------------------------------------------------------
 * MỘT LƯU Ý AN NINH QUAN TRỌNG
 * ---------------------------------------------------------------------------
 * Vì Next.js sinh ra endpoint thật, kẻ xấu có thể gửi POST thẳng tới đó mà
 * không qua giao diện của bạn. Nên nếu sau này app có đăng nhập, bạn PHẢI kiểm
 * tra quyền BÊN TRONG mỗi Server Action — không được tin rằng "chỉ giao diện
 * của mình mới gọi được hàm này".
 *
 * App todo này chưa có đăng nhập nên chưa cần, nhưng hãy nhớ điều đó.
 *
 * ---------------------------------------------------------------------------
 * MỌI HÀM EXPORT Ở ĐÂY BẮT BUỘC PHẢI LÀ `async`
 * ---------------------------------------------------------------------------
 * Vì lời gọi phải đi qua mạng, mà đi qua mạng thì luôn mất thời gian. Nếu bạn
 * export một hàm đồng bộ (không `async`) từ file "use server", Next.js sẽ báo lỗi.
 */

"use server";

import { revalidatePath } from "next/cache";
import * as api from "./api";
import { ROUTES } from "./constants";
import type { FormState } from "./types";

/**
 * Gom lỗi về một chuỗi hiển thị được cho người dùng.
 *
 * Backend đã trả message tiếng Việt sẵn (zod báo dữ liệu không hợp lệ, Prisma
 * báo không tìm thấy), nên chỉ cần lấy `message` ra dùng lại.
 *
 * Hàm này KHÔNG export — trong file "use server", chỉ hàm được export mới trở
 * thành endpoint. Hàm nội bộ như thế này vẫn là hàm thường, và vì thế nó không
 * cần `async`.
 */
function toErrorMessage(err: unknown): string {
  return err instanceof api.ApiError ? err.message : "Đã có lỗi xảy ra";
}

/**
 * ---------------------------------------------------------------------------
 * `revalidatePath` — mảnh ghép còn thiếu
 * ---------------------------------------------------------------------------
 *
 * Sau khi ghi dữ liệu, làm sao giao diện biết mà cập nhật?
 *
 * Trong React thuần bạn sẽ gọi `setState` rồi tự vẽ lại. Ở đây khác: danh sách
 * todo được render bởi SERVER (xem app/page.tsx), nên client không "sở hữu" dữ
 * liệu đó và không thể tự sửa.
 *
 * `revalidatePath("/")` nói với Next.js: "trang này cũ rồi, render lại đi".
 * Next.js sẽ chạy lại Server Component của trang đó, gọi lại API, dựng lại HTML,
 * rồi gửi phần thay đổi về trình duyệt — TRONG CÙNG một request với Server
 * Action. Chỉ một vòng gửi/nhận cho cả việc ghi lẫn việc cập nhật giao diện.
 *
 * Đây là lý do bạn không thấy `useState` nào giữ danh sách todo trong dự án này.
 *
 * Hàm dưới làm mới cả hai trang vì cả hai đều hiển thị cùng một todo: sửa nội
 * dung ở trang chi tiết thì trang danh sách cũng phải đổi theo.
 */
function revalidateTodo(id: number) {
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.todoDetail(id));
}

/**
 * Thêm todo mới. Được gọi từ form ở AddTodoForm.tsx.
 *
 * CHỮ KÝ HÀM TRÔNG LẠ — vì sao có tham số `_prevState`?
 *
 * Vì hàm này dùng với hook `useActionState` của React. Hook đó luôn truyền
 * trạng thái của LẦN CHẠY TRƯỚC vào tham số đầu tiên, còn dữ liệu form vào tham
 * số thứ hai. Đây là quy ước bắt buộc, không đảo thứ tự được.
 *
 * Ta không cần trạng thái cũ nên đặt tên bắt đầu bằng dấu gạch dưới `_` —
 * quy ước phổ biến để báo "biến này cố tình không dùng".
 *
 * `formData` là đối tượng `FormData` chuẩn của trình duyệt. React tự động gom
 * mọi input có thuộc tính `name` vào đó rồi truyền sang. Bạn không phải viết
 * `onChange` cho từng ô nhập.
 */
export async function createTodoAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  /*
   * `formData.get()` trả về kiểu `FormDataEntryValue | null` (có thể là File),
   * nên phải ép về chuỗi rồi mới `.trim()` được.
   */
  const content = String(formData.get("content") ?? "").trim();

  /*
   * Kiểm tra ở client cho phản hồi nhanh. Backend VẪN kiểm tra lại bằng zod —
   * đó mới là lớp bảo vệ thật. Kiểm tra ở đây chỉ để đỡ tốn một vòng gọi mạng.
   */
  if (!content) {
    return { error: "Nội dung không được để trống" };
  }

  /*
   * Vì sao trả về lỗi thay vì `throw`?
   *
   * Nếu `throw`, lỗi sẽ nổi lên thành màn hình lỗi của Next.js — quá nặng nề
   * cho một chuyện nhỏ như "chưa nhập nội dung". Trả về object lỗi thì
   * `useActionState` nhận được và component hiện một dòng chữ đỏ nhẹ nhàng.
   */
  try {
    await api.createTodo(content);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  // Chỉ cần làm mới trang danh sách — todo mới thì chưa có trang chi tiết nào đang mở.
  revalidatePath(ROUTES.home);

  // `null` = thành công, không có lỗi. Xem quy ước ở type FormState.
  return null;
}

/**
 * Sửa nội dung todo. Được gọi từ form ở EditTodoForm.tsx.
 *
 * Cũng theo quy ước `(prevState, formData)` của `useActionState` như hàm trên.
 *
 * `id` không phải tham số riêng mà nằm trong `formData`, vì form gửi kèm một
 * `<input type="hidden" name="id">`. Đó là cách truyền dữ liệu phụ qua form.
 */
export async function updateTodoContentAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const id = Number(formData.get("id"));
  const content = String(formData.get("content") ?? "").trim();

  if (!content) {
    return { error: "Nội dung không được để trống" };
  }

  try {
    await api.updateTodoContent(id, content);
  } catch (err) {
    return { error: toErrorMessage(err) };
  }

  revalidateTodo(id);
  return null;
}

/**
 * Đổi trạng thái hoàn thành của todo.
 *
 * Hàm này KHÁC hai hàm trên: nhận tham số bình thường chứ không nhận `FormData`.
 *
 * Được không? Được. Server Action nhận tham số gì cũng được, miễn là kiểu dữ
 * liệu đó "serialize" được (số, chuỗi, boolean, mảng, object thường...) — vì
 * tham số phải đi qua mạng. Không truyền được: hàm, class instance, DOM node.
 *
 * Quy ước `(prevState, formData)` chỉ bắt buộc khi dùng với `useActionState`.
 * Hàm này được gọi từ sự kiện `onChange` của checkbox nên tự do hơn.
 *
 * Ở đây KHÔNG bắt lỗi — lỗi được để nổi lên cho nơi gọi (TodoItem.tsx) tự xử lý,
 * vì nơi đó mới biết nên hiện thông báo ở chỗ nào trên màn hình.
 */
export async function toggleTodoDoneAction(id: number, isDone: boolean) {
  await api.setTodoDone(id, isDone);
  revalidateTodo(id);
}

/**
 * Xóa todo.
 *
 * Chỉ làm mới trang danh sách, không làm mới trang chi tiết — todo đã bị xóa thì
 * trang chi tiết của nó không còn ý nghĩa. Việc điều hướng đi nơi khác do
 * component xử lý (xem TodoDetailActions.tsx).
 */
export async function deleteTodoAction(id: number) {
  await api.deleteTodo(id);
  revalidatePath(ROUTES.home);
}
