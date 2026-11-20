import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/car/notifications/unread-count
 *
 * 未讀通知數量
 */
export const GET = withAuth(async ({ user }) => {
  try {
    const count = await prisma.carNotification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    console.error('[GET /api/car/notifications/unread-count] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得未讀數量' }, { status: 500 });
  }
});
