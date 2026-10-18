import { NextRequest, NextResponse } from 'next/server';
import {
  COOKIE_NAME,
  validateSession,
  revokeSession,
  deleteSessionCookie,
} from '@/lib/auth/session';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * POST /api/auth/logout
 *
 * 登出目前 session。
 * - 撤銷 session (revokedAt = now)
 * - 刪除 cookie
 * - 未登入也回 200，不洩漏使用者狀態
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (token) {
    const result = await validateSession(token);

    if (result) {
      await revokeSession(result.session.id);

      await logAudit({
        actorId: result.user.id,
        action: AuditActions.LOGOUT,
        resourceType: ResourceTypes.USER,
        resourceId: result.session.id,
        outcome: Outcomes.SUCCESS,
      });
    }
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  const cookie = deleteSessionCookie();
  response.cookies.set(cookie.name, cookie.value, {
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: cookie.path,
    maxAge: cookie.maxAge,
  });

  return response;
}
