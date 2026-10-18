"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import loginStyles from "@/app/(auth)/login/login.module.css";
import styles from "./login-form.module.css";

/**
 * 登入表單 — Client Component
 *
 * POST /api/auth/login
 * 成功 + requirePasswordChange → /change-password
 * 成功 → /
 * 失敗 → 顯示錯誤訊息
 */
export function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setError("登入嘗試次數過多，請稍後再試");
        } else {
          setError(data.error ?? "帳號或密碼錯誤");
        }
        return;
      }

      // 成功：檢查是否需要首次改密碼
      if (data.requirePasswordChange) {
        router.push("/change-password?must=1");
      } else {
        router.push("/");
      }
    } catch {
      setError("無法連線至伺服器，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={loginStyles.form} onSubmit={handleSubmit} noValidate>
      {/* ── 錯誤訊息 ─────────────────────────────────────── */}
      {error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={18} className={styles.errorIcon} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* ── 帳號 ─────────────────────────────────────────── */}
      <div className={loginStyles.field}>
        <label htmlFor="username" className={loginStyles.label}>
          帳號
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          required
          className={loginStyles.input}
          placeholder="請輸入帳號"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
      </div>

      {/* ── 密碼 ─────────────────────────────────────────── */}
      <div className={loginStyles.field}>
        <label htmlFor="password" className={loginStyles.label}>
          密碼
        </label>
        <div className={styles.passwordWrapper}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${loginStyles.input} ${styles.passwordInput}`}
            placeholder="請輸入密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "隱藏密碼" : "顯示密碼"}
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden />
            ) : (
              <Eye size={18} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* ── 登入按鈕 ─────────────────────────────────────── */}
      <button
        type="submit"
        className={`${loginStyles.button} ${loading ? styles.buttonDisabled : ""}`}
        disabled={loading}
      >
        <span className={styles.buttonContent}>
          {loading && <Spinner size="sm" color="#fff" />}
          {loading ? "登入中…" : "登入"}
        </span>
      </button>
    </form>
  );
}
