import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/posts/[id]/pin
 *
 * 釘選貼文（置頂）。只有貼文作者可以操作。
 */
export const PUT = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // 取得貼文
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post || post.deletedAt !== null) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // 只有作者可以操作
  if (post.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_PIN,
      resourceType: ResourceTypes.POST,
      resourceId: postId,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '只有作者可以釘選此貼文' },
      { status: 403 },
    );
  }

  const pinnedAt = new Date();
  const updated = await prisma.post.update({
    where: { id: postId },
    data: { pinnedAt },
  });

  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_PIN,
    resourceType: ResourceTypes.POST,
    resourceId: postId,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({
    success: true,
    pinnedAt: updated.pinnedAt,
  });
});

/**
 * DELETE /api/posts/[id]/pin
 *
 * 取消釘選貼文。只有貼文作者可以操作。
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // 取得貼文
  const post = await prisma.post.findUnique({
    where: { id: postId },
  });

  if (!post || post.deletedAt !== null) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  // 只有作者可以操作
  if (post.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.POST_PIN,
      resourceType: ResourceTypes.POST,
      resourceId: postId,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '只有作者可以取消釘選此貼文' },
      { status: 403 },
    );
  }

  await prisma.post.update({
    where: { id: postId },
    data: { pinnedAt: null },
  });

  await logAudit({
    actorId: user.id,
    action: AuditActions.POST_PIN,
    resourceType: ResourceTypes.POST,
    resourceId: postId,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({
    success: true,
    pinnedAt: null,
  });
});
