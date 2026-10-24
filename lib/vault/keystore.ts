/**
 * Vault 金鑰管理 — 含閒置自動上鎖
 * 金鑰存於記憶體，sessionStorage 存 token
 */

let _vaultKey: CryptoKey | null = null;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _onLockCallback: (() => void) | null = null;

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘閒置後自動上鎖

export function setVaultKey(key: CryptoKey): void {
  _vaultKey = key;
  resetIdleTimer();
}

export function getVaultKey(): CryptoKey | null {
  if (_vaultKey) resetIdleTimer();
  return _vaultKey;
}

export function clearVaultKey(): void {
  _vaultKey = null;
  clearIdleTimer();
}

/** 設定上鎖回調（用於清除 token 並跳轉） */
export function setOnLockCallback(callback: (() => void) | null): void {
  _onLockCallback = callback;
}

/** 重設閒置計時器（每次使用者有操作時呼叫） */
export function resetIdleTimer(): void {
  clearIdleTimer();
  if (!_vaultKey) return;
  _idleTimer = setTimeout(() => {
    _vaultKey = null;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('vault_token');
    }
    if (_onLockCallback) _onLockCallback();
  }, IDLE_TIMEOUT_MS);
}

function clearIdleTimer(): void {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

/**
 * 初始化閒置監控 — 監聽使用者互動事件
 * 回傳 cleanup 函式
 */
export function initIdleMonitor(): () => void {
  if (typeof window === 'undefined') return () => {};

  const events = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
  const handler = () => resetIdleTimer();
  events.forEach(e => window.addEventListener(e, handler, { passive: true }));

  // 頁面不可見時立即清除金鑰
  const visibilityHandler = () => {
    if (document.visibilityState === 'hidden' && _vaultKey) {
      // 給一個短暫的寬限期（使用者可能只是切換分頁又回來）
      clearIdleTimer();
      _idleTimer = setTimeout(() => {
        _vaultKey = null;
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('vault_token');
        }
        if (_onLockCallback) _onLockCallback();
      }, 30_000); // 離開頁面 30 秒後上鎖
    } else if (document.visibilityState === 'visible' && _vaultKey) {
      resetIdleTimer();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  // beforeunload — 關閉分頁時清除
  const unloadHandler = () => {
    _vaultKey = null;
  };
  window.addEventListener('beforeunload', unloadHandler);

  resetIdleTimer();

  return () => {
    events.forEach(e => window.removeEventListener(e, handler));
    document.removeEventListener('visibilitychange', visibilityHandler);
    window.removeEventListener('beforeunload', unloadHandler);
    clearIdleTimer();
  };
}
