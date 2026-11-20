import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { generateAmortizationSchedule } from '@/lib/car/loan-calculator';

/**
 * GET /api/car/loans
 *
 * 列出車貸（?vehicleId=&isActive=）含已繳期數
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const isActiveParam = searchParams.get('isActive');

  try {
    const where: Record<string, unknown> = {};
    if (vehicleId) where.vehicleId = vehicleId;
    if (isActiveParam !== null) {
      where.isActive = isActiveParam === 'true';
    }

    const loans = await prisma.carLoan.findMany({
      where,
      include: {
        vehicle: { select: { id: true, name: true } },
        payments: {
          select: { status: true, remainingBalance: true, installmentNo: true },
          orderBy: { installmentNo: 'asc' },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    const formatted = loans.map((loan) => {
      const paidPayments = loan.payments.filter((p) => p.status === 'PAID');
      const paidCount = paidPayments.length;

      // 剩餘本金：取最後一筆已繳的 remainingBalance，若無已繳則為貸款金額
      const lastPaid = loan.payments
        .filter((p) => p.status === 'PAID')
        .sort((a, b) => b.installmentNo - a.installmentNo)[0];
      const remainingBalance = lastPaid
        ? Number(lastPaid.remainingBalance)
        : Number(loan.loanAmount);

      return {
        id: loan.id,
        vehicleId: loan.vehicleId,
        vehicle: loan.vehicle,
        lender: loan.lender,
        totalAmount: Number(loan.totalAmount),
        downPayment: Number(loan.downPayment),
        loanAmount: Number(loan.loanAmount),
        interestRate: Number(loan.interestRate),
        totalInstallments: loan.totalInstallments,
        monthlyPayment: Number(loan.monthlyPayment),
        startDate: loan.startDate.toISOString().split('T')[0],
        endDate: loan.endDate.toISOString().split('T')[0],
        paymentDay: loan.paymentDay,
        note: loan.note,
        isActive: loan.isActive,
        paidCount,
        remainingBalance,
        createdAt: loan.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ loans: formatted });
  } catch (error) {
    console.error('[GET /api/car/loans] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得車貸資料' }, { status: 500 });
  }
});

/**
 * POST /api/car/loans (ADMIN)
 *
 * 新增車貸 → 用 loan-calculator 自動產生全部 CarLoanPayment
 */
export const POST = withAdmin(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    vehicleId,
    lender,
    totalAmount,
    downPayment,
    loanAmount,
    interestRate,
    totalInstallments,
    startDate,
    paymentDay,
    note,
  } = body;

  // ── 驗證 ────────────────────────────────────────
  if (!vehicleId || typeof vehicleId !== 'string') {
    return NextResponse.json({ error: 'vehicleId 為必填' }, { status: 400 });
  }
  if (!lender || typeof lender !== 'string') {
    return NextResponse.json({ error: '貸款機構為必填' }, { status: 400 });
  }
  if (typeof totalAmount !== 'number' || totalAmount <= 0) {
    return NextResponse.json({ error: '車輛總價必須大於 0' }, { status: 400 });
  }
  if (typeof downPayment !== 'number' || downPayment < 0) {
    return NextResponse.json({ error: '頭期款必須 ≥ 0' }, { status: 400 });
  }
  if (typeof loanAmount !== 'number' || loanAmount <= 0) {
    return NextResponse.json({ error: '貸款金額必須大於 0' }, { status: 400 });
  }
  if (typeof interestRate !== 'number' || interestRate < 0) {
    return NextResponse.json({ error: '年利率必須 ≥ 0' }, { status: 400 });
  }
  if (typeof totalInstallments !== 'number' || totalInstallments <= 0 || !Number.isInteger(totalInstallments)) {
    return NextResponse.json({ error: '總期數必須為正整數' }, { status: 400 });
  }
  if (!startDate || typeof startDate !== 'string') {
    return NextResponse.json({ error: '貸款起始日為必填（YYYY-MM-DD）' }, { status: 400 });
  }
  if (typeof paymentDay !== 'number' || paymentDay < 1 || paymentDay > 31) {
    return NextResponse.json({ error: '每月扣款日需在 1-31 之間' }, { status: 400 });
  }

  const parsedStartDate = new Date(startDate + 'T00:00:00Z');
  if (isNaN(parsedStartDate.getTime())) {
    return NextResponse.json({ error: '無效的起始日期' }, { status: 400 });
  }

  // 驗證車輛存在
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) {
    return NextResponse.json({ error: '車輛不存在' }, { status: 404 });
  }

  try {
    // 用 loan-calculator 產生還款計畫
    const schedule = generateAmortizationSchedule({
      loanAmount,
      interestRate,
      totalInstallments,
      startDate: parsedStartDate,
      paymentDay,
    });

    const result = await prisma.$transaction(async (tx) => {
      // 1. 建立車貸
      const loan = await tx.carLoan.create({
        data: {
          vehicleId,
          lender: lender.trim(),
          totalAmount,
          downPayment,
          loanAmount,
          interestRate,
          totalInstallments,
          monthlyPayment: schedule.monthlyPayment,
          startDate: parsedStartDate,
          endDate: schedule.endDate,
          paymentDay,
          note: typeof note === 'string' ? note.trim() || null : null,
        },
      });

      // 2. 自動產生全部 CarLoanPayment
      const paymentData = schedule.installments.map((inst) => ({
        loanId: loan.id,
        installmentNo: inst.installmentNo,
        dueDate: inst.dueDate,
        amount: inst.amount,
        principal: inst.principal,
        interest: inst.interest,
        remainingBalance: inst.remainingBalance,
      }));

      await tx.carLoanPayment.createMany({ data: paymentData });

      return loan;
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: result.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      loan: {
        id: result.id,
        vehicleId: result.vehicleId,
        lender: result.lender,
        totalAmount: Number(result.totalAmount),
        downPayment: Number(result.downPayment),
        loanAmount: Number(result.loanAmount),
        interestRate: Number(result.interestRate),
        totalInstallments: result.totalInstallments,
        monthlyPayment: Number(result.monthlyPayment),
        startDate: result.startDate.toISOString().split('T')[0],
        endDate: result.endDate.toISOString().split('T')[0],
        paymentDay: result.paymentDay,
        note: result.note,
        isActive: result.isActive,
        paidCount: 0,
        remainingBalance: Number(result.loanAmount),
      },
      schedule: {
        totalInterest: schedule.totalInterest,
        totalPayment: schedule.totalPayment,
        installmentCount: schedule.installments.length,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/loans] 新增失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CAR_LOAN_CREATE,
      resourceType: ResourceTypes.CAR_LOAN,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '新增車貸失敗' }, { status: 500 });
  }
});
