import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * PATCH /api/kanban/columns/[columnId] — 修改欄位
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { columnId } = await routeCtx.params;

  try {
    const column = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      include: { board: { select: { creatorId: true, visibility: true } } },
    });
    if (!column) {
      return NextResponse.json({ error: '欄位不存在' }, { status: 404 });
    }
    if (column.board.visibility === 'PRIVATE' && column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此欄位' }, { status: 403 });
    }

    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (typeof body.title === 'string') {
      if (body.title.trim().length === 0) {
        return NextResponse.json({ error: '欄位標題不可為空' }, { status: 400 });
      }
      if (body.title.trim().length > 30) {
        return NextResponse.json({ error: '欄位標題不可超過 30 字' }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if (typeof body.color === 'string') data.color = body.color.trim() || '#5a7a5a';

    const updated = await prisma.kanbanColumn.update({
      where: { id: columnId },
      data,
      include: { cards: true },
    });

    return NextResponse.json({ column: updated });
  } catch (error) {
    console.error('[PATCH /api/kanban/columns/[columnId]]', error);
    return NextResponse.json({ error: '修改欄位失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/kanban/columns/[columnId] — 刪除欄位
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { columnId } = await routeCtx.params;

  try {
    const column = await prisma.kanbanColumn.findUnique({
      where: { id: columnId },
      include: { board: { select: { creatorId: true, visibility: true } } },
    });
    if (!column) {
      return NextResponse.json({ error: '欄位不存在' }, { status: 404 });
    }
    if (column.board.visibility === 'PRIVATE' && column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此欄位' }, { status: 403 });
    }

    await prisma.kanbanColumn.delete({ where: { id: columnId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/kanban/columns/[columnId]]', error);
    return NextResponse.json({ error: '刪除欄位失敗' }, { status: 500 });
  }
});
