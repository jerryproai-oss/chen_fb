import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/tags
 *
 * 取得所有標籤（含貼文數量），按使用次數排序。
 *
 * Query params:
 * - q: 搜尋關鍵字（可選）
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { slug: { contains: q.toLowerCase(), mode: 'insensitive' as const } },
        ],
      }
    : undefined;

  const tags = await prisma.tag.findMany({
    where,
    include: {
      _count: {
        select: {
          posts: {
            where: {
              post: {
                deletedAt: null,
              },
            },
          },
        },
      },
    },
  });

  const formatted = tags
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      postCount: t._count.posts,
    }))
    .sort((a, b) => b.postCount - a.postCount);

  return NextResponse.json({ tags: formatted });
});
