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

// PUT — 更改 PIN
export const PUT = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { oldPin, newPin } = body;

  if (!oldPin || !newPin) {
    return NextResponse.json({ error: '請提供舊密碼與新密碼' }, { status: 400 });
  }

  const err = validatePin(newPin);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const record = await prisma.vaultPin.findUnique({ where: { userId: user.id } });
  if (!record) {
    return NextResponse.json({ error: '尚未設定密碼' }, { status: 404 });
  }

  const valid = await bcrypt.compare(oldPin, record.pinHash);
  if (!valid) {
    return NextResponse.json({ error: '舊密碼錯誤' }, { status: 401 });
  }

  const pinHash = await bcrypt.hash(newPin, 12);
  await prisma.vaultPin.update({
    where: { userId: user.id },
    data: { pinHash },
  });

  return NextResponse.json({ success: true });
});
