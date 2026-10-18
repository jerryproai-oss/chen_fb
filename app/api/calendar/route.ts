import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { FamilyEventItem } from '@/lib/types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const VALID_RECURRING_TYPES = ['YEARLY', 'MONTHLY', 'WEEKLY'] as const;

/**
 * GET /api/calendar?year=2026&month=10
 *
 * 取得指定年月的家庭事件（包含當月事件與循環事件）
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const yearParam = searchParams.get('year');
  const monthParam = searchParams.get('month');

  const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();
  const targetMonth = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;

  if (isNaN(targetYear) || targetYear < 1970 || targetYear > 2100) {
    return NextResponse.json({ error: '無效的年份' }, { status: 400 });
  }

  if (isNaN(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    return NextResponse.json({ error: '無效的月份（需為 1 至 12）' }, { status: 400 });
  }

  const startOfMonth = new Date(Date.UTC(targetYear, targetMonth - 1, 1));
  const endOfMonth = new Date(Date.UTC(targetYear, targetMonth, 0, 23, 59, 59, 999));

  try {
    const [rangeEvents, recurringEvents] = await Promise.all([
      prisma.familyEvent.findMany({
        where: {
          isRecurring: false,
          eventDate: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
        include: {
          author: {
            select: { displayName: true, avatarUrl: true },
          },
        },
        orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
      }),
      prisma.familyEvent.findMany({
        where: {
          isRecurring: true,
        },
        include: {
          author: {
            select: { displayName: true, avatarUrl: true },
          },
        },
        orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
      }),
    ]);

    const formattedEvents: FamilyEventItem[] = [];

    // 處理非循環事件
    for (const ev of rangeEvents) {
      formattedEvents.push({
        id: ev.id,
        authorId: ev.authorId,
        author: ev.author,
        title: ev.title,
        description: ev.description,
        eventDate: ev.eventDate.toISOString().split('T')[0],
        eventTime: ev.eventTime,
        isAllDay: ev.isAllDay,
        isRecurring: ev.isRecurring,
        recurringType: ev.recurringType,
      });
    }

    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

    // 處理循環事件
    for (const ev of recurringEvents) {
      const origDate = ev.eventDate;
      const origMonth = origDate.getUTCMonth() + 1;
      const origDay = origDate.getUTCDate();
      const origDayOfWeek = origDate.getUTCDay();

      // 若事件起始日晚於查詢月份結束日，則不顯示
      if (origDate > endOfMonth) continue;

      if (ev.recurringType === 'YEARLY') {
        if (origMonth === targetMonth) {
          const validDay = Math.min(origDay, daysInMonth);
          const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
          formattedEvents.push({
            id: ev.id,
            authorId: ev.authorId,
            author: ev.author,
            title: ev.title,
            description: ev.description,
            eventDate: dateStr,
            eventTime: ev.eventTime,
            isAllDay: ev.isAllDay,
            isRecurring: ev.isRecurring,
            recurringType: ev.recurringType,
          });
        }
      } else if (ev.recurringType === 'MONTHLY') {
        const validDay = Math.min(origDay, daysInMonth);
        const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`;
        formattedEvents.push({
          id: ev.id,
          authorId: ev.authorId,
          author: ev.author,
          title: ev.title,
          description: ev.description,
          eventDate: dateStr,
          eventTime: ev.eventTime,
          isAllDay: ev.isAllDay,
          isRecurring: ev.isRecurring,
          recurringType: ev.recurringType,
        });
      } else if (ev.recurringType === 'WEEKLY') {
        for (let d = 1; d <= daysInMonth; d++) {
          const currentD = new Date(Date.UTC(targetYear, targetMonth - 1, d));
          if (currentD >= origDate && currentD.getUTCDay() === origDayOfWeek) {
            const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            formattedEvents.push({
              id: `${ev.id}_${d}`,
              authorId: ev.authorId,
              author: ev.author,
              title: ev.title,
              description: ev.description,
              eventDate: dateStr,
              eventTime: ev.eventTime,
              isAllDay: ev.isAllDay,
              isRecurring: ev.isRecurring,
              recurringType: ev.recurringType,
            });
          }
        }
      } else {
        if (origDate >= startOfMonth && origDate <= endOfMonth) {
          formattedEvents.push({
            id: ev.id,
            authorId: ev.authorId,
            author: ev.author,
            title: ev.title,
            description: ev.description,
            eventDate: origDate.toISOString().split('T')[0],
            eventTime: ev.eventTime,
            isAllDay: ev.isAllDay,
            isRecurring: ev.isRecurring,
            recurringType: ev.recurringType,
          });
        }
      }
    }

    // 依日期與時間排序
    formattedEvents.sort((a, b) => {
      if (a.eventDate !== b.eventDate) {
        return a.eventDate.localeCompare(b.eventDate);
      }
      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;
      return (a.eventTime || '').localeCompare(b.eventTime || '');
    });

    return NextResponse.json({ events: formattedEvents });
  } catch (error) {
    console.error('[GET /api/calendar] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得行事曆事件' }, { status: 500 });
  }
});

/**
 * POST /api/calendar
 *
 * 建立新行事曆事件
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    title,
    eventDate,
    description,
    eventTime,
    isAllDay = true,
    isRecurring = false,
    recurringType,
  } = body;

  // 驗證 title
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: '標題為必填' }, { status: 400 });
  }
  if (title.trim().length > 100) {
    return NextResponse.json({ error: '標題長度不能超過 100 字' }, { status: 400 });
  }

  // 驗證 eventDate
  if (typeof eventDate !== 'string' || !DATE_PATTERN.test(eventDate)) {
    return NextResponse.json(
      { error: 'eventDate 為必填，格式為 YYYY-MM-DD' },
      { status: 400 },
    );
  }
  const parsedDate = new Date(eventDate + 'T00:00:00Z');
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: '無效的日期' }, { status: 400 });
  }

  // 驗證 eventTime
  if (eventTime !== undefined && eventTime !== null && eventTime !== '') {
    if (typeof eventTime !== 'string' || !TIME_PATTERN.test(eventTime)) {
      return NextResponse.json(
        { error: 'eventTime 格式應為 HH:mm' },
        { status: 400 },
      );
    }
  }

  // 驗證 recurringType
  if (isRecurring && recurringType) {
    if (!VALID_RECURRING_TYPES.includes(recurringType as (typeof VALID_RECURRING_TYPES)[number])) {
      return NextResponse.json(
        { error: '循環週期類型需為 YEARLY, MONTHLY 或 WEEKLY' },
        { status: 400 },
      );
    }
  }

  try {
    const newEvent = await prisma.familyEvent.create({
      data: {
        authorId: user.id,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        eventDate: parsedDate,
        eventTime: typeof eventTime === 'string' && eventTime.trim() !== '' ? eventTime.trim() : null,
        isAllDay: Boolean(isAllDay),
        isRecurring: Boolean(isRecurring),
        recurringType: isRecurring && typeof recurringType === 'string' ? recurringType : null,
      },
      include: {
        author: {
          select: { displayName: true, avatarUrl: true },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_CREATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: newEvent.id,
      outcome: Outcomes.SUCCESS,
    });

    const responseItem: FamilyEventItem = {
      id: newEvent.id,
      authorId: newEvent.authorId,
      author: newEvent.author,
      title: newEvent.title,
      description: newEvent.description,
      eventDate: newEvent.eventDate.toISOString().split('T')[0],
      eventTime: newEvent.eventTime,
      isAllDay: newEvent.isAllDay,
      isRecurring: newEvent.isRecurring,
      recurringType: newEvent.recurringType,
    };

    return NextResponse.json({ event: responseItem }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/calendar] 建立事件失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_CREATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立行事曆事件失敗' }, { status: 500 });
  }
});
