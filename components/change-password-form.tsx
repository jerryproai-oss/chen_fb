"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, AlertCircle, ShieldCheck, Info } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import loginStyles from "@/app/(auth)/login/login.module.css";
import styles from "./change-password-form.module.css";

interface ChangePasswordFormProps {
  /** 若為 true，顯示首次改密碼提示 */
  mustChange?: boolean;
}

/**
 * 變更密碼表單 — Client Component
 *
 * PUT /api/me/password
 * 成功 → redirect to /
 */
export function ChangePasswordForm({
  mustChange = false,
}: ChangePasswordFormProps) {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  function validate(): string | null {
    if (newPassword.length < 8) {
      return "新密碼至少需要 8 個字元";
    }
    if (newPassword !== confirmPassword) {
      return "新密碼與確認密碼不一致";
    }
    if (newPassword === currentPassword) {
      return "新密碼不能與目前密碼相同";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "密碼變更失敗");
        return;
      }

      // 密碼變更成功，導向首頁
      router.push("/");
    } catch {
      setError("無法連線至伺服器，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  const passwordToggleBtn = (
    <button
      type="button"
      className={styles.passwordToggle}
      onClick={() => setShowPasswords((v) => !v)}
      aria-label={showPasswords ? "隱藏密碼" : "顯示密碼"}
      tabIndex={-1}
    >
      {showPasswords ? (
        <EyeOff size={18} aria-hidden />
      ) : (
        <Eye size={18} aria-hidden />
      )}
    </button>
  );

  return (
    <form className={loginStyles.form} onSubmit={handleSubmit} noValidate>
      {/* ── 首次改密碼提示 ───────────────────────────────── */}
      {mustChange && (
        <div className={styles.notice} role="status">
          <Info size={18} className={styles.noticeIcon} aria-hidden />
          <span>為了帳號安全，請先設定新密碼</span>
        </div>
      )}

      {/* ── 錯誤訊息 ─────────────────────────────────────── */}
      {error && (
        <div className={styles.errorBox} role="alert">
          <AlertCircle size={18} className={styles.errorIcon} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* ── 當前密碼 ─────────────────────────────────────── */}
      <div className={loginStyles.field}>
        <label htmlFor="currentPassword" className={loginStyles.label}>
          目前密碼
        </label>
        <div className={styles.passwordWrapper}>
          <input
            id="currentPassword"
            name="currentPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="current-password"
            required
            className={`${loginStyles.input} ${styles.passwordInput}`}
            placeholder="請輸入目前密碼"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={loading}
          />
          {passwordToggleBtn}
        </div>
      </div>

      {/* ── 新密碼 ───────────────────────────────────────── */}
      <div className={loginStyles.field}>
        <label htmlFor="newPassword" className={loginStyles.label}>
          新密碼
        </label>
        <div className={styles.passwordWrapper}>
          <input
            id="newPassword"
            name="newPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className={`${loginStyles.input} ${styles.passwordInput}`}
            placeholder="請輸入新密碼"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <p className={styles.hint}>至少 8 個字元</p>
      </div>

      {/* ── 確認新密碼 ───────────────────────────────────── */}
      <div className={loginStyles.field}>
        <label htmlFor="confirmPassword" className={loginStyles.label}>
          確認新密碼
        </label>
        <div className={styles.passwordWrapper}>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={8}
            className={`${loginStyles.input} ${styles.passwordInput}`}
            placeholder="請再次輸入新密碼"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {/* ── 儲存按鈕 ─────────────────────────────────────── */}
      <button
        type="submit"
        className={`${loginStyles.button} ${loading ? styles.buttonDisabled : ""}`}
        disabled={loading}
      >
        <span className={styles.buttonContent}>
          {loading ? (
            <>
              <Spinner size="sm" color="#fff" />
              儲存中…
            </>
          ) : (
            <>
              <ShieldCheck size={18} aria-hidden />
              儲存新密碼
            </>
          )}
        </span>
      </button>
    </form>
  );
}
