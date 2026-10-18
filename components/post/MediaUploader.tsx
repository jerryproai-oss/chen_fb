'use client';

import { useState, useRef, useCallback } from 'react';
import { ImagePlus, X } from 'lucide-react';
import type { MediaItem } from '@/lib/types';
import styles from './MediaUploader.module.css';

/** 最大上傳數量 */
const MAX_FILES = 9;
/** 單檔最大大小 (20 MB) */
const MAX_SIZE = 20 * 1024 * 1024;
/** 接受的圖片類型 */
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

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

  // 已上傳的媒體 map (id -> MediaItem)
  const mediaMap = new Map(existingMedia.map((m) => [m.id, m]));

  const totalCount = mediaIds.length + uploading.length;
  const canUpload = totalCount < MAX_FILES;

  /** 驗證檔案 */
  const validateFile = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return `「${file.name}」格式不支援，請上傳 JPG、PNG、GIF 或 WebP 圖片`;
      }
      if (file.size > MAX_SIZE) {
        return `「${file.name}」超過 20MB 限制`;
      }
      return null;
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
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `上傳失敗 (${res.status})`);
        }

        const data = await res.json();
        const newId: string = data.media.id;

        // 移除 uploading 狀態，加入 mediaIds
        setUploading((prev) => prev.filter((u) => u.id !== tempId));
        onMediaChange([...mediaIds, newId]);
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
        setError(`最多只能上傳 ${MAX_FILES} 張圖片`);
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
        uploadFile(file, tempId);
      }
    },
    [totalCount, validateFile, uploadFile],
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

  /** 取得圖片 URL（優先使用 existingMedia 中的 url） */
  const getMediaUrl = (id: string): string => {
    const item = mediaMap.get(id);
    return item?.url ?? `/api/media/${id}`;
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
          {/* 已上傳的圖片 */}
          {mediaIds.map((id) => (
            <div key={id} className={styles.previewItem}>
              <img
                className={styles.previewImage}
                src={getMediaUrl(id)}
                alt="已上傳的圖片"
                loading="lazy"
              />
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => handleRemove(id)}
                aria-label="移除圖片"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* 上傳中的圖片 */}
          {uploading.map((u) => (
            <div key={u.id} className={styles.previewItem}>
              <img
                className={styles.previewImage}
                src={u.previewUrl}
                alt="上傳中"
              />
              <div className={styles.uploadingOverlay}>
                <div className={styles.spinner} />
                <span className={styles.uploadingText}>上傳中…</span>
              </div>
            </div>
          ))}
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
        <ImagePlus size={28} className={styles.dropIcon} />
        <span className={styles.dropText}>
          {canUpload ? '點擊或拖放圖片到此處' : '已達上傳上限'}
        </span>
        <span className={styles.dropSubText}>
          JPG、PNG、GIF、WebP・每張最大 20MB
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        multiple
        className={styles.fileInput}
        onChange={handleInputChange}
      />

      {/* 上傳提示 */}
      <span className={styles.hint}>
        已選 {mediaIds.length}/{MAX_FILES} 張圖片
      </span>
    </div>
  );
}
