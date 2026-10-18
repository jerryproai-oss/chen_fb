import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { Prisma } from '@prisma/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/media/pool
 *
 * 媒體池：取得媒體檔案列表
 * scope=journal: 使用者自己所有未刪除貼文的媒體
 * scope=family: 使用者可見的 FAMILY/SELECTED 已發布貼文的媒體
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  const scope = searchParams.get('scope') || 'journal';
  if (!['journal', 'family'].includes(scope)) {
    return NextResponse.json(
      { error: '無效的 scope，可用值：journal, family' },
      { status: 400 },
    );
  }

  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '30', 10) || 30, 1), 100);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // Build where condition based on scope
  let postWhere: Prisma.PostWhereInput;

  if (scope === 'journal') {
    // 自己的所有未刪除貼文
    postWhere = {
      authorId: user.id,
      deletedAt: null,
    };
  } else {
    // family: 可見的已發布 FAMILY/SELECTED 貼文
    postWhere = {
      deletedAt: null,
      status: 'PUBLISHED',
      OR: [
        { visibility: 'FAMILY' },
        {
          visibility: 'SELECTED',
          authorId: user.id,
        },
        {
          visibility: 'SELECTED',
          audiences: {
            some: { userId: user.id },
          },
        },
      ],
    };
  }

  const media = await prisma.postMedia.findMany({
    where: {
      post: postWhere,
      postId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    include: {
      post: {
        select: {
          id: true,
          title: true,
          recordDate: true,
          author: {
            select: {
              displayName: true,
            },
          },
        },
      },
    },
  });

  const hasMore = media.length > limit;
  const resultItems = hasMore ? media.slice(0, limit) : media;
  const nextCursor = hasMore ? resultItems[resultItems.length - 1].id : null;

  return NextResponse.json({
    items: resultItems.map((m) => ({
      id: m.id,
      url: `/api/media/${m.id}`,
      filename: m.filename,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      width: m.width,
      height: m.height,
      postId: m.post!.id,
      postTitle: m.post!.title,
      recordDate: m.post!.recordDate,
      authorName: m.post!.author.displayName,
    })),
    nextCursor,
    hasMore,
  });
});
