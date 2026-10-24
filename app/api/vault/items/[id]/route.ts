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

  if (ownerId === currentUserId) return { ownerId };

  const membership = await prisma.vaultMember.findUnique({
    where: { ownerId_memberId: { ownerId, memberId: currentUserId } },
  });
  if (!membership) return { error: '你沒有此保險庫的存取權限', status: 403 };

  return { ownerId };
}

export const GET = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  const result = await validateAndGetOwnerId(token, user.id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await routeCtx.params;

  const item = await prisma.vaultItem.findFirst({
    where: { id, userId: result.ownerId },
  });

  if (!item) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  return NextResponse.json({ item });
});

export const PATCH = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  const result = await validateAndGetOwnerId(token, user.id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await routeCtx.params;
  const body = await req.json();
  const { titleEnc, contentEnc, category, iv, pinned } = body;

  // 確認項目存在於此保險庫
  const existing = await prisma.vaultItem.findFirst({
    where: { id, userId: result.ownerId },
  });
  if (!existing) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  // 共享保險庫中，成員可以編輯所有項目
  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: '無效的分類' }, { status: 400 });
  }
  // 加密欄位必須同時提供，避免不一致導致資料無法解密
  const hasCryptoFields = titleEnc || contentEnc || iv;
  if (hasCryptoFields && (!titleEnc || !contentEnc || !iv)) {
    return NextResponse.json(
      { error: '加密欄位（titleEnc、contentEnc、iv）必須同時提供' },
      { status: 400 },
    );
  }
  const data: Record<string, string | Date | null> = {};
  if (titleEnc) data.titleEnc = titleEnc;
  if (contentEnc) data.contentEnc = contentEnc;
  if (category) data.category = category;
  if (iv) data.iv = iv;
  if (pinned === true) data.pinnedAt = new Date();
  if (pinned === false) data.pinnedAt = null;

  const { count } = await prisma.vaultItem.updateMany({
    where: { id, userId: result.ownerId },
    data,
  });

  if (count === 0) {
    return NextResponse.json({ error: '更新失敗，項目可能已被刪除' }, { status: 404 });
  }

  // 取回更新後的項目
  const item = await prisma.vaultItem.findUnique({ where: { id } });

  return NextResponse.json({ item });
});

export const DELETE = withAuth(async ({ user }, req, routeCtx) => {
  const token = req.headers.get('x-vault-token');
  const result = await validateAndGetOwnerId(token, user.id);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { id } = await routeCtx.params;

  const existing = await prisma.vaultItem.findFirst({
    where: { id, userId: result.ownerId },
  });
  if (!existing) {
    return NextResponse.json({ error: '找不到此項目' }, { status: 404 });
  }

  // 共享保險庫中，只有項目建立者或保險庫擁有者可以刪除
  const isOwner = result.ownerId === user.id;
  const isCreator = existing.createdBy === user.id;
  if (!isOwner && !isCreator) {
    return NextResponse.json({ error: '只有項目建立者或保險庫擁有者可以刪除' }, { status: 403 });
  }

  await prisma.vaultItem.deleteMany({ where: { id, userId: result.ownerId } });

  return NextResponse.json({ success: true });
});
