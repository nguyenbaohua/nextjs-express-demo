/*
 * ============================================================================
 * TRANG "KHÔNG TÌM THẤY"  —  file convention: `not-found.tsx`
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * KHI NÀO FILE NÀY ĐƯỢC DÙNG?
 * ---------------------------------------------------------------------------
 * Khi code gọi hàm `notFound()` của Next.js. Trong dự án này có hai chỗ gọi, cả
 * hai đều ở `app/todos/[id]/page.tsx`:
 *
 *   1. URL có id không phải số dương  → "/todos/abc"
 *   2. Backend trả về 404             → "/todos/999" (id không có trong database)
 *
 * Next.js đi ngược lên cây thư mục để tìm `not-found.tsx` gần nhất. Vì file này
 * nằm ngay trong `app/todos/[id]/` nên nó được chọn. Nếu không có file này,
 * Next.js sẽ dùng trang 404 mặc định — trống trơn và bằng tiếng Anh.
 *
 * ---------------------------------------------------------------------------
 * MỘT ĐIỀU CẦN BIẾT
 * ---------------------------------------------------------------------------
 * Nội dung hiển thị đúng, nhưng mã HTTP trả về là 200 chứ không phải 404. Đó là
 * do route này là "dynamic" nên Next.js đã bắt đầu gửi HTML đi trước khi biết
 * kết quả `notFound()`. Không ảnh hưởng người dùng, chỉ ảnh hưởng các con bot
 * thu thập dữ liệu (SEO).
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO ĐÂY KHÔNG PHẢI CLIENT COMPONENT?
 * ---------------------------------------------------------------------------
 * Trang này chỉ có chữ và một cái link, không có nút bấm hay state nào. Không
 * cần tương tác thì để nguyên Server Component — như vậy không tốn một byte
 * JavaScript nào gửi xuống trình duyệt.
 */

import Link from "next/link";
import { ROUTES } from "@/lib/constants";
import styles from "./not-found.module.css";

export default function TodoNotFound() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Không tìm thấy task</h1>
      <p className={styles.message}>Task này có thể đã bị xóa hoặc đường dẫn không đúng.</p>
      {/* Ngõ thoát: đừng bao giờ để người dùng mắc kẹt ở trang lỗi. */}
      <Link href={ROUTES.home} className={styles.link}>
        ← Về danh sách task
      </Link>
    </main>
  );
}
