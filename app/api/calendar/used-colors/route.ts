import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/calendar/used-colors
 *
 * 回傳所有使用者已選用的行事曆顏色（供顏色選擇器排除已用顏色）
 */
export const GET = withAuth(async () => {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      displayName: true,
      calendarColor: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    colors: users
      .filter(u => u.calendarColor)
      .map(u => ({
        userId: u.id,
        displayName: u.displayName,
        color: u.calendarColor,
      })),
  });
});
