import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAdmin } from '@/lib/auth/middleware';
import { revokeAllUserSessions } from '@/lib/auth/session';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canDisableUser } from '@/lib/policy/authorization';

/**
 * 將使用者物件轉為安全的回傳格式（排除 passwordHash）。
 */
function sanitizeUser(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  passwordVersion: number;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
    passwordVersion: user.passwordVersion,
    passwordChangedAt: user.passwordChangedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/users/[id]
 *
 * 取得單一使用者詳情（管理員限定）。
 */
export const GET = withAdmin(async (_ctx, _request: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的使用者 ID 格式' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return NextResponse.json(
      { error: '找不到該使用者' },
      { status: 404 },
    );
  }

  return NextResponse.json({ user: sanitizeUser(user) });
});

/**
 * PATCH /api/admin/users/[id]
 *
 * 更新使用者資料（管理員限定）。
 * 可更新欄位：displayName, role, status
 *
 * - 停用使用者時撤銷其所有 session
 * - 不能停用自己
 */
export const PATCH = withAdmin(async ({ user: admin }, request: NextRequest, routeCtx) => {
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

  const { displayName, role, status } = body as {
    displayName?: unknown;
    role?: unknown;
    status?: unknown;
  };

  const updateData: Record<string, unknown> = {};

  // ── 驗證 displayName ───────────────────────────────────
  if (displayName !== undefined) {
    if (
      typeof displayName !== 'string' ||
      displayName.trim().length === 0 ||
      displayName.trim().length > 50
    ) {
      return NextResponse.json(
        { error: '顯示名稱長度需 1-50 字' },
        { status: 400 },
      );
    }
    updateData.displayName = displayName.trim();
  }

  // ── 驗證 role ──────────────────────────────────────────
  if (role !== undefined) {
    const validRoles = ['ADMIN', 'MEMBER'];
    if (typeof role !== 'string' || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: '無效的角色，可用值：ADMIN, MEMBER' },
        { status: 400 },
      );
    }
    updateData.role = role;
  }

  // ── 驗證 status ────────────────────────────────────────
  if (status !== undefined) {
    const validStatuses = ['ACTIVE', 'DISABLED'];
    if (typeof status !== 'string' || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: '無效的狀態，可用值：ACTIVE, DISABLED' },
        { status: 400 },
      );
    }

    // 停用使用者：檢查權限
    if (status === 'DISABLED') {
      if (!canDisableUser(admin, id)) {
        return NextResponse.json(
          { error: '不能停用自己的帳號' },
          { status: 403 },
        );
      }
    }

    updateData.status = status;
  }

  // 至少需要一個欄位
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: '至少需要提供一個要更新的欄位' },
      { status: 400 },
    );
  }

  // ── 停用時先撤銷所有 session（在更新 status 之前）─────────
  // 確保時序正確：先 revoke sessions，再更新 user status
  if (status === 'DISABLED') {
    await revokeAllUserSessions(id);
  }

  // ── 更新使用者 ──────────────────────────────────────────
  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
  });

  // ── 稽核 ────────────────────────────────────────────────
  await logAudit({
    actorId: admin.id,
    action: AuditActions.USER_UPDATE,
    resourceType: ResourceTypes.USER,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ user: sanitizeUser(updatedUser) });
});
