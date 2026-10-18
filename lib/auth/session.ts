import { prisma } from '@/lib/db/client';
import crypto from 'node:crypto';
import type { Session, User } from '@prisma/client';

// ── 環境變數設定 ─────────────────────────────────────────────

/** Session 閒置逾時（秒），預設 24 小時 */
const SESSION_IDLE_SECONDS = Number(
  process.env.SESSION_IDLE_SECONDS ?? '86400',
);

/** Session 絕對逾時（秒），預設 7 天 */
const SESSION_MAX_SECONDS = Number(
  process.env.SESSION_MAX_SECONDS ?? '604800',
);

// ── Cookie 設定 ──────────────────────────────────────────────

/** Session cookie 名稱 */
export const COOKIE_NAME = 'shiri_session';

// ── Token 工具函數 ───────────────────────────────────────────

/**
 * 產生一組隨機 session token（UUID v4）。
 *
 * @returns 隨機產生的 UUID 字串
 */
export function generateToken(): string {
  return crypto.randomUUID();
}

/**
 * 將原始 token 以 SHA-256 雜湊，回傳 hex 字串。
 * 只有雜湊後的值會存入資料庫，原始 token 僅透過 cookie 傳給客戶端。
 *
 * @param token - 原始 session token
 * @returns SHA-256 hex 雜湊值
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

// ── Session CRUD ─────────────────────────────────────────────

/**
 * 建立新的 session。
 *
 * 產生隨機 token，將其 SHA-256 雜湊存入資料庫，
 * 並設定 idle timeout 與 absolute timeout。
 *
 * @param userId - 使用者 ID
 * @param passwordVersion - 使用者目前的密碼版本號
 * @returns 原始 token（用於設定 cookie）與 session 紀錄
 */
export async function createSession(
  userId: string,
  passwordVersion: number,
): Promise<{ token: string; session: Session }> {
  const token = generateToken();
  const tokenHashValue = hashToken(token);
  const now = new Date();

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: tokenHashValue,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_SECONDS * 1000),
      absoluteExpiresAt: new Date(
        now.getTime() + SESSION_MAX_SECONDS * 1000,
      ),
      passwordVersion,
    },
  });

  return { token, session };
}

/**
 * 驗證 session token 是否有效。
 *
 * 驗證流程：
 * 1. 以 SHA-256 雜湊 token 後查詢資料庫
 * 2. 檢查 session 是否已撤銷
 * 3. 檢查 idle timeout 與 absolute timeout
 * 4. 檢查使用者狀態是否為 ACTIVE
 * 5. 檢查密碼版本是否一致（密碼變更後舊 session 自動失效）
 * 6. 更新 lastSeenAt 並滑動式延長 expiresAt
 *
 * @param token - 原始 session token（來自 cookie）
 * @returns 驗證成功時回傳 user 與 session，失敗時回傳 null
 */
export async function validateSession(
  token: string,
): Promise<{ user: User; session: Session } | null> {
  const tokenHashValue = hashToken(token);
  const now = new Date();

  // 查詢 session 並一併載入使用者資料
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHashValue },
    include: { user: true },
  });

  if (!session) return null;

  // 已被撤銷
  if (session.revokedAt !== null) return null;

  // 閒置逾時
  if (session.expiresAt <= now) return null;

  // 絕對逾時
  if (session.absoluteExpiresAt <= now) return null;

  // 使用者已停用
  if (session.user.status !== 'ACTIVE') return null;

  // 密碼版本不一致（密碼已變更，此 session 應失效）
  if (session.passwordVersion !== session.user.passwordVersion) return null;

  // 滑動式延長：計算新的 expiresAt，但不超過 absoluteExpiresAt
  const newExpiresAt = new Date(
    now.getTime() + SESSION_IDLE_SECONDS * 1000,
  );
  const cappedExpiresAt =
    newExpiresAt > session.absoluteExpiresAt
      ? session.absoluteExpiresAt
      : newExpiresAt;

  // 更新 lastSeenAt 與 expiresAt
  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: {
      lastSeenAt: now,
      expiresAt: cappedExpiresAt,
    },
  });

  return { user: session.user, session: updatedSession };
}

/**
 * 撤銷單一 session。
 *
 * @param sessionId - 要撤銷的 session ID
 */
export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/**
 * 撤銷指定使用者的所有 session。
 * 可選擇排除目前正在使用的 session（例如變更密碼後保留當前登入）。
 *
 * @param userId - 使用者 ID
 * @param exceptSessionId - 可選，要排除的 session ID
 */
export async function revokeAllUserSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

// ── Cookie 工具函數 ──────────────────────────────────────────

/**
 * 產生設定 session cookie 的選項物件。
 * 設計為 httpOnly、secure、sameSite=lax。
 *
 * @param token - 原始 session token
 * @returns 可直接傳給 cookies().set() 的參數物件
 */
export function setSessionCookie(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_SECONDS,
  };
}

/**
 * 產生刪除 session cookie 的選項物件。
 *
 * @returns 可直接傳給 cookies().set() 或 cookies().delete() 的參數物件
 */
export function deleteSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}
