/**
 * Google Drive 儲存模組
 *
 * 透過 Service Account 操作 Google Drive，提供上傳、下載、刪除功能。
 * 所有媒體檔案存放在指定的 Google Drive 資料夾下，
 * 以 year/month 子資料夾組織。
 */

import { google } from 'googleapis';
import { Readable } from 'stream';

// ── 環境變數 ───────────────────────────────────────────────

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error('缺少環境變數 GOOGLE_SERVICE_ACCOUNT_KEY');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY 格式錯誤，請確認是完整的 JSON 字串');
  }
}

function getRootFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) {
    throw new Error('缺少環境變數 GOOGLE_DRIVE_ROOT_FOLDER_ID');
  }
  return id;
}

// ── 授權 ─────────────────────────────────────────────────

let _driveClient: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (_driveClient) return _driveClient;

  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  _driveClient = google.drive({ version: 'v3', auth });
  return _driveClient;
}

// ── 資料夾管理 ───────────────────────────────────────────

/** 快取已建立的資料夾 ID，避免重複查詢 */
const folderCache = new Map<string, string>();

/**
 * 在指定的父資料夾下取得或建立子資料夾
 */
async function getOrCreateFolder(
  parentId: string,
  folderName: string,
): Promise<string> {
  const cacheKey = `${parentId}/${folderName}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const drive = getDriveClient();

  // 查詢是否已存在
  const query = `'${parentId}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const list = await drive.files.list({
    q: query,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (list.data.files && list.data.files.length > 0) {
    const id = list.data.files[0].id!;
    folderCache.set(cacheKey, id);
    return id;
  }

  // 建立資料夾
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  const id = created.data.id!;
  folderCache.set(cacheKey, id);
  return id;
}

/**
 * 取得或建立 year/month 子資料夾路徑
 * 例如 rootFolder/2026/11/
 */
async function getMonthFolder(year: string, month: string): Promise<string> {
  const rootId = getRootFolderId();
  const yearFolderId = await getOrCreateFolder(rootId, year);
  return getOrCreateFolder(yearFolderId, month);
}

/**
 * 取得或建立 avatars 資料夾
 */
async function getAvatarFolder(): Promise<string> {
  const rootId = getRootFolderId();
  return getOrCreateFolder(rootId, 'avatars');
}

// ── 上傳 ─────────────────────────────────────────────────

export interface UploadResult {
  /** Google Drive 檔案 ID */
  driveFileId: string;
  /** 儲存路徑（用來記錄在 DB，格式如 2026/11/uuid.jpg） */
  storagePath: string;
}

/**
 * 上傳檔案到 Google Drive
 *
 * @param buffer    檔案內容
 * @param fileName  檔案名稱（如 uuid.jpg）
 * @param mimeType  MIME 類型
 * @param year      年份（4碼）
 * @param month     月份（2碼，補零）
 */
export async function uploadToGoogleDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  year: string,
  month: string,
): Promise<UploadResult> {
  const drive = getDriveClient();
  const folderId = await getMonthFolder(year, month);

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const result = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id',
  });

  const driveFileId = result.data.id!;
  const storagePath = `gdrive:${driveFileId}`;

  return { driveFileId, storagePath };
}

/**
 * 上傳大頭照到 Google Drive（avatars 資料夾）
 */
export async function uploadAvatarToGoogleDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const drive = getDriveClient();
  const folderId = await getAvatarFolder();

  // 先刪除同名的舊檔案
  const query = `'${folderId}' in parents and name contains '${fileName.split('.')[0]}' and trashed=false`;
  const existing = await drive.files.list({
    q: query,
    fields: 'files(id)',
    spaces: 'drive',
  });

  if (existing.data.files) {
    for (const f of existing.data.files) {
      try {
        await drive.files.delete({ fileId: f.id! });
      } catch {
        // 忽略刪除錯誤
      }
    }
  }

  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  const result = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: 'id',
  });

  return result.data.id!;
}

// ── 下載 / 串流 ─────────────────────────────────────────

/**
 * 從 storagePath 提取 Google Drive 檔案 ID
 * storagePath 格式：`gdrive:{fileId}`
 */
export function extractDriveFileId(storagePath: string): string | null {
  if (storagePath.startsWith('gdrive:')) {
    return storagePath.slice(7);
  }
  return null;
}

/**
 * 從 Google Drive 下載檔案，回傳 Buffer
 */
export async function downloadFromGoogleDrive(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();

  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );

  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * 取得 Google Drive 檔案的 metadata（fileSize）
 */
export async function getFileMetadata(fileId: string): Promise<{ size: number }> {
  const drive = getDriveClient();

  const response = await drive.files.get({
    fileId,
    fields: 'size',
  });

  return { size: parseInt(response.data.size || '0', 10) };
}

// ── 刪除 ─────────────────────────────────────────────────

/**
 * 從 Google Drive 刪除檔案
 */
export async function deleteFromGoogleDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();

  try {
    await drive.files.delete({ fileId });
  } catch (error) {
    // 檔案不存在或已刪除不阻擋流程
    console.warn('[google-drive] 刪除檔案失敗:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * 根據 storagePath 刪除 Google Drive 上的檔案
 * 支援新格式 (gdrive:xxx) 和舊格式（本地路徑，忽略）
 */
export async function deleteByStoragePath(storagePath: string): Promise<void> {
  const fileId = extractDriveFileId(storagePath);
  if (fileId) {
    await deleteFromGoogleDrive(fileId);
  }
  // 舊的本地路徑格式：不做任何事
}
