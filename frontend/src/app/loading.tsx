import styles from "@/components/Skeleton.module.css";

export default function TodoListLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Đang tải danh sách task">
      <div className={styles.bar} style={{ width: 180, height: 34 }} />
      <div className={styles.bar} style={{ width: 240, height: 16, marginTop: 10 }} />
      <div className={styles.bar} style={{ height: 42, marginTop: 24 }} />

      <div style={{ marginTop: 32 }}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={`${styles.bar} ${styles.row}`} />
        ))}
      </div>
    </main>
  );
}
