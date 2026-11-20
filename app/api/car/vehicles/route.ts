import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * GET /api/car/vehicles
 * 列出所有啟用中的車輛
 */
export const GET = withAuth(async () => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      vehicles: vehicles.map((v) => ({
        id: v.id,
        name: v.name,
        brand: v.brand,
        model: v.model,
        plateNumber: v.plateNumber,
        purchaseDate: v.purchaseDate ? v.purchaseDate.toISOString().split('T')[0] : null,
        warrantyEnd: v.warrantyEnd ? v.warrantyEnd.toISOString().split('T')[0] : null,
        insuranceEnd: v.insuranceEnd ? v.insuranceEnd.toISOString().split('T')[0] : null,
        nextMaintenanceDate: v.nextMaintenanceDate ? v.nextMaintenanceDate.toISOString().split('T')[0] : null,
        nextMaintenanceMileage: v.nextMaintenanceMileage,
        currentMileage: v.currentMileage,
        color: v.color,
        vin: v.vin,
        note: v.note,
        isActive: v.isActive,
      })),
    });
  } catch (error) {
    console.error('[GET /api/car/vehicles] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得車輛列表' }, { status: 500 });
  }
});

/**
 * POST /api/car/vehicles (ADMIN)
 * 新增車輛
 */
export const POST = withAdmin(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { name, brand, model, plateNumber, purchaseDate, warrantyEnd, insuranceEnd,
    nextMaintenanceDate, nextMaintenanceMileage, currentMileage, color, vin, note } = body;

  // 驗證必填欄位
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '車輛名稱為必填' }, { status: 400 });
  }
  if (!brand || typeof brand !== 'string' || !brand.trim()) {
    return NextResponse.json({ error: '品牌為必填' }, { status: 400 });
  }
  if (!model || typeof model !== 'string') {
    return NextResponse.json({ error: '車型為必填' }, { status: 400 });
  }
  if (!plateNumber || typeof plateNumber !== 'string' || !plateNumber.trim()) {
    return NextResponse.json({ error: '車牌號碼為必填' }, { status: 400 });
  }

  try {
    const vehicle = await prisma.vehicle.create({
      data: {
        name: (name as string).trim(),
        brand: (brand as string).trim(),
        model: (model as string).trim(),
        plateNumber: (plateNumber as string).trim(),
        purchaseDate: purchaseDate ? new Date(purchaseDate as string + 'T00:00:00Z') : null,
        warrantyEnd: warrantyEnd ? new Date(warrantyEnd as string + 'T00:00:00Z') : null,
        insuranceEnd: insuranceEnd ? new Date(insuranceEnd as string + 'T00:00:00Z') : null,
        nextMaintenanceDate: nextMaintenanceDate ? new Date(nextMaintenanceDate as string + 'T00:00:00Z') : null,
        nextMaintenanceMileage: nextMaintenanceMileage != null ? Number(nextMaintenanceMileage) : null,
        currentMileage: currentMileage != null ? Number(currentMileage) : null,
        color: typeof color === 'string' ? color.trim() : null,
        vin: typeof vin === 'string' ? vin.trim() : null,
        note: typeof note === 'string' ? note.trim() : null,
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_CREATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: vehicle.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/vehicles] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_VEHICLE_CREATE,
      resourceType: ResourceTypes.CAR_VEHICLE,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立車輛失敗' }, { status: 500 });
  }
});
