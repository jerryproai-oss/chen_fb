import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

// ── 預設分類 ──────────────────────────────────────────────

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: '餐飲', emoji: '🍽️', sortOrder: 0 },
  { name: '交通', emoji: '🚗', sortOrder: 1 },
  { name: '購物', emoji: '🛒', sortOrder: 2 },
  { name: '居住', emoji: '🏠', sortOrder: 3 },
  { name: '通訊', emoji: '📱', sortOrder: 4 },
  { name: '娛樂', emoji: '🎮', sortOrder: 5 },
  { name: '服飾', emoji: '👕', sortOrder: 6 },
  { name: '醫療', emoji: '💊', sortOrder: 7 },
  { name: '教育', emoji: '📚', sortOrder: 8 },
  { name: '人情', emoji: '🎁', sortOrder: 9 },
  { name: '寵物', emoji: '🐾', sortOrder: 10 },
  { name: '其他', emoji: '📦', sortOrder: 11 },
];

const DEFAULT_INCOME_CATEGORIES = [
  { name: '薪資', emoji: '💼', sortOrder: 0 },
  { name: '獎金', emoji: '💰', sortOrder: 1 },
  { name: '投資', emoji: '📈', sortOrder: 2 },
  { name: '紅包', emoji: '🧧', sortOrder: 3 },
  { name: '其他收入', emoji: '💵', sortOrder: 4 },
];

/**
 * GET /api/expenses/categories — 取得使用者的分類
 * 首次呼叫時自動建立預設分類
 */
export const GET = withAuth(async ({ user }) => {
  try {
    let categories = await prisma.expenseCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
    });

    // 若使用者沒有任何分類，自動建立預設分類
    if (categories.length === 0) {
      const expenseData = DEFAULT_EXPENSE_CATEGORIES.map((c) => ({
        ...c,
        userId: user.id,
        type: 'EXPENSE' as const,
      }));

      const incomeData = DEFAULT_INCOME_CATEGORIES.map((c) => ({
        ...c,
        userId: user.id,
        type: 'INCOME' as const,
      }));

      await prisma.expenseCategory.createMany({
        data: [...expenseData, ...incomeData],
      });

      categories = await prisma.expenseCategory.findMany({
        where: { userId: user.id },
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      });
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('[GET /api/expenses/categories]', error);
    return NextResponse.json({ error: '取得分類失敗' }, { status: 500 });
  }
});

/**
 * POST /api/expenses/categories — 新增自訂分類
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  try {
    const body = await req.json();
    const { name, emoji, type } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '分類名稱為必填' }, { status: 400 });
    }

    if (name.trim().length > 20) {
      return NextResponse.json({ error: '分類名稱不可超過 20 字' }, { status: 400 });
    }

    if (type !== 'INCOME' && type !== 'EXPENSE') {
      return NextResponse.json({ error: '類型必須為 INCOME 或 EXPENSE' }, { status: 400 });
    }

    // 取得目前最大 sortOrder
    const maxSort = await prisma.expenseCategory.findFirst({
      where: { userId: user.id, type },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const category = await prisma.expenseCategory.create({
      data: {
        userId: user.id,
        name: name.trim(),
        emoji: typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '📦',
        type,
        sortOrder: (maxSort?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/expenses/categories]', error);
    return NextResponse.json({ error: '新增分類失敗' }, { status: 500 });
  }
});
