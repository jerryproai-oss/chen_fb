import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/kanban/[id] — 看板詳情（含完整 columns → cards → checklists）
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
        columns: {
          orderBy: { sortOrder: 'asc' },
          include: {
            cards: {
              orderBy: { sortOrder: 'asc' },
              include: {
                assignee: { select: { id: true, displayName: true, avatarUrl: true } },
                createdBy: { select: { id: true, displayName: true, avatarUrl: true } },
                checklists: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    if (!board) {
      return NextResponse.json({ error: '看板不存在' }, { status: 404 });
    }

    // 權限檢查：PRIVATE 只有創建者可看
    if (board.visibility === 'PRIVATE' && board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限查看此看板' }, { status: 403 });
    }

    return NextResponse.json({ board });
  } catch (error) {
    console.error('[GET /api/kanban/[id]]', error);
    return NextResponse.json({ error: '取得看板詳情失敗' }, { status: 500 });
  }
});

/**
 * PATCH /api/kanban/[id] — 更新看板（標題/emoji/描述/visibility/archived）
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const board = await prisma.kanbanBoard.findUnique({ where: { id } });
    if (!board) {
      return NextResponse.json({ error: '看板不存在' }, { status: 404 });
    }
    if (board.visibility === 'PRIVATE' && board.creatorId !== user.id) {
      return NextResponse.json({ error: '無權限修改此看板' }, { status: 403 });
    }

    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};

    if (typeof body.title === 'string') {
      if (body.title.trim().length === 0) {
        return NextResponse.json({ error: '標題不可為空' }, { status: 400 });
      }
      if (body.title.trim().length > 50) {
        return NextResponse.json({ error: '標題長度不可超過 50 字' }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if (typeof body.emoji === 'string') data.emoji = body.emoji.trim() || '📋';
    if (typeof body.description === 'string') data.description = body.description.trim() || null;
    if (body.description === null) data.description = null;
    if (body.visibility === 'PRIVATE' || body.visibility === 'FAMILY') {
      // 只有創建者可改 visibility
      if (board.creatorId !== user.id) {
        return NextResponse.json({ error: '只有建立者可以變更可見度' }, { status: 403 });
      }
      data.visibility = body.visibility;
    }
    if (typeof body.archived === 'boolean') data.archived = body.archived;

    const updated = await prisma.kanbanBoard.update({
      where: { id },
      data,
      include: {
        creator: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return NextResponse.json({ board: updated });
  } catch (error) {
    console.error('[PATCH /api/kanban/[id]]', error);
    return NextResponse.json({ error: '更新看板失敗' }, { status: 500 });
  }
});

/**
 * DELETE /api/kanban/[id] — 刪除看板（僅創建者可刪）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  try {
    const board = await prisma.kanbanBoard.findUnique({ where: { id } });
    if (!board) {
      return NextResponse.json({ error: '看板不存在' }, { status: 404 });
    }
    if (board.creatorId !== user.id) {
      return NextResponse.json({ error: '只有建立者可以刪除看板' }, { status: 403 });
    }

    await prisma.kanbanBoard.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/kanban/[id]]', error);
    return NextResponse.json({ error: '刪除看板失敗' }, { status: 500 });
  }
});
