import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAdmin } from '@/lib/auth/middleware';
import { hashPassword } from '@/lib/auth/password';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 臨時密碼預設存活時間 (秒) */
const TEMP_PASSWORD_TTL_SECONDS = Number(
  process.env.TEMP_PASSWORD_TTL_SECONDS || '86400',
);

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/users/[id]/reset-password
 *
 * 管理員重設使用者密碼。
 * - Body: { temporaryPassword: string }
 * - 更新 passwordHash, mustChangePassword = true
 * - 設定臨時密碼過期時間
 * - 撤銷該使用者所有 session
 */
export const POST = withAdmin(async ({ user: admin }, request: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的使用者 ID 格式' },
      { status: 400 },
    );
  }

  // ── 查找目標使用者 ──────────────────────────────────────
  const targetUser = await prisma.user.findUnique({
    where: { id },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: '找不到該使用者' },
      { status: 404 },
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

  const { temporaryPassword } = body as {
    temporaryPassword?: unknown;
  };

  if (
    typeof temporaryPassword !== 'string' ||
    temporaryPassword.length < 8 ||
    temporaryPassword.length > 128
  ) {
    return NextResponse.json(
      { error: '臨時密碼為必填，長度需 8-128 字元' },
      { status: 400 },
    );
  }

  // ── 雜湊密碼 & 更新使用者 ──────────────────────────────
  const newHash = await hashPassword(temporaryPassword);
  const now = new Date();
  const temporaryPasswordExpiresAt = new Date(
    now.getTime() + TEMP_PASSWORD_TTL_SECONDS * 1000,
  );

  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: newHash,
      passwordVersion: { increment: 1 },
      passwordChangedAt: now,
      mustChangePassword: true,
      temporaryPasswordExpiresAt,
    },
  });

  // ── 撤銷該使用者所有 session ────────────────────────────
  await revokeAllUserSessions(id);

  // ── 稽核 ────────────────────────────────────────────────
  await logAudit({
    actorId: admin.id,
    action: AuditActions.USER_PASSWORD_RESET,
    resourceType: ResourceTypes.USER,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true }, { status: 200 });
});
