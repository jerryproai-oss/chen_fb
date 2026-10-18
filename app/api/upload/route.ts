import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 允許的 MIME 類型 */
const ALLOWED_MIME_TYPES = new Set([
  // 圖片
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  // 影片
  'video/mp4',
  'video/quicktime',      // MOV
  'video/webm',
  'video/x-matroska',     // MKV
  'video/x-msvideo',      // AVI
  'video/3gpp',           // 3GP
  // 音訊
  'audio/mpeg',           // MP3
  'audio/mp4',            // M4A
  'audio/x-m4a',          // M4A (alternative)
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/webm',
]);

/** MIME → 副檔名對應 */
const MIME_TO_EXT: Record<string, string> = {
  // 圖片
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  // 影片
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
  'video/3gpp': '3gp',
  // 音訊
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/webm': 'weba',
};

/** 單檔上限：圖片 20MB、影片/音訊 500MB */
const MAX_FILE_SIZE_IMAGE = 20 * 1024 * 1024;
const MAX_FILE_SIZE_MEDIA = 500 * 1024 * 1024;

/** 媒體檔案根目錄 */
const MEDIA_ROOT = '/data/media';

/**
 * POST /api/upload
 *
 * 上傳圖片檔案。
 * multipart/form-data，欄位名稱: `file`
 *
 * 回傳：{ media: { id, url, filename, mimeType, fileSize, width, height } }
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  // ── 解析 formData ──────────────────────────────────
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: '無法解析上傳資料' },
      { status: 400 },
    );
  }

  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: '缺少檔案，請使用 file 欄位上傳' },
      { status: 400 },
    );
  }

  // ── 驗證 MIME type ────────────────────────────────
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: '不支援的檔案類型，可上傳圖片（JPG/PNG/WebP/GIF）、影片（MP4/MOV/WebM）或音訊（MP3/M4A/WAV/OGG）' },
      { status: 400 },
    );
  }

  // ── 驗證檔案大小 ──────────────────────────────────
  const isImage = file.type.startsWith('image/');
  const maxSize = isImage ? MAX_FILE_SIZE_IMAGE : MAX_FILE_SIZE_MEDIA;
  const maxLabel = isImage ? '20MB' : '500MB';

  if (file.size > maxSize) {
    return NextResponse.json(
      { error: `檔案大小超過上限 ${maxLabel}` },
      { status: 400 },
    );
  }

  // ── 產生存檔路徑 ──────────────────────────────────
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, '0');
  const uuid = randomUUID();
  const ext = MIME_TO_EXT[file.type] || 'bin';
  const fileName = `${uuid}.${ext}`;
  const relativePath = path.posix.join(yyyy, mm, fileName);
  const absoluteDir = path.join(MEDIA_ROOT, yyyy, mm);
  const absolutePath = path.join(MEDIA_ROOT, yyyy, mm, fileName);

  // ── 寫檔 ──────────────────────────────────────────
  try {
    await mkdir(absoluteDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);
  } catch (error) {
    console.error('[upload] 檔案寫入失敗:', error);
    return NextResponse.json(
      { error: '檔案儲存失敗' },
      { status: 500 },
    );
  }

  // ── 建立 PostMedia record ─────────────────────────
  let media;
  try {
    media = await prisma.postMedia.create({
      data: {
        uploaderId: user.id,
        postId: null,
        filename: file.name,
        storagePath: relativePath,
        mimeType: file.type,
        fileSize: file.size,
        width: null,
        height: null,
        sortOrder: 0,
      },
    });
  } catch (error) {
    console.error('[upload] 資料庫寫入失敗:', error);
    return NextResponse.json(
      { error: '媒體記錄建立失敗' },
      { status: 500 },
    );
  }

  // ── 稽核 ──────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.MEDIA_UPLOAD,
    resourceType: ResourceTypes.MEDIA,
    resourceId: media.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json(
    {
      media: {
        id: media.id,
        url: `/api/media/${media.id}`,
        filename: media.filename,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        width: media.width,
        height: media.height,
      },
    },
    { status: 201 },
  );
});
