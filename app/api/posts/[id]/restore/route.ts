import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/posts/[id]/restore
 *
 * 還原軟刪除的貼文（設定 deletedAt = null）。
 * 權限：只有貼文作者或 ADMIN 可操作。
 */
export const POST = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // 只能還原已軟刪除的貼文
  if (!post.deletedAt) {
    return NextResponse.json(
      { error: '此貼文未被刪除' },
      { status: 400 },
    );
  }

  // 權限檢查：只有作者或 ADMIN 可還原
  if (post.authorId !== user.id && user.role !== 'ADMIN') {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_RESTORE,
      resourceType: ResourceTypes.POST,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權還原此貼文' },
      { status: 403 },
    );
  }

  // 還原貼文
  await prisma.post.update({
    where: { id },
    data: { deletedAt: null },
  });

  // 稽核
  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_RESTORE,
    resourceType: ResourceTypes.POST,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true });
});
