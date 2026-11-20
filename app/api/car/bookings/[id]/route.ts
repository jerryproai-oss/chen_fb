import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

const VALID_TRANSITIONS: Record<string, string[]> = {
  RESERVED: ['OUT', 'CANCELLED'],
  OUT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/**
 * PATCH /api/car/bookings/[id]
 * 更新預約（狀態轉換 / 里程紀錄 / 用途修改）
 *
 * 狀態轉換規則：
 *   RESERVED → OUT / CANCELLED
 *   OUT → COMPLETED / CANCELLED
 *   COMPLETED / CANCELLED → 不可變更
 *
 * - OUT 時可填 startMileage
 * - COMPLETED 時可填 endMileage → 自動算 tripDistance，更新 Vehicle.currentMileage
 * - COMPLETED → countedDays = applyDays
 * - CANCELLED → countedDays = 0
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const booking = await prisma.carBooking.findUnique({
    where: { id },
    include: { vehicle: true },
  });

  if (!booking) {
    return NextResponse.json({ error: '找不到該預約' }, { status: 404 });
  }

  const { status, startMileage, endMileage, purpose, startDate, endDate } = body;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: any = {};

  // 若提供 purpose 則更新用途
  if (purpose !== undefined) {
    updateData.purpose = (purpose as string).trim();
  }

  // 若提供日期且狀態為 RESERVED 則更新日期
  if (booking.status === 'RESERVED') {
    if (startDate !== undefined && typeof startDate === 'string') {
      const parsed = new Date(startDate + 'T00:00:00Z');
      if (!isNaN(parsed.getTime())) updateData.startDate = parsed;
    }
    if (endDate !== undefined && typeof endDate === 'string') {
      const parsed = new Date(endDate + 'T00:00:00Z');
      if (!isNaN(parsed.getTime())) updateData.endDate = parsed;
    }
    // 重新計算天數
    const newStart = updateData.startDate || booking.startDate;
    const newEnd = updateData.endDate || booking.endDate;
    if (updateData.startDate || updateData.endDate) {
      const days = Math.round((newEnd.getTime() - newStart.getTime()) / 86400000) + 1;
      updateData.applyDays = days > 0 ? days : 1;
    }
  }

  // 狀態變更
  if (status && typeof status === 'string') {
    const currentStatus = booking.status;
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(status)) {
      return NextResponse.json({
        error: `無法從 ${currentStatus} 轉換到 ${status}`,
      }, { status: 400 });
    }

    updateData.status = status;

    // 狀態 → OUT：記錄出車里程
    if (status === 'OUT') {
      if (startMileage != null) {
        updateData.startMileage = Number(startMileage);
      }
    }

    // 狀態 → COMPLETED：記錄還車里程、計算行駛距離
    if (status === 'COMPLETED') {
      updateData.countedDays = booking.applyDays;

      if (endMileage != null) {
        const endMileageNum = Number(endMileage);
        updateData.endMileage = endMileageNum;

        if (booking.startMileage != null) {
          updateData.tripDistance = endMileageNum - booking.startMileage;
        }
      }
    }

    // 狀態 → CANCELLED：計入天數 = 0
    if (status === 'CANCELLED') {
      updateData.countedDays = 0;
    }
  }

  try {
    const updated = await prisma.carBooking.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, calendarColor: true } },
      },
    });

    // 狀態 → OUT 且有出車里程：建立里程記錄
    if (status === 'OUT' && updateData.startMileage != null) {
      await prisma.carMileageLog.create({
        data: {
          vehicleId: booking.vehicleId,
          userId: user.id,
          mileage: updateData.startMileage,
          source: 'BOOKING_START',
          note: `預約出車 — ${booking.purpose}`,
        },
      });
    }

    // 狀態 → COMPLETED 且有還車里程：更新 Vehicle.currentMileage + 建立里程記錄
    if (status === 'COMPLETED' && updateData.endMileage != null) {
      await prisma.vehicle.update({
        where: { id: booking.vehicleId },
        data: { currentMileage: updateData.endMileage },
      });

      await prisma.carMileageLog.create({
        data: {
          vehicleId: booking.vehicleId,
          userId: user.id,
          mileage: updateData.endMileage,
          source: 'BOOKING_END',
          note: `還車完成 — ${booking.purpose}${updateData.tripDistance != null ? `，行駛 ${updateData.tripDistance} km` : ''}`,
        },
      });
    }

    await logAudit({
      actorId: user.id,
      action: status ? AuditActions.CAR_BOOKING_STATUS : AuditActions.CAR_BOOKING_UPDATE,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      booking: {
        id: updated.id,
        vehicleId: updated.vehicleId,
        userId: updated.userId,
        user: updated.user,
        startDate: updated.startDate.toISOString().split('T')[0],
        endDate: updated.endDate.toISOString().split('T')[0],
        applyDays: updated.applyDays,
        purpose: updated.purpose,
        status: updated.status,
        countedDays: updated.countedDays,
        startMileage: updated.startMileage,
        endMileage: updated.endMileage,
        tripDistance: updated.tripDistance,
        isRecurring: updated.isRecurring,
        recurringType: updated.recurringType,
        parentBookingId: updated.parentBookingId,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[PATCH /api/car/bookings/:id] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_BOOKING_UPDATE,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新預約失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/car/bookings/[id]
 * 刪除預約（僅本人或 ADMIN；已出車/已完成不可刪）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  const booking = await prisma.carBooking.findUnique({ where: { id } });
  if (!booking) {
    return NextResponse.json({ error: '找不到該預約' }, { status: 404 });
  }

  // 只有本人或 ADMIN 可刪除
  if (booking.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 });
  }

  // 已出車或已完成不可刪除
  if (booking.status === 'OUT' || booking.status === 'COMPLETED') {
    return NextResponse.json({ error: '已出車或已完成的預約不可刪除' }, { status: 400 });
  }

  try {
    // 若為循環母預約，一併刪除尚未出車的子預約
    if (booking.isRecurring) {
      await prisma.carBooking.deleteMany({
        where: { parentBookingId: id, status: 'RESERVED' },
      });
    }

    await prisma.carBooking.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_BOOKING_CANCEL,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/car/bookings/:id] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_BOOKING_CANCEL,
      resourceType: ResourceTypes.CAR_BOOKING,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除預約失敗' }, { status: 500 });
  }
});
