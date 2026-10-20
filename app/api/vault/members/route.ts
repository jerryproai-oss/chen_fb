import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/client';

/**
 * GET /api/vault/members
 * 列出我的保險庫共享成員
 */
export const GET = withAuth(async ({ user }) => {
  const members = await prisma.vaultMember.findMany({
    where: { ownerId: user.id },
    include: {
      member: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.member.id,
      displayName: m.member.displayName,
      avatarUrl: m.member.avatarUrl,
      createdAt: m.createdAt,
    })),
  });
});

/**
 * POST /api/vault/members
 * 新增共享成員（僅保險庫擁有者可操作）
 * body: { memberId: string }
 */
export const POST = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { memberId } = body;

  if (!memberId || typeof memberId !== 'string') {
    return NextResponse.json({ error: '請指定家庭成員' }, { status: 400 });
  }

  // 不能加自己
  if (memberId === user.id) {
    return NextResponse.json({ error: '不能將自己加入共享' }, { status: 400 });
  }

  // 確認使用者已設定 PIN
  const ownerPin = await prisma.vaultPin.findUnique({ where: { userId: user.id } });
  if (!ownerPin) {
    return NextResponse.json({ error: '請先設定特別區密碼' }, { status: 400 });
  }

  // 確認目標使用者存在且啟用
  const targetUser = await prisma.user.findUnique({
    where: { id: memberId },
    select: { id: true, status: true, displayName: true },
  });
  if (!targetUser || targetUser.status !== 'ACTIVE') {
    return NextResponse.json({ error: '找不到此家庭成員' }, { status: 404 });
  }

  // 檢查是否已是成員
  const existing = await prisma.vaultMember.findUnique({
    where: { ownerId_memberId: { ownerId: user.id, memberId } },
  });
  if (existing) {
    return NextResponse.json({ error: '此成員已在共享名單中' }, { status: 409 });
  }

  const member = await prisma.vaultMember.create({
    data: { ownerId: user.id, memberId },
  });

  return NextResponse.json({
    member: {
      id: member.id,
      userId: targetUser.id,
      displayName: targetUser.displayName,
      createdAt: member.createdAt,
    },
  }, { status: 201 });
});

/**
 * DELETE /api/vault/members
 * 移除共享成員
 * body: { memberId: string }
 */
export const DELETE = withAuth(async ({ user }, req) => {
  const body = await req.json();
  const { memberId } = body;

  if (!memberId || typeof memberId !== 'string') {
    return NextResponse.json({ error: '請指定要移除的成員' }, { status: 400 });
  }

  const existing = await prisma.vaultMember.findUnique({
    where: { ownerId_memberId: { ownerId: user.id, memberId } },
  });
  if (!existing) {
    return NextResponse.json({ error: '此成員不在共享名單中' }, { status: 404 });
  }

  await prisma.vaultMember.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ success: true });
});
