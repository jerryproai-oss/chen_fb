import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { FamilyEventItem } from '@/lib/types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const VALID_RECURRING_TYPES = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY'] as const;

// Google Calendar 風格的 12 種事件顏色
const VALID_COLORS = [
  '#5a7a5a', // 鼠尾草綠 (預設)
  '#d50000', // 番茄紅
  '#e67c73', // 火鶴粉
  '#f4511e', // 橘柑橙
  '#f6bf26', // 香蕉黃
  '#33b679', // 羅勒綠
  '#039be5', // 孔雀藍
  '#7986cb', // 藍莓紫
  '#8e24aa', // 葡萄紫
  '#616161', // 石墨灰
  '#8b6f47', // 木棕色
  '#3f51b5', // 薰衣草
];

function formatEvent(ev: {
  id: string;
  authorId: string;
  author: { displayName: string; avatarUrl: string | null };
  title: string;
  description: string | null;
  eventDate: Date;
  endDate: Date | null;
  eventTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  color: string | null;
  location: string | null;
  isRecurring: boolean;
  recurringType: string | null;
  recurringEndDate: Date | null;
}, overrideDateStr?: string): FamilyEventItem {
  return {
    id: ev.id,
    authorId: ev.authorId,
    author: ev.author,
    title: ev.title,
    description: ev.description,
    eventDate: overrideDateStr || ev.eventDate.toISOString().split('T')[0],
    endDate: ev.endDate ? ev.endDate.toISOString().split('T')[0] : null,
    eventTime: ev.eventTime,
    endTime: ev.endTime,
    isAllDay: ev.isAllDay,
    color: ev.color,
    location: ev.location,
    isRecurring: ev.isRecurring,
    recurringType: ev.recurringType,
    recurringEndDate: ev.recurringEndDate ? ev.recurringEndDate.toISOString().split('T')[0] : null,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

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

  const authorInclude = { author: { select: { displayName: true, avatarUrl: true } } };

  try {
    const [rangeEvents, recurringEvents] = await Promise.all([
      // 1) 非循環事件：開始日期在當月範圍 OR 跨天事件覆蓋到當月
      prisma.familyEvent.findMany({
        where: {
          isRecurring: false,
          OR: [
            // 事件開始日在當月
            { eventDate: { gte: startOfMonth, lte: endOfMonth } },
            // 跨天事件：開始日在當月之前 但 結束日在當月或之後
            {
              endDate: { gte: startOfMonth },
              eventDate: { lte: endOfMonth },
            },
          ],
        },
        include: authorInclude,
        orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
      }),
      // 2) 循環事件
      prisma.familyEvent.findMany({
        where: { isRecurring: true },
        include: authorInclude,
        orderBy: [{ eventDate: 'asc' }, { eventTime: 'asc' }],
      }),
    ]);

    const formattedEvents: FamilyEventItem[] = [];

    // 處理非循環事件
    for (const ev of rangeEvents) {
      formattedEvents.push(formatEvent(ev));
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

      // 檢查循環結束日期
      if (ev.recurringEndDate && ev.recurringEndDate < startOfMonth) continue;

      if (ev.recurringType === 'YEARLY') {
        if (origMonth === targetMonth) {
          const validDay = Math.min(origDay, daysInMonth);
          const dateStr = `${targetYear}-${pad2(targetMonth)}-${pad2(validDay)}`;
          formattedEvents.push(formatEvent(ev, dateStr));
        }
      } else if (ev.recurringType === 'MONTHLY') {
        const validDay = Math.min(origDay, daysInMonth);
        const dateStr = `${targetYear}-${pad2(targetMonth)}-${pad2(validDay)}`;
        // 檢查是否在循環結束日期之前
        const checkDate = new Date(Date.UTC(targetYear, targetMonth - 1, validDay));
        if (ev.recurringEndDate && checkDate > ev.recurringEndDate) continue;
        formattedEvents.push(formatEvent(ev, dateStr));
      } else if (ev.recurringType === 'WEEKLY') {
        for (let d = 1; d <= daysInMonth; d++) {
          const currentD = new Date(Date.UTC(targetYear, targetMonth - 1, d));
          if (currentD >= origDate && currentD.getUTCDay() === origDayOfWeek) {
            if (ev.recurringEndDate && currentD > ev.recurringEndDate) break;
            const dateStr = `${targetYear}-${pad2(targetMonth)}-${pad2(d)}`;
            const item = formatEvent(ev, dateStr);
            item.id = `${ev.id}_${d}`;
            formattedEvents.push(item);
          }
        }
      } else if (ev.recurringType === 'DAILY') {
        for (let d = 1; d <= daysInMonth; d++) {
          const currentD = new Date(Date.UTC(targetYear, targetMonth - 1, d));
          if (currentD >= origDate) {
            if (ev.recurringEndDate && currentD > ev.recurringEndDate) break;
            const dateStr = `${targetYear}-${pad2(targetMonth)}-${pad2(d)}`;
            const item = formatEvent(ev, dateStr);
            item.id = `${ev.id}_${d}`;
            formattedEvents.push(item);
          }
        }
      } else {
        // 未知循環類型，當一般事件處理
        if (origDate >= startOfMonth && origDate <= endOfMonth) {
          formattedEvents.push(formatEvent(ev));
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
    endDate,
    description,
    eventTime,
    endTime,
    isAllDay = true,
    color,
    location,
    isRecurring = false,
    recurringType,
    recurringEndDate,
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

  // 驗證 endDate
  let parsedEndDate: Date | null = null;
  if (endDate !== undefined && endDate !== null && endDate !== '') {
    if (typeof endDate !== 'string' || !DATE_PATTERN.test(endDate)) {
      return NextResponse.json({ error: 'endDate 格式應為 YYYY-MM-DD' }, { status: 400 });
    }
    parsedEndDate = new Date(endDate + 'T00:00:00Z');
    if (isNaN(parsedEndDate.getTime())) {
      return NextResponse.json({ error: '無效的結束日期' }, { status: 400 });
    }
    if (parsedEndDate < parsedDate) {
      return NextResponse.json({ error: '結束日期不能早於開始日期' }, { status: 400 });
    }
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

  // 驗證 endTime
  if (endTime !== undefined && endTime !== null && endTime !== '') {
    if (typeof endTime !== 'string' || !TIME_PATTERN.test(endTime)) {
      return NextResponse.json(
        { error: 'endTime 格式應為 HH:mm' },
        { status: 400 },
      );
    }
  }

  // 驗證 color
  if (color !== undefined && color !== null && color !== '') {
    if (typeof color !== 'string' || !VALID_COLORS.includes(color)) {
      return NextResponse.json({ error: '無效的事件顏色' }, { status: 400 });
    }
  }

  // 驗證 recurringType
  if (isRecurring && recurringType) {
    if (!VALID_RECURRING_TYPES.includes(recurringType as (typeof VALID_RECURRING_TYPES)[number])) {
      return NextResponse.json(
        { error: '循環週期類型需為 YEARLY, MONTHLY, WEEKLY 或 DAILY' },
        { status: 400 },
      );
    }
  }

  // 驗證 recurringEndDate
  let parsedRecurringEndDate: Date | null = null;
  if (recurringEndDate !== undefined && recurringEndDate !== null && recurringEndDate !== '') {
    if (typeof recurringEndDate !== 'string' || !DATE_PATTERN.test(recurringEndDate)) {
      return NextResponse.json({ error: 'recurringEndDate 格式應為 YYYY-MM-DD' }, { status: 400 });
    }
    parsedRecurringEndDate = new Date(recurringEndDate + 'T00:00:00Z');
    if (isNaN(parsedRecurringEndDate.getTime())) {
      return NextResponse.json({ error: '無效的循環結束日期' }, { status: 400 });
    }
  }

  // 驗證 location
  if (location !== undefined && location !== null) {
    if (typeof location !== 'string' || location.trim().length > 200) {
      return NextResponse.json({ error: '地點長度不能超過 200 字' }, { status: 400 });
    }
  }

  try {
    const newEvent = await prisma.familyEvent.create({
      data: {
        authorId: user.id,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : null,
        eventDate: parsedDate,
        endDate: parsedEndDate,
        eventTime: typeof eventTime === 'string' && eventTime.trim() !== '' ? eventTime.trim() : null,
        endTime: typeof endTime === 'string' && endTime.trim() !== '' ? endTime.trim() : null,
        isAllDay: Boolean(isAllDay),
        color: typeof color === 'string' && color.trim() !== '' ? color.trim() : '#5a7a5a',
        location: typeof location === 'string' && location.trim() !== '' ? location.trim() : null,
        isRecurring: Boolean(isRecurring),
        recurringType: isRecurring && typeof recurringType === 'string' ? recurringType : null,
        recurringEndDate: parsedRecurringEndDate,
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

    return NextResponse.json({ event: formatEvent(newEvent) }, { status: 201 });
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
