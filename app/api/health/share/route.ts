import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/health/share
 *
 * 列出分享關係：
 * - sharedTo: 我分享給哪些人（我是 owner）
 * - sharedFrom: 哪些人分享給我（我是 viewer）
 */
export const GET = withAuth(async ({ user }) => {
  const [sharedTo, sharedFrom] = await Promise.all([
    // 我分享給誰
    prisma.healthSharePermission.findMany({
      where: { ownerId: user.id },
      select: {
        id: true,
        createdAt: true,
        viewer: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    // 誰分享給我
    prisma.healthSharePermission.findMany({
      where: { viewerId: user.id },
      select: {
        id: true,
        createdAt: true,
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    sharedTo: sharedTo.map((s) => ({
      id: s.id,
      viewer: s.viewer,
      createdAt: s.createdAt,
    })),
    sharedFrom: sharedFrom.map((s) => ({
      id: s.id,
      owner: s.owner,
      createdAt: s.createdAt,
    })),
  });
});

/**
 * POST /api/health/share
 *
 * 新增分享權限（將自己的健康記錄分享給指定使用者）。
 *
 * Body:
 * - viewerId: 被分享者的使用者 ID
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  // ── 解析 Body ────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { viewerId } = body as Record<string, unknown>;

  // ── 驗證 viewerId ───────────────────────────────
  if (typeof viewerId !== 'string' || !UUID_PATTERN.test(viewerId)) {
    return NextResponse.json(
      { error: '無效的使用者 ID 格式' },
      { status: 400 },
    );
  }

  if (viewerId === user.id) {
    return NextResponse.json(
      { error: '不能分享給自己' },
      { status: 400 },
    );
  }

  // ── 驗證目標使用者存在且為 ACTIVE ─────────────
  const targetUser = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { id: true, status: true },
  });

  if (!targetUser || targetUser.status !== 'ACTIVE') {
    return NextResponse.json(
      { error: '目標使用者不存在或已停用' },
      { status: 400 },
    );
  }

  // ── 檢查是否已分享 ──────────────────────────────
  const existing = await prisma.healthSharePermission.findUnique({
    where: {
      ownerId_viewerId: {
        ownerId: user.id,
        viewerId,
      },
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: '已分享給此使用者' },
      { status: 409 },
    );
  }

  // ── 建立分享 ─────────────────────────────────────
  const permission = await prisma.healthSharePermission.create({
    data: {
      ownerId: user.id,
      viewerId,
    },
    select: {
      id: true,
      createdAt: true,
      viewer: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return NextResponse.json(
    {
      permission: {
        id: permission.id,
        viewer: permission.viewer,
        createdAt: permission.createdAt,
      },
    },
    { status: 201 },
  );
});

/**
 * DELETE /api/health/share
 *
 * 移除分享權限。
 *
 * Body:
 * - viewerId: 要移除的被分享者 ID
 */
export const DELETE = withAuth(async ({ user }, req: NextRequest) => {
  // ── 解析 Body ────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { viewerId } = body as Record<string, unknown>;

  // ── 驗證 viewerId ───────────────────────────────
  if (typeof viewerId !== 'string' || !UUID_PATTERN.test(viewerId)) {
    return NextResponse.json(
      { error: '無效的使用者 ID 格式' },
      { status: 400 },
    );
  }

  // ── 查詢並刪除 ──────────────────────────────────
  const existing = await prisma.healthSharePermission.findUnique({
    where: {
      ownerId_viewerId: {
        ownerId: user.id,
        viewerId,
      },
    },
  });

  if (!existing) {
    return NextResponse.json(
      { error: '找不到該分享權限' },
      { status: 404 },
    );
  }

  await prisma.healthSharePermission.delete({
    where: { id: existing.id },
  });

  return NextResponse.json({ message: '已移除分享權限' });
});
