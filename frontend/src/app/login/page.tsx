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
 * duyệt. Trang càng nhẹ thì càng nhanh.
 */

import LoginForm from "@/components/LoginForm";
import { getGoogleLoginErrorMessage } from "@/lib/oauth";
import styles from "@/components/AuthForm.module.css";

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
   * tệ hơn là lỗi lúc chạy ở chỗ khác.
   */
  const email = typeof searchParams.email === "string" ? searchParams.email : undefined;
  const nextPath = typeof searchParams.next === "string" ? searchParams.next : undefined;
  /*
   * `?confirmed=1` do `confirmAction` gắn vào sau khi xác thực email xong. Nó chỉ
   * để hiện dòng chúc mừng — không mang ý nghĩa bảo mật nào, nên người dùng có tự
   * gõ thêm vào URL cũng chẳng sao.
   */
  const justConfirmed = searchParams.confirmed === "1";

  /*
   * `?error=...` do Route Handler `/api/auth/callback/google` gắn vào khi luồng
   * đăng nhập Google thất bại.
   *
   * 🔒 Để ý: trên URL chỉ có MÃ LỖI (ví dụ `google_state`), không phải câu thông
   * báo. Trang này tra mã đó ra câu tiếng Việt tương ứng.
   *
   * Vì sao không truyền thẳng câu thông báo cho nhanh? Vì mọi thứ trên URL đều do
   * người dùng sửa được: kẻ xấu sẽ gửi cho nạn nhân một link kiểu
   * `/login?error=Tài khoản bị khoá, gọi 0900xxx để mở` — và câu lừa đảo đó hiện
   * ra trên đúng website thật của bạn, trong đúng khung cảnh báo màu đỏ.
   *
   * Truyền mã thì kẻ tấn công chỉ chọn được một trong vài câu DO BẠN VIẾT SẴN, và
   * mã lạ thì không hiện gì cả. Xem giải thích đầy đủ trong `lib/oauth.ts`.
   */
  const googleErrorCode = typeof searchParams.error === "string" ? searchParams.error : undefined;
  const googleError = getGoogleLoginErrorMessage(googleErrorCode);

  return (
    <main className={styles.page}>
      <LoginForm
        defaultEmail={email}
        justConfirmed={justConfirmed}
        nextPath={nextPath}
        googleError={googleError}
      />
    </main>
  );
}
