import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import crypto from 'crypto';

/** 合法的隱私設定值 */
const VALID_VISIBILITIES = ['PRIVATE', 'FAMILY', 'SELECTED'] as const;
type ValidVisibility = (typeof VALID_VISIBILITIES)[number];

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 從標題產生 URL-safe slug。
 * 將空白替換為 -，移除特殊字元，附加 6 字元隨機後綴確保唯一性。
 */
function generateSlug(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')           // 空白 → -
    .replace(/[^\p{L}\p{N}-]/gu, '') // 保留 Unicode 字母、數字、-
    .replace(/-{2,}/g, '-')         // 合併連續 -
    .replace(/^-|-$/g, '')          // 移除首尾 -
    .slice(0, 80);                  // 限制長度

  const suffix = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * GET /api/wiki/pages
 *
 * 取得 Wiki 頁面列表（依使用者權限篩選可見頁面）。
 *
 * Query params:
 * - search: 搜尋標題／內容
 * - category: 篩選分類
 * - cursor: 分頁游標（頁面 ID）
 * - limit: 每頁筆數 (1-50, 預設 20)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 分頁參數 ────────────────────────────────────────
  const cursor = searchParams.get('cursor');
  const limitParam = searchParams.get('limit');
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50);

  if (cursor && !UUID_PATTERN.test(cursor)) {
    return NextResponse.json(
      { error: '無效的 cursor 格式' },
      { status: 400 },
    );
  }

  // ── 篩選參數 ────────────────────────────────────────
  const search = searchParams.get('search')?.trim() || '';
  const category = searchParams.get('category')?.trim() || '';

  // ── 可見性條件 ──────────────────────────────────────
  // FAMILY → 所有人可見
  // PRIVATE → 僅作者
  // SELECTED → 作者 + wiki_page_permissions 中的使用者
  const visibilityConditions = [
    { visibility: 'FAMILY' as const },
    { visibility: 'PRIVATE' as const, authorId: user.id },
    {
      visibility: 'SELECTED' as const,
      OR: [
        { authorId: user.id },
        { permissions: { some: { userId: user.id } } },
      ],
    },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    OR: visibilityConditions,
  };

  if (search) {
    where.AND = [
      {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  if (category) {
    where.category = category;
  }

  // ── 查詢 ────────────────────────────────────────────
  const pages = await prisma.wikiPage.findMany({
    where,
    orderBy: [
      { pinned: 'desc' },
      { updatedAt: 'desc' },
    ],
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    include: {
      author: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  const hasMore = pages.length > limit;
  const resultPages = hasMore ? pages.slice(0, limit) : pages;
  const nextCursor = hasMore ? resultPages[resultPages.length - 1].id : null;

  return NextResponse.json({
    pages: resultPages.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      content: p.content,
      category: p.category,
      visibility: p.visibility,
      authorId: p.authorId,
      author: p.author,
      pinned: p.pinned,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    nextCursor,
    hasMore,
  });
});

/**
 * POST /api/wiki/pages
 *
 * 建立新 Wiki 頁面。
 *
 * Body:
 * - title: string (必填, ≤200 字)
 * - content: string (必填)
 * - category?: string (預設 "general")
 * - visibility?: Visibility (預設 FAMILY)
 * - permissionUserIds?: string[] (SELECTED 模式時的指定使用者)
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  // ── 解析 Body ───────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const {
    title,
    content,
    category,
    visibility,
    permissionUserIds,
  } = body as Record<string, unknown>;

  // ── 驗證 title ──────────────────────────────────────
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json(
      { error: '標題為必填' },
      { status: 400 },
    );
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > 200) {
    return NextResponse.json(
      { error: '標題長度上限 200 字' },
      { status: 400 },
    );
  }

  // ── 驗證 content ────────────────────────────────────
  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json(
      { error: '內容為必填' },
      { status: 400 },
    );
  }

  // ── 驗證 category ───────────────────────────────────
  let pageCategory = 'general';
  if (category !== undefined && category !== null) {
    if (typeof category !== 'string') {
      return NextResponse.json(
        { error: '分類格式不正確' },
        { status: 400 },
      );
    }
    pageCategory = category.trim() || 'general';
  }

  // ── 驗證 visibility ─────────────────────────────────
  const pageVisibility: ValidVisibility =
    (visibility as ValidVisibility) ?? 'FAMILY';

  if (!VALID_VISIBILITIES.includes(pageVisibility)) {
    return NextResponse.json(
      { error: '無效的隱私設定，可用值：PRIVATE, FAMILY, SELECTED' },
      { status: 400 },
    );
  }

  // ── 驗證 permissionUserIds ──────────────────────────
  let validPermissionIds: string[] = [];

  if (pageVisibility === 'SELECTED') {
    if (!Array.isArray(permissionUserIds) || permissionUserIds.length === 0) {
      return NextResponse.json(
        { error: '指定使用者模式必須提供至少一位指定對象' },
        { status: 400 },
      );
    }

    for (const uid of permissionUserIds) {
      if (typeof uid !== 'string' || !UUID_PATTERN.test(uid)) {
        return NextResponse.json(
          { error: '指定對象的 ID 格式不正確' },
          { status: 400 },
        );
      }
    }

    // 去重並排除自己（作者本來就有存取權）
    validPermissionIds = [...new Set(permissionUserIds as string[])].filter(
      (id) => id !== user.id,
    );

    // 驗證指定的使用者都存在且 ACTIVE
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { in: validPermissionIds },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const existingIds = new Set(existingUsers.map((u) => u.id));
    const invalidIds = validPermissionIds.filter((id) => !existingIds.has(id));

    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: '部分指定對象不存在或已停用' },
        { status: 400 },
      );
    }
  }

  // ── 產生 slug ───────────────────────────────────────
  const slug = generateSlug(trimmedTitle);

  // ── 建立頁面 ────────────────────────────────────────
  const page = await prisma.$transaction(async (tx) => {
    const created = await tx.wikiPage.create({
      data: {
        slug,
        title: trimmedTitle,
        content: content as string,
        category: pageCategory,
        visibility: pageVisibility,
        authorId: user.id,
        permissions:
          pageVisibility === 'SELECTED' && validPermissionIds.length > 0
            ? {
                create: validPermissionIds.map((userId) => ({ userId })),
              }
            : undefined,
      },
    });

    return tx.wikiPage.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        author: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        permissions: {
          select: {
            userId: true,
            user: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });
  });

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.WIKI_CREATE,
    resourceType: ResourceTypes.WIKI,
    resourceId: page.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json(
    {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        content: page.content,
        category: page.category,
        visibility: page.visibility,
        authorId: page.authorId,
        author: page.author,
        pinned: page.pinned,
        createdAt: page.createdAt,
        updatedAt: page.updatedAt,
        permissions: page.permissions.map((p) => ({
          userId: p.userId,
          displayName: p.user.displayName,
        })),
      },
    },
    { status: 201 },
  );
});
