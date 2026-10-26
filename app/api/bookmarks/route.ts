import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { canViewPost } from '@/lib/policy/post-authorization';
import type { Prisma } from '@prisma/client';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/bookmarks
 *
 * 取得目前使用者的所有收藏手札（含貼文摘要），支援 cursor-based 分頁。
 * 僅回傳目前使用者仍有權限查看的貼文。
 *
 * Query params:
 * - cursor: 上一頁最後一篇貼文的 ID
 * - limit: 每頁筆數 (1-50, 預設 20)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 分頁參數 ────────────────────────────────────────
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // 檢查 cursor 是否存在
  let hasValidCursor = false;
  if (cursor) {
    const cursorBookmark = await prisma.postBookmark.findUnique({
      where: {
        postId_userId: {
          postId: cursor,
          userId: user.id,
        },
      },
    });
    if (cursorBookmark) {
      hasValidCursor = true;
    }
  }

  // ── 查詢條件 ────────────────────────────────────────
  // 1. 屬於目前使用者
  // 2. 貼文未被刪除
  // 3. 貼文可見度權限檢查：作者本人 OR 已發布家庭動態 OR 已發布指定家人且包含自己
  const where: Prisma.PostBookmarkWhereInput = {
    userId: user.id,
    post: {
      deletedAt: null,
      OR: [
        { authorId: user.id },
        {
          status: 'PUBLISHED',
          visibility: 'FAMILY',
        },
        {
          status: 'PUBLISHED',
          visibility: 'SELECTED',
          audiences: {
            some: { userId: user.id },
          },
        },
      ],
    },
  };

  const bookmarks = await prisma.postBookmark.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(hasValidCursor && cursor
      ? {
          cursor: {
            postId_userId: {
              postId: cursor,
              userId: user.id,
            },
          },
          skip: 1,
        }
      : {}),
    include: {
      post: {
        include: {
          author: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          audiences: {
            select: { userId: true },
          },
          media: {
            orderBy: { sortOrder: 'asc' },
          },
          poll: {
            select: { id: true },
          },
          reactions: {
            select: { type: true, userId: true },
          },
          _count: {
            select: {
              comments: { where: { deletedAt: null } },
              reactions: true,
            },
          },
        },
      },
    },
  });

  // 以 canViewPost 作雙重保險確認權限
  const validBookmarks = bookmarks.filter((b) => {
    const audienceIds = b.post.audiences.map((a) => a.userId);
    return canViewPost(user, b.post, audienceIds);
  });

  const hasMore = validBookmarks.length > limit;
  const resultBookmarks = hasMore ? validBookmarks.slice(0, limit) : validBookmarks;
  const nextCursor =
    hasMore && resultBookmarks.length > 0
      ? resultBookmarks[resultBookmarks.length - 1].postId
      : null;

  return NextResponse.json({
    posts: resultBookmarks.map((b) => ({
      id: b.post.id,
      authorId: b.post.authorId,
      author: b.post.author,
      recordDate: b.post.recordDate,
      title: b.post.title,
      subtitle: b.post.subtitle,
      bodyJson: b.post.bodyJson,
      bodyPlainText: b.post.bodyPlainText,
      visibility: b.post.visibility,
      status: b.post.status,
      version: b.post.version,
      publishedAt: b.post.publishedAt,
      createdAt: b.post.createdAt,
      updatedAt: b.post.updatedAt,
      audienceUserIds: b.post.audiences.map((a) => a.userId),
      commentCount: b.post._count.comments,
      reactionCount: b.post._count.reactions,
      reactionSummary: Object.entries(
        b.post.reactions.reduce<Record<string, number>>((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {}),
      ).map(([type, count]) => ({ type, count })),
      myReaction: b.post.reactions.find((r) => r.userId === user.id)?.type ?? null,
      media: b.post.media.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        filename: m.filename,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        caption: m.caption,
        takenAt: m.takenAt,
        sortOrder: m.sortOrder,
      })),
      hasPoll: !!b.post.poll,
      isBookmarked: true,
    })),
    nextCursor,
    hasMore,
  });
});
