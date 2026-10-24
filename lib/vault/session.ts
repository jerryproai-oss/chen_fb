import crypto from 'crypto';

// Vault session tokens — in-memory store (cleared on server restart)
const vaultSessions = new Map<string, { ownerId: string; callerId: string; expiresAt: number }>();

// Rate limiting for unlock attempts
const unlockAttempts = new Map<string, { count: number; resetAt: number; lockedUntil: number }>();

export function createVaultSession(ownerId: string, callerId: string): { token: string; expiresAt: number } {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  vaultSessions.set(token, { ownerId, callerId, expiresAt });
  return { token, expiresAt };
}

/**
 * 驗證 vault session token
 * @param token - vault session token
 * @param userId - 呼叫 API 的使用者 ID（或保險庫擁有者 ID）
 * @returns true if valid
 */
export function validateVaultSession(token: string, callerId: string): boolean {
  const session = vaultSessions.get(token);
  if (!session) return false;
  if (session.callerId !== callerId) return false;
  if (Date.now() > session.expiresAt) {
    vaultSessions.delete(token);
    return false;
  }
  // Extend expiry on use
  session.expiresAt = Date.now() + 5 * 60 * 1000;
  return true;
}

/**
 * 取得 vault session 的擁有者 ID
 * 用於共享保險庫：session 綁的是保險庫擁有者，而非操作者
 */
export function getVaultSessionOwnerId(token: string, callerId?: string): string | null {
  const session = vaultSessions.get(token);
  if (!session) return null;
  // 驗證呼叫者身份 — 防止 Token 被竊取後由其他帳號使用
  if (callerId && session.callerId !== callerId) return null;
  if (Date.now() > session.expiresAt) {
    vaultSessions.delete(token);
    return null;
  }
  // Extend expiry on use
  session.expiresAt = Date.now() + 5 * 60 * 1000;
  return session.ownerId;
}

export function revokeVaultSession(token: string): void {
  vaultSessions.delete(token);
}

/**
 * 暴力破解防護 — 指數退避 + 帳號鎖定
 * 5 次失敗 → 鎖定 1 分鐘
 * 10 次失敗 → 鎖定 5 分鐘
 * 15 次失敗 → 鎖定 15 分鐘
 * 20+ 次失敗 → 鎖定 60 分鐘
 */
export function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = unlockAttempts.get(userId);

  if (!record) {
    unlockAttempts.set(userId, { count: 1, resetAt: now + 60_000, lockedUntil: 0 });
    return { allowed: true };
  }

  // 帳號鎖定中
  if (record.lockedUntil && now < record.lockedUntil) {
    return { allowed: false, retryAfter: Math.ceil((record.lockedUntil - now) / 1000) };
  }

  // 鎖定已到期 — 重設視窗但保留累計次數
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.lockedUntil = 0;
    record.resetAt = now + 60_000;
  }

  // 視窗已過期且未鎖定 — 完全重設
  if (now > record.resetAt && !record.lockedUntil) {
    record.count = 1;
    record.resetAt = now + 60_000;
    record.lockedUntil = 0;
    return { allowed: true };
  }

  record.count++;

  // 指數退避鎖定
  if (record.count >= 20) {
    record.lockedUntil = now + 60 * 60_000; // 60 分鐘
    return { allowed: false, retryAfter: 3600 };
  } else if (record.count >= 15) {
    record.lockedUntil = now + 15 * 60_000; // 15 分鐘
    return { allowed: false, retryAfter: 900 };
  } else if (record.count >= 10) {
    record.lockedUntil = now + 5 * 60_000;  // 5 分鐘
    return { allowed: false, retryAfter: 300 };
  } else if (record.count >= 5) {
    record.lockedUntil = now + 60_000;      // 1 分鐘
    return { allowed: false, retryAfter: 60 };
  }

  return { allowed: true };
}

/** 登入成功後重設 rate limit（避免合法使用者被鎖） */
export function resetRateLimit(userId: string): void {
  unlockAttempts.delete(userId);
}
