import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { calculateCostShares, type CostConfig } from '@/lib/car/cost-calculator';

// ── GET /api/car/costs ─────────────────────────────────────
// 列出費用結算（支援 vehicleId, item, status, 日期範圍篩選）

export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const item = searchParams.get('item');
  const status = searchParams.get('status');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (vehicleId) where.vehicleId = vehicleId;
  if (item) where.item = { contains: item, mode: 'insensitive' };
  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.settlementDate = {};
    if (dateFrom) where.settlementDate.gte = new Date(dateFrom + 'T00:00:00Z');
    if (dateTo) where.settlementDate.lte = new Date(dateTo + 'T23:59:59Z');
  }

  try {
    const records = await prisma.carCostRecord.findMany({
      where,
      include: {
        shares: {
          include: {
            user: {
              select: { id: true, displayName: true, avatarUrl: true },
            },
          },
        },
        paidBy: {
          select: { id: true, displayName: true },
        },
        _count: {
          select: { attachments: true },
        },
      },
      orderBy: { settlementDate: 'desc' },
    });

    const formatted = records.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId,
      settlementDate: r.settlementDate.toISOString().split('T')[0],
      item: r.item,
      totalAmount: Number(r.totalAmount),
      parentAmount: Number(r.parentAmount),
      paidBy: r.paidBy,
      paymentMethod: r.paymentMethod,
      paymentRef: r.paymentRef,
      paymentNote: r.paymentNote,
      periodStart: r.periodStart ? r.periodStart.toISOString().split('T')[0] : null,
      periodEnd: r.periodEnd ? r.periodEnd.toISOString().split('T')[0] : null,
      status: r.status,
      auditCheck: r.auditCheck,
      shares: r.shares.map((s) => ({
        id: s.id,
        userId: s.userId,
        user: s.user,
        usageDays: s.usageDays,
        amount: Number(s.amount),
        paymentStatus: s.paymentStatus,
        paidAt: s.paidAt ? s.paidAt.toISOString() : null,
        confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
      })),
      attachmentCount: r._count.attachments,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ records: formatted });
  } catch (error) {
    console.error('[GET /api/car/costs] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得費用結算列表' }, { status: 500 });
  }
});

// ── POST /api/car/costs (ADMIN) ────────────────────────────
// 新增費用結算

export const POST = withAdmin(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    vehicleId,
    totalAmount,
    item,
    paidById,
    paymentMethod,
    paymentRef,
    paymentNote,
    periodStart,
    periodEnd,
    shares,
    settlementDate,
  } = body as {
    vehicleId?: string;
    totalAmount?: number;
    item?: string;
    paidById?: string;
    paymentMethod?: string;
    paymentRef?: string;
    paymentNote?: string;
    periodStart?: string;
    periodEnd?: string;
    shares?: Array<{ userId: string; usageDays: number; displayName?: string }>;
    settlementDate?: string;
  };

  // 驗證必填欄位
  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId 為必填' }, { status: 400 });
  }
  if (!totalAmount || totalAmount <= 0) {
    return NextResponse.json({ error: '費用總額必須大於 0' }, { status: 400 });
  }
  if (!item || typeof item !== 'string' || !item.trim()) {
    return NextResponse.json({ error: '費用項目名稱為必填' }, { status: 400 });
  }
  if (!paidById) {
    return NextResponse.json({ error: '實際繳費人為必填' }, { status: 400 });
  }
  if (!paymentMethod) {
    return NextResponse.json({ error: '付款方式為必填' }, { status: 400 });
  }
  if (!shares || !Array.isArray(shares) || shares.length === 0) {
    return NextResponse.json({ error: '至少需要一人參與分攤' }, { status: 400 });
  }

  try {
    // 驗證車輛存在
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: '車輛不存在' }, { status: 404 });
    }

    // 驗證繳費人存在
    const paidByUser = await prisma.user.findUnique({
      where: { id: paidById },
      select: { id: true, displayName: true, familyRole: true },
    });
    if (!paidByUser) {
      return NextResponse.json({ error: '繳費人不存在' }, { status: 404 });
    }

    // 查找對應的 CarCostConfig 規則（先精確匹配，再嘗試前綴匹配）
    let config = await prisma.carCostConfig.findFirst({
      where: {
        vehicleId,
        item: item.trim(),
        isActive: true,
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    // 若精確匹配不到，嘗試前綴匹配（如「一般保養 — 60000公里保養」→ 匹配「一般保養」）
    if (!config) {
      const trimmedItem = item.trim();
      // 嘗試用「 — 」分割取前綴
      const dashIdx = trimmedItem.indexOf(' — ');
      const prefix = dashIdx > 0 ? trimmedItem.slice(0, dashIdx).trim() : null;
      if (prefix) {
        config = await prisma.carCostConfig.findFirst({
          where: {
            vehicleId,
            item: prefix,
            isActive: true,
          },
          orderBy: { effectiveFrom: 'desc' },
        });
      }

      // 再嘗試包含常見費用類型的模糊匹配
      if (!config) {
        const allConfigs = await prisma.carCostConfig.findMany({
          where: { vehicleId, isActive: true },
          orderBy: { effectiveFrom: 'desc' },
        });
        config = allConfigs.find(c => trimmedItem.includes(c.item)) || null;
      }
    }

    // 組合計算規則：有資料庫規則就用，沒有就用預設值
    const costConfig: CostConfig = config
      ? {
          parentRatio: Number(config.parentRatio),
          calcMethod: config.calcMethod as CostConfig['calcMethod'],
          dualTrackBaseRatio: Number(config.dualTrackBaseRatio),
        }
      : {
          parentRatio: 0,
          calcMethod: 'DUAL_TRACK',
          dualTrackBaseRatio: 0.5,
        };

    // 取得分攤人員資料
    const shareUsers = await prisma.user.findMany({
      where: { id: { in: shares.map((s) => s.userId) } },
      select: { id: true, displayName: true, familyRole: true },
    });

    const userMap = new Map(shareUsers.map((u) => [u.id, u]));

    // 找出父母用戶
    const parentUser = shareUsers.find((u) => u.familyRole === 'PARENT');

    // 子女列表（非 PARENT）
    const children = shares
      .filter((s) => {
        const u = userMap.get(s.userId);
        return u && u.familyRole !== 'PARENT';
      })
      .map((s) => ({
        userId: s.userId,
        displayName: userMap.get(s.userId)?.displayName || s.displayName || '',
        usageDays: s.usageDays || 0,
      }));

    // 若沒有子女則所有人視為子女（均分）
    const effectiveChildren = children.length > 0
      ? children
      : shares.map((s) => ({
          userId: s.userId,
          displayName: userMap.get(s.userId)?.displayName || s.displayName || '',
          usageDays: s.usageDays || 0,
        }));

    // 使用 cost-calculator 計算分攤
    const calcResult = calculateCostShares(
      totalAmount,
      costConfig,
      effectiveChildren,
      parentUser?.id || paidById,
      parentUser?.displayName || paidByUser.displayName,
      paidById,
    );

    // 建立結算日期
    const settleDate = settlementDate
      ? new Date(settlementDate + 'T00:00:00Z')
      : new Date();

    // 交易：建立 CarCostRecord + CarCostShare
    const record = await prisma.$transaction(async (tx) => {
      const costRecord = await tx.carCostRecord.create({
        data: {
          vehicleId,
          settlementDate: settleDate,
          item: item.trim(),
          totalAmount,
          parentAmount: calcResult.parentAmount,
          paidById,
          paymentMethod: paymentMethod as import('@prisma/client').PaymentMethod,
          paymentRef: typeof paymentRef === 'string' ? paymentRef : null,
          paymentNote: typeof paymentNote === 'string' ? paymentNote : null,
          configId: config?.id || null,
          periodStart: periodStart ? new Date(periodStart + 'T00:00:00Z') : null,
          periodEnd: periodEnd ? new Date(periodEnd + 'T00:00:00Z') : null,
          auditCheck: calcResult.auditCheck,
          createdBy: user.id,
        },
      });

      // 建立每人分攤記錄
      for (const share of calcResult.shares) {
        await tx.carCostShare.create({
          data: {
            costRecordId: costRecord.id,
            userId: share.userId,
            usageDays: share.usageDays,
            amount: share.amount,
          },
        });
      }

      return costRecord;
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_CREATE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: record.id,
      outcome: Outcomes.SUCCESS,
    });

    // 回傳建立的結算記錄
    const created = await prisma.carCostRecord.findUnique({
      where: { id: record.id },
      include: {
        shares: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
          },
        },
        paidBy: { select: { id: true, displayName: true } },
        _count: { select: { attachments: true } },
      },
    });

    return NextResponse.json({
      record: {
        id: created!.id,
        vehicleId: created!.vehicleId,
        settlementDate: created!.settlementDate.toISOString().split('T')[0],
        item: created!.item,
        totalAmount: Number(created!.totalAmount),
        parentAmount: Number(created!.parentAmount),
        paidBy: created!.paidBy,
        paymentMethod: created!.paymentMethod,
        status: created!.status,
        auditCheck: created!.auditCheck,
        shares: created!.shares.map((s) => ({
          id: s.id,
          userId: s.userId,
          user: s.user,
          usageDays: s.usageDays,
          amount: Number(s.amount),
          paymentStatus: s.paymentStatus,
          paidAt: null,
          confirmedAt: null,
        })),
        attachmentCount: created!._count.attachments,
        createdAt: created!.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/costs] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_CREATE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立費用結算失敗' }, { status: 500 });
  }
});
