import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    birthday: user.birthday ? user.birthday.toISOString().split('T')[0] : null,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  });
});

/**
 * PATCH /api/me
 *
 * 更新個人資料（支援生日設定、姓名等）
 */
export const PATCH = withAuth(async ({ user }, req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const { birthday, displayName } = body;
  const updateData: { birthday?: Date | null; displayName?: string } = {};

  if (birthday !== undefined) {
    if (birthday === null || birthday === '') {
      updateData.birthday = null;
    } else if (typeof birthday === 'string' && DATE_PATTERN.test(birthday)) {
      const parsed = new Date(birthday + 'T00:00:00Z');
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '無效的日期格式' }, { status: 400 });
      }
      updateData.birthday = parsed;
    } else {
      return NextResponse.json(
        { error: '生日格式必須為 YYYY-MM-DD 或 null' },
        { status: 400 },
      );
    }
  }

  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      return NextResponse.json({ error: '顯示名稱不能為空' }, { status: 400 });
    }
    if (displayName.trim().length > 50) {
      return NextResponse.json({ error: '顯示名稱不可超過 50 字' }, { status: 400 });
    }
    updateData.displayName = displayName.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: '無有效的更新欄位' }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.PROFILE_UPDATE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      role: updated.role,
      avatarUrl: updated.avatarUrl,
      birthday: updated.birthday ? updated.birthday.toISOString().split('T')[0] : null,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
    });
  } catch (error) {
    console.error('[PATCH /api/me] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.PROFILE_UPDATE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新失敗' }, { status: 500 });
  }
});
