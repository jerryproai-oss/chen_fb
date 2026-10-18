import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/middleware';
import { hashPassword } from '@/lib/auth/password';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 臨時密碼預設存活時間 (秒) */
const TEMP_PASSWORD_TTL_SECONDS = Number(
  process.env.TEMP_PASSWORD_TTL_SECONDS || '86400',
);

/** username 合法字元：英數底線，2-30 字 */
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{2,30}$/;

/**
 * 將使用者物件轉為安全的回傳格式（排除 passwordHash）。
 */
function sanitizeUser(user: {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  passwordVersion: number;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
    passwordVersion: user.passwordVersion,
    passwordChangedAt: user.passwordChangedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * GET /api/admin/users
 *
 * 列出所有使用者（管理員限定）。
 * 支援 ?status=ACTIVE|DISABLED 篩選。
 */
export async function GET(request: NextRequest) {
  await requireAdmin();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  // 驗證 status 參數值
  const validStatuses = ['ACTIVE', 'DISABLED'] as const;
  const where: { status?: (typeof validStatuses)[number] } = {};

  if (statusFilter) {
    if (!validStatuses.includes(statusFilter as (typeof validStatuses)[number])) {
      return NextResponse.json(
        { error: '無效的 status 篩選值，可用值：ACTIVE, DISABLED' },
        { status: 400 },
      );
    }
    where.status = statusFilter as (typeof validStatuses)[number];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    users: users.map(sanitizeUser),
  });
}

/**
 * POST /api/admin/users
 *
 * 建立新使用者（管理員限定）。
 * Body: { username, displayName, role?, temporaryPassword }
 *
 * - username 只能是英數底線, 2-30 字
 * - 檢查 usernameNormalized 是否已存在
 * - 設定 mustChangePassword = true
 * - 設定臨時密碼過期時間
 * - 回傳 temporaryPassword (僅此一次)
 */
export async function POST(request: NextRequest) {
  const { user: admin } = await requireAdmin();

  // ── 解析 & 驗證輸入 ─────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const { username, displayName, role, temporaryPassword } = body as {
    username?: unknown;
    displayName?: unknown;
    role?: unknown;
    temporaryPassword?: unknown;
  };

  // ── 驗證 username ──────────────────────────────────────
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      { error: '帳號只能使用英文、數字、底線，長度 2-30 字' },
      { status: 400 },
    );
  }

  // ── 驗證 displayName ───────────────────────────────────
  if (
    typeof displayName !== 'string' ||
    displayName.trim().length === 0 ||
    displayName.trim().length > 50
  ) {
    return NextResponse.json(
      { error: '顯示名稱為必填，長度上限 50 字' },
      { status: 400 },
    );
  }

  // ── 驗證 role ──────────────────────────────────────────
  const validRoles = ['ADMIN', 'MEMBER'] as const;
  const userRole = role ?? 'MEMBER';

  if (typeof userRole !== 'string' || !validRoles.includes(userRole as (typeof validRoles)[number])) {
    return NextResponse.json(
      { error: '無效的角色，可用值：ADMIN, MEMBER' },
      { status: 400 },
    );
  }

  // ── 驗證 temporaryPassword ─────────────────────────────
  if (
    typeof temporaryPassword !== 'string' ||
    temporaryPassword.length < 8 ||
    temporaryPassword.length > 128
  ) {
    return NextResponse.json(
      { error: '臨時密碼為必填，長度需 8-128 字元' },
      { status: 400 },
    );
  }

  // ── 檢查帳號是否已存在 ──────────────────────────────────
  const normalizedUsername = username.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { usernameNormalized: normalizedUsername },
  });

  if (existing) {
    return NextResponse.json(
      { error: '此帳號已被使用' },
      { status: 409 },
    );
  }

  // ── 建立使用者 ──────────────────────────────────────────
  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();
  const temporaryPasswordExpiresAt = new Date(
    now.getTime() + TEMP_PASSWORD_TTL_SECONDS * 1000,
  );

  const newUser = await prisma.user.create({
    data: {
      username,
      usernameNormalized: normalizedUsername,
      displayName: displayName.trim(),
      passwordHash,
      role: userRole as (typeof validRoles)[number],
      mustChangePassword: true,
      temporaryPasswordExpiresAt,
    },
  });

  // ── 稽核 ────────────────────────────────────────────────
  await logAudit({
    actorId: admin.id,
    action: AuditActions.USER_CREATE,
    resourceType: ResourceTypes.USER,
    resourceId: newUser.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json(
    {
      user: sanitizeUser(newUser),
      temporaryPassword,
    },
    { status: 201 },
  );
}
