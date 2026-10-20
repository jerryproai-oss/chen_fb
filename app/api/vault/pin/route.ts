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

// PUT — 更改 PIN（暫時停用）
// 目前加密金鑰直接由 PIN+salt 推導，改 PIN 後既有內容無法解密。
// 需實作資料重新加密流程後才能啟用此 API。
export const PUT = withAuth(async () => {
  return NextResponse.json(
    { error: '目前暫不支援更改特別區密碼，此功能開發中' },
    { status: 501 },
  );
});
