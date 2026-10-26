import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

// ── 常數與驗證規則 ──────────────────────────────────────────────────────────

/** 允許的聯絡人群組類別 */
const VALID_GROUPS = [
  'family', 'friend', 'work', 'school',
  'neighbor', 'service', 'medical', 'other',
] as const;

/** 電話號碼格式：允許 +、-、空格、數字、括號 */
const PHONE_PATTERN = /^[+\-\s()0-9]{2,30}$/;

/** 基本 Email 格式驗證 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 檢視模式 */
const VALID_VIEWS = ['personal', 'shared', 'all'] as const;

/** 共用的 user include（僅取 displayName） */
const USER_SELECT = { user: { select: { displayName: true } } } as const;

// ── 工具函式 ─────────────────────────────────────────────────────────────────

/** 驗證電話號碼格式，空值或 undefined 視為合格 */
function isValidPhone(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && PHONE_PATTERN.test(value.trim());
}

/** 驗證 Email 格式，空值或 undefined 視為合格 */
function isValidEmail(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

/** 將字串值修剪後回傳，若為空則回傳 null */
function trimOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ── GET /api/contacts ────────────────────────────────────────────────────────

/**
 * 取得聯絡人列表
 *
 * Query params:
 * - view: 'personal' | 'shared' | 'all'（預設 'all'）
 * - group: 篩選群組類別
 * - search: 依姓名 / 電話 / 公司搜尋
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'all';
  const group = searchParams.get('group');
  const search = searchParams.get('search')?.trim();

  // 驗證 view 參數
  if (!VALID_VIEWS.includes(view as typeof VALID_VIEWS[number])) {
    return NextResponse.json(
      { error: 'view 參數需為 personal、shared 或 all' },
      { status: 400 },
    );
  }

  // 驗證 group 參數
  if (group && !VALID_GROUPS.includes(group as typeof VALID_GROUPS[number])) {
    return NextResponse.json(
      { error: '無效的群組類別' },
      { status: 400 },
    );
  }

  try {
    // 組合搜尋條件
    const searchCondition = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { phone2: { contains: search, mode: 'insensitive' as const } },
            { company: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const groupCondition = group ? { group } : {};

    let contacts;

    if (view === 'personal') {
      // 僅回傳使用者自己的聯絡人
      contacts = await prisma.contact.findMany({
        where: {
          userId: user.id,
          ...groupCondition,
          ...searchCondition,
        },
        include: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    } else if (view === 'shared') {
      // 回傳所有共享聯絡人
      contacts = await prisma.contact.findMany({
        where: {
          isShared: true,
          ...groupCondition,
          ...searchCondition,
        },
        include: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    } else {
      // view === 'all'：回傳個人 + 共享（不重複）
      // 使用者自己的聯絡人（無論是否共享）＋ 其他人共享的聯絡人
      contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { userId: user.id },
            { isShared: true, userId: { not: user.id } },
          ],
          ...groupCondition,
          ...searchCondition,
        },
        include: USER_SELECT,
        orderBy: { name: 'asc' },
      });
    }

    return NextResponse.json({ contacts });
  } catch (error) {
    console.error('[GET /api/contacts] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得聯絡人列表' }, { status: 500 });
  }
});

// ── POST /api/contacts ───────────────────────────────────────────────────────

/**
 * 新增聯絡人
 *
 * 若 query param `checkDuplicate=true`，僅檢查重複不建立。
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const checkDuplicateOnly = searchParams.get('checkDuplicate') === 'true';

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
    group = 'other',
    isShared = false,
  } = body;

  // ── 必填欄位驗證 ──

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: '姓名為必填' }, { status: 400 });
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 100) {
    return NextResponse.json({ error: '姓名長度不能超過 100 字' }, { status: 400 });
  }

  // ── 選填欄位驗證 ──

  if (!isValidPhone(phone)) {
    return NextResponse.json(
      { error: '電話格式不正確（允許數字、+、-、空格、括號）' },
      { status: 400 },
    );
  }

  if (!isValidPhone(phone2)) {
    return NextResponse.json(
      { error: '第二電話格式不正確（允許數字、+、-、空格、括號）' },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: 'Email 格式不正確' },
      { status: 400 },
    );
  }

  if (group !== undefined && !VALID_GROUPS.includes(group as typeof VALID_GROUPS[number])) {
    return NextResponse.json(
      { error: '無效的群組類別，允許值：family, friend, work, school, neighbor, service, medical, other' },
      { status: 400 },
    );
  }

  // 驗證生日格式
  let parsedBirthday: Date | null = null;
  if (birthday !== undefined && birthday !== null && birthday !== '') {
    if (typeof birthday !== 'string') {
      return NextResponse.json({ error: '生日格式不正確' }, { status: 400 });
    }
    const parsed = new Date(birthday);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json({ error: '無效的生日日期' }, { status: 400 });
    }
    parsedBirthday = parsed;
  }

  try {
    // ── 重複檢查 ──
    const trimmedPhone = trimOrNull(phone);
    const duplicateWhere = {
      name: { equals: trimmedName, mode: 'insensitive' as const },
      ...(trimmedPhone ? { phone: trimmedPhone } : {}),
      OR: [
        { userId: user.id },
        { isShared: true },
      ],
    };

    const duplicates = await prisma.contact.findMany({
      where: duplicateWhere,
      include: USER_SELECT,
    });

    // 僅檢查重複模式
    if (checkDuplicateOnly) {
      return NextResponse.json({ duplicates });
    }

    // ── 建立聯絡人 ──
    const newContact = await prisma.contact.create({
      data: {
        userId: user.id,
        name: trimmedName,
        phone: trimmedPhone,
        phone2: trimOrNull(phone2),
        email: trimOrNull(email),
        company: trimOrNull(company),
        jobTitle: trimOrNull(jobTitle),
        address: trimOrNull(address),
        birthday: parsedBirthday,
        note: trimOrNull(note),
        group: typeof group === 'string' ? group : 'other',
        isShared: isShared === true,
      },
      include: USER_SELECT,
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_CREATE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: newContact.id,
      outcome: Outcomes.SUCCESS,
    });

    // 若有重複，附帶警告
    const response: Record<string, unknown> = { contact: newContact };
    if (duplicates.length > 0) {
      response.duplicateWarning = '發現可能重複的聯絡人';
      response.duplicates = duplicates;
    }

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/contacts] 建立失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.CONTACT_CREATE,
      resourceType: ResourceTypes.CONTACT,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '建立聯絡人失敗' }, { status: 500 });
  }
});
