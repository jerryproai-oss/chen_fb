import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { Prisma } from '@prisma/client';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/tags/[slug]/posts
 *
 * 取得指定標籤下所有使用者有權查看的貼文。
 * 支援 cursor-based 分頁。
 *
 * Query params:
 * - cursor: 上一頁最後一篇貼文的 ID
 * - limit: 每頁筆數 (1-50, 預設 20)
 */
export const GET = withAuth(
  async ({ user }, req: NextRequest, routeCtx) => {
    const { slug } = await routeCtx.params;
    const decodedSlug = decodeURIComponent(slug).trim().toLowerCase();

    // ── 查找標籤 ─────────────────────────────────────────
    const tag = await prisma.tag.findFirst({
      where: {
        OR: [
          { slug: decodedSlug },
          { name: decodedSlug },
        ],
      },
    });

    if (!tag) {
      return NextResponse.json(
        { error: '找不到該標籤' },
        { status: 404 },
      );
    }

    // ── 分頁參數 ─────────────────────────────────────────
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limitParam = searchParams.get('limit');
    const limit = Math.min(
      Math.max(parseInt(limitParam || '20', 10) || 20, 1),
      50,
    );

    if (cursor && !UUID_PATTERN.test(cursor)) {
      return NextResponse.json(
        { error: '無效的 cursor 格式' },
        { status: 400 },
      );
    }

    // ── 可見性條件 ───────────────────────────────────────
    // 作者可看自己的所有非刪除貼文；
    // 其他人僅能看已發布的 FAMILY 或在指定觀眾名單中的 SELECTED
    const visibilityCondition: Prisma.PostWhereInput = {
      deletedAt: null,
      tags: {
        some: {
          tagId: tag.id,
        },
      },
      OR: [
        {
          authorId: user.id,
        },
        {
          visibility: 'FAMILY',
          status: 'PUBLISHED',
        },
        {
          visibility: 'SELECTED',
          status: 'PUBLISHED',
          audiences: {
            some: { userId: user.id },
          },
        },
      ],
    };

    // 計算使用者可見的總貼文數
    const totalCount = await prisma.post.count({
      where: visibilityCondition,
    });

    // 查詢貼文
    const posts = await prisma.post.findMany({
      where: visibilityCondition,
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
        tags: {
          include: { tag: true },
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
    });

    const hasMore = posts.length > limit;
    const resultPosts = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? resultPosts[resultPosts.length - 1].id : null;

    return NextResponse.json({
      tag: {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        postCount: totalCount,
      },
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
        reactionSummary: Object.entries(
          p.reactions.reduce<Record<string, number>>((acc, r) => {
            acc[r.type] = (acc[r.type] || 0) + 1;
            return acc;
          }, {}),
        ).map(([type, count]) => ({ type, count })),
        myReaction: p.reactions.find((r) => r.userId === user.id)?.type ?? null,
        media: p.media.map((m) => ({
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
        hasPoll: !!p.poll,
        pinnedAt: p.pinnedAt,
        locationName: p.locationName,
        bgColor: p.bgColor,
        isMilestone: p.isMilestone,
        milestoneType: p.milestoneType,
        tags: p.tags.map((pt) => pt.tag.name),
      })),
      nextCursor,
      hasMore,
    });
  },
);
