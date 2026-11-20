import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * PATCH /api/car/loans/[id] (ADMIN)
 *
 * 更新車貸資訊
 */
export const PATCH = withAdmin(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const existing = await prisma.carLoan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '車貸不存在' }, { status: 404 });
  }

  const { lender, note, isActive } = body;

  const updateData: Record<string, unknown> = {};
  if (lender !== undefined && typeof lender === 'string') {
    updateData.lender = lender.trim();
  }
  if (note !== undefined) {
    updateData.note = typeof note === 'string' ? note.trim() || null : null;
  }
  if (isActive !== undefined && typeof isActive === 'boolean') {
    updateData.isActive = isActive;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  try {
    const updated = await prisma.carLoan.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE, // reuse — 無專用 UPDATE action
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      loan: {
        id: updated.id,
        vehicleId: updated.vehicleId,
        lender: updated.lender,
        totalAmount: Number(updated.totalAmount),
        downPayment: Number(updated.downPayment),
        loanAmount: Number(updated.loanAmount),
        interestRate: Number(updated.interestRate),
        totalInstallments: updated.totalInstallments,
        monthlyPayment: Number(updated.monthlyPayment),
        startDate: updated.startDate.toISOString().split('T')[0],
        endDate: updated.endDate.toISOString().split('T')[0],
        paymentDay: updated.paymentDay,
        note: updated.note,
        isActive: updated.isActive,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/car/loans/[id]] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新車貸失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/car/loans/[id] (ADMIN)
 *
 * 刪除車貸（連帶刪除所有還款記錄 — 由 Prisma onDelete Cascade 處理）
 */
export const DELETE = withAdmin(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  const existing = await prisma.carLoan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '車貸不存在' }, { status: 404 });
  }

  try {
    await prisma.carLoan.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE, // reuse
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/car/loans/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除車貸失敗' }, { status: 500 });
  }
});
