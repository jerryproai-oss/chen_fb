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
