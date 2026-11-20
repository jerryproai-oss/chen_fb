import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * PATCH /api/car/fuel/[id]
 *
 * 更新加油記錄
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  // 確認記錄存在
  const existing = await prisma.carFuelRecord.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '加油記錄不存在' }, { status: 404 });
  }

  // 只有本人或 ADMIN 可以修改
  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 });
  }

  const {
    fuelDate,
    fuelType,
    amount,
    liters,
    kwh,
    pricePerUnit,
    mileage,
    station,
    paymentMethod,
    note,
  } = body;

  const updateData: Record<string, unknown> = {};

  if (fuelDate !== undefined) {
    const parsed = new Date(fuelDate + 'T00:00:00Z');
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: '無效的日期格式' }, { status: 400 });
    }
    updateData.fuelDate = parsed;
  }
  if (fuelType !== undefined) updateData.fuelType = fuelType;
  if (amount !== undefined) {
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: '金額必須大於 0' }, { status: 400 });
    }
    updateData.amount = amount;
  }
  if (liters !== undefined) updateData.liters = typeof liters === 'number' ? liters : null;
  if (kwh !== undefined) updateData.kwh = typeof kwh === 'number' ? kwh : null;
  if (pricePerUnit !== undefined) updateData.pricePerUnit = typeof pricePerUnit === 'number' ? pricePerUnit : null;
  if (mileage !== undefined) {
    if (typeof mileage !== 'number' || mileage < 0) {
      return NextResponse.json({ error: '里程數必須 ≥ 0' }, { status: 400 });
    }
    updateData.mileage = mileage;
  }
  if (station !== undefined) updateData.station = typeof station === 'string' ? station.trim() || null : null;
  if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
  if (note !== undefined) updateData.note = typeof note === 'string' ? note.trim() || null : null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.carFuelRecord.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });

      // 若里程有更新，同步更新 Vehicle.currentMileage
      if (mileage !== undefined && typeof mileage === 'number') {
        const vehicle = await tx.vehicle.findUnique({ where: { id: record.vehicleId } });
        if (vehicle && (!vehicle.currentMileage || mileage > vehicle.currentMileage)) {
          await tx.vehicle.update({
            where: { id: record.vehicleId },
            data: { currentMileage: mileage },
          });
        }
      }

      return record;
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_UPDATE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      record: {
        id: updated.id,
        vehicleId: updated.vehicleId,
        userId: updated.userId,
        user: updated.user,
        fuelDate: updated.fuelDate.toISOString().split('T')[0],
        fuelType: updated.fuelType,
        amount: Number(updated.amount),
        liters: updated.liters ? Number(updated.liters) : null,
        kwh: updated.kwh ? Number(updated.kwh) : null,
        pricePerUnit: updated.pricePerUnit ? Number(updated.pricePerUnit) : null,
        mileage: updated.mileage,
        station: updated.station,
        paymentMethod: updated.paymentMethod,
        note: updated.note,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[PATCH /api/car/fuel/[id]] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_UPDATE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新加油記錄失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/car/fuel/[id]
 *
 * 刪除加油記錄
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  const existing = await prisma.carFuelRecord.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '加油記錄不存在' }, { status: 404 });
  }

  // 只有本人或 ADMIN 可以刪除
  if (existing.userId !== user.id && user.role !== 'ADMIN') {
    return NextResponse.json({ error: '權限不足' }, { status: 403 });
  }

  try {
    await prisma.carFuelRecord.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_DELETE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/car/fuel/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_DELETE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除加油記錄失敗' }, { status: 500 });
  }
});
