'use client';

import imageCompression from 'browser-image-compression';

/**
 * 前端圖片壓縮工具
 *
 * - 使用 browser-image-compression (Web Worker, 支援 HEIC/HEIF)
 * - 預設最大 1MB、長邊 2048px、品質 0.8
 * - GIF 不壓縮（保留動畫）
 * - 非圖片檔案直接跳過
 * - 壓縮後若比原檔大則保留原檔
 */

export interface CompressOptions {
  /** 最大檔案大小 (MB)，預設 1 */
  maxSizeMB?: number;
  /** 最大寬或高 (px)，預設 2048 */
  maxWidthOrHeight?: number;
  /** 是否使用 Web Worker，預設 true */
  useWebWorker?: boolean;
  /** 輸出檔案類型，預設保持原格式（HEIC 自動轉 JPEG） */
  fileType?: string;
}

const DEFAULT_OPTIONS: CompressOptions = {
  maxSizeMB: 1,
  maxWidthOrHeight: 2048,
  useWebWorker: true,
};

/**
 * 壓縮單張圖片
 * @param file 原始圖片檔案
 * @param options 壓縮選項（可選）
 * @returns 壓縮後的 File（或原檔，若不需壓縮或壓縮失敗）
 */
export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<File> {
  // 非圖片直接跳過
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // GIF 不壓縮（保留動畫）
  if (file.type === 'image/gif') {
    return file;
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 小檔案且非 HEIC 不需壓縮
  const maxBytes = (opts.maxSizeMB ?? 1) * 1024 * 1024;
  const isHEIC = file.type === 'image/heic' || file.type === 'image/heif'
    || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

  if (file.size <= maxBytes && !isHEIC) {
    return file;
  }

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: opts.maxSizeMB ?? 1,
      maxWidthOrHeight: opts.maxWidthOrHeight ?? 2048,
      useWebWorker: opts.useWebWorker ?? true,
      fileType: opts.fileType || (isHEIC ? 'image/jpeg' : undefined),
      preserveExif: false,
    });

    // 壓縮後若比原檔大，使用原檔
    if (compressed.size >= file.size && !isHEIC) {
      console.log(`[圖片壓縮] ${file.name}: 壓縮後更大，保留原檔 (${(file.size / 1024).toFixed(0)}KB)`);
      return file;
    }

    // 確保回傳 File（而非 Blob）
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const ext = isHEIC ? '.jpg' : file.name.match(/\.[^.]+$/)?.[0] || '.jpg';
    const result = new File([compressed], baseName + ext, {
      type: compressed.type || 'image/jpeg',
      lastModified: Date.now(),
    });

    const reduction = Math.round((1 - result.size / file.size) * 100);
    console.log(
      `[圖片壓縮] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(result.size / 1024).toFixed(0)}KB (${reduction}% 減少)`,
    );
    return result;
  } catch (err) {
    console.warn('[圖片壓縮] 壓縮失敗，使用原檔:', err);
    return file;
  }
}

/**
 * 批量壓縮多張圖片
 */
export async function compressImages(
  files: File[],
  options?: CompressOptions,
): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, options)));
}
