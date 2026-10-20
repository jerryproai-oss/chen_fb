import { NextResponse } from 'next/server';
import { withAuthAllowRestricted } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

export const GET = withAuthAllowRestricted(async ({ user }) => {
  // 自己的 PIN 狀態
  const pin = await prisma.vaultPin.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });

  // 別人共享給我的保險庫
  const sharedVaults = await prisma.vaultMember.findMany({
    where: { memberId: user.id },
    include: {
      owner: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    hasPin: !!pin,
    sharedVaults: sharedVaults.map((sv) => ({
      ownerId: sv.owner.id,
      ownerName: sv.owner.displayName,
      ownerAvatar: sv.owner.avatarUrl,
    })),
  });
});
