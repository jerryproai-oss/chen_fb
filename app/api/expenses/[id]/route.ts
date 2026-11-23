import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * PATCH /api/expenses/[id] — 更新記帳紀錄
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    // 確認紀錄存在且屬於當前使用者
    const existing = await prisma.expenseRecord.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '紀錄不存在' }, { status: 404 });
    }

    const body = await req.json();
    const { amount, type, categoryId, date, note, visibility } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    // 驗證金額
    if (amount !== undefined) {
      if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
        return NextResponse.json({ error: '金額必須為正整數' }, { status: 400 });
      }
      data.amount = amount;
    }

    // 驗證類型
    if (type !== undefined) {
      if (type !== 'INCOME' && type !== 'EXPENSE') {
        return NextResponse.json({ error: '類型必須為 INCOME 或 EXPENSE' }, { status: 400 });
      }
      data.type = type;
    }

    // 驗證日期
    if (date !== undefined) {
      if (!date || isNaN(new Date(date).getTime())) {
        return NextResponse.json({ error: '請提供有效日期' }, { status: 400 });
      }
      data.date = new Date(date);
    }

    // 驗證分類
    if (categoryId !== undefined) {
      if (categoryId === null) {
        data.categoryId = null;
      } else {
        const category = await prisma.expenseCategory.findFirst({
          where: { id: categoryId, userId: user.id },
        });
        if (!category) {
          return NextResponse.json({ error: '分類不存在' }, { status: 400 });
        }
        data.categoryId = categoryId;
      }
    }

    if (note !== undefined) {
      data.note = note?.trim() || null;
    }

    if (visibility !== undefined) {
      data.visibility = visibility === 'FAMILY' ? 'FAMILY' : 'PRIVATE';
    }

    const record = await prisma.expenseRecord.update({
      where: { id },
      data,
      include: {
        category: { select: { id: true, name: true, emoji: true } },
      },
    });

    return NextResponse.json({ record });
  } catch (error) {
    console.error('[PATCH /api/expenses/[id]]', error);
    return NextResponse.json({ error: '更新紀錄失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/expenses/[id] — 刪除記帳紀錄（只能刪除自己的）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const existing = await prisma.expenseRecord.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '紀錄不存在' }, { status: 404 });
    }

    await prisma.expenseRecord.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/expenses/[id]]', error);
    return NextResponse.json({ error: '刪除紀錄失敗' }, { status: 500 });
  }
});
