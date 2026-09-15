/*
 * ============================================================================
 * LOADING UI cho trang chi tiết
 * ============================================================================
 *
 * Cùng cơ chế với `app/loading.tsx` (đọc file đó để hiểu chi tiết), nhưng file
 * này nằm trong `app/todos/[id]/` nên CHỈ áp dụng cho trang chi tiết.
 *
 * Đây là điểm hay của file convention: mỗi nhánh route có thể có giao diện chờ
 * riêng, khớp với hình dạng nội dung của chính nó. Trang danh sách hiện mấy
 * dòng ngang, trang chi tiết hiện một khối thẻ lớn.
 *
 * Với route động như `[id]`, `loading.tsx` còn có thêm một tác dụng: nó cho
 * phép Next.js PREFETCH một phần trang trước khi người dùng bấm vào link. Khung
 * xương này được tải sẵn, nên lúc bấm là hiện ra tức thì, không có khoảng chờ
 * trắng nào.
 */

import styles from "@/components/Skeleton.module.css";

export default function TodoDetailLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Đang tải chi tiết task">
      {/* Giả link "← Danh sách task" */}
      <div className={styles.bar} style={{ width: 140, height: 16 }} />
      {/* Giả khối thẻ chứa nội dung task */}
      <div className={styles.bar} style={{ height: 320, marginTop: 20, borderRadius: 10 }} />
    </main>
  );
}
