import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canViewPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/posts/[id]/bookmark
 *
 * 檢查目前使用者是否已收藏指定貼文。
 * 回傳 { bookmarked: boolean }
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  const bookmark = await prisma.postBookmark.findUnique({
    where: {
      postId_userId: {
        postId: id,
        userId: user.id,
      },
    },
  });

  return NextResponse.json({ bookmarked: !!bookmark });
});

/**
 * PUT /api/posts/[id]/bookmark
 *
 * 收藏貼文（若已存在則忽略）。
 * 需有貼文閱讀權限。
 */
export const PUT = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.BOOKMARK_CREATE,
      resourceType: ResourceTypes.BOOKMARK,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  await prisma.postBookmark.upsert({
    where: {
      postId_userId: {
        postId: id,
        userId: user.id,
      },
    },
    create: {
      postId: id,
      userId: user.id,
    },
    update: {},
  });

  await logAudit({
    actorId: user.id,
    action: AuditActions.BOOKMARK_CREATE,
    resourceType: ResourceTypes.BOOKMARK,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ bookmarked: true });
});

/**
 * DELETE /api/posts/[id]/bookmark
 *
 * 取消收藏指定貼文。
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      audiences: { select: { userId: true } },
    },
  });

  if (!post) {
    return NextResponse.json(
      { error: '貼文不存在' },
      { status: 404 },
    );
  }

  const audienceUserIds = post.audiences.map((a) => a.userId);
  if (!canViewPost(user, post, audienceUserIds)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.BOOKMARK_DELETE,
      resourceType: ResourceTypes.BOOKMARK,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權存取此貼文' },
      { status: 403 },
    );
  }

  try {
    await prisma.postBookmark.delete({
      where: {
        postId_userId: {
          postId: id,
          userId: user.id,
        },
      },
    });
  } catch {
    // 冪等：若本來就沒有收藏記錄則靜默成功
  }

  await logAudit({
    actorId: user.id,
    action: AuditActions.BOOKMARK_DELETE,
    resourceType: ResourceTypes.BOOKMARK,
    resourceId: id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ bookmarked: false });
});
