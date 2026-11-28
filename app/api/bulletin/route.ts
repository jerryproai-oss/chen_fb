import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import type { FamilyEventItem } from '@/lib/types';

/**
 * GET /api/bulletin?days=14
 *
 * 取得未來 N 天內所有重要行程 + 用車排程（含 CarBooking 預約），彙整為首頁資料
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
    // ── 1. 行事曆事件（重要 / 需用車）──────────────────────────
    const events = await prisma.familyEvent.findMany({
      where: {
        OR: [
          { needsCar: true },
          { isImportant: true },
        ],
        eventDate: {
          gte: todayUTC,
          lte: futureDate,
        },
      },
      include: {
        author: {
          select: { displayName: true, avatarUrl: true, calendarColor: true },
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

    // ── 2. 用車模組預約（CarBooking）──────────────────────────
    const bookings = await prisma.carBooking.findMany({
      where: {
        status: { in: ['RESERVED', 'OUT'] },
        // 預約日期範圍與查詢期間有交集
        startDate: { lte: futureDate },
        endDate: { gte: todayUTC },
      },
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, calendarColor: true },
        },
        vehicle: {
          select: { name: true, plateNumber: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    // 將 CarBooking 轉為 FamilyEventItem（整筆連續行程，不拆天）
    const bookingItems: FamilyEventItem[] = bookings.map((b) => {
      const vehicleLabel = b.vehicle.plateNumber
        ? `${b.vehicle.name}（${b.vehicle.plateNumber}）`
        : b.vehicle.name;
      const statusLabel = b.status === 'OUT' ? '🚗 出車中' : '📋 已預約';
      const startStr = b.startDate.toISOString().split('T')[0];
      const endStr = b.endDate.toISOString().split('T')[0];
      const days = Math.round((b.endDate.getTime() - b.startDate.getTime()) / 86400000) + 1;

      return {
        id: `booking-${b.id}`,
        authorId: b.userId,
        author: {
          displayName: b.user.displayName,
          avatarUrl: b.user.avatarUrl,
          calendarColor: b.user.calendarColor,
        },
        title: `${statusLabel} ${vehicleLabel} — ${b.purpose}${days > 1 ? `（${days}天）` : ''}`,
        description: null,
        eventDate: startStr,
        endDate: startStr !== endStr ? endStr : null,
        eventTime: null,
        endTime: null,
        isAllDay: true,
        color: '#1565C0',   // 用車主題色
        location: null,
        isRecurring: false,
        recurringType: null,
        recurringEndDate: null,
        needsCar: true,
        isImportant: false,
      };
    });

    // ── 3. 合併並分類 ─────────────────────────────────────────
    const allItems = [...formattedEvents, ...bookingItems]
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

    const importantEvents = allItems.filter((e) => e.isImportant);
    const carSchedule = allItems.filter((e) => e.needsCar);

    // 找出用車衝突日期（同日 ≥2 個不同使用者的用車事件）
    const carByDate = Object.groupBy(carSchedule, (ev) => ev.eventDate);

    const carConflicts = Object.entries(carByDate)
      .filter(([, evs]) => {
        if (!evs) return false;
        // 同日有 ≥2 個不同使用者的用車事件才算衝突
        const uniqueAuthors = new Set(evs.map((e) => e.authorId));
        return uniqueAuthors.size >= 2;
      })
      .map(([date, evs]) => ({ date, events: evs! }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      events: allItems,
      importantEvents,
      carSchedule,
      carConflicts,
    });
  } catch (error) {
    console.error('[GET /api/bulletin] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得公佈欄資料' }, { status: 500 });
  }
});
