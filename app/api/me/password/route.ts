import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuthAllowRestricted } from '@/lib/auth/middleware';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 新密碼最小長度 */
const MIN_PASSWORD_LENGTH = 8;
/** 新密碼最大長度 */
const MAX_PASSWORD_LENGTH = 128;

/**
 * PUT /api/me/password
 *
 * 修改目前使用者自己的密碼。
 * - 驗證舊密碼
 * - 新密碼長度至少 8 字
 * - 更新 passwordHash、passwordVersion、passwordChangedAt
 * - 清除 mustChangePassword & temporaryPasswordExpiresAt
 * - 撤銷所有其他 session (保留目前這個)
 * - 同步更新目前 session 的 passwordVersion
 */
export const PUT = withAuthAllowRestricted(async ({ user, session }, request) => {
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

  const { currentPassword, newPassword } = body as {
    currentPassword?: unknown;
    newPassword?: unknown;
  };

  if (
    typeof currentPassword !== 'string' ||
    typeof newPassword !== 'string' ||
    currentPassword.length === 0 ||
    newPassword.length === 0
  ) {
    return NextResponse.json(
      { error: '目前密碼和新密碼為必填' },
      { status: 400 },
    );
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `新密碼長度至少 ${MIN_PASSWORD_LENGTH} 個字元` },
      { status: 400 },
    );
  }

  if (newPassword.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: '新密碼長度超出限制' },
      { status: 400 },
    );
  }

  // ── 驗證目前密碼 ───────────────────────────────────────
  const passwordValid = await verifyPassword(
    user.passwordHash,
    currentPassword,
  );

  if (!passwordValid) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.PASSWORD_CHANGE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json(
      { error: '目前密碼不正確' },
      { status: 401 },
    );
  }

  // ── 雜湊新密碼 & 更新 ──────────────────────────────────
  const newHash = await hashPassword(newPassword);

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordVersion: { increment: 1 },
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
    },
  });

  // ── 撤銷所有其他 session ────────────────────────────────
  await revokeAllUserSessions(user.id, session.id);

  // ── 同步更新目前 session 的 passwordVersion ─────────────
  // 避免 validateSession 檢查 passwordVersion 不一致而失效
  await prisma.session.update({
    where: { id: session.id },
    data: { passwordVersion: updatedUser.passwordVersion },
  });

  // ── 稽核 ────────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.PASSWORD_CHANGE,
    resourceType: ResourceTypes.USER,
    resourceId: user.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true }, { status: 200 });
});
