import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/**
 * PATCH /api/kanban/reorder — 批量重新排序（欄位和/或卡片）
 * body: { columns?: {id, sortOrder}[], cards?: {id, columnId, sortOrder}[] }
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest) => {
  try {
    const body = await req.json();
    const { columns, cards } = body;

    if (!Array.isArray(columns) && !Array.isArray(cards)) {
      return NextResponse.json({ error: '需要提供 columns 或 cards 陣列' }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      // 重排欄位
      if (Array.isArray(columns)) {
        for (const col of columns) {
          if (typeof col.id !== 'string' || typeof col.sortOrder !== 'number') continue;
          // 權限檢查
          const existing = await tx.kanbanColumn.findUnique({
            where: { id: col.id },
            include: { board: { select: { creatorId: true, visibility: true } } },
          });
          if (!existing) continue;
          if (existing.board.visibility === 'PRIVATE' && existing.board.creatorId !== user.id) continue;
          await tx.kanbanColumn.update({
            where: { id: col.id },
            data: { sortOrder: col.sortOrder },
          });
        }
      }

      // 重排卡片（含跨欄位移動）
      if (Array.isArray(cards)) {
        for (const card of cards) {
          if (typeof card.id !== 'string' || typeof card.sortOrder !== 'number') continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data: any = { sortOrder: card.sortOrder };
          if (typeof card.columnId === 'string') data.columnId = card.columnId;

          const existing = await tx.kanbanCard.findUnique({
            where: { id: card.id },
            include: {
              column: { include: { board: { select: { creatorId: true, visibility: true } } } },
            },
          });
          if (!existing) continue;
          if (existing.column.board.visibility === 'PRIVATE' && existing.column.board.creatorId !== user.id) continue;

          await tx.kanbanCard.update({
            where: { id: card.id },
            data,
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[PATCH /api/kanban/reorder]', error);
    return NextResponse.json({ error: '重新排序失敗' }, { status: 500 });
  }
});
