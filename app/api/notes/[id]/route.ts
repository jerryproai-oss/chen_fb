import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/notes/[id] — 取得單一記事 ───────────────────────
export const GET = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await routeCtx.params;

  const note = await prisma.note.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, displayName: true, avatarUrl: true } },
      tags: { select: { id: true, name: true } },
      audiences: {
        select: {
          userId: true,
          user: { select: { id: true, displayName: true } },
        },
      },
    },
  });

  if (!note) {
    return NextResponse.json({ error: '記事不存在' }, { status: 404 });
  }

  // 權限檢查
  const isAuthor = note.authorId === user.id;
  const isFamily = note.visibility === 'FAMILY';
  const isSelected =
    note.visibility === 'SELECTED' &&
    note.audiences.some((a) => a.userId === user.id);

  if (!isAuthor && !isFamily && !isSelected) {
    return NextResponse.json({ error: '無權存取此記事' }, { status: 403 });
  }

  return NextResponse.json(note);
});

// ── PATCH /api/notes/[id] — 更新記事（僅作者）────────────────
export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const { id } = await routeCtx.params;

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '記事不存在' }, { status: 404 });
  }
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可編輯' }, { status: 403 });
  }

  const body = await req.json();
  const { title, content, color, pinned, visibility, audienceIds, tags } = body;

  // 驗證
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: '標題不可為空' }, { status: 400 });
    }
    if (title.trim().length > 200) {
      return NextResponse.json({ error: '標題不可超過 200 字' }, { status: 400 });
    }
  }

  const validVisibilities = ['PRIVATE', 'FAMILY', 'SELECTED'];
  const vis = visibility && validVisibilities.includes(visibility) ? visibility : undefined;

  // 使用 transaction 處理 audiences 和 tags 的刪除重建
  const note = await prisma.$transaction(async (tx) => {
    // 更新 audiences（如果有變更）
    if (vis !== undefined && Array.isArray(audienceIds)) {
      await tx.noteAudience.deleteMany({ where: { noteId: id } });
      if (vis === 'SELECTED' && audienceIds.length > 0) {
        await tx.noteAudience.createMany({
          data: audienceIds
            .filter((uid: string) => typeof uid === 'string' && uid !== user.id)
            .map((userId: string) => ({ noteId: id, userId })),
        });
      }
    }

    // 更新 tags（如果有變更）
    if (tags !== undefined && Array.isArray(tags)) {
      await tx.noteTag.deleteMany({ where: { noteId: id } });
      if (tags.length > 0) {
        await tx.noteTag.createMany({
          data: tags
            .filter((t: string) => typeof t === 'string' && t.trim().length > 0)
            .slice(0, 20)
            .map((name: string) => ({ noteId: id, name: name.trim() })),
        });
      }
    }

    // 更新記事本體
    return tx.note.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content }),
        ...(color !== undefined && { color: color || null }),
        ...(pinned !== undefined && { pinned: !!pinned }),
        ...(vis !== undefined && { visibility: vis }),
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        tags: { select: { id: true, name: true } },
        audiences: {
          select: {
            userId: true,
            user: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  });

  return NextResponse.json(note);
});

// ── DELETE /api/notes/[id] — 刪除記事（僅作者）───────────────
export const DELETE = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await routeCtx.params;

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '記事不存在' }, { status: 404 });
  }
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可刪除' }, { status: 403 });
  }

  await prisma.note.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
