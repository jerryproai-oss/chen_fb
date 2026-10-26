import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import type { FamilyEventItem } from '@/lib/types';

/**
 * GET /api/bulletin?days=14
 *
 * 取得未來 N 天內所有重要行程 + 用車排程，彙整為公佈欄資料
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const daysParam = searchParams.get('days');
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam, 10), 1), 366) : 14;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const futureDate = new Date(todayUTC);
  futureDate.setUTCDate(futureDate.getUTCDate() + days);

  try {
    const events = await prisma.familyEvent.findMany({
      where: {
        OR: [
          { needsCar: true },
          { isImportant: true },
        ],
        // 事件日期在今天到未來 N 天之間
        eventDate: {
          gte: todayUTC,
          lte: futureDate,
        },
      },
      include: {
        author: {
          select: { displayName: true, avatarUrl: true },
        },
      },
      orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
    });

    const formatEvent = (ev: typeof events[number]): FamilyEventItem => ({
      id: ev.id,
      authorId: ev.authorId,
      author: ev.author,
      title: ev.title,
      description: ev.description,
      eventDate: ev.eventDate.toISOString().split('T')[0],
      endDate: ev.endDate ? ev.endDate.toISOString().split('T')[0] : null,
      eventTime: ev.eventTime,
      endTime: ev.endTime,
      isAllDay: ev.isAllDay,
      color: ev.color,
      location: ev.location,
      isRecurring: ev.isRecurring,
      recurringType: ev.recurringType,
      recurringEndDate: ev.recurringEndDate ? ev.recurringEndDate.toISOString().split('T')[0] : null,
      needsCar: ev.needsCar,
      isImportant: ev.isImportant,
    });

    const formattedEvents = events.map(formatEvent);

    // 分類
    const importantEvents = formattedEvents.filter((e) => e.isImportant);
    const carSchedule = formattedEvents.filter((e) => e.needsCar);

    // 找出用車衝突日期（同日 ≥2 個用車事件）
    const carByDate: Record<string, FamilyEventItem[]> = {};
    for (const ev of carSchedule) {
      if (!carByDate[ev.eventDate]) carByDate[ev.eventDate] = [];
      carByDate[ev.eventDate].push(ev);
    }

    const carConflicts = Object.entries(carByDate)
      .filter(([, evs]) => evs.length >= 2)
      .map(([date, evs]) => ({ date, events: evs }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      events: formattedEvents,
      importantEvents,
      carSchedule,
      carConflicts,
    });
  } catch (error) {
    console.error('[GET /api/bulletin] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得公佈欄資料' }, { status: 500 });
  }
});
