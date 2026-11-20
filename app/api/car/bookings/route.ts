import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = ['RESERVED', 'OUT', 'COMPLETED', 'CANCELLED'] as const;
const VALID_RECURRING_TYPES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;

/**
 * GET /api/car/bookings
 * 列出預約（支援 vehicleId, userId, month/year, status 篩選）
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const userId = searchParams.get('userId');
  const month = searchParams.get('month');
  const year = searchParams.get('year');
  const status = searchParams.get('status');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};

  if (vehicleId) where.vehicleId = vehicleId;
  if (userId) where.userId = userId;
  if (status) {
    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number])) {
      return NextResponse.json({ error: '無效的狀態值' }, { status: 400 });
    }
    where.status = status;
  }

  // 月份篩選
  if (year && month) {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
      return NextResponse.json({ error: '無效的年份或月份' }, { status: 400 });
    }
    const startOfMonth = new Date(Date.UTC(y, m - 1, 1));
    const endOfMonth = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    where.OR = [
      { startDate: { gte: startOfMonth, lte: endOfMonth } },
      { endDate: { gte: startOfMonth }, startDate: { lte: endOfMonth } },
    ];
  }

  try {
    const bookings = await prisma.carBooking.findMany({
      where,
      include: {
        user: {
          select: { id: true, displayName: true, avatarUrl: true, calendarColor: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return NextResponse.json({
      bookings: bookings.map((b) => ({
        id: b.id,
        vehicleId: b.vehicleId,
        userId: b.userId,
        user: b.user,
        startDate: b.startDate.toISOString().split('T')[0],
        endDate: b.endDate.toISOString().split('T')[0],
        applyDays: b.applyDays,
        purpose: b.purpose,
        status: b.status,
        countedDays: b.countedDays,
        startMileage: b.startMileage,
        endMileage: b.endMileage,
        tripDistance: b.tripDistance,
        isRecurring: b.isRecurring,
        recurringType: b.recurringType,
        parentBookingId: b.parentBookingId,
        createdAt: b.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/car/bookings] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得預約列表' }, { status: 500 });
  }
});

/**
 * 檢查日期範圍是否與現有預約衝突
 */
async function checkConflicts(
  vehicleId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
): Promise<{ id: string; userId: string; startDate: Date; endDate: Date }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    vehicleId,
    status: { in: ['RESERVED', 'OUT'] },
    startDate: { lte: endDate },
    endDate: { gte: startDate },
  };
  if (excludeId) {
    where.id = { not: excludeId };
  }

  return prisma.carBooking.findMany({
    where,
    select: { id: true, userId: true, startDate: true, endDate: true },
  });
}

/**
 * 計算兩個日期之間的天數（含首尾）
 */
function calcApplyDays(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * 展開循環預約日期
 */
function expandRecurringDates(
  startDate: Date,
  endDate: Date,
  recurringType: string,
  recurringEndDate: Date,
): { start: Date; end: Date }[] {
  const results: { start: Date; end: Date }[] = [];
  const durationMs = endDate.getTime() - startDate.getTime();

  let currentStart = new Date(startDate);

  // 跳過第一期（父預約本身）
  currentStart = getNextOccurrence(currentStart, recurringType);

  while (currentStart <= recurringEndDate) {
    const currentEnd = new Date(currentStart.getTime() + durationMs);
    if (currentEnd > recurringEndDate) break;
    results.push({ start: new Date(currentStart), end: new Date(currentEnd) });
    currentStart = getNextOccurrence(currentStart, recurringType);
  }

  return results;
}

function getNextOccurrence(date: Date, recurringType: string): Date {
  const next = new Date(date);
  switch (recurringType) {
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'BIWEEKLY':
      next.setUTCDate(next.getUTCDate() + 14);
      break;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    default:
      next.setUTCDate(next.getUTCDate() + 7);
  }
  return next;
}

/**
 * POST /api/car/bookings
 * 新增預約（所有登入使用者皆可）
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { vehicleId, startDate, endDate, purpose,
    isRecurring = false, recurringType, recurringEndDate } = body;

  // 驗證必填
  if (!vehicleId || typeof vehicleId !== 'string') {
    return NextResponse.json({ error: '車輛 ID 為必填' }, { status: 400 });
  }
  if (!startDate || typeof startDate !== 'string' || !DATE_PATTERN.test(startDate)) {
    return NextResponse.json({ error: '開始日期為必填，格式 YYYY-MM-DD' }, { status: 400 });
  }
  if (!endDate || typeof endDate !== 'string' || !DATE_PATTERN.test(endDate)) {
    return NextResponse.json({ error: '結束日期為必填，格式 YYYY-MM-DD' }, { status: 400 });
  }
  if (!purpose || typeof purpose !== 'string' || !purpose.trim()) {
    return NextResponse.json({ error: '用途為必填' }, { status: 400 });
  }

  const parsedStart = new Date(startDate + 'T00:00:00Z');
  const parsedEnd = new Date(endDate + 'T00:00:00Z');

  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return NextResponse.json({ error: '無效的日期' }, { status: 400 });
  }
  if (parsedEnd < parsedStart) {
    return NextResponse.json({ error: '結束日期不能早於開始日期' }, { status: 400 });
  }

  // 確認車輛存在且啟用
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || !vehicle.isActive) {
    return NextResponse.json({ error: '找不到該車輛或已停用' }, { status: 404 });
  }

  // 計算天數
  const applyDays = calcApplyDays(parsedStart, parsedEnd);

  // 檢查衝突
  const conflicts = await checkConflicts(vehicleId, parsedStart, parsedEnd);
  if (conflicts.length > 0) {
    return NextResponse.json({
      error: '該日期範圍與其他預約衝突',
      conflicts: conflicts.map((c) => ({
        id: c.id,
        userId: c.userId,
        startDate: c.startDate.toISOString().split('T')[0],
        endDate: c.endDate.toISOString().split('T')[0],
      })),
    }, { status: 409 });
  }

  // 循環預約驗證
  if (isRecurring) {
    if (!recurringType || !VALID_RECURRING_TYPES.includes(recurringType as typeof VALID_RECURRING_TYPES[number])) {
      return NextResponse.json({ error: '循環類型為必填，需為 WEEKLY / BIWEEKLY / MONTHLY' }, { status: 400 });
    }
    if (!recurringEndDate || typeof recurringEndDate !== 'string' || !DATE_PATTERN.test(recurringEndDate as string)) {
      return NextResponse.json({ error: '循環結束日期為必填，格式 YYYY-MM-DD' }, { status: 400 });
    }
  }

  try {
    // 建立主預約
    const parentBooking = await prisma.carBooking.create({
      data: {
        vehicleId,
        userId: user.id,
        startDate: parsedStart,
        endDate: parsedEnd,
        applyDays,
        purpose: (purpose as string).trim(),
        isRecurring: Boolean(isRecurring),
        recurringType: isRecurring ? (recurringType as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY') : null,
        recurringEndDate: isRecurring && recurringEndDate
          ? new Date((recurringEndDate as string) + 'T00:00:00Z')
          : null,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, calendarColor: true } },
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const childBookings: any[] = [];

    // 展開循環子預約
    if (isRecurring && recurringEndDate) {
      const parsedRecEnd = new Date((recurringEndDate as string) + 'T00:00:00Z');
      const occurrences = expandRecurringDates(parsedStart, parsedEnd, recurringType as string, parsedRecEnd);

      for (const occ of occurrences) {
        // 檢查每個子預約是否衝突
        const childConflicts = await checkConflicts(vehicleId, occ.start, occ.end);
        if (childConflicts.length > 0) continue; // 跳過衝突的日期

        const childDays = calcApplyDays(occ.start, occ.end);
        const child = await prisma.carBooking.create({
          data: {
            vehicleId,
            userId: user.id,
            startDate: occ.start,
            endDate: occ.end,
            applyDays: childDays,
            purpose: (purpose as string).trim(),
            isRecurring: false,
            parentBookingId: parentBooking.id,
          },
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true, calendarColor: true } },
          },
        });
        childBookings.push(child);
      }
    }

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_BOOKING_CREATE,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: parentBooking.id,
      outcome: Outcomes.SUCCESS,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formatBooking = (b: any) => ({
      id: b.id,
      vehicleId: b.vehicleId,
      userId: b.userId,
      user: b.user,
      startDate: b.startDate.toISOString().split('T')[0],
      endDate: b.endDate.toISOString().split('T')[0],
      applyDays: b.applyDays,
      purpose: b.purpose,
      status: b.status,
      countedDays: b.countedDays,
      startMileage: b.startMileage,
      endMileage: b.endMileage,
      tripDistance: b.tripDistance,
      isRecurring: b.isRecurring,
      recurringType: b.recurringType,
      parentBookingId: b.parentBookingId,
      createdAt: b.createdAt.toISOString(),
    });

    return NextResponse.json({
      booking: formatBooking(parentBooking),
      childBookings: childBookings.map(formatBooking),
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/bookings] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_BOOKING_CREATE,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立預約失敗' }, { status: 500 });
  }
});
