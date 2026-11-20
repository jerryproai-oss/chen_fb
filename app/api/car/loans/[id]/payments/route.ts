import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/**
 * GET /api/car/loans/[id]/payments
 *
 * 列出還款記錄
 */
export const GET = withAuth(async (_ctx, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  // 確認車貸存在
  const loan = await prisma.carLoan.findUnique({ where: { id } });
  if (!loan) {
    return NextResponse.json({ error: '車貸不存在' }, { status: 404 });
  }

  try {
    const payments = await prisma.carLoanPayment.findMany({
      where: { loanId: id },
      orderBy: { installmentNo: 'asc' },
    });

    const formatted = payments.map((p) => ({
      id: p.id,
      installmentNo: p.installmentNo,
      dueDate: p.dueDate.toISOString().split('T')[0],
      amount: Number(p.amount),
      principal: Number(p.principal),
      interest: Number(p.interest),
      remainingBalance: Number(p.remainingBalance),
      status: p.status,
      paidAt: p.paidAt ? p.paidAt.toISOString() : null,
      note: p.note,
    }));

    return NextResponse.json({
      payments: formatted,
      summary: {
        totalInstallments: loan.totalInstallments,
        paidCount: payments.filter((p) => p.status === 'PAID').length,
        overdueCount: payments.filter((p) => p.status === 'OVERDUE').length,
        loanAmount: Number(loan.loanAmount),
        monthlyPayment: Number(loan.monthlyPayment),
      },
    });
  } catch (error) {
    console.error('[GET /api/car/loans/[id]/payments] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得還款記錄' }, { status: 500 });
  }
});

/**
 * PATCH /api/car/loans/[id]/payments (ADMIN)
 *
 * 標記某期已繳（?installmentNo=）→ status=PAID, paidAt=now
 */
export const PATCH = withAdmin(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;
  const { searchParams } = new URL(req.url);
  const installmentNoStr = searchParams.get('installmentNo');

  if (!installmentNoStr) {
    return NextResponse.json({ error: 'installmentNo 為必填查詢參數' }, { status: 400 });
  }

  const installmentNo = parseInt(installmentNoStr, 10);
  if (isNaN(installmentNo) || installmentNo <= 0) {
    return NextResponse.json({ error: 'installmentNo 必須為正整數' }, { status: 400 });
  }

  // 確認車貸存在
  const loan = await prisma.carLoan.findUnique({ where: { id } });
  if (!loan) {
    return NextResponse.json({ error: '車貸不存在' }, { status: 404 });
  }

  // 找到該期
  const payment = await prisma.carLoanPayment.findFirst({
    where: { loanId: id, installmentNo },
  });

  if (!payment) {
    return NextResponse.json({ error: `第 ${installmentNo} 期不存在` }, { status: 404 });
  }

  if (payment.status === 'PAID') {
    return NextResponse.json({ error: `第 ${installmentNo} 期已繳` }, { status: 400 });
  }

  // 讀取 body（可選 note）
  let note: string | undefined;
  try {
    const body = await req.json();
    if (body.note && typeof body.note === 'string') {
      note = body.note.trim();
    }
  } catch {
    // body 為選填，忽略解析失敗
  }

  try {
    const updateData: Record<string, unknown> = {
      status: 'PAID',
      paidAt: new Date(),
    };
    if (note !== undefined) {
      updateData.note = note || null;
    }

    const updated = await prisma.carLoanPayment.update({
      where: { id: payment.id },
      data: updateData,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_PAYMENT,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      payment: {
        id: updated.id,
        installmentNo: updated.installmentNo,
        dueDate: updated.dueDate.toISOString().split('T')[0],
        amount: Number(updated.amount),
        principal: Number(updated.principal),
        interest: Number(updated.interest),
        remainingBalance: Number(updated.remainingBalance),
        status: updated.status,
        paidAt: updated.paidAt ? updated.paidAt.toISOString() : null,
        note: updated.note,
      },
    });
  } catch (error) {
    console.error('[PATCH /api/car/loans/[id]/payments] 標記失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_PAYMENT,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '標記繳款失敗' }, { status: 500 });
  }
});
