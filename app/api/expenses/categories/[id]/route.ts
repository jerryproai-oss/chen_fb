import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * PATCH /api/expenses/categories/[id] — 更新分類
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const existing = await prisma.expenseCategory.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '分類不存在' }, { status: 404 });
    }

    const body = await req.json();
    const { name, emoji } = body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json({ error: '分類名稱不可為空' }, { status: 400 });
      }
      if (name.trim().length > 20) {
        return NextResponse.json({ error: '分類名稱不可超過 20 字' }, { status: 400 });
      }
      data.name = name.trim();
    }

    if (emoji !== undefined) {
      if (typeof emoji === 'string' && emoji.trim()) {
        data.emoji = emoji.trim();
      }
    }

    const category = await prisma.expenseCategory.update({
      where: { id },
      data,
    });

    return NextResponse.json({ category });
  } catch (error) {
    console.error('[PATCH /api/expenses/categories/[id]]', error);
    return NextResponse.json({ error: '更新分類失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/expenses/categories/[id] — 刪除分類
 * 相關紀錄的 categoryId 會被設為 null（Prisma onDelete: SetNull）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const existing = await prisma.expenseCategory.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: '分類不存在' }, { status: 404 });
    }

    await prisma.expenseCategory.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/expenses/categories/[id]]', error);
    return NextResponse.json({ error: '刪除分類失敗' }, { status: 500 });
  }
});
