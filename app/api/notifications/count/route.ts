import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/notifications/count
 *
 * 取得當前使用者的未讀通知數量。
 */
export const GET = withAuth(async ({ user }) => {
  const count = await prisma.notification.count({
    where: {
      userId: user.id,
      isRead: false,
    },
  });

  return NextResponse.json({ count });
});
