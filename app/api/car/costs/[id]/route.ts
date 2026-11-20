import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { calculateCostShares, type CostConfig } from '@/lib/car/cost-calculator';

type RouteContext = { params: Promise<Record<string, string>> };

// ── GET /api/car/costs/[id] ────────────────────────────────
// 取得單筆結算詳情（含 shares, attachments, amendments）

export const GET = withAuth(async (_ctx, _req: NextRequest, routeCtx: RouteContext) => {
  const { id } = await routeCtx.params;

  try {
    const record = await prisma.carCostRecord.findUnique({
      where: { id },
      include: {
        shares: {
          include: {
            user: { select: { id: true, displayName: true, avatarUrl: true } },
            confirmer: { select: { id: true, displayName: true } },
          },
        },
        paidBy: { select: { id: true, displayName: true } },
        attachments: {
          include: {
            uploader: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        amendments: {
          include: {
            amendedByUser: { select: { id: true, displayName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        config: {
          select: { id: true, item: true, parentRatio: true, calcMethod: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json({ error: '費用結算不存在' }, { status: 404 });
    }

    const formatted = {
      id: record.id,
      vehicleId: record.vehicleId,
      settlementDate: record.settlementDate.toISOString().split('T')[0],
      item: record.item,
      totalAmount: Number(record.totalAmount),
      parentAmount: Number(record.parentAmount),
      paidBy: record.paidBy,
      paymentMethod: record.paymentMethod,
      paymentRef: record.paymentRef,
      paymentNote: record.paymentNote,
      periodStart: record.periodStart ? record.periodStart.toISOString().split('T')[0] : null,
      periodEnd: record.periodEnd ? record.periodEnd.toISOString().split('T')[0] : null,
      status: record.status,
      auditCheck: record.auditCheck,
      config: record.config
        ? {
            id: record.config.id,
            item: record.config.item,
            parentRatio: Number(record.config.parentRatio),
            calcMethod: record.config.calcMethod,
          }
        : null,
      shares: record.shares.map((s) => ({
        id: s.id,
        userId: s.userId,
        user: s.user,
        usageDays: s.usageDays,
        amount: Number(s.amount),
        paymentStatus: s.paymentStatus,
        paidAt: s.paidAt ? s.paidAt.toISOString() : null,
        confirmedBy: s.confirmer || null,
        confirmedAt: s.confirmedAt ? s.confirmedAt.toISOString() : null,
      })),
      attachments: record.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        docType: a.docType,
        note: a.note,
        uploaderName: a.uploader.displayName,
        createdAt: a.createdAt.toISOString(),
      })),
      amendments: record.amendments.map((m) => ({
        id: m.id,
        amendedBy: m.amendedByUser,
        reason: m.reason,
        fieldChanged: m.fieldChanged,
        oldValue: m.oldValue,
        newValue: m.newValue,
        createdAt: m.createdAt.toISOString(),
      })),
      createdAt: record.createdAt.toISOString(),
    };

    return NextResponse.json({ record: formatted });
  } catch (error) {
    console.error('[GET /api/car/costs/[id]] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得費用結算詳情' }, { status: 500 });
  }
});

// ── PATCH /api/car/costs/[id] (ADMIN) ──────────────────────
// 修正費用 → 建立 CarCostAmendment 記錄 → 重新計算分攤

export const PATCH = withAdmin(async ({ user }, req: NextRequest, routeCtx: RouteContext) => {
  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { reason, totalAmount, item, shares } = body as {
    reason?: string;
    totalAmount?: number;
    item?: string;
    shares?: Array<{ userId: string; usageDays: number; displayName?: string }>;
  };

  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    return NextResponse.json({ error: '修正原因為必填' }, { status: 400 });
  }

  try {
    const existing = await prisma.carCostRecord.findUnique({
      where: { id },
      include: {
        shares: { include: { user: { select: { id: true, displayName: true, familyRole: true } } } },
        config: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '費用結算不存在' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const amendments: Array<{ fieldChanged: string; oldValue: string; newValue: string }> = [];

      // 修正費用項目名稱
      if (item && item.trim() !== existing.item) {
        amendments.push({
          fieldChanged: 'item',
          oldValue: existing.item,
          newValue: item.trim(),
        });
      }

      // 修正費用總額
      const newTotalAmount = totalAmount ?? Number(existing.totalAmount);
      if (totalAmount && totalAmount !== Number(existing.totalAmount)) {
        amendments.push({
          fieldChanged: 'totalAmount',
          oldValue: String(Number(existing.totalAmount)),
          newValue: String(totalAmount),
        });
      }

      // 建立修正記錄
      for (const amendment of amendments) {
        await tx.carCostAmendment.create({
          data: {
            costRecordId: id,
            amendedBy: user.id,
            reason: reason.trim(),
            fieldChanged: amendment.fieldChanged,
            oldValue: amendment.oldValue,
            newValue: amendment.newValue,
          },
        });
      }

      // 重新計算分攤（如果金額或天數有改變）
      if (totalAmount || shares) {
        const costConfig: CostConfig = existing.config
          ? {
              parentRatio: Number(existing.config.parentRatio),
              calcMethod: existing.config.calcMethod as CostConfig['calcMethod'],
              dualTrackBaseRatio: Number(existing.config.dualTrackBaseRatio),
            }
          : { parentRatio: 0, calcMethod: 'DUAL_TRACK', dualTrackBaseRatio: 0.5 };

        // 使用新的或現有的分攤天數
        const effectiveShares = shares || existing.shares.map((s) => ({
          userId: s.userId,
          usageDays: s.usageDays,
          displayName: s.user.displayName,
        }));

        // 取得使用者資料
        const shareUsers = await tx.user.findMany({
          where: { id: { in: effectiveShares.map((s) => s.userId) } },
          select: { id: true, displayName: true, familyRole: true },
        });

        const userMap = new Map(shareUsers.map((u) => [u.id, u]));
        const parentUser = shareUsers.find((u) => u.familyRole === 'PARENT');
        const children = effectiveShares
          .filter((s) => userMap.get(s.userId)?.familyRole !== 'PARENT')
          .map((s) => ({
            userId: s.userId,
            displayName: userMap.get(s.userId)?.displayName || s.displayName || '',
            usageDays: s.usageDays || 0,
          }));

        const effectiveChildren = children.length > 0 ? children : effectiveShares.map((s) => ({
          userId: s.userId,
          displayName: userMap.get(s.userId)?.displayName || s.displayName || '',
          usageDays: s.usageDays || 0,
        }));

        const calcResult = calculateCostShares(
          newTotalAmount,
          costConfig,
          effectiveChildren,
          parentUser?.id || existing.paidById,
          parentUser?.displayName || '',
          existing.paidById,
        );

        // 刪除舊分攤，建立新分攤
        await tx.carCostShare.deleteMany({ where: { costRecordId: id } });

        for (const share of calcResult.shares) {
          await tx.carCostShare.create({
            data: {
              costRecordId: id,
              userId: share.userId,
              usageDays: share.usageDays,
              amount: share.amount,
            },
          });
        }

        // 更新費用記錄
        await tx.carCostRecord.update({
          where: { id },
          data: {
            totalAmount: newTotalAmount,
            parentAmount: calcResult.parentAmount,
            item: item ? item.trim() : undefined,
            auditCheck: calcResult.auditCheck,
          },
        });

        // 記錄分攤變更
        if (shares) {
          await tx.carCostAmendment.create({
            data: {
              costRecordId: id,
              amendedBy: user.id,
              reason: reason.trim(),
              fieldChanged: 'shares',
              oldValue: JSON.stringify(existing.shares.map((s) => ({
                userId: s.userId,
                usageDays: s.usageDays,
                amount: Number(s.amount),
              }))),
              newValue: JSON.stringify(calcResult.shares.map((s) => ({
                userId: s.userId,
                usageDays: s.usageDays,
                amount: s.amount,
              }))),
            },
          });
        }
      } else if (item) {
        // 只修改項目名稱
        await tx.carCostRecord.update({
          where: { id },
          data: { item: item.trim() },
        });
      }
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_AMEND,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true, message: '費用已修正' });
  } catch (error) {
    console.error('[PATCH /api/car/costs/[id]] 修正失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_AMEND,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '修正費用結算失敗' }, { status: 500 });
  }
});

// ── DELETE /api/car/costs/[id] (ADMIN) ─────────────────────
// 刪除費用結算

export const DELETE = withAdmin(async ({ user }, _req: NextRequest, routeCtx: RouteContext) => {
  const { id } = await routeCtx.params;

  try {
    const existing = await prisma.carCostRecord.findUnique({
      where: { id },
      include: {
        attachments: { select: { storagePath: true } },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: '費用結算不存在' }, { status: 404 });
    }

    // 刪除 Google Drive 上的附件
    if (existing.attachments.length > 0) {
      const { deleteByStoragePath } = await import('@/lib/google-drive');
      for (const att of existing.attachments) {
        await deleteByStoragePath(att.storagePath);
      }
    }

    // Cascade 會自動刪除 shares, attachments, amendments
    await prisma.carCostRecord.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_DELETE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true, message: '費用結算已刪除' });
  } catch (error) {
    console.error('[DELETE /api/car/costs/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_COST_DELETE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除費用結算失敗' }, { status: 500 });
  }
});
