import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { Session, User } from '@prisma/client';
import { COOKIE_NAME, validateSession } from '@/lib/auth/session';

// ── 型別定義 ─────────────────────────────────────────────────

/** 已驗證的請求上下文，包含使用者與 session 資訊 */
export type AuthenticatedContext = {
  user: User;
  session: Session;
};

// ── 自訂錯誤 ─────────────────────────────────────────────────

/**
 * 認證/授權失敗時拋出的錯誤。
 * 攜帶 HTTP status code 與 JSON 回應，方便 API route 統一處理。
 */
export class AuthError extends Error {
  public readonly status: number;
  public readonly response: NextResponse;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.response = NextResponse.json(
      { error: message },
      { status },
    );
  }
}

// ── 中間件函數 ───────────────────────────────────────────────

/**
 * 驗證當前請求的身份。
 * 從 httpOnly cookie 取出 session token 並驗證。
 *
 * @returns 已驗證的使用者與 session
 * @throws {AuthError} 401 — 未登入或 session 已失效
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const { user, session } = await requireAuth();
 *   // ...
 * }
 * ```
 */
export async function requireAuth(): Promise<AuthenticatedContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    throw new AuthError(401, '未登入');
  }

  const result = await validateSession(token);

  if (!result) {
    throw new AuthError(401, '登入已過期，請重新登入');
  }

  return result;
}

/**
 * 驗證當前請求的身份，並要求使用者為 ADMIN 角色。
 *
 * @returns 已驗證的管理員使用者與 session
 * @throws {AuthError} 401 — 未登入或 session 已失效
 * @throws {AuthError} 403 — 權限不足
 *
 * @example
 * ```ts
 * export async function POST() {
 *   const { user } = await requireAdmin();
 *   // 只有管理員能執行到這裡
 * }
 * ```
 */
export async function requireAdmin(): Promise<AuthenticatedContext> {
  const ctx = await requireAuth();

  if (ctx.user.role !== 'ADMIN') {
    throw new AuthError(403, '權限不足');
  }

  return ctx;
}

/**
 * 嘗試取得當前登入的使用者資訊。
 * 與 requireAuth 不同，此函數不會拋出錯誤，
 * 適用於可選認證的場景。
 *
 * @returns 已驗證的使用者與 session，或未登入時回傳 null
 *
 * @example
 * ```ts
 * const ctx = await getCurrentUser();
 * if (ctx) {
 *   // 已登入
 * } else {
 *   // 未登入
 * }
 * ```
 */
export async function getCurrentUser(): Promise<AuthenticatedContext | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    if (!token) return null;

    return await validateSession(token);
  } catch {
    return null;
  }
}

// ── Route Handler Wrapper ────────────────────────────────────

/**
 * Route handler 的型別定義。
 * Next.js App Router route handler 的第二個參數包含動態路由 params。
 */
type RouteContext = { params: Promise<Record<string, string>> };

/**
 * 包裝需要認證的 route handler。
 * 自動執行 requireAuth()，並在 AuthError 時回傳正確的 HTTP status。
 *
 * @example
 * ```ts
 * export const GET = withAuth(async ({ user }, _req) => {
 *   return NextResponse.json({ user });
 * });
 * ```
 */
export function withAuth(
  handler: (ctx: AuthenticatedContext, req: NextRequest, routeCtx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, routeCtx: RouteContext) => {
    try {
      const ctx = await requireAuth();
      return await handler(ctx, req, routeCtx);
    } catch (e) {
      if (e instanceof AuthError) return e.response;
      throw e;
    }
  };
}

/**
 * 包裝需要管理員權限的 route handler。
 * 自動執行 requireAdmin()，並在 AuthError 時回傳正確的 HTTP status。
 *
 * @example
 * ```ts
 * export const POST = withAdmin(async ({ user }, req) => {
 *   const body = await req.json();
 *   // 只有管理員能執行到這裡
 *   return NextResponse.json({ success: true });
 * });
 * ```
 */
export function withAdmin(
  handler: (ctx: AuthenticatedContext, req: NextRequest, routeCtx: RouteContext) => Promise<NextResponse>,
) {
  return async (req: NextRequest, routeCtx: RouteContext) => {
    try {
      const ctx = await requireAdmin();
      return await handler(ctx, req, routeCtx);
    } catch (e) {
      if (e instanceof AuthError) return e.response;
      throw e;
    }
  };
}
