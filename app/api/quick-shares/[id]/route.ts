import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── DELETE /api/quick-shares/[id] ────────────────────────────

export const DELETE = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await routeCtx.params;

  const share = await prisma.quickShare.findUnique({
    where: { id },
    select: { authorId: true },
  });

  if (!share) {
    return NextResponse.json({ error: '找不到此分享' }, { status: 404 });
  }

  if (share.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可以刪除' }, { status: 403 });
  }

  await prisma.quickShare.delete({ where: { id } });

  return NextResponse.json({ success: true });
});

// ── PATCH /api/quick-shares/[id] — 切換置頂 ─────────────────

export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: { pinned?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  if (typeof body.pinned !== 'boolean') {
    return NextResponse.json({ error: '請提供 pinned 值' }, { status: 400 });
  }

  const share = await prisma.quickShare.findUnique({
    where: { id },
    select: { authorId: true },
  });

  if (!share) {
    return NextResponse.json({ error: '找不到此分享' }, { status: 404 });
  }

  if (share.authorId !== user.id) {
    return NextResponse.json({ error: '僅作者可以操作' }, { status: 403 });
  }

  const updated = await prisma.quickShare.update({
    where: { id },
    data: { pinned: body.pinned },
    include: {
      author: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

  return NextResponse.json(updated);
});
