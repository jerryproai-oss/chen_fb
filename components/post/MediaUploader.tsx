'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, Film, Music } from 'lucide-react';
import type { MediaItem } from '@/lib/types';
import styles from './MediaUploader.module.css';

/** 最大上傳數量 */
const MAX_FILES = 9;
/** 單檔最大大小（圖片 20MB、影片/音訊 500MB） */
const MAX_SIZE_IMAGE = 20 * 1024 * 1024;
const MAX_SIZE_MEDIA = 500 * 1024 * 1024;
/** 接受的檔案類型 */
const ACCEPTED_TYPES = [
  // 圖片
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  // 影片
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo', 'video/3gpp',
  // 音訊
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm',
];
const ACCEPT_STRING = 'image/*,video/*,audio/*';

interface UploadingFile {
  id: string;          // 臨時識別用
  file: File;
  previewUrl: string;
  progress: number;    // 0-100
}

interface MediaUploaderProps {
  mediaIds: string[];
  onMediaChange: (ids: string[]) => void;
  existingMedia?: MediaItem[];
}

/**
 * 圖片上傳元件
 * 支援點擊選擇、拖放上傳、預覽、刪除
 */
export default function MediaUploader({
  mediaIds,
  onMediaChange,
  existingMedia = [],
}: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 追蹤本次新上傳的媒體資訊（含 mimeType），讓預覽能正確區分影片/音訊/圖片
  const [uploadedMedia, setUploadedMedia] = useState<Map<string, MediaItem>>(new Map());

  // 已上傳的媒體 map (id -> MediaItem)：合併 existingMedia + 本次新上傳
  const mediaMap = new Map<string, MediaItem>([
    ...existingMedia.map((m) => [m.id, m] as [string, MediaItem]),
    ...uploadedMedia,
  ]);

  const totalCount = mediaIds.length + uploading.length;
  const canUpload = totalCount < MAX_FILES;

  /** 驗證檔案 */
  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return `「${file.name}」格式不支援，請上傳圖片、影片或音訊檔案`;
      }
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? MAX_SIZE_IMAGE : MAX_SIZE_MEDIA;
      const maxLabel = isImage ? '20MB' : '500MB';
      if (file.size > maxSize) {
        return `「${file.name}」超過 ${maxLabel} 限制`;
      }
      return null;
    },
    [],
  );

  /**
   * 圖片壓縮 — 上傳前自動減肥
   * - 長邊超過 MAX_DIMENSION 的圖片自動縮小
   * - JPEG/WebP 壓縮品質 0.85
   * - GIF 不壓縮（保留動畫）
   * - 非圖片檔案直接跳過
   */
  const compressImage = useCallback(
    async (file: File): Promise<File> => {
      // 非圖片或 GIF 不處理
      if (!file.type.startsWith('image/') || file.type === 'image/gif') {
        return file;
      }

      const MAX_DIMENSION = 1920;
      const QUALITY = 0.85;

      return new Promise<File>((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          URL.revokeObjectURL(url);

          let { width, height } = img;

          // 如果圖片尺寸在限制內且小於 500KB，不需壓縮
          if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size < 500 * 1024) {
            resolve(file);
            return;
          }

          // 計算縮放比例
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          // 輸出格式：原本是 PNG 且有透明通道就保持 PNG，否則轉 JPEG
          const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const quality = outputType === 'image/png' ? undefined : QUALITY;

          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= file.size) {
                // 壓縮後反而變大，使用原檔
                resolve(file);
                return;
              }
              const ext = outputType === 'image/png' ? '.png' : '.jpg';
              const baseName = file.name.replace(/\.[^.]+$/, '');
              const compressedFile = new File([blob], baseName + ext, {
                type: outputType,
                lastModified: Date.now(),
              });
              console.log(
                `[圖片壓縮] ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(compressedFile.size / 1024).toFixed(0)}KB (${Math.round((1 - compressedFile.size / file.size) * 100)}% 減少)`
              );
              resolve(compressedFile);
            },
            outputType,
            quality,
          );
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(file); // 失敗時使用原檔
        };

        img.src = url;
      });
    },
    [],
  );

  /** 上傳單一檔案 */
  const uploadFile = useCallback(
    async (file: File, tempId: string) => {
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          // 嘗試解析 JSON 錯誤訊息
          let errorMessage = `上傳失敗 (${res.status})`;
          try {
            const data = await res.json();
            if (data.error) errorMessage = data.error;
          } catch {
            // 非 JSON 回應（例如 Nginx 413 錯誤頁面）
            if (res.status === 413) {
              errorMessage = '檔案過大，伺服器無法處理。請嘗試壓縮影片後再上傳';
            } else if (res.status >= 500) {
              errorMessage = '伺服器發生錯誤，請稍後再試';
            }
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();
        const mediaItem: MediaItem = {
          id: data.media.id,
          url: data.media.url,
          filename: data.media.filename,
          mimeType: data.media.mimeType,
          fileSize: data.media.fileSize,
          width: data.media.width,
          height: data.media.height,
          sortOrder: 0,
        };

        // 保存新上傳的媒體資訊（含 mimeType）
        setUploadedMedia((prev) => {
          const next = new Map(prev);
          next.set(mediaItem.id, mediaItem);
          return next;
        });

        // 移除 uploading 狀態，加入 mediaIds
        setUploading((prev) => prev.filter((u) => u.id !== tempId));
        onMediaChange([...mediaIds, mediaItem.id]);
      } catch (err) {
        setUploading((prev) => prev.filter((u) => u.id !== tempId));
        setError(err instanceof Error ? err.message : '上傳失敗');
      }
    },
    [mediaIds, onMediaChange],
  );

  /** 處理選擇的檔案 */
  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArr = Array.from(files);
      const remaining = MAX_FILES - totalCount;

      if (remaining <= 0) {
        setError(`最多只能上傳 ${MAX_FILES} 個媒體檔案`);
        return;
      }

      const toUpload = fileArr.slice(0, remaining);
      if (fileArr.length > remaining) {
        setError(`已選取 ${fileArr.length} 張，但只能再上傳 ${remaining} 張`);
      }

      for (const file of toUpload) {
        const validationErr = validateFile(file);
        if (validationErr) {
          setError(validationErr);
          continue;
        }

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = URL.createObjectURL(file);

        const uploadingItem: UploadingFile = {
          id: tempId,
          file,
          previewUrl,
          progress: 0,
        };

        setUploading((prev) => [...prev, uploadingItem]);

        // 圖片先壓縮再上傳
        compressImage(file).then((compressed) => {
          uploadFile(compressed, tempId);
        });
      }
    },
    [totalCount, validateFile, uploadFile, compressImage],
  );

  /** 點擊上傳區域 */
  const handleClick = () => {
    if (canUpload) {
      fileInputRef.current?.click();
    }
  };

  /** 檔案輸入改變 */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = ''; // 重置以便重新選同檔案
    }
  };

  /** 拖放事件 */
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragOut = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  /** 刪除已上傳的圖片 */
  const handleRemove = (id: string) => {
    onMediaChange(mediaIds.filter((mid) => mid !== id));
  };

  /** 取得媒體 URL（優先使用 existingMedia 中的 url） */
  const getMediaUrl = (id: string): string => {
    const item = mediaMap.get(id);
    return item?.url ?? `/api/media/${id}`;
  };

  /** 取得媒體類型 */
  const getMediaType = (id: string): 'image' | 'video' | 'audio' => {
    const item = mediaMap.get(id);
    if (item?.mimeType.startsWith('video/')) return 'video';
    if (item?.mimeType.startsWith('audio/')) return 'audio';
    return 'image';
  };

  /** 渲染預覽項目 */
  const renderPreview = (id: string) => {
    const type = getMediaType(id);
    const url = getMediaUrl(id);
    if (type === 'video') {
      return (
        <div className={styles.mediaPlaceholder}>
          <Film size={24} />
          <span>影片</span>
        </div>
      );
    }
    if (type === 'audio') {
      return (
        <div className={styles.mediaPlaceholder}>
          <Music size={24} />
          <span>音訊</span>
        </div>
      );
    }
    return (
      <img
        className={styles.previewImage}
        src={url}
        alt="已上傳的圖片"
        loading="lazy"
      />
    );
  };

  return (
    <div className={styles.wrapper}>
      {/* 錯誤訊息 */}
      {error && (
        <div className={styles.errorMsg}>
          <span>{error}</span>
          <button
            type="button"
            className={styles.errorDismiss}
            onClick={() => setError(null)}
            aria-label="關閉錯誤訊息"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 預覽網格 */}
      {(mediaIds.length > 0 || uploading.length > 0) && (
        <div className={styles.previewGrid}>
          {/* 已上傳的媒體 */}
          {mediaIds.map((id) => (
            <div key={id} className={styles.previewItem}>
              {renderPreview(id)}
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(id)}
                aria-label="移除媒體"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* 上傳中的媒體 */}
          {uploading.map((u) => {
            const isVideo = u.file.type.startsWith('video/');
            const isAudio = u.file.type.startsWith('audio/');
            return (
              <div key={u.id} className={styles.previewItem}>
                {isVideo ? (
                  <div className={styles.mediaPlaceholder}>
                    <Film size={24} />
                    <span>影片</span>
                  </div>
                ) : isAudio ? (
                  <div className={styles.mediaPlaceholder}>
                    <Music size={24} />
                    <span>音訊</span>
                  </div>
                ) : (
                  <img
                    className={styles.previewImage}
                    src={u.previewUrl}
                    alt="上傳中"
                  />
                )}
                <div className={styles.uploadingOverlay}>
                  <div className={styles.spinner} />
                  <span className={styles.uploadingText}>上傳中…</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 拖放上傳區域 */}
      <div
        className={`${styles.dropZone} ${dragActive ? styles.dropZoneActive : ''} ${!canUpload ? styles.dropZoneDisabled : ''}`}
        onClick={handleClick}
        onDragOver={handleDrag}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        aria-label="上傳圖片"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <Upload size={28} className={styles.dropIcon} />
        <span className={styles.dropText}>
          {canUpload ? '點擊或拖放檔案到此處' : '已達上傳上限'}
        </span>
        <span className={styles.dropSubText}>
          圖片・影片・音訊，每檔最大 500MB
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_STRING}
        multiple
        className={styles.fileInput}
        onChange={handleInputChange}
      />

      {/* 上傳提示 */}
      <span className={styles.hint}>
        已選 {mediaIds.length}/{MAX_FILES} 個媒體
      </span>
    </div>
  );
}
