import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { canViewPost } from '@/lib/policy/post-authorization';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 媒體檔案根目錄 */
const MEDIA_ROOT = '/data/media';

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

  // ── 讀取檔案 ──────────────────────────────────────
  const absolutePath = path.join(MEDIA_ROOT, media.storagePath);

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    console.error('[media] 檔案讀取失敗:', error);
    return NextResponse.json(
      { error: '檔案讀取失敗' },
      { status: 500 },
    );
  }

  // ── 回傳檔案 ──────────────────────────────────────
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': media.mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  });
});
