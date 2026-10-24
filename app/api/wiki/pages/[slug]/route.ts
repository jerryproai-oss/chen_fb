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
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const suffix = crypto.randomBytes(4).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}

/**
 * 檢查使用者是否有權檢視指定的 Wiki 頁面。
 */
function canViewWikiPage(
  userId: string,
  page: { authorId: string; visibility: string },
  permissionUserIds: string[],
): boolean {
  if (page.visibility === 'FAMILY') return true;
  if (page.visibility === 'PRIVATE') return page.authorId === userId;
  if (page.visibility === 'SELECTED') {
    return page.authorId === userId || permissionUserIds.includes(userId);
  }
  return false;
}

/**
 * GET /api/wiki/pages/[slug]
 *
 * 取得單一 Wiki 頁面，含權限檢查。
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { slug } = await routeCtx.params;

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
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

  if (!page) {
    return NextResponse.json(
      { error: '頁面不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查 ────────────────────────────────────────
  const permissionUserIds = page.permissions.map((p) => p.userId);
  if (!canViewWikiPage(user.id, page, permissionUserIds)) {
    return NextResponse.json(
      { error: '無權存取此頁面' },
      { status: 403 },
    );
  }

  return NextResponse.json({
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
  });
});

/**
 * PUT /api/wiki/pages/[slug]
 *
 * 編輯 Wiki 頁面（僅作者可操作）。
 * 更新前會將當前版本存入 wiki_page_versions。
 *
 * Body (所有欄位皆可選):
 * - title?: string (≤200 字)
 * - content?: string
 * - category?: string
 * - visibility?: Visibility
 * - permissionUserIds?: string[]
 */
export const PUT = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { slug } = await routeCtx.params;

  // ── 取得現有頁面 ────────────────────────────────────
  const existingPage = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      permissions: { select: { userId: true } },
    },
  });

  if (!existingPage) {
    return NextResponse.json(
      { error: '頁面不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查：僅作者可編輯 ──────────────────────────
  if (existingPage.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.WIKI_UPDATE,
      resourceType: ResourceTypes.WIKI,
      resourceId: existingPage.id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權編輯此頁面' },
      { status: 403 },
    );
  }

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

  // ── 構建更新資料 ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};

  // title
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: '標題不可為空' },
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
    updateData.title = trimmedTitle;
    // 標題變更時重新產生 slug
    updateData.slug = generateSlug(trimmedTitle);
  }

  // content
  if (content !== undefined) {
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: '內容不可為空' },
        { status: 400 },
      );
    }
    updateData.content = content;
  }

  // category
  if (category !== undefined) {
    if (category !== null && typeof category !== 'string') {
      return NextResponse.json(
        { error: '分類格式不正確' },
        { status: 400 },
      );
    }
    updateData.category = typeof category === 'string' && category.trim()
      ? category.trim()
      : 'general';
  }

  // visibility
  const newVisibility = (visibility as ValidVisibility) ?? existingPage.visibility;
  if (visibility !== undefined) {
    if (!VALID_VISIBILITIES.includes(newVisibility)) {
      return NextResponse.json(
        { error: '無效的隱私設定，可用值：PRIVATE, FAMILY, SELECTED' },
        { status: 400 },
      );
    }
    updateData.visibility = newVisibility;
  }

  // ── 驗證 permissionUserIds ──────────────────────────
  let validPermissionIds: string[] = [];
  const effectiveVisibility = newVisibility;

  if (effectiveVisibility === 'SELECTED') {
    if (permissionUserIds !== undefined) {
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

      validPermissionIds = [...new Set(permissionUserIds as string[])].filter(
        (uid) => uid !== user.id,
      );

      const existingUsers = await prisma.user.findMany({
        where: {
          id: { in: validPermissionIds },
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const existingIds = new Set(existingUsers.map((u) => u.id));
      const invalidIds = validPermissionIds.filter((uid) => !existingIds.has(uid));

      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: '部分指定對象不存在或已停用' },
          { status: 400 },
        );
      }
    }
  }

  // ── 手動設定 updatedAt ──────────────────────────────
  updateData.updatedAt = new Date();

  // ── 更新頁面（含版本紀錄） ──────────────────────────
  const updatedPage = await prisma.$transaction(async (tx) => {
    // 先將當前版本存入 wiki_page_versions
    await tx.wikiPageVersion.create({
      data: {
        pageId: existingPage.id,
        title: existingPage.title,
        content: existingPage.content,
        editedById: user.id,
      },
    });

    // 同步 permissions（visibility 變更或有新的 permissionUserIds）
    const needUpdatePermissions =
      (visibility !== undefined && effectiveVisibility !== existingPage.visibility) ||
      (effectiveVisibility === 'SELECTED' && permissionUserIds !== undefined);

    if (needUpdatePermissions) {
      // 刪除舊的 permissions
      await tx.wikiPagePermission.deleteMany({ where: { pageId: existingPage.id } });

      // 如果是 SELECTED，建立新的 permissions
      if (effectiveVisibility === 'SELECTED' && validPermissionIds.length > 0) {
        await tx.wikiPagePermission.createMany({
          data: validPermissionIds.map((userId) => ({
            pageId: existingPage.id,
            userId,
          })),
        });
      }
    }

    // 如果 visibility 從 SELECTED 改成其他，清除 permissions
    if (
      visibility !== undefined &&
      effectiveVisibility !== 'SELECTED' &&
      existingPage.visibility === 'SELECTED'
    ) {
      await tx.wikiPagePermission.deleteMany({ where: { pageId: existingPage.id } });
    }

    return tx.wikiPage.update({
      where: { id: existingPage.id },
      data: updateData,
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
    action: AuditActions.WIKI_UPDATE,
    resourceType: ResourceTypes.WIKI,
    resourceId: existingPage.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({
    page: {
      id: updatedPage.id,
      slug: updatedPage.slug,
      title: updatedPage.title,
      content: updatedPage.content,
      category: updatedPage.category,
      visibility: updatedPage.visibility,
      authorId: updatedPage.authorId,
      author: updatedPage.author,
      pinned: updatedPage.pinned,
      createdAt: updatedPage.createdAt,
      updatedAt: updatedPage.updatedAt,
      permissions: updatedPage.permissions.map((p) => ({
        userId: p.userId,
        displayName: p.user.displayName,
      })),
    },
  });
});

/**
 * DELETE /api/wiki/pages/[slug]
 *
 * 刪除 Wiki 頁面（僅作者可操作）。
 * 級聯刪除版本紀錄與權限設定。
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { slug } = await routeCtx.params;

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
  });

  if (!page) {
    return NextResponse.json(
      { error: '頁面不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查：僅作者可刪除 ──────────────────────────
  if (page.authorId !== user.id) {
    await logAudit({
      actorId: user.id,
      action: AuditActions.WIKI_DELETE,
      resourceType: ResourceTypes.WIKI,
      resourceId: page.id,
      outcome: Outcomes.DENIED,
    });
    return NextResponse.json(
      { error: '無權刪除此頁面' },
      { status: 403 },
    );
  }

  // ── 刪除頁面（cascade 刪除 versions 和 permissions） ─
  await prisma.wikiPage.delete({
    where: { id: page.id },
  });

  // ── 稽核 ────────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.WIKI_DELETE,
    resourceType: ResourceTypes.WIKI,
    resourceId: page.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true });
});
