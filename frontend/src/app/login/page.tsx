/*
 * ============================================================================
 * TRANG /login
 * ============================================================================
 *
 * Đây là SERVER COMPONENT (không có `"use client"`). Nó chỉ đọc tham số trên URL
 * rồi giao phần tương tác cho `<LoginForm />` — component chạy ở trình duyệt.
 *
 * Cách chia này là khuôn mẫu rất hay gặp trong Next.js App Router:
 *
 *     Server Component  →  lấy dữ liệu, đọc URL, dựng khung
 *     Client Component  →  xử lý tương tác, giữ trạng thái form
 *
 * Lợi ích: chỉ phần code THẬT SỰ cần chạy ở trình duyệt mới được gửi xuống trình
 * duyệt. Trang càng nhẹ thì càng nhanh, và lợi ích đó cộng dồn trên mọi lượt
 * truy cập.
 *
 * ----------------------------------------------------------------------------
 * VÌ SAO FILE NÀY MỎNG NHƯ VẬY?
 * ----------------------------------------------------------------------------
 * Vì `app/` chỉ dùng cho ROUTING (xem `.claude/nextjs-folder-structure.md`).
 * Form đăng nhập là NGHIỆP VỤ, nên nó nằm ở `features/auth/components/`.
 *
 * Lợi ích cụ thể của ranh giới đó: nếu mai này bạn chuyển dự án sang Pages
 * Router, sang Vite + React Router, hay thậm chí sang React Native — bạn vứt bỏ
 * thư mục `app/` và viết lại tầng routing, còn `features/` thì giữ nguyên gần
 * như toàn bộ. Framework là thứ thay được; nghiệp vụ mới là tài sản.
 */

import LoginForm from "@/features/auth/components/LoginForm";
import styles from "@/features/auth/components/AuthForm.module.css";

export default async function LoginPage(props: PageProps<"/login">) {
  /*
   * `searchParams` là một Promise nên phải `await`.
   *
   * Đây là thay đổi của Next.js 15 trở đi. Trước kia nó là object thường. Lý do
   * đổi: tham số URL chỉ biết được lúc có request thật, và việc bắt phải `await`
   * giúp Next.js render sẵn phần tĩnh của trang trước, chỉ chờ ở đúng chỗ cần chờ.
   *
   * Nếu bạn đọc bài hướng dẫn cũ thấy `props.searchParams.email` không có `await`
   * thì đó là cú pháp của phiên bản trước — ở đây sẽ không chạy.
   */
  const searchParams = await props.searchParams;

  /*
   * Một tham số trên URL có thể xuất hiện nhiều lần: `?email=a&email=b`. Khi đó
   * Next.js trả về MẢNG chứ không phải chuỗi.
   *
   * Ta không cần hỗ trợ trường hợp đó, nên chỉ lấy khi nó đúng là chuỗi. Bỏ qua
   * chi tiết này thì gặp URL kiểu trên sẽ hiện ra `"a,b"` trong ô email — hoặc
   * tệ hơn là lỗi lúc chạy ở một chỗ khác hoàn toàn, rất khó lần ngược về đây.
   *
   * Đây là một ví dụ nhỏ của bài học lớn: mọi thứ đến từ bên ngoài đều có thể
   * mang hình dạng bạn không ngờ tới.
   */
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;
  const nextPath = typeof searchParams.next === "string" ? searchParams.next : undefined;

  /*
   * `?registered=1` do `registerAction` gắn vào sau khi tạo tài khoản xong. Nó
   * chỉ để hiện dòng chúc mừng — không mang ý nghĩa bảo mật nào, nên người dùng
   * có tự gõ thêm vào URL cũng chẳng sao.
   *
   * Nguyên tắc để tự đánh giá: hãy hỏi "nếu người dùng tự bịa tham số này thì họ
   * được gì?". Ở đây câu trả lời là "một dòng chữ vui vẻ" — vô hại. Với `?next=`
   * bên trên thì câu trả lời khác hẳn, và đó là lý do nó phải được lọc kỹ trong
   * `features/auth/actions.ts`.
   */
  const justRegistered = searchParams.registered === "1";

  return (
    <main className={styles.page}>
      <LoginForm defaultEmail={email} justRegistered={justRegistered} nextPath={nextPath} />
    </main>
  );
}
