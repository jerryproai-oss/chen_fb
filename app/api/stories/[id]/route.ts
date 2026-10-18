import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * DELETE /api/stories/[id]
 *
 * 刪除自己的限時動態
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的限時動態 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.story.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: '找不到該限時動態' }, { status: 404 });
  }

  if (existing.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.STORY_DELETE,
      resourceType: ResourceTypes.STORY,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有作者可以刪除此限時動態' }, { status: 403 });
  }

  try {
    await prisma.story.delete({
      where: { id },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.STORY_DELETE,
      resourceType: ResourceTypes.STORY,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/stories/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.STORY_DELETE,
      resourceType: ResourceTypes.STORY,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除限時動態失敗' }, { status: 500 });
  }
});
