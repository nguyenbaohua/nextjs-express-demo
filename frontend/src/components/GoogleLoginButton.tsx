"use client";

/*
 * ============================================================================
 * NÚT "ĐĂNG NHẬP BẰNG GOOGLE"
 * ============================================================================
 *
 * Component này nhỏ nhưng chứa ba điểm kỹ thuật đáng học, nên đọc kỹ phần chú
 * thích bên dưới hơn là phần code.
 *
 * ----------------------------------------------------------------------------
 * ĐIỂM 1 — VÌ SAO PHẢI LÀ <form>, KHÔNG PHẢI <button onClick>?
 * ----------------------------------------------------------------------------
 *
 * Cách quen thuộc mà đa số bài hướng dẫn dạy:
 *
 *     <button onClick={() => window.location.href = googleUrl}>
 *
 * Cách đó buộc URL đăng nhập phải có sẵn TRONG TRÌNH DUYỆT, nghĩa là:
 *   - Client ID và domain Hosted UI phải được gửi xuống trình duyệt
 *   - `state` chống CSRF phải được sinh ở trình duyệt, hoặc lấy về trước bằng
 *     một request phụ
 *
 * Dùng `<form action={serverAction}>` thì mọi thứ đó ở lại trên server. Trình
 * duyệt chỉ biết "gửi form này đi", còn việc sinh `state`, ghi cookie, dựng URL
 * đều xảy ra ở server rồi mới trả về lệnh chuyển hướng.
 *
 * Phần thưởng kèm theo: nút này CHẠY ĐƯỢC KỂ CẢ KHI JAVASCRIPT BỊ TẮT, vì nó
 * chỉ là một form HTML gửi POST như thời web mới ra đời. Với `onClick` thì
 * không — tắt JS là nút chết.
 *
 * ----------------------------------------------------------------------------
 * ĐIỂM 2 — `useFormStatus` KHÁC `useActionState` Ở CHỖ NÀO?
 * ----------------------------------------------------------------------------
 *
 * `LoginForm` dùng `useActionState` vì nó cần ĐỌC KẾT QUẢ action trả về (câu báo
 * lỗi) để hiện lên màn hình.
 *
 * Còn action ở đây không bao giờ "trả về" gì cả — nó kết thúc bằng `redirect()`,
 * tức là người dùng rời khỏi trang. Không có kết quả nào để đọc. Thứ duy nhất ta
 * cần biết là "đã bấm chưa, đang chờ à?" — và đó chính xác là việc của
 * `useFormStatus`.
 *
 * ⚠️ CÁI BẪY: `useFormStatus` chỉ hoạt động khi component gọi nó nằm BÊN TRONG
 * <form>, ở một component CON. Gọi ngay trong component chứa <form> thì
 * `pending` luôn là `false` — form đó là "anh em" chứ không phải "cha" của hook.
 *
 * Đó là lý do file này có tới hai component: `GoogleLoginButton` dựng form, còn
 * `SubmitButton` nằm bên trong và đọc trạng thái. Trông thừa nhưng bắt buộc.
 *
 * ----------------------------------------------------------------------------
 * ĐIỂM 3 — LOGO GOOGLE VIẾT THẲNG BẰNG SVG
 * ----------------------------------------------------------------------------
 *
 * Logo được nhúng dưới dạng SVG ngay trong code, không tải ảnh từ Internet. Ba
 * lý do:
 *   - Không thêm một request mạng (và một điểm có thể hỏng)
 *   - Không bị lệ thuộc vào một CDN có thể chết hoặc theo dõi người dùng
 *   - SVG là ảnh vector nên nét ở mọi kích thước, mọi độ phân giải màn hình
 *
 * Bốn đường `<path>` là bốn mảnh màu của chữ G — đúng bộ màu thương hiệu Google.
 * Đây là bản chính thức Google cung cấp cho nút đăng nhập, không nên tự vẽ lại
 * hay đổi màu: hướng dẫn thương hiệu của họ yêu cầu giữ nguyên.
 */

import { useFormStatus } from "react-dom";
import { loginWithGoogleAction } from "@/lib/auth-actions";
import buttonStyles from "./button.module.css";
import styles from "./AuthForm.module.css";

/** Logo chữ G bốn màu của Google, dạng SVG nội tuyến. */
function GoogleLogo() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      /*
       * `aria-hidden` giấu hình này khỏi trình đọc màn hình.
       *
       * Không phải để "ẩn cho gọn" — mà vì chữ "Đăng nhập bằng Google" ngay bên
       * cạnh đã nói đủ ý rồi. Không giấu thì người khiếm thị nghe thành "hình ảnh,
       * Đăng nhập bằng Google" — thừa và gây nhiễu.
       *
       * Quy tắc: ảnh chỉ mang tính TRANG TRÍ, đi kèm chữ đã diễn đạt đủ ý, thì nên
       * ẩn khỏi trình đọc màn hình.
       */
      aria-hidden="true"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Nút submit thật sự. Phải là component RIÊNG để `useFormStatus` đọc được trạng
 * thái của <form> cha — xem "ĐIỂM 2" ở đầu file.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={`${buttonStyles.button} ${styles.googleButton}`}
      /*
       * Khoá nút trong lúc chờ, để tránh người dùng bấm hai lần.
       *
       * Ở đây việc khoá nút quan trọng hơn bình thường: mỗi lần bấm là ghi ĐÈ
       * cookie `state` bằng một giá trị mới. Bấm hai lần liên tiếp thì lần chuyển
       * hướng đầu mang `state` cũ, còn cookie đã giữ `state` mới — hai bên không
       * khớp và người dùng bị từ chối ở bước cuối, dù chẳng làm gì sai.
       */
      disabled={pending}
    >
      <GoogleLogo />
      {pending ? "Đang chuyển tới Google..." : "Đăng nhập bằng Google"}
    </button>
  );
}

export default function GoogleLoginButton({
  /** Trang người dùng định vào trước khi bị chặn. Đăng nhập xong sẽ quay lại đó. */
  nextPath,
}: {
  nextPath?: string;
}) {
  return (
    <div className={styles.googleSection}>
      {/*
        Vạch ngăn với chữ "hoặc" ở giữa.

        `aria-hidden` vì đây thuần tuý là đường kẻ trang trí — nó phân tách hai
        cách đăng nhập bằng thị giác. Người dùng trình đọc màn hình đã nghe lần
        lượt "nút Đăng nhập" rồi "nút Đăng nhập bằng Google", vốn đã rõ ràng;
        chen thêm một chữ "hoặc" trống trải chỉ làm rối.
      */}
      <div className={styles.divider} aria-hidden="true">
        <span>hoặc</span>
      </div>

      {/*
        `action={loginWithGoogleAction}` — gắn thẳng Server Action vào form.

        Được phép vì action nhận đúng một tham số `FormData`, đúng chữ ký mà React
        truyền vào. Không cần `onSubmit`, không cần `preventDefault`, không cần
        `fetch`.
      */}
      <form action={loginWithGoogleAction}>
        {/*
          Ô ẩn mang theo đường dẫn cần quay về — cùng cơ chế với `LoginForm`.

          Nhắc lại: "ẩn" KHÔNG phải "an toàn". Ai mở DevTools cũng sửa được giá
          trị này, nên `loginWithGoogleAction` lọc nó qua `safeRedirectPath()`
          trước khi cất vào cookie.
        */}
        <input type="hidden" name="next" value={nextPath ?? ""} />
        <SubmitButton />
      </form>
    </div>
  );
}
