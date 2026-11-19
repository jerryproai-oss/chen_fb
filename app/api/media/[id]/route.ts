import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { canViewPost } from '@/lib/policy/post-authorization';
import { extractDriveFileId, downloadFromGoogleDrive } from '@/lib/google-drive';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/media/[id]
 *
 * 取得媒體檔案。
 * - 若 postId 為 null（尚未關聯貼文），僅上傳者可存取
 * - 若 postId 存在，依 canViewPost 檢查閱讀權限
 */
export const GET = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的媒體 ID 格式' },
      { status: 400 },
    );
  }

  // ── 查詢媒體記錄 ──────────────────────────────────
  const media = await prisma.postMedia.findUnique({
    where: { id },
    include: {
      post: {
        include: {
          audiences: { select: { userId: true } },
        },
      },
    },
  });

  if (!media) {
    return NextResponse.json(
      { error: '媒體不存在' },
      { status: 404 },
    );
  }

  // ── 權限檢查 ──────────────────────────────────────
  if (media.post) {
    // 已關聯貼文：檢查使用者對該貼文的閱讀權限
    const audienceUserIds = media.post.audiences.map((a) => a.userId);
    if (!canViewPost(user, media.post, audienceUserIds)) {
      return NextResponse.json(
        { error: '無權存取此媒體' },
        { status: 403 },
      );
    }
  } else {
    // 尚未關聯貼文：僅上傳者可存取
    if (media.uploaderId !== user.id) {
      return NextResponse.json(
        { error: '無權存取此媒體' },
        { status: 403 },
      );
    }
  }

  // ── 從 Google Drive 讀取檔案 ───────────────────────
  const driveFileId = extractDriveFileId(media.storagePath);

  if (!driveFileId) {
    // 舊的本地路徑格式，無法在 Vercel 上讀取
    return NextResponse.json(
      { error: '此媒體使用舊版儲存格式，無法存取' },
      { status: 410 },
    );
  }

  try {
    const buffer = await downloadFromGoogleDrive(driveFileId);
    const mimeType = media.mimeType;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Length': String(buffer.length),
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  } catch (error) {
    console.error('[media] Google Drive 讀取失敗:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: '檔案讀取失敗' },
      { status: 500 },
    );
  }
});
