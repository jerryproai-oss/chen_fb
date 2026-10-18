import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/notifications
 *
 * 取得當前使用者的通知列表。
 * 支援 cursor-based 分頁。
 *
 * Query params:
 * - cursor: 上一頁最後一筆通知的 ID
 * - limit: 每頁筆數 (1-50, 預設 20)
 * - unread: "true" 僅取得未讀通知
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const unreadOnly = searchParams.get('unread') === 'true';

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

  const where = {
    userId: user.id,
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1,
          }
        : {}),
      include: {
        actor: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    }),
  ]);

  const hasMore = notifications.length > limit;
  const resultNotifications = hasMore
    ? notifications.slice(0, limit)
    : notifications;
  const nextCursor = hasMore
    ? resultNotifications[resultNotifications.length - 1].id
    : null;

  return NextResponse.json({
    notifications: resultNotifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      isRead: n.isRead,
      actorId: n.actorId,
      resourceId: n.resourceId,
      createdAt: n.createdAt.toISOString(),
      actor: n.actor,
    })),
    nextCursor,
    unreadCount,
  });
});
