import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * GET /api/car/mileage?vehicleId=
 * 列出里程記錄
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (vehicleId) where.vehicleId = vehicleId;

  try {
    const logs = await prisma.carMileageLog.findMany({
      where,
      include: {
        user: { select: { id: true, displayName: true } },
      },
      orderBy: { recordedAt: 'desc' },
    });

    return NextResponse.json({
      logs: logs.map((l) => ({
        id: l.id,
        vehicleId: l.vehicleId,
        userId: l.userId,
        user: l.user,
        mileage: l.mileage,
        source: l.source,
        note: l.note,
        recordedAt: l.recordedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('[GET /api/car/mileage] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得里程記錄' }, { status: 500 });
  }
});

/**
 * POST /api/car/mileage
 * 新增手動里程記錄，並更新 Vehicle.currentMileage
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { vehicleId, mileage, note } = body;

  if (!vehicleId || typeof vehicleId !== 'string') {
    return NextResponse.json({ error: '車輛 ID 為必填' }, { status: 400 });
  }
  if (mileage == null || typeof mileage !== 'number' || mileage < 0) {
    return NextResponse.json({ error: '里程數為必填且不得為負數' }, { status: 400 });
  }

  // 確認車輛存在
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle || !vehicle.isActive) {
    return NextResponse.json({ error: '找不到該車輛或已停用' }, { status: 404 });
  }

  // 里程不可小於目前里程
  if (vehicle.currentMileage != null && mileage < vehicle.currentMileage) {
    return NextResponse.json({
      error: `里程數不得小於目前里程 ${vehicle.currentMileage} km`,
    }, { status: 400 });
  }

  try {
    const [log] = await prisma.$transaction([
      prisma.carMileageLog.create({
        data: {
          vehicleId,
          userId: user.id,
          mileage: Number(mileage),
          source: 'MANUAL',
          note: typeof note === 'string' ? note.trim() : null,
        },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      }),
      prisma.vehicle.update({
        where: { id: vehicleId },
        data: { currentMileage: Number(mileage) },
      }),
    ]);

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_MILEAGE_LOG,
      resourceType: ResourceTypes.CAR_MILEAGE,
      resourceId: log.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      log: {
        id: log.id,
        vehicleId: log.vehicleId,
        userId: log.userId,
        user: log.user,
        mileage: log.mileage,
        source: log.source,
        note: log.note,
        recordedAt: log.recordedAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/mileage] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_MILEAGE_LOG,
      resourceType: ResourceTypes.CAR_MILEAGE,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '新增里程記錄失敗' }, { status: 500 });
  }
});
