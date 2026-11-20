import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/car/conflicts?vehicleId=&startDate=&endDate=&excludeId=
 * 檢查日期範圍是否有衝突預約
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const excludeId = searchParams.get('excludeId');

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      vehicleId,
      status: { in: ['RESERVED', 'OUT'] },
      startDate: { lte: parsedEnd },
      endDate: { gte: parsedStart },
    };
    if (excludeId) {
      where.id = { not: excludeId };
    }

    const conflicts = await prisma.carBooking.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { startDate: 'asc' },
    });

    return NextResponse.json({
      hasConflict: conflicts.length > 0,
      conflicts: conflicts.map((c) => ({
        id: c.id,
        userId: c.userId,
        user: c.user,
        startDate: c.startDate.toISOString().split('T')[0],
        endDate: c.endDate.toISOString().split('T')[0],
        purpose: c.purpose,
        status: c.status,
      })),
    });
  } catch (error) {
    console.error('[GET /api/car/conflicts] 查詢失敗:', error);
    return NextResponse.json({ error: '檢查衝突失敗' }, { status: 500 });
  }
});
