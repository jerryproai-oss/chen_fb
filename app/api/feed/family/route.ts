import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { Prisma } from '@prisma/client';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/feed/family
 *
 * 家庭動態：取得所有目前使用者可見的已發布、非私人貼文。
 * 包含歷年今日（recordDate 的月日與今天相同、年份不同的貼文）。
 *
 * 可見性規則：
 * - FAMILY：所有 ACTIVE 使用者可見
 * - SELECTED：作者 + 被指定的家人可見
 * - PRIVATE：不顯示在 family feed 中（即使是自己的）
 *
 * 歷年今日：比對 recordDate 的月和日，找出過去年份的同日貼文，
 *           標示「N 年前的今天」。
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

  // ── 構建可見性條件 ──────────────────────────────────
  // Family feed 只顯示 PUBLISHED、非 PRIVATE、未刪除的貼文
  // FAMILY: 所有 ACTIVE 使用者可見
  // SELECTED: 作者自己 或 被指定的家人
  const visibilityCondition: Prisma.PostWhereInput = {
    deletedAt: null,
    status: 'PUBLISHED',
    OR: [
      // FAMILY 可見度：所有人可見
      { visibility: 'FAMILY' },
      // SELECTED 可見度：自己是作者
      {
        visibility: 'SELECTED',
        authorId: user.id,
      },
      // SELECTED 可見度：自己在指定觀眾中
      {
        visibility: 'SELECTED',
        audiences: {
          some: { userId: user.id },
        },
      },
    ],
  };

  // ── 查詢貼文 ────────────────────────────────────────
  const posts = await prisma.post.findMany({
    where: visibilityCondition,
    orderBy: [
      { publishedAt: 'desc' },
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
      tags: {
        include: { tag: true },
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

  // ── 歷年今日 ────────────────────────────────────────
  const now = new Date();
  const todayMonth = now.getMonth() + 1; // 1-12
  const todayDay = now.getDate();
  const currentYear = now.getFullYear();

  // 查找 recordDate 月日與今天相同、年份不同的可見貼文
  // 使用 Prisma 原始查詢來精確比對月和日
  const memoriesRaw = await prisma.$queryRaw<
    Array<{
      id: string;
      author_id: string;
      record_date: Date;
      title: string;
      subtitle: string | null;
      body_json: string | null;
      body_plain_text: string | null;
      visibility: string;
      status: string;
      version: number;
      published_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>
  >`
    SELECT p.id, p.author_id, p.record_date, p.title, p.subtitle,
           p.body_json, p.body_plain_text, p.visibility, p.status,
           p.version, p.published_at, p.created_at, p.updated_at
    FROM posts p
    WHERE p.deleted_at IS NULL
      AND p.status = 'PUBLISHED'
      AND p.visibility != 'PRIVATE'
      AND EXTRACT(MONTH FROM p.record_date) = ${todayMonth}
      AND EXTRACT(DAY FROM p.record_date) = ${todayDay}
      AND EXTRACT(YEAR FROM p.record_date) != ${currentYear}
      AND (
        p.visibility = 'FAMILY'
        OR (p.visibility = 'SELECTED' AND p.author_id = ${user.id}::uuid)
        OR (p.visibility = 'SELECTED' AND EXISTS (
          SELECT 1 FROM post_audiences pa
          WHERE pa.post_id = p.id AND pa.user_id = ${user.id}::uuid
        ))
      )
    ORDER BY p.record_date ASC
    LIMIT 20
  `;

  // 取得 memories 的作者資訊和統計
  const memoryIds = memoriesRaw.map((m) => m.id);

  let memoriesWithDetails: typeof resultPosts = [];

  if (memoryIds.length > 0) {
    memoriesWithDetails = await prisma.post.findMany({
      where: { id: { in: memoryIds } },
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
        tags: {
          include: { tag: true },
        },
        _count: {
          select: {
            comments: { where: { deletedAt: null } },
            reactions: true,
          },
        },
      },
      orderBy: { recordDate: 'asc' },
    });
  }

  const memories = memoriesWithDetails.map((p) => {
    const recordYear = new Date(p.recordDate).getFullYear();
    const yearsAgo = currentYear - recordYear;

    return {
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
      pinnedAt: p.pinnedAt,
      locationName: p.locationName,
      bgColor: p.bgColor,
      isMilestone: p.isMilestone,
      milestoneType: p.milestoneType,
      tags: p.tags.map((pt) => pt.tag.name),
      yearsAgo,
      memoryLabel: `${yearsAgo} 年前的今天`,
    };
  });

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
      pinnedAt: p.pinnedAt,
      locationName: p.locationName,
      bgColor: p.bgColor,
      isMilestone: p.isMilestone,
      milestoneType: p.milestoneType,
      tags: p.tags.map((pt) => pt.tag.name),
    })),
    nextCursor,
    memories,
  });
});
