import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';

/**
 * GET /api/me
 *
 * 取得目前登入使用者的基本資訊。
 * 回傳不含 passwordHash 等敏感欄位。
 */
export const GET = withAuth(async ({ user }) => {
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatarUrl: user.avatarUrl,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  });
});
