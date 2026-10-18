import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/middleware";

/**
 * Root page
 * - 已登入 → 顯示首頁（暫時為簡單歡迎頁）
 * - 未登入 → 跳轉到 /login
 */
export default async function HomePage() {
  const ctx = await getCurrentUser();

  if (!ctx) {
    redirect("/login");
  }

  const { user } = ctx;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f5f0",
        fontFamily: "system-ui, sans-serif",
        color: "#3d3d3d",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: "#5a7a5a",
          marginBottom: "0.5rem",
        }}
      >
        拾日 · 家庭手札
      </h1>
      <p style={{ fontSize: "1.1rem", marginBottom: "2rem", color: "#6b6b6b" }}>
        歡迎回來，{user.displayName}
      </p>

      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "2rem",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          maxWidth: "400px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <p style={{ marginBottom: "1rem", color: "#8b6f47" }}>
          🏗️ 貼文功能開發中…
        </p>
        <p style={{ fontSize: "0.9rem", color: "#999", marginBottom: "1.5rem" }}>
          Phase 1 認證系統已完成，Phase 2 貼文系統即將到來。
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
          <a
            href="/change-password"
            style={{
              padding: "0.5rem 1.2rem",
              background: "#5a7a5a",
              color: "#fff",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "0.9rem",
            }}
          >
            更改密碼
          </a>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              style={{
                padding: "0.5rem 1.2rem",
                background: "#e8e4dd",
                color: "#3d3d3d",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.9rem",
              }}
            >
              登出
            </button>
          </form>
        </div>
      </div>

      <p
        style={{
          marginTop: "2rem",
          fontSize: "0.8rem",
          color: "#b0a89f",
        }}
      >
        {user.role === "ADMIN" ? "👑 管理員" : "👤 成員"} · {user.username}
      </p>
    </div>
  );
}
