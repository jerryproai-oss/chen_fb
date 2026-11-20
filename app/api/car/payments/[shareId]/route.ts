import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

type RouteContext = { params: Promise<Record<string, string>> };

// ── PATCH /api/car/payments/[shareId] ──────────────────────
// 標記繳款狀態
// - 本人可將 UNPAID → PAID（設 paidAt）
// - ADMIN 可將 PAID → CONFIRMED（設 confirmedBy, confirmedAt）

export const PATCH = withAuth(async ({ user }, _req: NextRequest, routeCtx: RouteContext) => {
  const { shareId } = await routeCtx.params;

  try {
    const share = await prisma.carCostShare.findUnique({
      where: { id: shareId },
      include: {
        user: { select: { id: true, displayName: true } },
      },
    });

    if (!share) {
      return NextResponse.json({ error: '分攤記錄不存在' }, { status: 404 });
    }

    const isAdmin = user.role === 'ADMIN';
    const isOwner = share.userId === user.id;

    // 本人標記繳款：UNPAID → PAID
    if (share.paymentStatus === 'UNPAID') {
      if (!isOwner && !isAdmin) {
        return NextResponse.json({ error: '僅本人或管理員可標記繳款' }, { status: 403 });
      }

      await prisma.carCostShare.update({
        where: { id: shareId },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
        },
      });

      await logAudit({
        actorId: user.id,
        action: AuditActions.CAR_PAYMENT_MARK,
        resourceType: ResourceTypes.CAR_PAYMENT,
        resourceId: shareId,
        outcome: Outcomes.SUCCESS,
      });

      return NextResponse.json({
        success: true,
        message: '已標記為已繳款',
        paymentStatus: 'PAID',
      });
    }

    // ADMIN 確認繳款：PAID → CONFIRMED
    if (share.paymentStatus === 'PAID') {
      if (!isAdmin) {
        return NextResponse.json(
          { error: '僅管理員可確認繳款' },
          { status: 403 },
        );
      }

      await prisma.carCostShare.update({
        where: { id: shareId },
        data: {
          paymentStatus: 'CONFIRMED',
          confirmedBy: user.id,
          confirmedAt: new Date(),
        },
      });

      await logAudit({
        actorId: user.id,
        action: AuditActions.CAR_PAYMENT_CONFIRM,
        resourceType: ResourceTypes.CAR_PAYMENT,
        resourceId: shareId,
        outcome: Outcomes.SUCCESS,
      });

      return NextResponse.json({
        success: true,
        message: '已確認繳款',
        paymentStatus: 'CONFIRMED',
      });
    }

    // 已確認的不能再改
    if (share.paymentStatus === 'CONFIRMED') {
      return NextResponse.json(
        { error: '此筆分攤已確認繳款，無法再修改' },
        { status: 400 },
      );
    }

    return NextResponse.json({ error: '無效的繳款狀態轉換' }, { status: 400 });
  } catch (error) {
    console.error('[PATCH /api/car/payments/[shareId]] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_PAYMENT_MARK,
      resourceType: ResourceTypes.CAR_PAYMENT,
      resourceId: shareId,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新繳款狀態失敗' }, { status: 500 });
  }
});
