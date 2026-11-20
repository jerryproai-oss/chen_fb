import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * PATCH /api/car/vehicles/[id] (ADMIN)
 * 更新車輛資訊
 */
export const PATCH = withAdmin(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  // 確認車輛存在
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '找不到該車輛' }, { status: 404 });
  }

  const { name, brand, model, plateNumber, purchaseDate, warrantyEnd, insuranceEnd,
    nextMaintenanceDate, nextMaintenanceMileage, currentMileage, color, vin, note } = body;

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = (name as string).trim();
  if (brand !== undefined) updateData.brand = (brand as string).trim();
  if (model !== undefined) updateData.model = (model as string).trim();
  if (plateNumber !== undefined) updateData.plateNumber = (plateNumber as string).trim();
  if (purchaseDate !== undefined) updateData.purchaseDate = purchaseDate ? new Date(purchaseDate as string + 'T00:00:00Z') : null;
  if (warrantyEnd !== undefined) updateData.warrantyEnd = warrantyEnd ? new Date(warrantyEnd as string + 'T00:00:00Z') : null;
  if (insuranceEnd !== undefined) updateData.insuranceEnd = insuranceEnd ? new Date(insuranceEnd as string + 'T00:00:00Z') : null;
  if (nextMaintenanceDate !== undefined) updateData.nextMaintenanceDate = nextMaintenanceDate ? new Date(nextMaintenanceDate as string + 'T00:00:00Z') : null;
  if (nextMaintenanceMileage !== undefined) updateData.nextMaintenanceMileage = nextMaintenanceMileage != null ? Number(nextMaintenanceMileage) : null;
  if (currentMileage !== undefined) updateData.currentMileage = currentMileage != null ? Number(currentMileage) : null;
  if (color !== undefined) updateData.color = typeof color === 'string' ? color.trim() : null;
  if (vin !== undefined) updateData.vin = typeof vin === 'string' ? vin.trim() : null;
  if (note !== undefined) updateData.note = typeof note === 'string' ? note.trim() : null;

  try {
    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_UPDATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: vehicle.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ vehicle });
  } catch (error) {
    console.error('[PATCH /api/car/vehicles/:id] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_UPDATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新車輛失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/car/vehicles/[id] (ADMIN)
 * 軟刪除車輛（isActive = false）
 */
export const DELETE = withAdmin(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '找不到該車輛' }, { status: 404 });
  }
  if (!existing.isActive) {
    return NextResponse.json({ error: '該車輛已停用' }, { status: 400 });
  }

  try {
    await prisma.vehicle.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_UPDATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/car/vehicles/:id] 軟刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_UPDATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '停用車輛失敗' }, { status: 500 });
  }
});
