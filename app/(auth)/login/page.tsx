import { LoginForm } from "@/components/login-form";
import styles from "./login.module.css";

export const metadata = {
  title: "登入 · 拾日",
};

/**
 * 登入頁面 — Server Component
 *
 * TODO: 當 session 驗證 API 就緒後，在此檢查 cookie；
 *       若已登入則 redirect("/")。
 */
export default function LoginPage() {
  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>拾日</h1>
          <p className={styles.subtitle}>家庭手札</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
