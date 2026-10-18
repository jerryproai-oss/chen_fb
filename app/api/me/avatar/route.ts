import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
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
 * POST /api/me/avatar
 *
 * 上傳使用者大頭照。
 * multipart/form-data，欄位名稱: `file`
 *
 * 回傳：{ avatarUrl: '/api/me/avatar?v=timestamp' }
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

  // ── 產生存檔路徑 ──────────────────────────────────
  const uuid = randomUUID();
  const ext = MIME_TO_EXT[file.type] || 'jpg';
  const fileName = `${uuid}.${ext}`;
  const absolutePath = path.join(AVATAR_ROOT, fileName);
  // 存成相對路徑供 avatarUrl 使用
  const storagePath = `avatars/${fileName}`;

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
  const avatarUrl = `/api/me/avatar?v=${Date.now()}`;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: storagePath },
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
 * 取得目前登入使用者的大頭照圖片檔案。
 * 如果 URL 帶有 userId query param，取得該使用者的大頭照。
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get('userId') || user.id;

  // 查詢目標使用者
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { avatarUrl: true },
  });

  if (!targetUser?.avatarUrl) {
    return NextResponse.json(
      { error: '找不到大頭照' },
      { status: 404 },
    );
  }

  // 讀取檔案
  const { readFile } = await import('fs/promises');
  const absolutePath = path.join('/data/media', targetUser.avatarUrl);

  try {
    const buffer = await readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase().slice(1);
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
