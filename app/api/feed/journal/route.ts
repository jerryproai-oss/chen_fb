import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/feed/journal
 *
 * 個人手札：取得自己所有的貼文（含草稿），依 recordDate 降序排列。
 * 支援 cursor-based 分頁。
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

  // ── 查詢自己的所有貼文（含草稿，不含已刪除） ─────────
  const posts = await prisma.post.findMany({
    where: {
      authorId: user.id,
      deletedAt: null,
    },
    orderBy: [
      { recordDate: 'desc' },
      { createdAt: 'desc' },
    ],
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
      audiences: {
        select: { userId: true },
      },
      media: {
        orderBy: { sortOrder: 'asc' },
      },
      _count: {
        select: {
          comments: { where: { deletedAt: null } },
          reactions: true,
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore ? resultPosts[resultPosts.length - 1].id : null;

  return NextResponse.json({
    posts: resultPosts.map((p) => ({
      id: p.id,
      authorId: p.authorId,
      author: p.author,
      recordDate: p.recordDate,
      title: p.title,
      subtitle: p.subtitle,
      bodyJson: p.bodyJson,
      bodyPlainText: p.bodyPlainText,
      visibility: p.visibility,
      status: p.status,
      version: p.version,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      audienceUserIds: p.audiences.map((a) => a.userId),
      commentCount: p._count.comments,
      reactionCount: p._count.reactions,
      media: p.media.map((m) => ({
        id: m.id,
        url: `/api/media/${m.id}`,
        filename: m.filename,
        mimeType: m.mimeType,
        fileSize: m.fileSize,
        width: m.width,
        height: m.height,
        sortOrder: m.sortOrder,
      })),
    })),
    nextCursor,
  });
});
