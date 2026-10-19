import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import { validateVaultSession } from '@/lib/vault/session';

const VALID_CATEGORIES = ['NOTE', 'PASSWORD', 'OTHER'];

export const GET = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  if (!token || !validateVaultSession(token, user.id)) {
    return NextResponse.json({ error: '請先解鎖特別區' }, { status: 401 });
  }

  const { id } = await routeCtx.params;

  const item = await prisma.vaultItem.findFirst({
    where: { id, userId: user.id },
  });

  if (!item) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  return NextResponse.json({ item });
});

export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  if (!token || !validateVaultSession(token, user.id)) {
    return NextResponse.json({ error: '請先解鎖特別區' }, { status: 401 });
  }

  const { id } = await routeCtx.params;
  const body = await req.json();
  const { titleEnc, contentEnc, category, iv } = body;

  // Check ownership
  const existing = await prisma.vaultItem.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '無效的分類' }, { status: 400 });
  }

  const data: Record<string, string> = {};
  if (titleEnc) data.titleEnc = titleEnc;
  if (contentEnc) data.contentEnc = contentEnc;
  if (category) data.category = category;
  if (iv) data.iv = iv;

  const item = await prisma.vaultItem.update({
    where: { id },
    data,
  });

  return NextResponse.json({ item });
});

export const DELETE = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  if (!token || !validateVaultSession(token, user.id)) {
    return NextResponse.json({ error: '請先解鎖特別區' }, { status: 401 });
  }

  const { id } = await routeCtx.params;

  // Check ownership
  const existing = await prisma.vaultItem.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  await prisma.vaultItem.delete({ where: { id } });

  return NextResponse.json({ success: true });
});
