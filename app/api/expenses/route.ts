import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/expenses — 取得某月份的記帳紀錄
 * Query params: month (YYYY-MM), type (all/income/expense)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get('month');
  const typeFilter = searchParams.get('type') || 'all';

  try {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: '請提供有效月份（YYYY-MM）' }, { status: 400 });
    }

    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      userId: user.id,
      date: { gte: startDate, lt: endDate },
    };

    if (typeFilter === 'income') {
      where.type = 'INCOME';
    } else if (typeFilter === 'expense') {
      where.type = 'EXPENSE';
    }

    const records = await prisma.expenseRecord.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, emoji: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ records });
  } catch (error) {
    console.error('[GET /api/expenses]', error);
    return NextResponse.json({ error: '取得記帳紀錄失敗' }, { status: 500 });
  }
});

/**
 * POST /api/expenses — 新增記帳紀錄
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  try {
    const body = await req.json();
    const { amount, type, categoryId, date, note, visibility } = body;

    // 驗證金額
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json({ error: '金額必須為正整數' }, { status: 400 });
    }

    // 驗證類型
    if (type !== 'INCOME' && type !== 'EXPENSE') {
      return NextResponse.json({ error: '類型必須為 INCOME 或 EXPENSE' }, { status: 400 });
    }

    // 驗證日期
    if (!date || isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: '請提供有效日期' }, { status: 400 });
    }

    // 驗證分類（若有提供）
    if (categoryId) {
      const category = await prisma.expenseCategory.findFirst({
        where: { id: categoryId, userId: user.id },
      });
      if (!category) {
        return NextResponse.json({ error: '分類不存在' }, { status: 400 });
      }
    }

    const record = await prisma.expenseRecord.create({
      data: {
        userId: user.id,
        categoryId: categoryId || null,
        amount,
        type,
        date: new Date(date),
        note: note?.trim() || null,
        visibility: visibility === 'FAMILY' ? 'FAMILY' : 'PRIVATE',
      },
      include: {
        category: { select: { id: true, name: true, emoji: true } },
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/expenses]', error);
    return NextResponse.json({ error: '新增記帳紀錄失敗' }, { status: 500 });
  }
});
