import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/calendar/car-conflicts?date=YYYY-MM-DD
 *
 * 查詢指定日期所有需要用車的事件，用於衝突偵測
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get('date');

  if (!dateParam || !DATE_PATTERN.test(dateParam)) {
    return NextResponse.json(
      { error: 'date 為必填，格式為 YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const targetDate = new Date(dateParam + 'T00:00:00Z');
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json({ error: '無效的日期' }, { status: 400 });
  }

  try {
    const carEvents = await prisma.familyEvent.findMany({
      where: {
        needsCar: true,
        // 事件日期覆蓋到目標日期
        OR: [
          // 單日事件在目標日
          { eventDate: targetDate, endDate: null },
          { eventDate: targetDate, endDate: targetDate },
          // 跨日事件覆蓋目標日
          {
            eventDate: { lte: targetDate },
            endDate: { gte: targetDate },
          },
          // 單日事件（endDate 未設定）
          { eventDate: targetDate },
        ],
      },
      include: {
        author: {
          select: { displayName: true, avatarUrl: true },
        },
      },
      orderBy: [{ eventTime: 'asc' }],
    });

    const conflicts = carEvents.map((ev) => ({
      id: ev.id,
      title: ev.title,
      author: ev.author,
      authorId: ev.authorId,
      eventDate: ev.eventDate.toISOString().split('T')[0],
      eventTime: ev.eventTime,
      endTime: ev.endTime,
      isAllDay: ev.isAllDay,
    }));

    return NextResponse.json({
      conflicts,
      hasConflict: conflicts.length >= 2,
    });
  } catch (error) {
    console.error('[GET /api/calendar/car-conflicts] 查詢失敗:', error);
    return NextResponse.json({ error: '查詢用車衝突失敗' }, { status: 500 });
  }
});
