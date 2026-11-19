import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { uploadAvatarToGoogleDrive, downloadFromGoogleDrive } from '@/lib/google-drive';

/** 允許的圖片 MIME 類型 */
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** MIME → 副檔名 */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** 單檔上限 5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * 驗證圖片檔案的 magic bytes 是否與宣稱的 MIME type 相符。
 */
function validateImageMagicBytes(buffer: Buffer, declaredMime: string): boolean {
  if (buffer.length < 12) return false;
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
  return false;
}

/**
 * POST /api/me/avatar
 *
 * 上傳使用者大頭照到 Google Drive。
 * multipart/form-data，欄位名稱: `file`
 *
 * 回傳：{ avatarUrl: '/api/me/avatar?userId=xxx&v=timestamp' }
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
      { error: '缺少檔案，請使用 file 欄位上傳圖片' },
      { status: 400 },
    );
  }

  // ── 驗證 MIME type ────────────────────────────────
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: '不支援的檔案類型，請上傳 JPG、PNG、WebP 或 GIF 圖片' },
      { status: 400 },
    );
  }

  // ── 驗證檔案大小 ──────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: '檔案大小超過上限 5MB' },
      { status: 400 },
    );
  }

  // ── 上傳到 Google Drive ────────────────────────────
  const ext = MIME_TO_EXT[file.type] || 'jpg';
  const fileName = `${user.id}.${ext}`;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── 驗證 magic bytes（防止偽造 MIME type）────────
    if (!validateImageMagicBytes(buffer, file.type)) {
      return NextResponse.json(
        { error: '檔案內容與宣稱的圖片類型不符' },
        { status: 400 },
      );
    }

    const driveFileId = await uploadAvatarToGoogleDrive(buffer, fileName, file.type);

    // ── 更新 User.avatarUrl ───────────────────────────
    // 儲存 Google Drive file ID，讓 GET handler 能讀取
    const stableUrl = `/api/me/avatar?userId=${user.id}`;
    const avatarUrl = `${stableUrl}&v=${Date.now()}`;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl: stableUrl,
        // 把 Drive file ID 存在 metadata 中方便 GET 讀取
        // 使用 avatarDriveId 欄位（如果沒有就用 bio 欄位暫存）
        avatarDriveId: driveFileId,
      },
    });

    // ── 稽核 ──────────────────────────────────────────
    await logAudit({
      actorId: user.id,
      action: AuditActions.PROFILE_UPDATE,
      resourceType: ResourceTypes.USER,
      resourceId: user.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ avatarUrl }, { status: 200 });
  } catch (error) {
    console.error('[avatar] Google Drive 上傳失敗:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { error: '檔案儲存失敗' },
      { status: 500 },
    );
  }
});

/**
 * GET /api/me/avatar
 *
 * 取得使用者的大頭照圖片檔案（從 Google Drive）。
 * 支援 ?userId=xxx 取得指定使用者的大頭照。
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId') || user.id;

  // 驗證 userId 格式（UUID v4），防止參數注入
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(targetUserId)) {
    return NextResponse.json(
      { error: '無效的使用者 ID' },
      { status: 400 },
    );
  }

  // 查詢使用者的 avatar Drive ID
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { avatarDriveId: true },
  });

  if (!targetUser?.avatarDriveId) {
    return NextResponse.json(
      { error: '找不到大頭照' },
      { status: 404 },
    );
  }

  try {
    const buffer = await downloadFromGoogleDrive(targetUser.avatarDriveId);

    // 根據檔案 magic bytes 判斷 Content-Type
    let contentType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = 'image/png';
    else if (buffer[0] === 0x47 && buffer[1] === 0x49) contentType = 'image/gif';
    else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[8] === 0x57) contentType = 'image/webp';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch (error) {
    console.error('[avatar] Google Drive 讀取失敗:', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json(
      { error: '讀取大頭照失敗' },
      { status: 500 },
    );
  }
});
