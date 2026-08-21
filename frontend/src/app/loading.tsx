/*
 * ============================================================================
 * LOADING UI cho trang danh sách  —  file convention: `loading.tsx`
 * ============================================================================
 *
 * ---------------------------------------------------------------------------
 * FILE NÀY LÀM GÌ, VÀ AI GỌI NÓ?
 * ---------------------------------------------------------------------------
 * Không ai import file này cả. Bạn cũng không gọi nó ở đâu. Chỉ cần đặt file tên
 * `loading.tsx` cạnh `page.tsx` là Next.js tự dùng.
 *
 * Cụ thể, Next.js tự động bọc `page.tsx` vào trong <Suspense> của React, lấy
 * component này làm nội dung hiện tạm:
 *
 *     <Suspense fallback={<TodoListLoading />}>
 *       <TodoListPage />
 *     </Suspense>
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO CẦN?
 * ---------------------------------------------------------------------------
 * Trang danh sách là Server Component có `await getTodos()`. Nếu backend chậm
 * một giây, người dùng sẽ ngồi nhìn màn hình cũ và tưởng app bị treo.
 *
 * Có `loading.tsx`, Next.js gửi ngay khung xương này xuống trước, rồi khi dữ
 * liệu xong mới gửi nội dung thật và thay vào chỗ. Kỹ thuật này gọi là
 * STREAMING — server gửi HTML thành nhiều đợt thay vì chờ đủ mới gửi.
 *
 * ---------------------------------------------------------------------------
 * VÌ SAO KHÔNG PHẢI VÒNG TRÒN XOAY?
 * ---------------------------------------------------------------------------
 * Khung xương (skeleton) mô phỏng đúng hình dạng nội dung sắp hiện ra, nên mắt
 * người thấy trang "đang thành hình" thay vì "đang đợi". Cảm giác nhanh hơn dù
 * thời gian thật không đổi.
 */

import styles from "@/components/Skeleton.module.css";

export default function TodoListLoading() {
  return (
    /*
     * `aria-busy` và `aria-label` dành cho trình đọc màn hình: người khiếm thị
     * cần được báo "đang tải", vì họ không nhìn thấy hiệu ứng nhấp nháy.
     */
    <main className={styles.page} aria-busy="true" aria-label="Đang tải danh sách task">
      {/*
        * Vài chỗ dùng `style={{...}}` thay vì CSS Module.
        *
        * Đây là style nội tuyến của React: nhận một object JavaScript, tên
        * thuộc tính viết kiểu camelCase (`marginTop` chứ không phải
        * `margin-top`), số không cần đơn vị thì React tự thêm "px".
        *
        * Dùng ở đây vì mấy kích thước này chỉ xuất hiện đúng một lần, đặt tên
        * class riêng cho chúng thì rườm rà hơn là có ích.
        */}
      <div className={styles.bar} style={{ width: 180, height: 34 }} />
      <div className={styles.bar} style={{ width: 240, height: 16, marginTop: 10 }} />
      <div className={styles.bar} style={{ height: 42, marginTop: 24 }} />

      <div style={{ marginTop: 32 }}>
        {/*
          * Mảng `[0, 1, 2]` chỉ để lặp ba lần cho ra ba dòng giả.
          * Ở đây dùng chỉ số làm `key` là chấp nhận được, vì danh sách này cố
          * định, không bao giờ thêm/bớt/đảo thứ tự.
          */}
        {[0, 1, 2].map((index) => (
          <div key={index} className={`${styles.bar} ${styles.row}`} />
        ))}
      </div>
    </main>
  );
}
