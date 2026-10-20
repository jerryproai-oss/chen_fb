/**
 * Vault 金鑰暫存 — 模組級記憶體變數
 * 不存 sessionStorage，離開頁面或逾時即清除
 */

let _vaultKey: CryptoKey | null = null;

export function setVaultKey(key: CryptoKey): void {
  _vaultKey = key;
}

export function getVaultKey(): CryptoKey | null {
  return _vaultKey;
}

export function clearVaultKey(): void {
  _vaultKey = null;
}
