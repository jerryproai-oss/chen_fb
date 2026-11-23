import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

// ── 看板範本 ────────────────────────────────────────────────

const TEMPLATES: Record<string, { emoji: string; title: string; columns: { title: string; color: string }[] }> = {
  chores: {
    emoji: '🏠',
    title: '家務管理',
    columns: [
      { title: '待辦', color: '#e3f2fd' },
      { title: '進行中', color: '#fff3e0' },
      { title: '完成', color: '#e8f5e9' },
    ],
  },
  travel: {
    emoji: '✈️',
    title: '旅行規劃',
    columns: [
      { title: '構想', color: '#f3e5f5' },
      { title: '規劃中', color: '#fff3e0' },
      { title: '已預訂', color: '#e3f2fd' },
      { title: '出發！', color: '#e8f5e9' },
    ],
  },
  shopping: {
    emoji: '🛒',
    title: '採購清單',
    columns: [
      { title: '待買', color: '#fff3e0' },
      { title: '已買', color: '#e8f5e9' },
    ],
  },
  study: {
    emoji: '📚',
    title: '學習追蹤',
    columns: [
      { title: '待學習', color: '#e3f2fd' },
      { title: '進行中', color: '#fff3e0' },
      { title: '已完成', color: '#e8f5e9' },
      { title: '複習', color: '#fce4ec' },
    ],
  },
  health: {
    emoji: '💪',
    title: '健康管理',
    columns: [
      { title: '目標', color: '#e3f2fd' },
      { title: '執行中', color: '#fff3e0' },
      { title: '已達成', color: '#e8f5e9' },
    ],
  },
  meal: {
    emoji: '🍽️',
    title: '每週菜單',
    columns: [
      { title: '週一～三', color: '#fce4ec' },
      { title: '週四～五', color: '#e3f2fd' },
      { title: '週六～日', color: '#f3e5f5' },
      { title: '備料', color: '#fff3e0' },
      { title: '完成', color: '#e8f5e9' },
    ],
  },
  budget: {
    emoji: '💰',
    title: '家庭預算',
    columns: [
      { title: '規劃', color: '#e3f2fd' },
      { title: '待繳', color: '#fff3e0' },
      { title: '已繳', color: '#e8f5e9' },
    ],
  },
  event: {
    emoji: '🎉',
    title: '活動企劃',
    columns: [
      { title: '發想', color: '#f3e5f5' },
      { title: '準備中', color: '#fff3e0' },
      { title: '執行', color: '#e3f2fd' },
      { title: '回顧', color: '#e8f5e9' },
    ],
  },
  reading: {
    emoji: '📖',
    title: '閱讀計畫',
    columns: [
      { title: '想讀', color: '#f3e5f5' },
      { title: '閱讀中', color: '#fff3e0' },
      { title: '讀完', color: '#e8f5e9' },
      { title: '推薦', color: '#fce4ec' },
    ],
  },
  moving: {
    emoji: '📦',
    title: '搬家清單',
    columns: [
      { title: '打包', color: '#fff3e0' },
      { title: '搬運', color: '#e3f2fd' },
      { title: '整理', color: '#f3e5f5' },
      { title: '完成', color: '#e8f5e9' },
    ],
  },
  pet: {
    emoji: '🐾',
    title: '寵物照顧',
    columns: [
      { title: '餵食', color: '#fff3e0' },
      { title: '清潔', color: '#e3f2fd' },
      { title: '就醫', color: '#fce4ec' },
      { title: '用品', color: '#f3e5f5' },
    ],
  },
  garden: {
    emoji: '🌱',
    title: '園藝種植',
    columns: [
      { title: '播種', color: '#e3f2fd' },
      { title: '照顧', color: '#fff3e0' },
      { title: '收成', color: '#e8f5e9' },
    ],
  },
};

/**
 * GET /api/kanban — 取得看板列表
 * 回傳使用者有權看的看板（FAMILY 全部 + 自己的 PRIVATE）
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter'); // all | family | private | archived
  const search = searchParams.get('search')?.trim();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      OR: [
        { visibility: 'FAMILY' },
        { creatorId: user.id, visibility: 'PRIVATE' },
      ],
    };

    if (filter === 'family') {
      where.OR = [{ visibility: 'FAMILY' }];
      where.archived = false;
    } else if (filter === 'private') {
      where.OR = [{ creatorId: user.id, visibility: 'PRIVATE' }];
      where.archived = false;
    } else if (filter === 'archived') {
      where.archived = true;
    } else {
      where.archived = false;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const boards = await prisma.kanbanBoard.findMany({
      where,
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        columns: {
          select: {
            id: true,
            _count: { select: { cards: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = boards.map((b) => ({
      id: b.id,
      title: b.title,
      emoji: b.emoji,
      description: b.description,
      visibility: b.visibility,
      archived: b.archived,
      creatorId: b.creatorId,
      creator: b.creator,
      columnsCount: b.columns.length,
      cardsCount: b.columns.reduce((sum, c) => sum + c._count.cards, 0),
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));

    return NextResponse.json({ boards: result });
  } catch (error) {
    console.error('[GET /api/kanban]', error);
    return NextResponse.json({ error: '取得看板列表失敗' }, { status: 500 });
  }
});

/**
 * POST /api/kanban — 建立看板
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  try {
    const body = await req.json();
    const { title, emoji, description, visibility, columns, template } = body;

    // 使用範本
    if (template && TEMPLATES[template]) {
      const tmpl = TEMPLATES[template];
      const board = await prisma.kanbanBoard.create({
        data: {
          title: tmpl.title,
          emoji: tmpl.emoji,
          description: null,
          visibility: visibility === 'PRIVATE' ? 'PRIVATE' : 'FAMILY',
          creatorId: user.id,
          columns: {
            create: tmpl.columns.map((col, idx) => ({
              title: col.title,
              color: col.color,
              sortOrder: idx,
            })),
          },
        },
        include: {
          creator: { select: { id: true, displayName: true, avatarUrl: true } },
          columns: { orderBy: { sortOrder: 'asc' } },
        },
      });
      return NextResponse.json({ board }, { status: 201 });
    }

    // 自訂看板
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '看板標題為必填' }, { status: 400 });
    }
    if (title.trim().length > 50) {
      return NextResponse.json({ error: '標題長度不可超過 50 字' }, { status: 400 });
    }

    const boardEmoji = typeof emoji === 'string' && emoji.trim() ? emoji.trim() : '📋';
    const boardVisibility = visibility === 'PRIVATE' ? 'PRIVATE' : 'FAMILY';
    const boardDescription = typeof description === 'string' && description.trim() ? description.trim() : null;

    // 預設欄位
    const defaultColumns = Array.isArray(columns) && columns.length > 0
      ? columns.slice(0, 10).map((c: { title?: string; color?: string }, idx: number) => ({
          title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : `欄位 ${idx + 1}`,
          color: typeof c.color === 'string' ? c.color : '#5a7a5a',
          sortOrder: idx,
        }))
      : [
          { title: '待辦', color: '#e3f2fd', sortOrder: 0 },
          { title: '進行中', color: '#fff3e0', sortOrder: 1 },
          { title: '完成', color: '#e8f5e9', sortOrder: 2 },
        ];

    const board = await prisma.kanbanBoard.create({
      data: {
        title: title.trim(),
        emoji: boardEmoji,
        description: boardDescription,
        visibility: boardVisibility,
        creatorId: user.id,
        columns: {
          create: defaultColumns,
        },
      },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        columns: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/kanban]', error);
    return NextResponse.json({ error: '建立看板失敗' }, { status: 500 });
  }
});
