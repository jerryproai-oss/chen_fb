import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

// ── PATCH /api/quick-shares/categories/[id] ──────────────────

export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const { id } = await routeCtx.params;

  let body: { name?: string; emoji?: string; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const category = await prisma.shareCategory.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: '找不到此分類' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!body.name.trim()) {
      return NextResponse.json({ error: '分類名稱不能為空' }, { status: 400 });
    }
    if (body.name.trim().length > 20) {
      return NextResponse.json({ error: '分類名稱不能超過 20 個字' }, { status: 400 });
    }
    // 檢查重複（排除自己）
    const existing = await prisma.shareCategory.findFirst({
      where: { name: body.name.trim(), id: { not: id } },
    });
    if (existing) {
      return NextResponse.json({ error: '此分類名稱已存在' }, { status: 409 });
    }
    updateData.name = body.name.trim();
  }

  if (body.emoji !== undefined) {
    updateData.emoji = body.emoji.trim() || '📎';
  }

  if (typeof body.sortOrder === 'number') {
    updateData.sortOrder = body.sortOrder;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  }

  const updated = await prisma.shareCategory.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
});

// ── DELETE /api/quick-shares/categories/[id] ─────────────────

export const DELETE = withAuth(async ({ user }, _req, routeCtx) => {
  const { id } = await routeCtx.params;

  const category = await prisma.shareCategory.findUnique({ where: { id } });
  if (!category) {
    return NextResponse.json({ error: '找不到此分類' }, { status: 404 });
  }

  // 刪除分類（QuickShare.categoryId 會被 SetNull）
  await prisma.shareCategory.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
