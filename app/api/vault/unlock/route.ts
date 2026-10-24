import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';
import bcrypt from 'bcryptjs';
import { createVaultSession, checkRateLimit, resetRateLimit } from '@/lib/vault/session';

/**
 * POST /api/vault/unlock
 * 解鎖保險庫
 * body: { pin: string, vaultOwnerId?: string }
 * - 無 vaultOwnerId: 解鎖自己的保險庫
 * - 有 vaultOwnerId: 解鎖他人共享給我的保險庫（需 VaultMember 權限）
 */
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
  const { pin, vaultOwnerId } = body;

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json({ error: '請輸入密碼' }, { status: 400 });
  }

  // 決定要驗證哪位使用者的 PIN
  let targetUserId = user.id;

  if (vaultOwnerId && vaultOwnerId !== user.id) {
    // 解鎖共享保險庫 — 確認我是成員
    const membership = await prisma.vaultMember.findUnique({
      where: {
        ownerId_memberId: { ownerId: vaultOwnerId, memberId: user.id },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: '你沒有此保險庫的存取權限' }, { status: 403 });
    }
    targetUserId = vaultOwnerId;
  }

  const record = await prisma.vaultPin.findUnique({ where: { userId: targetUserId } });
  if (!record) {
    return NextResponse.json({ error: '尚未設定密碼' }, { status: 404 });
  }

  const valid = await bcrypt.compare(pin, record.pinHash);
  if (!valid) {
    return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
  }

  // 密碼正確 — 重設 rate limit
  resetRateLimit(user.id);

  // session 的 userId 設為保險庫擁有者（用來 scope item 查詢）
  const session = createVaultSession(targetUserId, user.id);

  return NextResponse.json({
    token: session.token,
    salt: record.salt,
    expiresAt: session.expiresAt,
    vaultOwnerId: targetUserId,
  });
});
