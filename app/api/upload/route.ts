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
 * 驗證檔案實際內容的 magic bytes 是否與宣稱的 MIME type 相符。
 * 防止客戶端偽造 MIME type 上傳惡意檔案。
 */
function validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < 12) return false;

  // 圖片
  if (declaredMime === 'image/jpeg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (declaredMime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  if (declaredMime === 'image/gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46;
  }
  if (declaredMime === 'image/webp') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
      && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
  }
  // HEIC/HEIF — ftyp box
  if (declaredMime === 'image/heic' || declaredMime === 'image/heif') {
    return buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
  }
  // 影片 — MP4/MOV/3GP 都有 ftyp box
  if (declaredMime.startsWith('video/') && ['video/mp4', 'video/quicktime', 'video/3gpp'].includes(declaredMime)) {
    return buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
  }
  // WebM/MKV — EBML header
  if (declaredMime === 'video/webm' || declaredMime === 'video/x-matroska') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }
  // AVI — RIFF....AVI
  if (declaredMime === 'video/x-msvideo') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  }
  // 音訊 — MP3 (ID3 tag 或 sync word)
  if (declaredMime === 'audio/mpeg') {
    return (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) // ID3
      || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0); // sync
  }
  // M4A/AAC in MP4 container
  if (declaredMime === 'audio/mp4' || declaredMime === 'audio/x-m4a' || declaredMime === 'audio/aac') {
    return buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70;
  }
  // WAV — RIFF
  if (declaredMime === 'audio/wav' || declaredMime === 'audio/x-wav') {
    return buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
  }
  // OGG
  if (declaredMime === 'audio/ogg') {
    return buffer[0] === 0x4F && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53;
  }
  // FLAC
  if (declaredMime === 'audio/flac') {
    return buffer[0] === 0x66 && buffer[1] === 0x4C && buffer[2] === 0x61 && buffer[3] === 0x43;
  }
  // Audio WebM — EBML header
  if (declaredMime === 'audio/webm') {
    return buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3;
  }

  return false;
}

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

    // ── 驗證 magic bytes（防止偽造 MIME type）────────
    if (!validateMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: '檔案內容與宣稱的類型不符' },
        { status: 400 },
      );
    }

    await writeFile(absolutePath, buffer);
  } catch (error) {
    console.error('[upload] 檔案寫入失敗:', error instanceof Error ? error.message : 'unknown error');
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
    console.error('[upload] 資料庫寫入失敗:', error instanceof Error ? error.message : 'unknown error');
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
