import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { canViewPost, canCommentOnPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 留言最大長度 */
const MAX_COMMENT_LENGTH = 1000;

/**
 * GET /api/posts/[id]/comments
 *
 * 取得指定貼文的留言列表。
 * 需要有貼文的閱讀權限。
 *
 * Query params:
 * - cursor: 上一頁最後一筆留言的 ID
 * - limit: 每頁筆數 (1-100, 預設 50)
 */
export const GET = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // ── 取得貼文並檢查權限 ──────────────────────────────
  const post = await prisma.post.findUnique({
    where: { id: postId },
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

  // ── 分頁參數 ────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 100);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // ── 查詢留言 ────────────────────────────────────────
  const comments = await prisma.comment.findMany({
    where: {
      postId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const hasMore = comments.length > limit;
  const resultComments = hasMore ? comments.slice(0, limit) : comments;
  const nextCursor = hasMore ? resultComments[resultComments.length - 1].id : null;

  return NextResponse.json({
    comments: resultComments.map((c) => ({
      id: c.id,
      postId: c.postId,
      authorId: c.authorId,
      author: c.author,
      bodyText: c.bodyText,
      createdAt: c.createdAt,
    })),
    nextCursor,
  });
});

/**
 * POST /api/posts/[id]/comments
 *
 * 對指定貼文新增留言。
 * 需要有貼文的留言權限（已發布 + 可見）。
 *
 * Body:
 * - bodyText: string (必填, ≤1000 字)
 */
export const POST = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id: postId } = await routeCtx.params;

  if (!UUID_PATTERN.test(postId)) {
    return NextResponse.json(
      { error: '無效的貼文 ID 格式' },
      { status: 400 },
    );
  }

  // ── 取得貼文並檢查權限 ──────────────────────────────
  const post = await prisma.post.findUnique({
    where: { id: postId },
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
  if (!canCommentOnPost(user, post, audienceUserIds)) {
    return NextResponse.json(
      { error: '無權對此貼文留言' },
      { status: 403 },
    );
  }

  // ── 解析 Body ───────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { bodyText } = body as Record<string, unknown>;

  // ── 驗證 bodyText ───────────────────────────────────
  if (typeof bodyText !== 'string' || bodyText.trim().length === 0) {
    return NextResponse.json(
      { error: '留言內容為必填' },
      { status: 400 },
    );
  }

  if (bodyText.trim().length > MAX_COMMENT_LENGTH) {
    return NextResponse.json(
      { error: `留言內容長度上限 ${MAX_COMMENT_LENGTH} 字` },
      { status: 400 },
    );
  }

  // ── 建立留言 ────────────────────────────────────────
  const comment = await prisma.comment.create({
    data: {
      postId,
      authorId: user.id,
      bodyText: bodyText.trim(),
    },
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  // ── 觸發通知（非阻塞） ─────────────────────────────
  if (post.authorId !== user.id) {
    const actorName = user.displayName || '有人';
    prisma.notification
      .create({
        data: {
          userId: post.authorId,
          actorId: user.id,
          type: 'COMMENT',
          title: `${actorName} 在你的手札留言`,
          body:
            comment.bodyText.length > 100
              ? `${comment.bodyText.slice(0, 100)}...`
              : comment.bodyText,
          linkUrl: `/posts/${postId}`,
          resourceId: comment.id,
        },
      })
      .catch((err) => console.error('[notification] 留言通知建立失敗:', err));
  }

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.COMMENT_CREATE,
    resourceType: ResourceTypes.COMMENT,
    resourceId: comment.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json(
    {
      comment: {
        id: comment.id,
        postId: comment.postId,
        authorId: comment.authorId,
        author: comment.author,
        bodyText: comment.bodyText,
        createdAt: comment.createdAt,
      },
    },
    { status: 201 },
  );
});
