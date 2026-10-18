import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/change-password-form";
import styles from "../login/login.module.css";

export const metadata: Metadata = {
  title: "變更密碼 · 拾日",
};

/**
 * 變更密碼頁面 — Server Component
 * 首次登入時 mustChange=true，顯示引導提示。
 */
export default function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ must?: string }>;
}) {
  // Next.js 15: searchParams is a Promise in Server Components
  // We use a nested async component to await it
  return <ChangePasswordContent searchParams={searchParams} />;
}

async function ChangePasswordContent({
  searchParams,
}: {
  searchParams: Promise<{ must?: string }>;
}) {
  const params = await searchParams;
  const mustChange = params.must === "1";

  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>拾日</h1>
          <p className={styles.subtitle}>變更密碼</p>
        </div>
        <ChangePasswordForm mustChange={mustChange} />
      </div>
    </main>
  );
}
