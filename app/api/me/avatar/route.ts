import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile, readdir } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

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

/** 大頭照存放根目錄 */
const AVATAR_ROOT = '/data/media/avatars';

/**
 * 取得使用者大頭照的檔案路徑
 * 檔名格式: {userId}.{ext}
 */
async function findAvatarFile(userId: string): Promise<string | null> {
  try {
    const files = await readdir(AVATAR_ROOT);
    const match = files.find((f) => f.startsWith(userId + '.'));
    return match ? path.join(AVATAR_ROOT, match) : null;
  } catch {
    return null;
  }
}

/**
 * 刪除使用者舊的大頭照檔案（如果存在）
 */
async function removeOldAvatar(userId: string): Promise<void> {
  try {
    const { unlink } = await import('fs/promises');
    const files = await readdir(AVATAR_ROOT);
    for (const f of files) {
      if (f.startsWith(userId + '.')) {
        await unlink(path.join(AVATAR_ROOT, f));
      }
    }
  } catch {
    // 忽略刪除錯誤
  }
}

/**
 * POST /api/me/avatar
 *
 * 上傳使用者大頭照。
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

  // ── 產生存檔路徑（以 userId 命名，方便 GET 查找）───
  const ext = MIME_TO_EXT[file.type] || 'jpg';
  const fileName = `${user.id}.${ext}`;
  const absolutePath = path.join(AVATAR_ROOT, fileName);

  // ── 刪除舊頭像 ────────────────────────────────────
  await removeOldAvatar(user.id);

  // ── 寫檔 ──────────────────────────────────────────
  try {
    await mkdir(AVATAR_ROOT, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(absolutePath, buffer);
  } catch (error) {
    console.error('[avatar] 檔案寫入失敗:', error);
    return NextResponse.json(
      { error: '檔案儲存失敗' },
      { status: 500 },
    );
  }

  // ── 更新 User.avatarUrl ───────────────────────────
  // 存入可直接使用的 API URL，讓所有 API 回傳的 avatarUrl 都能被瀏覽器載入
  const stableUrl = `/api/me/avatar?userId=${user.id}`;
  const avatarUrl = `${stableUrl}&v=${Date.now()}`;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: stableUrl },
    });
  } catch (error) {
    console.error('[avatar] 資料庫更新失敗:', error);
    return NextResponse.json(
      { error: '頭像更新失敗' },
      { status: 500 },
    );
  }

  // ── 稽核 ──────────────────────────────────────────
  await logAudit({
    actorId: user.id,
    action: AuditActions.PROFILE_UPDATE,
    resourceType: ResourceTypes.USER,
    resourceId: user.id,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ avatarUrl }, { status: 200 });
});

/**
 * GET /api/me/avatar
 *
 * 取得使用者的大頭照圖片檔案。
 * 支援 ?userId=xxx 取得指定使用者的大頭照。
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId') || user.id;

  // 直接從檔案系統尋找 {userId}.{ext}
  const avatarPath = await findAvatarFile(targetUserId);

  if (!avatarPath) {
    return NextResponse.json(
      { error: '找不到大頭照' },
      { status: 404 },
    );
  }

  // 讀取檔案
  const { readFile } = await import('fs/promises');

  try {
    const buffer = await readFile(avatarPath);
    const ext = path.extname(avatarPath).toLowerCase().slice(1);
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const contentType = mimeMap[ext] || 'image/jpeg';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return NextResponse.json(
      { error: '讀取大頭照失敗' },
      { status: 500 },
    );
  }
});
