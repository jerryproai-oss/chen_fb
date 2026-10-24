import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/posts/trash
 *
 * 列出已軟刪除的貼文（資源回收桶）。
 * - 管理員 (ADMIN) 可看到所有人的已刪除貼文
 * - 一般使用者只能看到自己的
 * - 支援 cursor 分頁
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const cursor = searchParams.get('cursor');

  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

  // 基礎查詢條件：deletedAt 不為 null
  const where: Record<string, unknown> = {
    deletedAt: { not: null },
  };

  // 非管理員只能看到自己的
  if (user.role !== 'ADMIN') {
    where.authorId = user.id;
  }

  // cursor 分頁
  if (cursor) {
    where.deletedAt = { not: null, lt: new Date(cursor) };
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { deletedAt: 'desc' },
    take: limit + 1,
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      _count: {
        select: {
          media: true,
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const resultPosts = hasMore ? posts.slice(0, limit) : posts;
  const nextCursor = hasMore && resultPosts.length > 0
    ? (resultPosts[resultPosts.length - 1].deletedAt as Date).toISOString()
    : null;

  return NextResponse.json({
    posts: resultPosts.map((post) => ({
      id: post.id,
      title: post.title,
      author: post.author,
      authorId: post.authorId,
      recordDate: post.recordDate,
      deletedAt: post.deletedAt,
      mediaCount: post._count.media,
      visibility: post.visibility,
      status: post.status,
    })),
    nextCursor,
    hasMore,
  });
});
