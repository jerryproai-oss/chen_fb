import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── 預設分類（首次自動 seed）────────────────────────────────

const DEFAULT_CATEGORIES = [
  { name: '美食', emoji: '🍽️', sortOrder: 1 },
  { name: '旅遊', emoji: '✈️', sortOrder: 2 },
  { name: '購物', emoji: '🛒', sortOrder: 3 },
  { name: '生活', emoji: '🏠', sortOrder: 4 },
  { name: '工作', emoji: '💼', sortOrder: 5 },
  { name: '學習', emoji: '📚', sortOrder: 6 },
  { name: '醫療', emoji: '🏥', sortOrder: 7 },
  { name: '其他', emoji: '📎', sortOrder: 8 },
];

// ── GET /api/quick-shares/categories ─────────────────────────

export const GET = withAuth(async ({ user }) => {
  let categories = await prisma.shareCategory.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  // 首次使用：自動 seed 預設分類
  if (categories.length === 0) {
    await prisma.shareCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        createdBy: user.id,
      })),
    });
    categories = await prisma.shareCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  return NextResponse.json(categories);
});

// ── POST /api/quick-shares/categories ────────────────────────

export const POST = withAuth(async ({ user }, req) => {
  let body: { name?: string; emoji?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { name, emoji } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '分類名稱不能為空' }, { status: 400 });
  }

  if (name.trim().length > 20) {
    return NextResponse.json({ error: '分類名稱不能超過 20 個字' }, { status: 400 });
  }

  // 檢查重複
  const existing = await prisma.shareCategory.findUnique({
    where: { name: name.trim() },
  });
  if (existing) {
    return NextResponse.json({ error: '此分類名稱已存在' }, { status: 409 });
  }

  // 取得最大排序值
  const maxSort = await prisma.shareCategory.aggregate({
    _max: { sortOrder: true },
  });

  const category = await prisma.shareCategory.create({
    data: {
      name: name.trim(),
      emoji: emoji?.trim() || '📎',
      sortOrder: (maxSort._max.sortOrder || 0) + 1,
      createdBy: user.id,
    },
  });

  return NextResponse.json(category, { status: 201 });
});
