import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { createVaultSession, checkRateLimit } from '@/lib/vault/session';

export const POST = withAuth(async ({ user }, req) => {
  // Rate limiting
  const rl = checkRateLimit(user.id);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `嘗試次數過多，請 ${rl.retryAfter} 秒後再試` },
      { status: 429 },
    );
  }

  const body = await req.json();
  const { pin } = body;

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json({ error: '請輸入密碼' }, { status: 400 });
  }

  const record = await prisma.vaultPin.findUnique({ where: { userId: user.id } });
  if (!record) {
    return NextResponse.json({ error: '尚未設定密碼' }, { status: 404 });
  }

  const valid = await bcrypt.compare(pin, record.pinHash);
  if (!valid) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
  }

  const session = createVaultSession(user.id);

  return NextResponse.json({
    token: session.token,
    salt: record.salt,
    expiresAt: session.expiresAt,
  });
});
