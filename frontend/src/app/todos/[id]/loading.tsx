import styles from "@/components/Skeleton.module.css";

export default function TodoDetailLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="Đang tải chi tiết task">
      <div className={styles.bar} style={{ width: 140, height: 16 }} />
      <div className={styles.bar} style={{ height: 320, marginTop: 20, borderRadius: 10 }} />
    </main>
  );
}
