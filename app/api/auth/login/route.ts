import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import {
  createSession,
  setSessionCookie,
} from '@/lib/auth/session';
import { checkRateLimit, recordAttempt } from '@/lib/auth/rate-limit';
import { validateOrigin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 每個 IP 在 15 分鐘內最多嘗試登入 10 次 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/login
 *
 * 使用者登入。
 * - 驗證帳號密碼
 * - Rate limit (per IP)
 * - 檢查帳號狀態 & 臨時密碼過期
 * - 建立 session 並設定 httpOnly cookie
 */
export async function POST(request: NextRequest) {
  // ── CSRF Origin 驗證 ────────────────────────────────────
  const originError = validateOrigin(request);
  if (originError) return originError;

  const ip =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';

  // ── Rate limit 檢查 ──────────────────────────────────────
  const rateLimitKey = `login:${ip}`;
  const { allowed, retryAfterMs } = checkRateLimit(
    rateLimitKey,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!allowed) {
    return NextResponse.json(
      { error: '登入嘗試次數過多，請稍後再試' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
        },
      },
    );
  }

  // ── 解析 & 驗證輸入 ─────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { username, password } = body as {
    username?: unknown;
    password?: unknown;
  };

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim().length === 0 ||
    password.length === 0
  ) {
    return NextResponse.json(
      { error: '帳號和密碼為必填' },
      { status: 400 },
    );
  }

  const trimmedUsername = username.trim();

  if (trimmedUsername.length > 30 || password.length > 128) {
    return NextResponse.json(
      { error: '帳號或密碼長度超出限制' },
      { status: 400 },
    );
  }

  // ── 查找使用者 ──────────────────────────────────────────
  const normalizedUsername = trimmedUsername.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { usernameNormalized: normalizedUsername },
  });

  // 不論帳號是否存在，都執行 password verify 以防 timing attack
  if (!user) {
    // 執行一次假的 hash 以消弭時間差
    await hashPassword(password);
    recordAttempt(rateLimitKey, RATE_LIMIT_WINDOW_MS);
    await logAudit({
      action: AuditActions.LOGIN_FAILURE,
      resourceType: ResourceTypes.USER,
      outcome: Outcomes.FAILURE,
      requestId: ip,
    });
    return NextResponse.json(
      { error: '帳號或密碼錯誤' },
      { status: 401 },
    );
  }

  // ── 驗證密碼 ────────────────────────────────────────────
  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    recordAttempt(rateLimitKey, RATE_LIMIT_WINDOW_MS);
    await logAudit({
      actorId: user.id,
      action: AuditActions.LOGIN_FAILURE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.FAILURE,
      requestId: ip,
    });
    return NextResponse.json(
      { error: '帳號或密碼錯誤' },
      { status: 401 },
    );
  }

  // ── 檢查帳號狀態 ───────────────────────────────────────
  if (user.status !== 'ACTIVE') {
    recordAttempt(rateLimitKey, RATE_LIMIT_WINDOW_MS);
    await logAudit({
      actorId: user.id,
      action: AuditActions.LOGIN_FAILURE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.FAILURE,
      requestId: ip,
    });
    return NextResponse.json(
      { error: '帳號或密碼錯誤' },
      { status: 401 },
    );
  }

  // ── 檢查臨時密碼是否過期 ────────────────────────────────
  if (
    user.temporaryPasswordExpiresAt &&
    user.temporaryPasswordExpiresAt < new Date()
  ) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.LOGIN_FAILURE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.FAILURE,
      requestId: ip,
    });
    return NextResponse.json(
      { error: '臨時密碼已過期，請聯絡管理員重設' },
      { status: 401 },
    );
  }

  // ── 建立 session ────────────────────────────────────────
  const { token } = await createSession(user.id, user.passwordVersion);

  // ── 稽核 ────────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.LOGIN_SUCCESS,
    resourceType: ResourceTypes.USER,
    resourceId: user.id,
    outcome: Outcomes.SUCCESS,
    requestId: ip,
  });

  // ── 回應 ────────────────────────────────────────────────
  const responseBody: {
    user: {
      id: string;
      username: string;
      displayName: string;
      role: string;
      mustChangePassword: boolean;
    };
    requirePasswordChange?: boolean;
  } = {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
  };

  if (user.mustChangePassword) {
    responseBody.requirePasswordChange = true;
  }

  const response = NextResponse.json(responseBody, { status: 200 });
  const cookie = setSessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return response;
}
