import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** 允許的 MIME 類型 */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** MIME → 副檔名對應 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 單檔上限 20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

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
      { error: '不支援的檔案類型，僅接受 JPEG、PNG、WebP、GIF' },
      { status: 400 },
    );
  }

  // ── 驗證檔案大小 ──────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '檔案大小超過上限 20MB' },
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
