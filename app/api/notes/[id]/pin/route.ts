import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

type RouteContext = { params: Promise<{ id: string }> };

// ── PATCH /api/notes/[id]/pin — 切換置頂 ─────────────────────
export const PATCH = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await (routeCtx as RouteContext).params;

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '記事不存在' }, { status: 404 });
  }
  if (existing.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可操作' }, { status: 403 });
  }

  const note = await prisma.note.update({
    where: { id },
    data: { pinned: !existing.pinned },
    select: { id: true, pinned: true },
  });

  return NextResponse.json(note);
});
