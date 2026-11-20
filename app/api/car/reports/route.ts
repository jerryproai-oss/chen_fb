import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/car/reports
 *
 * 報表數據（?vehicleId=&type=month|quarter|year&year=&month=）
 * 彙總：各人天數、各人費用、各項目費用、繳款狀態、油耗趨勢
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const reportType = searchParams.get('type') || 'month';

  // ── 首頁摘要 ──────────────────────────────────────
  if (reportType === 'summary') {
    return handleSummary();
  }

  // ── AI 狀態 ───────────────────────────────────────
  if (reportType === 'ai-status') {
    return NextResponse.json({ aiEnabled: !!process.env.GEMINI_API_KEY });
  }

  const vehicleId = searchParams.get('vehicleId');
  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId 為必填' }, { status: 400 });
  }

  if (!['month', 'quarter', 'year'].includes(reportType)) {
    return NextResponse.json({ error: 'type 需為 month、quarter 或 year' }, { status: 400 });
  }

  // 計算日期範圍
  let startDate: Date;
  let endDate: Date;

  if (reportType === 'month') {
    startDate = new Date(Date.UTC(year, month - 1, 1));
    endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  } else if (reportType === 'quarter') {
    const quarterStart = Math.floor((month - 1) / 3) * 3;
    startDate = new Date(Date.UTC(year, quarterStart, 1));
    endDate = new Date(Date.UTC(year, quarterStart + 3, 0, 23, 59, 59, 999));
  } else {
    // year
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  }

  try {
    // 並行查詢各項數據
    const [bookings, costRecords, fuelRecords, loanPayments] = await Promise.all([
      // 1. 用車預約（計算各人天數）
      prisma.carBooking.findMany({
        where: {
          vehicleId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          status: { in: ['RESERVED', 'OUT', 'COMPLETED'] },
        },
        include: {
          user: { select: { id: true, displayName: true } },
        },
      }),

      // 2. 費用結算（各項目費用 + 繳款狀態）
      prisma.carCostRecord.findMany({
        where: {
          vehicleId,
          settlementDate: { gte: startDate, lte: endDate },
        },
        include: {
          shares: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
          },
          paidBy: { select: { id: true, displayName: true } },
        },
      }),

      // 3. 加油記錄（油耗趨勢）
      prisma.carFuelRecord.findMany({
        where: {
          vehicleId,
          fuelDate: { gte: startDate, lte: endDate },
        },
        include: {
          user: { select: { id: true, displayName: true } },
        },
        orderBy: { fuelDate: 'asc' },
      }),

      // 4. 車貸繳款（該期間到期的）
      prisma.carLoanPayment.findMany({
        where: {
          loan: { vehicleId },
          dueDate: { gte: startDate, lte: endDate },
        },
        include: {
          loan: { select: { id: true, lender: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    // ── 彙整：各人天數 ──────────────────────────
    const userDaysMap: Record<string, { userId: string; displayName: string; totalDays: number }> = {};
    for (const booking of bookings) {
      const key = booking.userId;
      if (!userDaysMap[key]) {
        userDaysMap[key] = { userId: key, displayName: booking.user.displayName, totalDays: 0 };
      }
      userDaysMap[key].totalDays += booking.countedDays || booking.applyDays;
    }
    const userDays = Object.values(userDaysMap);

    // ── 彙整：各人費用 ──────────────────────────
    const userCostMap: Record<string, { userId: string; displayName: string; totalAmount: number }> = {};
    for (const cost of costRecords) {
      for (const share of cost.shares) {
        const key = share.userId;
        if (!userCostMap[key]) {
          userCostMap[key] = { userId: key, displayName: share.user.displayName, totalAmount: 0 };
        }
        userCostMap[key].totalAmount += Number(share.amount);
      }
    }
    const userCosts = Object.values(userCostMap);

    // ── 彙整：各項目費用 ────────────────────────
    const itemCostMap: Record<string, number> = {};
    for (const cost of costRecords) {
      if (!itemCostMap[cost.item]) itemCostMap[cost.item] = 0;
      itemCostMap[cost.item] += Number(cost.totalAmount);
    }
    const itemCosts = Object.entries(itemCostMap).map(([item, amount]) => ({ item, amount }));

    // ── 彙整：繳款狀態 ──────────────────────────
    let totalShareCount = 0;
    let unpaidCount = 0;
    let paidCount = 0;
    let confirmedCount = 0;
    let unpaidAmount = 0;
    for (const cost of costRecords) {
      for (const share of cost.shares) {
        totalShareCount++;
        const amt = Number(share.amount);
        if (share.paymentStatus === 'UNPAID') {
          unpaidCount++;
          unpaidAmount += amt;
        } else if (share.paymentStatus === 'PAID') {
          paidCount++;
        } else if (share.paymentStatus === 'CONFIRMED') {
          confirmedCount++;
        }
      }
    }
    const paymentSummary = {
      totalShareCount,
      unpaidCount,
      paidCount,
      confirmedCount,
      unpaidAmount: Math.round(unpaidAmount),
    };

    // ── 彙整：油耗趨勢 ──────────────────────────
    const fuelTrend = fuelRecords.map((rec, idx) => {
      const prevRec = idx > 0 ? fuelRecords[idx - 1] : null;
      let efficiency: number | null = null;

      if (prevRec) {
        const distance = rec.mileage - prevRec.mileage;
        if (distance > 0) {
          if (rec.liters && Number(rec.liters) > 0) {
            efficiency = Math.round((distance / Number(rec.liters)) * 100) / 100;
          } else if (rec.kwh && Number(rec.kwh) > 0) {
            efficiency = Math.round((distance / Number(rec.kwh)) * 100) / 100;
          }
        }
      }

      return {
        date: rec.fuelDate.toISOString().split('T')[0],
        mileage: rec.mileage,
        amount: Number(rec.amount),
        liters: rec.liters ? Number(rec.liters) : null,
        efficiency,
        user: rec.user.displayName,
      };
    });

    // ── 彙整：車貸繳款狀態 ──────────────────────
    const loanSummary = {
      totalDue: loanPayments.length,
      paid: loanPayments.filter((p) => p.status === 'PAID').length,
      overdue: loanPayments.filter((p) => p.status === 'OVERDUE').length,
      upcoming: loanPayments.filter((p) => p.status === 'UPCOMING').length,
      totalDueAmount: loanPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    };

    // ── 總費用摘要 ──────────────────────────────
    const totalCostAmount = costRecords.reduce((sum, c) => sum + Number(c.totalAmount), 0);
    const totalFuelAmount = fuelRecords.reduce((sum, f) => sum + Number(f.amount), 0);

    return NextResponse.json({
      period: {
        type: reportType,
        year,
        month: reportType === 'month' ? month : undefined,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      },
      summary: {
        totalCostAmount: Math.round(totalCostAmount),
        totalFuelAmount: Math.round(totalFuelAmount),
        totalBookings: bookings.length,
      },
      userDays,
      userCosts,
      itemCosts,
      paymentSummary,
      fuelTrend,
      loanSummary,
    });
  } catch (error) {
    console.error('[GET /api/car/reports] 查詢失敗:', error);
    return NextResponse.json({ error: '無法產生報表' }, { status: 500 });
  }
});


// ── 首頁摘要 handleSummary ─────────────────────────────────

async function handleSummary() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 取得第一台活躍車輛
    const vehicle = await prisma.vehicle.findFirst({
      where: { isActive: true },
    });

    if (!vehicle) {
      return NextResponse.json({ summary: null });
    }

    const [todayBookings, unpaidShares, activeLoan, weeklyFuel] = await Promise.all([
      // 今日用車
      prisma.carBooking.findMany({
        where: {
          vehicleId: vehicle.id,
          startDate: { lte: todayEnd },
          endDate: { gte: today },
          status: { in: ['RESERVED', 'OUT'] },
        },
        include: { user: { select: { displayName: true } } },
      }),

      // 待繳金額
      prisma.carCostShare.findMany({
        where: { paymentStatus: 'UNPAID' },
        select: { amount: true },
      }),

      // 車貸
      prisma.carLoan.findFirst({
        where: { vehicleId: vehicle.id, isActive: true },
        include: {
          payments: {
            orderBy: { installmentNo: 'asc' },
          },
        },
      }),

      // 上週油耗
      prisma.carFuelRecord.findMany({
        where: {
          vehicleId: vehicle.id,
          fuelDate: { gte: oneWeekAgo, lte: todayEnd },
        },
        orderBy: { mileage: 'asc' },
      }),
    ]);

    // 整理待繳金額
    const unpaidAmount = unpaidShares.reduce((s, sh) => s + Number(sh.amount), 0);

    // 整理車貸進度
    let loanProgress = null;
    if (activeLoan) {
      const paidCount = activeLoan.payments.filter(p => p.status === 'PAID').length;
      const totalInst = activeLoan.totalInstallments;
      const nextPayment = activeLoan.payments.find(p => p.status !== 'PAID');
      loanProgress = {
        paidCount,
        totalInstallments: totalInst,
        progressPercent: totalInst > 0 ? Math.round((paidCount / totalInst) * 100) : 0,
        nextDueDate: nextPayment ? nextPayment.dueDate.toISOString().split('T')[0] : null,
        nextAmount: nextPayment ? Number(nextPayment.amount) : null,
      };
    }

    // 整理上週油耗
    const totalFuelAmount = weeklyFuel.reduce((s, f) => s + Number(f.amount), 0);
    const totalLiters = weeklyFuel.reduce((s, f) => s + (f.liters ? Number(f.liters) : 0), 0);
    let avgEfficiency: number | null = null;
    if (weeklyFuel.length >= 2) {
      const first = weeklyFuel[0];
      const last = weeklyFuel[weeklyFuel.length - 1];
      const dist = last.mileage - first.mileage;
      if (dist > 0 && totalLiters > 0) {
        avgEfficiency = Math.round((dist / totalLiters) * 10) / 10;
      }
    }

    return NextResponse.json({
      summary: {
        todayBookings: {
          count: todayBookings.length,
          users: todayBookings.map(b => b.user.displayName),
        },
        unpaidAmount: Math.round(unpaidAmount),
        nextMaintenance: {
          date: vehicle.nextMaintenanceDate
            ? vehicle.nextMaintenanceDate.toISOString().split('T')[0]
            : null,
          mileage: vehicle.nextMaintenanceMileage,
        },
        loanProgress,
        weeklyFuel: {
          totalAmount: Math.round(totalFuelAmount),
          totalLiters: totalLiters > 0 ? Math.round(totalLiters * 10) / 10 : null,
          avgEfficiency,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/car/reports?type=summary] 失敗:', error);
    return NextResponse.json({ error: '無法取得摘要' }, { status: 500 });
  }
}
