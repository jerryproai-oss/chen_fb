import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import type { Prisma } from '@prisma/client';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/search
 *
 * 搜尋貼文：支援依關鍵字搜尋標題、副標題與純文字內容。
 *
 * Query params:
 * - q: 搜尋關鍵字 (1-100 字，超過截斷)
 * - scope: 搜尋範圍 ('all' | 'journal' | 'family', 預設 'all')
 * - cursor: 上一頁最後一篇貼文的 ID
 * - limit: 每頁筆數 (1-50, 預設 20)
 *
 * 回傳格式同 FeedResponse: { posts: PostSummary[], nextCursor: string | null, hasMore: boolean }
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 關鍵字處理 ──────────────────────────────────────
  const rawQ = searchParams.get('q') || '';
  const trimmedQ = rawQ.trim();
  const q = trimmedQ.length > 100 ? trimmedQ.slice(0, 100) : trimmedQ;

  // ── 分頁與範圍參數 ──────────────────────────────────
  const scope = (searchParams.get('scope') || 'all').toLowerCase();
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // 關鍵字為空時直接回傳空結果
  if (!q) {
    return NextResponse.json({
      posts: [],
      nextCursor: null,
      hasMore: false,
    });
  }

  // ── 搜尋條件 (ILIKE / contains insensitive) ─────────
  const searchCondition: Prisma.PostWhereInput = {
    OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { subtitle: { contains: q, mode: 'insensitive' } },
      { bodyPlainText: { contains: q, mode: 'insensitive' } },
    ],
  };

  // ── 範圍條件 ────────────────────────────────────────
  let scopeCondition: Prisma.PostWhereInput;

  if (scope === 'journal') {
    // 使用者自己的貼文（含草稿，不含已刪除）
    scopeCondition = {
      authorId: user.id,
      deletedAt: null,
    };
  } else if (scope === 'family') {
    // 使用者可見的已發布家庭貼文（不含 PRIVATE）
    scopeCondition = {
      deletedAt: null,
      status: 'PUBLISHED',
      OR: [
        { visibility: 'FAMILY' },
        { visibility: 'SELECTED', authorId: user.id },
        { visibility: 'SELECTED', audiences: { some: { userId: user.id } } },
      ],
    };
  } else {
    // scope === 'all'
    // 合併自己所有的貼文（含草稿）以及家人可見的已發布貼文
    scopeCondition = {
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
          audiences: { some: { userId: user.id } },
        },
      ],
    };
  }

  const where: Prisma.PostWhereInput = {
    AND: [scopeCondition, searchCondition],
  };

  const posts = await prisma.post.findMany({
    where,
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
      poll: {
        select: { id: true },
      },
      bookmarks: {
        where: { userId: user.id },
        select: { userId: true },
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
      hasPoll: !!p.poll,
      isBookmarked: p.bookmarks && p.bookmarks.length > 0,
    })),
    nextCursor,
    hasMore,
  });
});
