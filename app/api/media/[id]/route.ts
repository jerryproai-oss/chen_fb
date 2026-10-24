import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import { Readable } from 'stream';
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

  // ── 讀取檔案（支援 Range/206 串流） ─────────────────
  const absolutePath = path.join(MEDIA_ROOT, media.storagePath);

  let fileSize: number;
  try {
    const stat = statSync(absolutePath);
    fileSize = stat.size;
  } catch (error) {
    console.error('[media] 檔案不存在或無法存取:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { error: '檔案讀取失敗' },
      { status: 500 },
    );
  }

  const mimeType = media.mimeType;
  const range = _req.headers.get('range');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1); // 預設 1MB chunk
    const chunkSize = end - start + 1;

    const stream = createReadStream(absolutePath, { start, end });
    const readable = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(readable, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } else {
    const stream = createReadStream(absolutePath);
    const readable = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(readable, {
      status: 200,
      headers: {
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  }
});
