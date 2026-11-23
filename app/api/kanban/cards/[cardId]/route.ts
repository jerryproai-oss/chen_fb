import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * PATCH /api/kanban/cards/[cardId] — 修改卡片
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { cardId } = await routeCtx.params;

  try {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: {
          include: { board: { select: { creatorId: true, visibility: true } } },
        },
      },
    });
    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }
    if (card.column.board.visibility === 'PRIVATE' && card.column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此卡片' }, { status: 403 });
    }

    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

    if (typeof body.title === 'string') {
      if (body.title.trim().length === 0) {
        return NextResponse.json({ error: '卡片標題不可為空' }, { status: 400 });
      }
      if (body.title.trim().length > 100) {
        return NextResponse.json({ error: '標題長度不可超過 100 字' }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if (body.description !== undefined) {
      data.description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    }
    if (body.priority !== undefined) {
      data.priority = typeof body.priority === 'string' && validPriorities.includes(body.priority) ? body.priority : null;
    }
    if (body.label !== undefined) {
      data.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;
    }
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.assigneeId !== undefined) {
      data.assigneeId = typeof body.assigneeId === 'string' && body.assigneeId.trim() ? body.assigneeId.trim() : null;
    }
    if (typeof body.columnId === 'string') {
      data.columnId = body.columnId;
    }
    if (typeof body.sortOrder === 'number') {
      data.sortOrder = body.sortOrder;
    }

    const updated = await prisma.kanbanCard.update({
      where: { id: cardId },
      data,
      include: {
        assignee: { select: { id: true, displayName: true, avatarUrl: true } },
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        checklists: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({ card: updated });
  } catch (error) {
    console.error('[PATCH /api/kanban/cards/[cardId]]', error);
    return NextResponse.json({ error: '修改卡片失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/kanban/cards/[cardId] — 刪除卡片
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { cardId } = await routeCtx.params;

  try {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: {
          include: { board: { select: { creatorId: true, visibility: true } } },
        },
      },
    });
    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }
    if (card.column.board.visibility === 'PRIVATE' && card.column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此卡片' }, { status: 403 });
    }

    await prisma.kanbanCard.delete({ where: { id: cardId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/kanban/cards/[cardId]]', error);
    return NextResponse.json({ error: '刪除卡片失敗' }, { status: 500 });
  }
});
