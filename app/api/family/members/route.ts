import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

/**
 * GET /api/family/members
 * 回傳所有啟用中的家庭成員（排除自己）
 * 用於 VisibilityPicker 的 SELECTED 模式
 */
export const GET = withAuth(async ({ user }) => {
  const members = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      id: { not: user.id },
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      status: true,
    },
    orderBy: { displayName: 'asc' },
  });

  return NextResponse.json({ members });
});
