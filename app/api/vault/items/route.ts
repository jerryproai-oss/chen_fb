import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import { getVaultSessionOwnerId } from '@/lib/vault/session';

const VALID_CATEGORIES = ['NOTE', 'PASSWORD', 'BANK', 'CREDIT_CARD', 'FINANCE', 'CUSTOM', 'OTHER'];

/**
 * 驗證 vault token 並取得保險庫擁有者 ID
 * 同時驗證操作者是擁有者本人或共享成員
 */
async function validateAndGetOwnerId(
  token: string | null,
  currentUserId: string,
): Promise<{ ownerId: string } | { error: string; status: number }> {
  if (!token) return { error: '請先解鎖特別區', status: 401 };

  const ownerId = getVaultSessionOwnerId(token, currentUserId);
  if (!ownerId) return { error: '請先解鎖特別區', status: 401 };

  // 如果是自己的保險庫
  if (ownerId === currentUserId) return { ownerId };

  // 共享保險庫 — 確認操作者是成員
  const membership = await prisma.vaultMember.findUnique({
    where: { ownerId_memberId: { ownerId, memberId: currentUserId } },
  });
  if (!membership) return { error: '你沒有此保險庫的存取權限', status: 403 };

  return { ownerId };
}

export const GET = withAuth(async ({ user }, req) => {
  const token = req.headers.get('x-vault-token');
  const result = await validateAndGetOwnerId(token, user.id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const items = await prisma.vaultItem.findMany({
    where: { userId: result.ownerId },
    orderBy: [
      { pinnedAt: { sort: 'desc', nulls: 'last' } },
      { updatedAt: 'desc' },
    ],
    select: {
      id: true,
      titleEnc: true,
      contentEnc: true,
      category: true,
      iv: true,
      createdBy: true,
      pinnedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    items,
    isShared: result.ownerId !== user.id,
  });
});

export const POST = withAuth(async ({ user }, req) => {
  const token = req.headers.get('x-vault-token');
  const result = await validateAndGetOwnerId(token, user.id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
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
      userId: result.ownerId,
      createdBy: user.id,
      titleEnc,
      contentEnc,
      category: category || 'NOTE',
      iv,
    },
  });

  return NextResponse.json({ item }, { status: 201 });
});
