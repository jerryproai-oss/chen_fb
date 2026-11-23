import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/expenses/stats — 取得月度統計
 * Query params: month (YYYY-MM)
 * Return: totalIncome, totalExpense, balance, categoryBreakdown, dailyTotals
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');

  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '請提供有效月份（YYYY-MM）' }, { status: 400 });
    }

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    // 取得該月所有紀錄
    const records = await prisma.expenseRecord.findMany({
      where: {
        userId: user.id,
        date: { gte: startDate, lt: endDate },
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    // 計算總收入與總支出
    let totalIncome = 0;
    let totalExpense = 0;

    // 分類統計
    const categoryMap = new Map<string, {
      categoryId: string | null;
      name: string;
      emoji: string;
      amount: number;
      count: number;
    }>();

    // 每日統計
    const dailyMap = new Map<string, { income: number; expense: number }>();

    // 計算月份天數
    const daysInMonth = new Date(year, mon, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      dailyMap.set(dateStr, { income: 0, expense: 0 });
    }

    for (const record of records) {
      if (record.type === 'INCOME') {
        totalIncome += record.amount;
      } else {
        totalExpense += record.amount;
      }

      // 分類統計（僅統計支出）
      if (record.type === 'EXPENSE') {
        const catKey = record.categoryId || '__uncategorized__';
        const existing = categoryMap.get(catKey);
        if (existing) {
          existing.amount += record.amount;
          existing.count += 1;
        } else {
          categoryMap.set(catKey, {
            categoryId: record.categoryId,
            name: record.category?.name || '未分類',
            emoji: record.category?.emoji || '📦',
            amount: record.amount,
            count: 1,
          });
        }
      }

      // 每日統計
      const dateStr = record.date.toISOString().split('T')[0];
      const daily = dailyMap.get(dateStr);
      if (daily) {
        if (record.type === 'INCOME') {
          daily.income += record.amount;
        } else {
          daily.expense += record.amount;
        }
      }
    }

    // 分類統計排序（按金額降序）
    const categoryBreakdown = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount);

    // 每日統計轉為陣列
    const dailyTotals = Array.from(dailyMap.entries()).map(([date, totals]) => ({
      date,
      income: totals.income,
      expense: totals.expense,
    }));

    const balance = totalIncome - totalExpense;

    return NextResponse.json({
      totalIncome,
      totalExpense,
      balance,
      categoryBreakdown,
      dailyTotals,
    });
  } catch (error) {
    console.error('[GET /api/expenses/stats]', error);
    return NextResponse.json({ error: '取得統計失敗' }, { status: 500 });
  }
});
