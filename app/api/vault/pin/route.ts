import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function validatePin(pin: string): string | null {
  if (typeof pin !== 'string') return '密碼格式錯誤';
  if (pin.length < 6) return '至少需要 6 個字元';
  if (pin.length > 20) return '最多 20 個字元';
  if (!/[a-z]/.test(pin)) return '需包含至少一個小寫英文字母';
  if (!/[A-Z]/.test(pin)) return '需包含至少一個大寫英文字母';
  if (!/[0-9]/.test(pin)) return '需包含至少一個數字';
  return null;
}

// POST — 首次設定 PIN
export const POST = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { pin } = body;

  const err = validatePin(pin);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  // Check if already has PIN
  const existing = await prisma.vaultPin.findUnique({ where: { userId: user.id } });
  if (existing) {
    return NextResponse.json({ error: '已設定過密碼，請使用更改功能' }, { status: 409 });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const pinHash = await bcrypt.hash(pin, 12);

  await prisma.vaultPin.create({
    data: {
      userId: user.id,
      pinHash,
      salt,
    },
  });

  return NextResponse.json({ success: true, salt });
});

// PUT — 更改 PIN（包含全部項目重新加密）
// 客戶端負責用舊 key 解密所有項目，再用新 key 重新加密後一併送上。
// newSalt 由客戶端生成（Web Crypto randomBytes），與重新加密的項目一起提交。
export const PUT = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { oldPin, newPin, newSalt, reEncryptedItems } = body;

  // 驗證輸入
  if (typeof oldPin !== 'string' || typeof newPin !== 'string') {
    return NextResponse.json({ error: '密碼格式錯誤' }, { status: 400 });
  }

  if (typeof newSalt !== 'string' || !/^[0-9a-f]{32}$/i.test(newSalt)) {
    return NextResponse.json({ error: '無效的 salt' }, { status: 400 });
  }

  const newPinErr = validatePin(newPin);
  if (newPinErr) return NextResponse.json({ error: newPinErr }, { status: 400 });

  // 驗證舊 PIN
  const vaultPin = await prisma.vaultPin.findUnique({ where: { userId: user.id } });
  if (!vaultPin) {
    return NextResponse.json({ error: '尚未設定特別區密碼' }, { status: 404 });
  }

  const oldPinValid = await bcrypt.compare(oldPin, vaultPin.pinHash);
  if (!oldPinValid) {
    return NextResponse.json({ error: '目前密碼不正確' }, { status: 401 });
  }

  // 檢查現有項目數量
  const existingItems = await prisma.vaultItem.findMany({
    where: { userId: user.id },
    select: { id: true },
  });

  // 驗證重新加密的項目
  if (existingItems.length > 0) {
    if (!Array.isArray(reEncryptedItems) || reEncryptedItems.length !== existingItems.length) {
      return NextResponse.json(
        { error: `需要重新加密所有項目（共 ${existingItems.length} 個）` },
        { status: 400 },
      );
    }

    const existingIds = new Set(existingItems.map(i => i.id));
    for (const item of reEncryptedItems) {
      if (!item.id || !existingIds.has(item.id)) {
        return NextResponse.json({ error: '重新加密的項目 ID 不正確' }, { status: 400 });
      }
      if (typeof item.titleEnc !== 'string' || typeof item.contentEnc !== 'string' || typeof item.iv !== 'string') {
        return NextResponse.json({ error: '重新加密的項目資料不完整' }, { status: 400 });
      }
    }
  }

  // 交易：更新 PIN + 重新加密所有項目
  const newPinHash = await bcrypt.hash(newPin, 12);

  await prisma.$transaction(async (tx) => {
    // 更新 PIN
    await tx.vaultPin.update({
      where: { userId: user.id },
      data: {
        pinHash: newPinHash,
        salt: newSalt,
      },
    });

    // 批次更新所有重新加密的項目
    if (Array.isArray(reEncryptedItems) && reEncryptedItems.length > 0) {
      for (const item of reEncryptedItems) {
        await tx.vaultItem.update({
          where: { id: item.id, userId: user.id },
          data: {
            titleEnc: item.titleEnc,
            contentEnc: item.contentEnc,
            iv: item.iv,
          },
        });
      }
    }
  });

  return NextResponse.json({ success: true, salt: newSalt });
});
