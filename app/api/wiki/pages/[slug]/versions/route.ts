import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

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
 * GET /api/wiki/pages/[slug]/versions
 *
 * 取得 Wiki 頁面的版本歷史紀錄。
 * 權限檢查與頁面 GET 相同。
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { slug } = await routeCtx.params;

  // ── 取得頁面及權限 ──────────────────────────────────
  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      permissions: {
        select: { userId: true },
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

  // ── 取得版本歷史 ────────────────────────────────────
  const versions = await prisma.wikiPageVersion.findMany({
    where: { pageId: page.id },
    orderBy: { createdAt: 'desc' },
    include: {
      editedBy: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return NextResponse.json({
    versions: versions.map((v) => ({
      id: v.id,
      pageId: v.pageId,
      title: v.title,
      content: v.content,
      editedBy: v.editedBy,
      createdAt: v.createdAt,
    })),
  });
});
