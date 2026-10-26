import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

// ── 常數 ─────────────────────────────────────────────────────────────────────

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 共用的 user include */
const USER_SELECT = { user: { select: { displayName: true } } } as const;

// ── PATCH /api/contacts/[id]/share ───────────────────────────────────────────

/**
 * 切換聯絡人共享狀態
 *
 * Body: { isShared: boolean }
 * 僅建立者可操作
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的聯絡人 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '找不到該聯絡人' }, { status: 404 });
  }

  // 僅建立者可切換共享
  if (existing.userId !== user.id) {
    const action = existing.isShared
      ? AuditActions.CONTACT_UNSHARE
      : AuditActions.CONTACT_SHARE;
    await logAudit({
      actorId: user.id,
      action,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有建立者可以變更共享狀態' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { isShared } = body;

  if (typeof isShared !== 'boolean') {
    return NextResponse.json(
      { error: 'isShared 為必填且需為布林值' },
      { status: 400 },
    );
  }

  // 決定稽核動作
  const auditAction = isShared
    ? AuditActions.CONTACT_SHARE
    : AuditActions.CONTACT_UNSHARE;

  try {
    const updated = await prisma.contact.update({
      where: { id },
      data: { isShared },
      include: USER_SELECT,
    });

    await logAudit({
      actorId: user.id,
      action: auditAction,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('[PATCH /api/contacts/[id]/share] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: auditAction,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '變更共享狀態失敗' }, { status: 500 });
  }
});
