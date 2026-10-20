import crypto from 'crypto';

// Vault session tokens — in-memory store (cleared on server restart)
const vaultSessions = new Map<string, { userId: string; expiresAt: number }>();

// Rate limiting for unlock attempts
const unlockAttempts = new Map<string, { count: number; resetAt: number }>();

export function createVaultSession(userId: string): { token: string; expiresAt: number } {
  const token = crypto.randomUUID();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
  vaultSessions.set(token, { userId, expiresAt });
  return { token, expiresAt };
}

/**
 * 驗證 vault session token
 * @param token - vault session token
 * @param userId - 呼叫 API 的使用者 ID（或保險庫擁有者 ID）
 * @returns true if valid
 */
export function validateVaultSession(token: string, userId: string): boolean {
  const session = vaultSessions.get(token);
  if (!session) return false;
  if (session.userId !== userId) return false;
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
export function getVaultSessionOwnerId(token: string): string | null {
  const session = vaultSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    vaultSessions.delete(token);
    return null;
  }
  // Extend expiry on use
  session.expiresAt = Date.now() + 5 * 60 * 1000;
  return session.userId;
}

export function revokeVaultSession(token: string): void {
  vaultSessions.delete(token);
}

export function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = unlockAttempts.get(userId);
  
  if (!record || now > record.resetAt) {
    unlockAttempts.set(userId, { count: 1, resetAt: now + 60_000 });
    return { allowed: true };
  }
  
  if (record.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((record.resetAt - now) / 1000) };
  }
  
  record.count++;
  return { allowed: true };
}
