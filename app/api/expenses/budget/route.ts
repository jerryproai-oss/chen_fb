import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/expenses/budget — 取得指定月份的預算
 * Query params: month (YYYY-MM)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');

  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '請提供有效月份（YYYY-MM）' }, { status: 400 });
    }

    const budget = await prisma.expenseBudget.findUnique({
      where: {
        userId_month: { userId: user.id, month },
      },
    });

    return NextResponse.json({ budget });
  } catch (error) {
    console.error('[GET /api/expenses/budget]', error);
    return NextResponse.json({ error: '取得預算失敗' }, { status: 500 });
  }
});

/**
 * PUT /api/expenses/budget — 設定/更新指定月份的預算
 */
export const PUT = withAuth(async ({ user }, req: NextRequest) => {
  try {
    const body = await req.json();
    const { month, amount } = body;

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '請提供有效月份（YYYY-MM）' }, { status: 400 });
    }

    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: '預算金額必須為正整數' }, { status: 400 });
    }

    const budget = await prisma.expenseBudget.upsert({
      where: {
        userId_month: { userId: user.id, month },
      },
      update: { amount },
      create: {
        userId: user.id,
        month,
        amount,
      },
    });

    return NextResponse.json({ budget });
  } catch (error) {
    console.error('[PUT /api/expenses/budget]', error);
    return NextResponse.json({ error: '設定預算失敗' }, { status: 500 });
  }
});
