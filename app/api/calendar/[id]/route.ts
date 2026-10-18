import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { FamilyEventItem } from '@/lib/types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const VALID_RECURRING_TYPES = ['YEARLY', 'MONTHLY', 'WEEKLY'] as const;

/**
 * PATCH /api/calendar/[id]
 *
 * 編輯事件（只有作者可以）
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

  if (existing.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_UPDATE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有作者可以編輯此事件' }, { status: 403 });
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
    description,
    eventTime,
    isAllDay,
    isRecurring,
    recurringType,
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

  if (isAllDay !== undefined) {
    updateData.isAllDay = Boolean(isAllDay);
  }

  if (isRecurring !== undefined) {
    updateData.isRecurring = Boolean(isRecurring);
    if (!updateData.isRecurring) {
      updateData.recurringType = null;
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
        { error: '循環週期類型需為 YEARLY, MONTHLY 或 WEEKLY' },
        { status: 400 },
      );
    }
  }

  try {
    const updated = await prisma.familyEvent.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { displayName: true, avatarUrl: true },
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

    const responseItem: FamilyEventItem = {
      id: updated.id,
      authorId: updated.authorId,
      author: updated.author,
      title: updated.title,
      description: updated.description,
      eventDate: updated.eventDate.toISOString().split('T')[0],
      eventTime: updated.eventTime,
      isAllDay: updated.isAllDay,
      isRecurring: updated.isRecurring,
      recurringType: updated.recurringType,
    };

    return NextResponse.json({ event: responseItem });
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
 * 刪除事件（只有作者可以）
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

  if (existing.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CALENDAR_DELETE,
      resourceType: ResourceTypes.CALENDAR,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有作者可以刪除此事件' }, { status: 403 });
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
