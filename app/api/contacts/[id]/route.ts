import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

// ── 常數與驗證規則 ──────────────────────────────────────────────────────────

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_GROUPS = [
  'family', 'friend', 'work', 'school',
  'neighbor', 'service', 'medical', 'other',
] as const;

const PHONE_PATTERN = /^[+\-\s()0-9]{2,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 共用的 user include */
const USER_SELECT = { user: { select: { displayName: true } } } as const;

// ── 工具函式 ─────────────────────────────────────────────────────────────────

function isValidPhone(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && PHONE_PATTERN.test(value.trim());
}

function isValidEmail(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── GET /api/contacts/[id] ───────────────────────────────────────────────────

/**
 * 取得單一聯絡人
 *
 * 存取規則：
 * - 本人建立的聯絡人可檢視
 * - 已共享的聯絡人任何人可檢視
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的聯絡人 ID 格式' }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: USER_SELECT,
    });

    if (!contact) {
      return NextResponse.json({ error: '找不到該聯絡人' }, { status: 404 });
    }

    // 權限檢查：本人建立 或 已共享
    if (contact.userId !== user.id && !contact.isShared) {
      return NextResponse.json({ error: '無權檢視此聯絡人' }, { status: 403 });
    }

    return NextResponse.json({ contact });
  } catch (error) {
    console.error('[GET /api/contacts/[id]] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得聯絡人' }, { status: 500 });
  }
});

// ── PUT /api/contacts/[id] ───────────────────────────────────────────────────

/**
 * 更新聯絡人（僅建立者可修改）
 */
export const PUT = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的聯絡人 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '找不到該聯絡人' }, { status: 404 });
  }

  // 僅建立者可編輯
  if (existing.userId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_UPDATE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有建立者可以編輯此聯絡人' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的請求格式' }, { status: 400 });
  }

  const {
    name,
    phone,
    phone2,
    email,
    company,
    jobTitle,
    address,
    birthday,
    note,
    group,
    isShared,
  } = body;

  // ── 欄位驗證 ──

  const updateData: Record<string, unknown> = {};

  // 姓名
  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: '姓名不能為空' }, { status: 400 });
    }
    if (name.trim().length > 100) {
      return NextResponse.json({ error: '姓名長度不能超過 100 字' }, { status: 400 });
    }
    updateData.name = name.trim();
  }

  // 電話
  if (phone !== undefined) {
    if (!isValidPhone(phone)) {
      return NextResponse.json(
        { error: '電話格式不正確（允許數字、+、-、空格、括號）' },
        { status: 400 },
      );
    }
    updateData.phone = trimOrNull(phone);
  }

  // 第二電話
  if (phone2 !== undefined) {
    if (!isValidPhone(phone2)) {
      return NextResponse.json(
        { error: '第二電話格式不正確（允許數字、+、-、空格、括號）' },
        { status: 400 },
      );
    }
    updateData.phone2 = trimOrNull(phone2);
  }

  // Email
  if (email !== undefined) {
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 });
    }
    updateData.email = trimOrNull(email);
  }

  // 公司
  if (company !== undefined) {
    updateData.company = trimOrNull(company);
  }

  // 職稱
  if (jobTitle !== undefined) {
    updateData.jobTitle = trimOrNull(jobTitle);
  }

  // 地址
  if (address !== undefined) {
    updateData.address = trimOrNull(address);
  }

  // 生日
  if (birthday !== undefined) {
    if (birthday === null || birthday === '') {
      updateData.birthday = null;
    } else {
      if (typeof birthday !== 'string') {
        return NextResponse.json({ error: '生日格式不正確' }, { status: 400 });
      }
      const parsed = new Date(birthday);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: '無效的生日日期' }, { status: 400 });
      }
      updateData.birthday = parsed;
    }
  }

  // 備註
  if (note !== undefined) {
    updateData.note = trimOrNull(note);
  }

  // 群組
  if (group !== undefined) {
    if (!VALID_GROUPS.includes(group as typeof VALID_GROUPS[number])) {
      return NextResponse.json(
        { error: '無效的群組類別，允許值：family, friend, work, school, neighbor, service, medical, other' },
        { status: 400 },
      );
    }
    updateData.group = group;
  }

  // 共享
  if (isShared !== undefined) {
    if (typeof isShared !== 'boolean') {
      return NextResponse.json({ error: 'isShared 需為布林值' }, { status: 400 });
    }
    updateData.isShared = isShared;
  }

  try {
    const updated = await prisma.contact.update({
      where: { id },
      data: updateData,
      include: USER_SELECT,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_UPDATE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('[PUT /api/contacts/[id]] 更新失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_UPDATE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '更新聯絡人失敗' }, { status: 500 });
  }
});

// ── DELETE /api/contacts/[id] ────────────────────────────────────────────────

/**
 * 刪除聯絡人（僅建立者可刪除）
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: '無效的聯絡人 ID 格式' }, { status: 400 });
  }

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: '找不到該聯絡人' }, { status: 404 });
  }

  // 僅建立者可刪除
  if (existing.userId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_DELETE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json({ error: '只有建立者可以刪除此聯絡人' }, { status: 403 });
  }

  try {
    await prisma.contact.delete({ where: { id } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_DELETE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/contacts/[id]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_DELETE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: id,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除聯絡人失敗' }, { status: 500 });
  }
});
