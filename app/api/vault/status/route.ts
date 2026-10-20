import { NextResponse } from 'next/server';
import { withAuthAllowRestricted } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

export const GET = withAuthAllowRestricted(async ({ user }) => {
  const pin = await prisma.vaultPin.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });
  return NextResponse.json({ hasPin: !!pin });
});
