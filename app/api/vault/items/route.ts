import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import { validateVaultSession } from '@/lib/vault/session';

const VALID_CATEGORIES = ['NOTE', 'PASSWORD', 'OTHER'];

export const GET = withAuth(async ({ user }, req) => {
  const token = req.headers.get('x-vault-token');
  if (!token || !validateVaultSession(token, user.id)) {
    return NextResponse.json({ error: '請先解鎖特別區' }, { status: 401 });
  }

  const items = await prisma.vaultItem.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      titleEnc: true,
      contentEnc: true,
      category: true,
      iv: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ items });
});

export const POST = withAuth(async ({ user }, req) => {
  const token = req.headers.get('x-vault-token');
  if (!token || !validateVaultSession(token, user.id)) {
    return NextResponse.json({ error: '請先解鎖特別區' }, { status: 401 });
  }

  const body = await req.json();
  const { titleEnc, contentEnc, category, iv } = body;

  if (!titleEnc || !contentEnc || !iv) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 });
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '無效的分類' }, { status: 400 });
  }

  const item = await prisma.vaultItem.create({
    data: {
      userId: user.id,
      titleEnc,
      contentEnc,
      category: category || 'NOTE',
      iv,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
});
