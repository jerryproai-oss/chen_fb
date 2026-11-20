import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import type { FuelType, PaymentMethod } from '@prisma/client';

/**
 * GET /api/car/fuel
 *
 * 列出加油記錄（支援 vehicleId, userId 篩選）
 * 含前一筆里程以計算油耗
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const userId = searchParams.get('userId');

  try {
    const where: Record<string, unknown> = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (userId) where.userId = userId;

    const records = await prisma.carFuelRecord.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true } },
        vehicle: { select: { id: true, name: true } },
      },
      orderBy: { fuelDate: 'desc' },
    });

    // 計算油耗：找前一筆里程
    const formatted = records.map((rec, idx) => {
      // 找同車下一筆（排序為 desc，所以 idx+1 是更早的記錄）
      const prevRecord = records
        .slice(idx + 1)
        .find((r) => r.vehicleId === rec.vehicleId);

      let fuelEfficiency: number | null = null;
      if (prevRecord) {
        const distanceKm = rec.mileage - prevRecord.mileage;
        if (distanceKm > 0) {
          if (rec.liters && Number(rec.liters) > 0) {
            fuelEfficiency = Math.round((distanceKm / Number(rec.liters)) * 100) / 100;
          } else if (rec.kwh && Number(rec.kwh) > 0) {
            fuelEfficiency = Math.round((distanceKm / Number(rec.kwh)) * 100) / 100;
          }
        }
      }

      return {
        id: rec.id,
        vehicleId: rec.vehicleId,
        userId: rec.userId,
        user: rec.user,
        fuelDate: rec.fuelDate.toISOString().split('T')[0],
        fuelType: rec.fuelType,
        amount: Number(rec.amount),
        liters: rec.liters ? Number(rec.liters) : null,
        kwh: rec.kwh ? Number(rec.kwh) : null,
        pricePerUnit: rec.pricePerUnit ? Number(rec.pricePerUnit) : null,
        mileage: rec.mileage,
        station: rec.station,
        paymentMethod: rec.paymentMethod,
        note: rec.note,
        fuelEfficiency,
        createdAt: rec.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ records: formatted });
  } catch (error) {
    console.error('[GET /api/car/fuel] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得加油記錄' }, { status: 500 });
  }
});

/**
 * POST /api/car/fuel
 *
 * 新增加油記錄 → 自動建立 CarMileageLog → 更新 Vehicle.currentMileage
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    vehicleId,
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

  // ── 驗證 ────────────────────────────────────────
  if (!vehicleId || typeof vehicleId !== 'string') {
    return NextResponse.json({ error: '尚無車輛資料，請先到車輛資訊頁設定車輛' }, { status: 400 });
  }
  if (!fuelDate || typeof fuelDate !== 'string') {
    return NextResponse.json({ error: 'fuelDate 為必填（YYYY-MM-DD）' }, { status: 400 });
  }
  if (!fuelType || typeof fuelType !== 'string') {
    return NextResponse.json({ error: 'fuelType 為必填' }, { status: 400 });
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: '金額必須大於 0' }, { status: 400 });
  }
  if (typeof mileage !== 'number' || mileage < 0) {
    return NextResponse.json({ error: '里程數必須 ≥ 0' }, { status: 400 });
  }
  if (!paymentMethod || typeof paymentMethod !== 'string') {
    return NextResponse.json({ error: 'paymentMethod 為必填' }, { status: 400 });
  }

  // 驗證車輛存在
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    return NextResponse.json({ error: '車輛不存在' }, { status: 404 });
  }

  const parsedDate = new Date(fuelDate + 'T00:00:00Z');
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: '無效的日期格式' }, { status: 400 });
  }

  try {
    // 使用 transaction 確保一致性
    const result = await prisma.$transaction(async (tx) => {
      // 1. 建立加油記錄
      const fuelRecord = await tx.carFuelRecord.create({
        data: {
          vehicleId,
          userId: user.id,
          fuelDate: parsedDate,
          fuelType: fuelType as FuelType,
          amount,
          liters: typeof liters === 'number' ? liters : null,
          kwh: typeof kwh === 'number' ? kwh : null,
          pricePerUnit: typeof pricePerUnit === 'number' ? pricePerUnit : null,
          mileage: mileage as number,
          station: typeof station === 'string' ? station.trim() || null : null,
          paymentMethod: paymentMethod as PaymentMethod,
          note: typeof note === 'string' ? note.trim() || null : null,
        },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      });

      // 2. 自動建立里程記錄
      await tx.carMileageLog.create({
        data: {
          vehicleId,
          userId: user.id,
          mileage: mileage as number,
          source: 'FUEL',
          note: `加油記錄 - ${typeof station === 'string' ? station : ''}`.trim(),
        },
      });

      // 3. 更新車輛目前里程（僅在新里程較大時更新）
      if (!vehicle.currentMileage || (mileage as number) > vehicle.currentMileage) {
        await tx.vehicle.update({
          where: { id: vehicleId },
          data: { currentMileage: mileage as number },
        });
      }

      return fuelRecord;
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_CREATE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: result.id,
      outcome: Outcomes.SUCCESS,
    });

    // 重新查詢帶 user 的完整結果
    const created = await prisma.carFuelRecord.findUniqueOrThrow({
      where: { id: result.id },
      include: { user: { select: { id: true, displayName: true } } },
    });

    return NextResponse.json({
      record: {
        id: created.id,
        vehicleId: created.vehicleId,
        userId: created.userId,
        user: created.user,
        fuelDate: created.fuelDate.toISOString().split('T')[0],
        fuelType: created.fuelType,
        amount: Number(created.amount),
        liters: created.liters ? Number(created.liters) : null,
        kwh: created.kwh ? Number(created.kwh) : null,
        pricePerUnit: created.pricePerUnit ? Number(created.pricePerUnit) : null,
        mileage: created.mileage,
        station: created.station,
        paymentMethod: created.paymentMethod,
        note: created.note,
        fuelEfficiency: null,
        createdAt: created.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/fuel] 新增失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_FUEL_CREATE,
      resourceType: ResourceTypes.CAR_FUEL,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '新增加油記錄失敗' }, { status: 500 });
  }
});
