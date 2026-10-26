'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, AlertTriangle, Users } from 'lucide-react';
import { deriveKey } from '@/lib/vault/crypto';
import { setVaultKey } from '@/lib/vault/keystore';
import HelpGuide from '@/components/ui/HelpGuide';
import { vaultHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

type SharedVault = {
  ownerId: string;
  ownerName: string;
  ownerAvatar: string | null;
};

/**
 * Vault 入口頁 — PIN 驗證 / 首次設定
 * /vault 不出現在導覽列
 */
export default function VaultPage() {
  const router = useRouter();
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [sharedVaults, setSharedVaults] = useState<SharedVault[]>([]);
  const [selectedVaultOwner, setSelectedVaultOwner] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupMode, setSetupMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 檢查是否已設定 Vault PIN + 共享保險庫
  useEffect(() => {
    fetch('/api/vault/status')
      .then((r) => r.json())
      .then((data) => {
        setHasPin(data.hasPin);
        setSharedVaults(data.sharedVaults ?? []);
        if (!data.hasPin) setSetupMode(true);
      })
      .catch(() => setHasPin(false));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [hasPin, setupMode, selectedVaultOwner]);

  // PIN 驗證規則：6-20 字元，需包含大寫+小寫字母+數字
  const validatePin = (p: string): string | null => {
    if (p.length < 6) return '至少需要 6 個字元';
    if (p.length > 20) return '最多 20 個字元';
    if (!/[a-z]/.test(p)) return '需包含至少一個小寫英文字母';
    if (!/[A-Z]/.test(p)) return '需包含至少一個大寫英文字母';
    if (!/[0-9]/.test(p)) return '需包含至少一個數字';
    return null;
  };

  // 首次設定 PIN
  const handleSetup = async () => {
    const validErr = validatePin(pin);
    if (validErr) { setError(validErr); return; }
    if (pin !== confirmPin) { setError('兩次輸入不一致'); return; }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/vault/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '設定失敗');
        return;
      }
      const data = await res.json();
      // 設定成功，自動解鎖
      const unlockRes = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (unlockRes.ok) {
        const unlockData = await unlockRes.json();
        // 衍生加密金鑰存入記憶體（不存 PIN 到 sessionStorage）
        const key = await deriveKey(pin, data.salt);
        setVaultKey(key);
        sessionStorage.setItem('vault-token', unlockData.token);
        sessionStorage.setItem('vault-salt', data.salt);
        sessionStorage.setItem('vault-expires', String(unlockData.expiresAt));
        sessionStorage.removeItem('vault-owner-id');
        router.push('/vault/list');
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  // 解鎖（自己或共享保險庫）
  const handleUnlock = async () => {
    if (!pin) { setError('請輸入密碼'); return; }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, string> = { pin };
      if (selectedVaultOwner) {
        body.vaultOwnerId = selectedVaultOwner;
      }
      const res = await fetch('/api/vault/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || '密碼錯誤');
        setPin('');
        inputRef.current?.focus();
        return;
      }
      const data = await res.json();
      // 衍生加密金鑰存入記憶體（不存 PIN 到 sessionStorage）
      const key = await deriveKey(pin, data.salt);
      setVaultKey(key);
      sessionStorage.setItem('vault-token', data.token);
      sessionStorage.setItem('vault-salt', data.salt);
      sessionStorage.setItem('vault-expires', String(data.expiresAt));
      if (selectedVaultOwner) {
        sessionStorage.setItem('vault-owner-id', selectedVaultOwner);
      } else {
        sessionStorage.removeItem('vault-owner-id');
      }
      router.push('/vault/list');
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (setupMode) handleSetup();
      else handleUnlock();
    }
  };

  // 目前選擇的保險庫名稱
  const getSelectedVaultLabel = () => {
    if (!selectedVaultOwner) return '我的特別區';
    const sv = sharedVaults.find((v) => v.ownerId === selectedVaultOwner);
    return sv ? `${sv.ownerName} 的特別區` : '共享特別區';
  };

  if (hasPin === null) {
    return <div className={styles.container}><div className={styles.loader}>載入中…</div></div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.lockIcon}>
          <Lock size={40} />
        </div>
        <h1 className={styles.title}>
          {setupMode ? '設定特別區密碼' : getSelectedVaultLabel()}
          <HelpGuide content={vaultHelp} />
        </h1>
        <p className={styles.subtitle}>
          {setupMode
            ? '設定一組專屬密碼來保護你的私密資料'
            : '輸入密碼以進入特別區'}
        </p>

        {/* 共享保險庫選擇器（非設定模式且有共享保險庫時顯示） */}
        {!setupMode && (hasPin || sharedVaults.length > 0) && (
          <div className={styles.vaultSelector}>
            {hasPin && (
              <button
                type="button"
                className={`${styles.vaultOption} ${selectedVaultOwner === null ? styles.vaultOptionActive : ''}`}
                onClick={() => { setSelectedVaultOwner(null); setPin(''); setError(''); }}
              >
                <Lock size={16} />
                <span>我的特別區</span>
              </button>
            )}
            {sharedVaults.map((sv) => (
              <button
                key={sv.ownerId}
                type="button"
                className={`${styles.vaultOption} ${selectedVaultOwner === sv.ownerId ? styles.vaultOptionActive : ''}`}
                onClick={() => { setSelectedVaultOwner(sv.ownerId); setPin(''); setError(''); }}
              >
                <Users size={16} />
                <span>{sv.ownerName}</span>
              </button>
            ))}
          </div>
        )}

        {setupMode && (
          <div className={styles.warning}>
            <AlertTriangle size={16} />
            <span>密碼忘記將無法找回，資料也會永久遺失</span>
          </div>
        )}

        {/* PIN 輸入 */}
        <form onSubmit={(e) => e.preventDefault()} autoComplete="off" data-form-type="other">
        {/* 隱藏欄位避免瀏覽器將 PIN 視為登入密碼 */}
        <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} aria-hidden="true" />
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>
            {setupMode ? '設定密碼' : '密碼'}
          </label>
          <div className={styles.inputWrapper}>
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              className={styles.input}
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="大小寫英文+數字，至少6位"
              autoComplete="new-password"
              name="vault-pin-code"
              maxLength={20}
            />
            <button
              type="button"
              className={styles.eyeBtn}
              onClick={() => setShowPin(!showPin)}
              aria-label={showPin ? '隱藏密碼' : '顯示密碼'}
            >
              {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* 確認 PIN（僅設定模式） */}
        {setupMode && (
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>確認密碼</label>
            <div className={styles.inputWrapper}>
              <input
                type={showPin ? 'text' : 'password'}
                className={styles.input}
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="再次輸入密碼"
                autoComplete="new-password"
                name="vault-pin-confirm"
                maxLength={20}
              />
            </div>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button
          type="button"
          className={styles.submitBtn}
          onClick={setupMode ? handleSetup : handleUnlock}
          disabled={loading}
        >
          {loading ? '處理中…' : setupMode ? '設定並進入' : '解鎖'}
        </button>

        {setupMode && (
          <p className={styles.hint}>
            密碼需 6-20 字元，包含大寫與小寫英文字母及數字
          </p>
        )}
        </form>
      </div>
    </div>
  );
}
