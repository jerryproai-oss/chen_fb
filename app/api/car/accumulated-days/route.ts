import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/car/accumulated-days?vehicleId=&startDate=&endDate=
 * 查詢指定期間內各使用者的已完成用車天數
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!vehicleId) {
    return NextResponse.json({ error: '車輛 ID 為必填' }, { status: 400 });
  }
  if (!startDate || !DATE_PATTERN.test(startDate)) {
    return NextResponse.json({ error: '開始日期為必填，格式 YYYY-MM-DD' }, { status: 400 });
  }
  if (!endDate || !DATE_PATTERN.test(endDate)) {
    return NextResponse.json({ error: '結束日期為必填，格式 YYYY-MM-DD' }, { status: 400 });
  }

  const parsedStart = new Date(startDate + 'T00:00:00Z');
  const parsedEnd = new Date(endDate + 'T00:00:00Z');

  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return NextResponse.json({ error: '無效的日期' }, { status: 400 });
  }

  try {
    // 查詢指定期間內已完成的預約
    const bookings = await prisma.carBooking.findMany({
      where: {
        vehicleId,
        status: 'COMPLETED',
        startDate: { lte: parsedEnd },
        endDate: { gte: parsedStart },
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, familyRole: true } },
      },
    });

    // 彙總各使用者的天數
    const userDaysMap = new Map<string, {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
      familyRole: string | null;
      totalDays: number;
      bookingCount: number;
    }>();

    for (const b of bookings) {
      const existing = userDaysMap.get(b.userId);
      if (existing) {
        existing.totalDays += b.countedDays;
        existing.bookingCount += 1;
      } else {
        userDaysMap.set(b.userId, {
          userId: b.userId,
          displayName: b.user.displayName,
          avatarUrl: b.user.avatarUrl,
          familyRole: b.user.familyRole,
          totalDays: b.countedDays,
          bookingCount: 1,
        });
      }
    }

    const userDays = Array.from(userDaysMap.values()).sort((a, b) => b.totalDays - a.totalDays);
    const grandTotal = userDays.reduce((sum, u) => sum + u.totalDays, 0);

    return NextResponse.json({
      vehicleId,
      periodStart: startDate,
      periodEnd: endDate,
      grandTotal,
      userDays,
    });
  } catch (error) {
    console.error('[GET /api/car/accumulated-days] 查詢失敗:', error);
    return NextResponse.json({ error: '查詢累計天數失敗' }, { status: 500 });
  }
});
