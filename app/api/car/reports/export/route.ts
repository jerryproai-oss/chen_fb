import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/car/reports/export
 *
 * 匯出 CSV（?vehicleId=&type=month|quarter|year&year=&month=&format=csv）
 */
export const GET = withAuth(async (_ctx, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const vehicleId = searchParams.get('vehicleId');
  const reportType = searchParams.get('type') || 'month';
  const now = new Date();
  const year = parseInt(searchParams.get('year') || String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1), 10);

  if (!vehicleId) {
    return NextResponse.json({ error: 'vehicleId 為必填' }, { status: 400 });
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
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  }

  try {
    // 取得車輛資訊
    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) {
      return NextResponse.json({ error: '車輛不存在' }, { status: 404 });
    }

    // 並行查詢
    const [costRecords, fuelRecords, bookings] = await Promise.all([
      prisma.carCostRecord.findMany({
        where: {
          vehicleId,
          settlementDate: { gte: startDate, lte: endDate },
        },
        include: {
          shares: {
            include: {
              user: { select: { displayName: true } },
            },
          },
          paidBy: { select: { displayName: true } },
        },
        orderBy: { settlementDate: 'asc' },
      }),
      prisma.carFuelRecord.findMany({
        where: {
          vehicleId,
          fuelDate: { gte: startDate, lte: endDate },
        },
        include: {
          user: { select: { displayName: true } },
        },
        orderBy: { fuelDate: 'asc' },
      }),
      prisma.carBooking.findMany({
        where: {
          vehicleId,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
          status: { in: ['RESERVED', 'OUT', 'COMPLETED'] },
        },
        include: {
          user: { select: { displayName: true } },
        },
        orderBy: { startDate: 'asc' },
      }),
    ]);

    // ── 組 CSV ──────────────────────────────────
    const BOM = '\uFEFF'; // UTF-8 BOM for Excel
    const lines: string[] = [];

    const periodLabel = reportType === 'month'
      ? `${year}年${month}月`
      : reportType === 'quarter'
        ? `${year}年第${Math.ceil(month / 3)}季`
        : `${year}年`;

    // 標題
    lines.push(`"${vehicle.name} 用車報表 — ${periodLabel}"`);
    lines.push('');

    // 1. 用車預約
    lines.push('"=== 用車記錄 ==="');
    lines.push('"使用者","開始日期","結束日期","天數","用途","狀態"');
    for (const b of bookings) {
      lines.push([
        csvEscape(b.user.displayName),
        b.startDate.toISOString().split('T')[0],
        b.endDate.toISOString().split('T')[0],
        String(b.countedDays || b.applyDays),
        csvEscape(b.purpose),
        b.status,
      ].join(','));
    }
    lines.push('');

    // 2. 費用結算
    lines.push('"=== 費用結算 ==="');
    lines.push('"結算日期","項目","總金額","代墊人","狀態"');
    for (const c of costRecords) {
      lines.push([
        c.settlementDate.toISOString().split('T')[0],
        csvEscape(c.item),
        String(Number(c.totalAmount)),
        csvEscape(c.paidBy.displayName),
        c.status,
      ].join(','));
    }
    lines.push('');

    // 3. 分攤明細
    lines.push('"=== 分攤明細 ==="');
    lines.push('"結算日期","項目","使用者","使用天數","分攤金額","繳款狀態"');
    for (const c of costRecords) {
      for (const s of c.shares) {
        lines.push([
          c.settlementDate.toISOString().split('T')[0],
          csvEscape(c.item),
          csvEscape(s.user.displayName),
          String(s.usageDays),
          String(Number(s.amount)),
          s.paymentStatus,
        ].join(','));
      }
    }
    lines.push('');

    // 4. 加油記錄
    lines.push('"=== 加油記錄 ==="');
    lines.push('"日期","加油人","油種","金額","公升數","里程","加油站"');
    for (const f of fuelRecords) {
      lines.push([
        f.fuelDate.toISOString().split('T')[0],
        csvEscape(f.user.displayName),
        f.fuelType,
        String(Number(f.amount)),
        f.liters ? String(Number(f.liters)) : '',
        String(f.mileage),
        csvEscape(f.station || ''),
      ].join(','));
    }

    const csv = BOM + lines.join('\r\n');
    const filename = `car_report_${vehicle.name}_${periodLabel}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/car/reports/export] 匯出失敗:', error);
    return NextResponse.json({ error: '匯出報表失敗' }, { status: 500 });
  }
});

/** CSV 欄位轉義 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `"${value}"`;
}
