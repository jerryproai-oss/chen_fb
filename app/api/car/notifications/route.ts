import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * GET /api/car/notifications
 *
 * 列出用車通知（當前使用者的，分頁）
 * ?page=1&pageSize=20&unreadOnly=false
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10)),
  );
  const unreadOnly = searchParams.get('unreadOnly') === 'true';

  try {
    const where: Record<string, unknown> = { userId: user.id };
    if (unreadOnly) where.isRead = false;

    const [notifications, total] = await Promise.all([
      prisma.carNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.carNotification.count({ where }),
    ]);

    const formatted = notifications.map((n) => ({
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      relatedId: n.relatedId,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json({
      notifications: formatted,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error('[GET /api/car/notifications] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得通知' }, { status: 500 });
  }
});

/**
 * POST /api/car/notifications
 *
 * 標記已讀（批量或單筆）
 * body: { ids: string[] } 或 { id: string } 或 { all: true }
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { id, ids, all } = body;

  try {
    if (all === true) {
      // 標記所有未讀為已讀
      const result = await prisma.carNotification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return NextResponse.json({ updated: result.count });
    }

    // 收集要標記的 IDs
    let targetIds: string[] = [];

    if (typeof id === 'string') {
      targetIds = [id];
    } else if (Array.isArray(ids)) {
      targetIds = ids.filter((i): i is string => typeof i === 'string');
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: '請提供 id、ids 或 all 參數' }, { status: 400 });
    }

    // 只能標記自己的通知
    const result = await prisma.carNotification.updateMany({
      where: {
        id: { in: targetIds },
        userId: user.id,
      },
      data: { isRead: true },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('[POST /api/car/notifications] 標記已讀失敗:', error);
    return NextResponse.json({ error: '標記已讀失敗' }, { status: 500 });
  }
});
