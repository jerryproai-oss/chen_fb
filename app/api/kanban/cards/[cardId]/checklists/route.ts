import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * POST /api/kanban/cards/[cardId]/checklists — 新增 checklist item
 */
export const POST = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { cardId } = await routeCtx.params;

  try {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { include: { board: { select: { creatorId: true, visibility: true } } } },
      },
    });
    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }
    if (card.column.board.visibility === 'PRIVATE' && card.column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作' }, { status: 403 });
    }

    const body = await req.json();
    const { text } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: '內容為必填' }, { status: 400 });
    }
    if (text.trim().length > 200) {
      return NextResponse.json({ error: '內容不可超過 200 字' }, { status: 400 });
    }

    const maxItem = await prisma.kanbanChecklist.findFirst({
      where: { cardId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const item = await prisma.kanbanChecklist.create({
      data: {
        cardId,
        text: text.trim(),
        sortOrder: (maxItem?.sortOrder ?? -1) + 1,
      },
    });

    return NextResponse.json({ checklist: item }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/kanban/cards/[cardId]/checklists]', error);
    return NextResponse.json({ error: '新增子任務失敗' }, { status: 500 });
  }
});

/**
 * PATCH /api/kanban/cards/[cardId]/checklists — 更新 checklist item
 * body: { id, text?, checked? }
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { cardId } = await routeCtx.params;

  try {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { include: { board: { select: { creatorId: true, visibility: true } } } },
      },
    });
    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }
    if (card.column.board.visibility === 'PRIVATE' && card.column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作' }, { status: 403 });
    }

    const body = await req.json();
    const { id, text, checked } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Checklist ID 為必填' }, { status: 400 });
    }

    const existing = await prisma.kanbanChecklist.findUnique({ where: { id } });
    if (!existing || existing.cardId !== cardId) {
      return NextResponse.json({ error: '子任務不存在' }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof text === 'string') {
      if (text.trim().length === 0) {
        return NextResponse.json({ error: '內容不可為空' }, { status: 400 });
      }
      data.text = text.trim();
    }
    if (typeof checked === 'boolean') data.checked = checked;

    const updated = await prisma.kanbanChecklist.update({ where: { id }, data });

    return NextResponse.json({ checklist: updated });
  } catch (error) {
    console.error('[PATCH /api/kanban/cards/[cardId]/checklists]', error);
    return NextResponse.json({ error: '更新子任務失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/kanban/cards/[cardId]/checklists — 刪除 checklist item
 * body: { id }
 */
export const DELETE = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { cardId } = await routeCtx.params;

  try {
    const card = await prisma.kanbanCard.findUnique({
      where: { id: cardId },
      include: {
        column: { include: { board: { select: { creatorId: true, visibility: true } } } },
      },
    });
    if (!card) {
      return NextResponse.json({ error: '卡片不存在' }, { status: 404 });
    }
    if (card.column.board.visibility === 'PRIVATE' && card.column.board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Checklist ID 為必填' }, { status: 400 });
    }

    const existing = await prisma.kanbanChecklist.findUnique({ where: { id } });
    if (!existing || existing.cardId !== cardId) {
      return NextResponse.json({ error: '子任務不存在' }, { status: 404 });
    }

    await prisma.kanbanChecklist.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/kanban/cards/[cardId]/checklists]', error);
    return NextResponse.json({ error: '刪除子任務失敗' }, { status: 500 });
  }
});
