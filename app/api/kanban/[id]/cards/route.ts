import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * POST /api/kanban/[id]/cards — 新增卡片
 */
export const POST = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id },
      include: { columns: { select: { id: true } } },
    });
    if (!board) {
      return NextResponse.json({ error: '看板不存在' }, { status: 404 });
    }
    if (board.visibility === 'PRIVATE' && board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限操作此看板' }, { status: 403 });
    }

    const body = await req.json();
    const { columnId, title, description, priority, label, dueDate, assigneeId } = body;

    if (!columnId || typeof columnId !== 'string') {
      return NextResponse.json({ error: '欄位 ID 為必填' }, { status: 400 });
    }
    // 確認 column 屬於此看板
    if (!board.columns.some((c) => c.id === columnId)) {
      return NextResponse.json({ error: '欄位不屬於此看板' }, { status: 400 });
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '卡片標題為必填' }, { status: 400 });
    }
    if (title.trim().length > 100) {
      return NextResponse.json({ error: '標題長度不可超過 100 字' }, { status: 400 });
    }

    // 取得最大 sortOrder
    const maxCard = await prisma.kanbanCard.findFirst({
      where: { columnId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

    const card = await prisma.kanbanCard.create({
      data: {
        columnId,
        title: title.trim(),
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        priority: typeof priority === 'string' && validPriorities.includes(priority) ? priority as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' : null,
        label: typeof label === 'string' && label.trim() ? label.trim() : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        assigneeId: typeof assigneeId === 'string' && assigneeId.trim() ? assigneeId.trim() : null,
        sortOrder: (maxCard?.sortOrder ?? -1) + 1,
        createdById: user.id,
      },
      include: {
        assignee: { select: { id: true, displayName: true, avatarUrl: true } },
        createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
        checklists: { orderBy: { sortOrder: 'asc' } },
      },
    });

    return NextResponse.json({ card }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/kanban/[id]/cards]', error);
    return NextResponse.json({ error: '新增卡片失敗' }, { status: 500 });
  }
});
