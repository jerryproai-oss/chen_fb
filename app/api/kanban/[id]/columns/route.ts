import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * POST /api/kanban/[id]/columns — 新增欄位
 */
export const POST = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const board = await prisma.kanbanBoard.findUnique({ where: { id } });
    if (!board) {
      return NextResponse.json({ error: '看板不存在' }, { status: 404 });
    }
    if (board.visibility === 'PRIVATE' && board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此看板' }, { status: 403 });
    }

    const body = await req.json();
    const { title, color } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '欄位標題為必填' }, { status: 400 });
    }
    if (title.trim().length > 30) {
      return NextResponse.json({ error: '欄位標題不可超過 30 字' }, { status: 400 });
    }

    // 取得最大 sortOrder
    const maxCol = await prisma.kanbanColumn.findFirst({
      where: { boardId: id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const column = await prisma.kanbanColumn.create({
      data: {
        boardId: id,
        title: title.trim(),
        color: typeof color === 'string' && color.trim() ? color.trim() : '#5a7a5a',
        sortOrder: (maxCol?.sortOrder ?? -1) + 1,
      },
      include: {
        cards: true,
      },
    });

    return NextResponse.json({ column }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/kanban/[id]/columns]', error);
    return NextResponse.json({ error: '新增欄位失敗' }, { status: 500 });
  }
});
