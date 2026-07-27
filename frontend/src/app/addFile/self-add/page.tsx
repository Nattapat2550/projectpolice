import MemoForm from "@/components/self-add/MemoForm";
import styles from "@/components/self-add/SelfAdd.module.css";
import Link from "next/link";

export default function CreateMemoPage() {
  return (
    <main className="h-full p-4 md:p-8 w-full max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className={styles.Header} style={{ fontSize: '1.5rem', marginBottom: 0 }}>
          เพิ่มงานติดตามด้วยตนเอง
        </h1>

        <Link href="/">
          <button className={styles.SecondaryButton}>
            กลับหน้าหลัก
          </button>
        </Link>
      </div>
      <MemoForm />
    </main>
  );
}