import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

// ── GET /api/car/config ────────────────────────────────────
// 列出費用分攤規則（?vehicleId=&isActive=）

export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const isActive = searchParams.get('isActive');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (vehicleId) where.vehicleId = vehicleId;
  if (isActive !== null && isActive !== undefined && isActive !== '') {
    where.isActive = isActive === 'true';
  }

  try {
    const configs = await prisma.carCostConfig.findMany({
      where,
      include: {
        vehicle: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
      orderBy: [{ item: 'asc' }, { effectiveFrom: 'desc' }],
    });

    const formatted = configs.map((c) => ({
      id: c.id,
      vehicleId: c.vehicleId,
      vehicle: c.vehicle,
      item: c.item,
      parentRatio: Number(c.parentRatio),
      calcMethod: c.calcMethod,
      dualTrackBaseRatio: Number(c.dualTrackBaseRatio),
      effectiveFrom: c.effectiveFrom.toISOString().split('T')[0],
      effectiveMode: c.effectiveMode,
      isActive: c.isActive,
      note: c.note,
      createdBy: c.creator,
      createdAt: c.createdAt.toISOString(),
    }));

    return NextResponse.json({ configs: formatted });
  } catch (error) {
    console.error('[GET /api/car/config] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得費用分攤規則' }, { status: 500 });
  }
});

// ── POST /api/car/config (ADMIN) ───────────────────────────
// 新增規則

export const POST = withAdmin(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    vehicleId,
    item,
    parentRatio,
    calcMethod,
    dualTrackBaseRatio,
    effectiveFrom,
    effectiveMode,
    note,
  } = body as {
    vehicleId?: string;
    item?: string;
    parentRatio?: number;
    calcMethod?: string;
    dualTrackBaseRatio?: number;
    effectiveFrom?: string;
    effectiveMode?: string;
    note?: string;
  };

  // 驗證必填
  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId 為必填' }, { status: 400 });
  }
  if (!item || typeof item !== 'string' || !item.trim()) {
    return NextResponse.json({ error: '費用項目名稱為必填' }, { status: 400 });
  }
  if (parentRatio === undefined || parentRatio === null || parentRatio < 0 || parentRatio > 1) {
    return NextResponse.json({ error: '父母負擔比率須在 0 到 1 之間' }, { status: 400 });
  }
  if (!calcMethod || !['DUAL_TRACK', 'EVEN_SPLIT'].includes(calcMethod)) {
    return NextResponse.json({ error: '計算方式須為 DUAL_TRACK 或 EVEN_SPLIT' }, { status: 400 });
  }
  if (!effectiveFrom) {
    return NextResponse.json({ error: '生效日期為必填' }, { status: 400 });
  }
  if (!effectiveMode || !['RETROACTIVE', 'IMMEDIATE', 'SCHEDULED'].includes(effectiveMode)) {
    return NextResponse.json({ error: '生效模式須為 RETROACTIVE、IMMEDIATE 或 SCHEDULED' }, { status: 400 });
  }

  try {
    // 驗證車輛存在
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: '車輛不存在' }, { status: 404 });
    }

    const config = await prisma.carCostConfig.create({
      data: {
        vehicleId,
        item: item.trim(),
        parentRatio,
        calcMethod: calcMethod as import('@prisma/client').CalcMethod,
        dualTrackBaseRatio: dualTrackBaseRatio ?? 0.5,
        effectiveFrom: new Date(effectiveFrom + 'T00:00:00Z'),
        effectiveMode: effectiveMode as import('@prisma/client').EffectiveMode,
        note: typeof note === 'string' ? note.trim() || null : null,
        createdBy: user.id,
      },
      include: {
        vehicle: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_CONFIG_CREATE,
      resourceType: ResourceTypes.CAR_CONFIG,
      resourceId: config.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      config: {
        id: config.id,
        vehicleId: config.vehicleId,
        vehicle: config.vehicle,
        item: config.item,
        parentRatio: Number(config.parentRatio),
        calcMethod: config.calcMethod,
        dualTrackBaseRatio: Number(config.dualTrackBaseRatio),
        effectiveFrom: config.effectiveFrom.toISOString().split('T')[0],
        effectiveMode: config.effectiveMode,
        isActive: config.isActive,
        note: config.note,
        createdBy: config.creator,
        createdAt: config.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/config] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_CONFIG_CREATE,
      resourceType: ResourceTypes.CAR_CONFIG,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立費用分攤規則失敗' }, { status: 500 });
  }
});

// ── PATCH /api/car/config (ADMIN) ──────────────────────────
// 更新規則

export const PATCH = withAdmin(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    id,
    parentRatio,
    calcMethod,
    dualTrackBaseRatio,
    effectiveFrom,
    effectiveMode,
    isActive,
    note,
  } = body as {
    id?: string;
    parentRatio?: number;
    calcMethod?: string;
    dualTrackBaseRatio?: number;
    effectiveFrom?: string;
    effectiveMode?: string;
    isActive?: boolean;
    note?: string;
  };

  if (!id) {
    return NextResponse.json({ error: '規則 ID 為必填' }, { status: 400 });
  }

  try {
    const existing = await prisma.carCostConfig.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '規則不存在' }, { status: 404 });
    }

    // 驗證範圍
    if (parentRatio !== undefined && (parentRatio < 0 || parentRatio > 1)) {
      return NextResponse.json({ error: '父母負擔比率須在 0 到 1 之間' }, { status: 400 });
    }
    if (calcMethod && !['DUAL_TRACK', 'EVEN_SPLIT'].includes(calcMethod)) {
      return NextResponse.json({ error: '計算方式須為 DUAL_TRACK 或 EVEN_SPLIT' }, { status: 400 });
    }
    if (effectiveMode && !['RETROACTIVE', 'IMMEDIATE', 'SCHEDULED'].includes(effectiveMode)) {
      return NextResponse.json({ error: '生效模式須為 RETROACTIVE、IMMEDIATE 或 SCHEDULED' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (parentRatio !== undefined) updateData.parentRatio = parentRatio;
    if (calcMethod) updateData.calcMethod = calcMethod;
    if (dualTrackBaseRatio !== undefined) updateData.dualTrackBaseRatio = dualTrackBaseRatio;
    if (effectiveFrom) updateData.effectiveFrom = new Date(effectiveFrom + 'T00:00:00Z');
    if (effectiveMode) updateData.effectiveMode = effectiveMode;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (note !== undefined) updateData.note = note.trim() || null;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
    }

    const updated = await prisma.carCostConfig.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: { select: { id: true, name: true } },
        creator: { select: { id: true, displayName: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_CONFIG_UPDATE,
      resourceType: ResourceTypes.CAR_CONFIG,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      config: {
        id: updated.id,
        vehicleId: updated.vehicleId,
        vehicle: updated.vehicle,
        item: updated.item,
        parentRatio: Number(updated.parentRatio),
        calcMethod: updated.calcMethod,
        dualTrackBaseRatio: Number(updated.dualTrackBaseRatio),
        effectiveFrom: updated.effectiveFrom.toISOString().split('T')[0],
        effectiveMode: updated.effectiveMode,
        isActive: updated.isActive,
        note: updated.note,
        createdBy: updated.creator,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[PATCH /api/car/config] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_CONFIG_UPDATE,
      resourceType: ResourceTypes.CAR_CONFIG,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新費用分攤規則失敗' }, { status: 500 });
  }
});
