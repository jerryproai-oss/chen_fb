import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { FamilyEventItem } from '@/lib/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const VALID_RECURRING_TYPES = ['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY'] as const;

function formatEvent(ev: {
  id: string;
  authorId: string;
  author: { displayName: string; avatarUrl: string | null; calendarColor?: string | null };
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
  needsCar: boolean;
  isImportant: boolean;
}): FamilyEventItem {
  return {
    id: ev.id,
    authorId: ev.authorId,
    author: {
      displayName: ev.author.displayName,
      avatarUrl: ev.author.avatarUrl,
      calendarColor: ev.author.calendarColor ?? null,
    },
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
  };
}

/**
 * PATCH /api/calendar/[id]
 *
 * 編輯事件（作者可編輯自己的事件；管理員可編輯任何用車事件）
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的事件 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.familyEvent.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: '找不到該事件' }, { status: 404 });
  }

  const isOwner = existing.authorId === user.id;
  const isAdmin = user.role === 'ADMIN';
  const isCarEvent = existing.needsCar === true;

  // 權限檢查：作者本人 OR 管理員且為用車事件
  if (!isOwner && !(isAdmin && isCarEvent)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_UPDATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有作者可以編輯此事件（管理員可編輯用車事件）' }, { status: 403 });
  }

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
    isAllDay,
    color,
    location,
    isRecurring,
    recurringType,
    recurringEndDate,
    needsCar,
    isImportant,
  } = body;

  const updateData: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '標題不能為空' }, { status: 400 });
    }
    if (title.trim().length > 100) {
      return NextResponse.json({ error: '標題長度不能超過 100 字' }, { status: 400 });
    }
    updateData.title = title.trim();
  }

  if (eventDate !== undefined) {
    if (typeof eventDate !== 'string' || !DATE_PATTERN.test(eventDate)) {
      return NextResponse.json({ error: 'eventDate 格式應為 YYYY-MM-DD' }, { status: 400 });
    }
    const parsedDate = new Date(eventDate + 'T00:00:00Z');
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: '無效的日期' }, { status: 400 });
    }
    updateData.eventDate = parsedDate;
  }

  if (endDate !== undefined) {
    if (endDate === null || endDate === '') {
      updateData.endDate = null;
    } else {
      if (typeof endDate !== 'string' || !DATE_PATTERN.test(endDate)) {
        return NextResponse.json({ error: 'endDate 格式應為 YYYY-MM-DD' }, { status: 400 });
      }
      const parsed = new Date(endDate + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '無效的結束日期' }, { status: 400 });
      }
      updateData.endDate = parsed;
    }
  }

  if (description !== undefined) {
    updateData.description =
      description === null || description === '' ? null : String(description).trim();
  }

  if (eventTime !== undefined) {
    if (eventTime === null || eventTime === '') {
      updateData.eventTime = null;
    } else {
      if (typeof eventTime !== 'string' || !TIME_PATTERN.test(eventTime)) {
        return NextResponse.json({ error: 'eventTime 格式應為 HH:mm' }, { status: 400 });
      }
      updateData.eventTime = eventTime;
    }
  }

  if (endTime !== undefined) {
    if (endTime === null || endTime === '') {
      updateData.endTime = null;
    } else {
      if (typeof endTime !== 'string' || !TIME_PATTERN.test(endTime)) {
        return NextResponse.json({ error: 'endTime 格式應為 HH:mm' }, { status: 400 });
      }
      updateData.endTime = endTime;
    }
  }

  if (isAllDay !== undefined) {
    updateData.isAllDay = Boolean(isAllDay);
  }

  if (color !== undefined) {
    // color 欄位保留向下相容，但不再做 VALID_COLORS 驗證
    // 事件顏色由使用者的 calendarColor 決定
    if (color === null || color === '') {
      updateData.color = user.calendarColor || '#5a7a5a';
    } else if (typeof color === 'string') {
      updateData.color = color;
    }
  }

  if (location !== undefined) {
    if (location === null || location === '') {
      updateData.location = null;
    } else {
      if (typeof location !== 'string' || location.trim().length > 200) {
        return NextResponse.json({ error: '地點長度不能超過 200 字' }, { status: 400 });
      }
      updateData.location = location.trim();
    }
  }

  if (isRecurring !== undefined) {
    updateData.isRecurring = Boolean(isRecurring);
    if (!updateData.isRecurring) {
      updateData.recurringType = null;
      updateData.recurringEndDate = null;
    }
  }

  if (recurringType !== undefined) {
    if (recurringType === null || recurringType === '') {
      updateData.recurringType = null;
    } else if (
      VALID_RECURRING_TYPES.includes(recurringType as (typeof VALID_RECURRING_TYPES)[number])
    ) {
      updateData.recurringType = recurringType;
    } else {
      return NextResponse.json(
        { error: '循環週期類型需為 YEARLY, MONTHLY, WEEKLY 或 DAILY' },
        { status: 400 },
      );
    }
  }

  if (recurringEndDate !== undefined) {
    if (recurringEndDate === null || recurringEndDate === '') {
      updateData.recurringEndDate = null;
    } else {
      if (typeof recurringEndDate !== 'string' || !DATE_PATTERN.test(recurringEndDate)) {
        return NextResponse.json({ error: 'recurringEndDate 格式應為 YYYY-MM-DD' }, { status: 400 });
      }
      const parsed = new Date(recurringEndDate + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '無效的循環結束日期' }, { status: 400 });
      }
      updateData.recurringEndDate = parsed;
    }
  }

  if (typeof needsCar === 'boolean') {
    updateData.needsCar = needsCar;
  }

  if (typeof isImportant === 'boolean') {
    updateData.isImportant = isImportant;
  }

  try {
    const updated = await prisma.familyEvent.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { displayName: true, avatarUrl: true, calendarColor: true },
        },
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_UPDATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ event: formatEvent(updated) });
  } catch (error) {
    console.error('[PATCH /api/calendar/[id]] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_UPDATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新事件失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/calendar/[id]
 *
 * 刪除事件（作者可刪除自己的事件；管理員可刪除任何用車事件）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的事件 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.familyEvent.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: '找不到該事件' }, { status: 404 });
  }

  const isOwner = existing.authorId === user.id;
  const isAdmin = user.role === 'ADMIN';
  const isCarEvent = existing.needsCar === true;

  // 權限檢查：作者本人 OR 管理員且為用車事件
  if (!isOwner && !(isAdmin && isCarEvent)) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_DELETE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有作者可以刪除此事件（管理員可刪除用車事件）' }, { status: 403 });
  }

  try {
    await prisma.familyEvent.delete({
      where: { id },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_DELETE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/calendar/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_DELETE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除事件失敗' }, { status: 500 });
  }
});
