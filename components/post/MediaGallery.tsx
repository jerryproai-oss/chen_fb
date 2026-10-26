'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Pencil, Check, Film, Music } from 'lucide-react';
import type { MediaItem } from '@/lib/types';
import styles from './MediaGallery.module.css';

interface MediaGalleryProps {
  media: MediaItem[];
  /** 是否為作者（可編輯心情文） */
  isAuthor?: boolean;
}

/**
 * 媒體展示元件
 * 照片和影片分區顯示、點擊開啟燈箱
 * 燈箱中顯示拍攝日期與心情文
 */
export default function MediaGallery({ media, isAuthor = false }: MediaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [captions, setCaptions] = useState<Record<string, string | null>>({});

  // 初始化 captions from media
  useEffect(() => {
    const map: Record<string, string | null> = {};
    media.forEach((m) => { map[m.id] = m.caption; });
    setCaptions(map);
  }, [media]);

  if (media.length === 0) return null;

  // 分類媒體
  const photos = media.filter((m) => m.mimeType.startsWith('image/'));
  const videos = media.filter((m) => m.mimeType.startsWith('video/'));
  const audios = media.filter((m) => m.mimeType.startsWith('audio/'));

  // 燈箱用完整列表（照片 + 影片 + 音訊）
  const allMedia = [...photos, ...videos, ...audios];

  const openLightbox = (item: MediaItem) => {
    const idx = allMedia.findIndex((m) => m.id === item.id);
    setLightboxIndex(idx >= 0 ? idx : 0);
  };

  const handleCaptionUpdate = (mediaId: string, newCaption: string | null) => {
    setCaptions((prev) => ({ ...prev, [mediaId]: newCaption }));
  };

  // 照片網格（最多顯示 4 張）
  const photoDisplayCount = Math.min(photos.length, 4);
  const photoMore = photos.length - 4;
  const photoGridClass =
    photos.length === 1 ? styles.grid1
    : photos.length === 2 ? styles.grid2
    : photos.length === 3 ? styles.grid3
    : styles.grid4;

  return (
    <>
      {/* ── 照片區 ─────────────────────────── */}
      {photos.length > 0 && (
        <div className={`${styles.grid} ${photoGridClass}`}>
          {photos.slice(0, photoDisplayCount).map((item, i) => (
            <div
              key={item.id}
              className={styles.gridItem}
              onClick={() => openLightbox(item)}
              role="button"
              tabIndex={0}
              aria-label={`檢視照片 ${i + 1}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(item);
                }
              }}
            >
              <img
                className={styles.gridItemImage}
                src={item.url}
                alt={item.filename || `照片 ${i + 1}`}
                loading="lazy"
              />
              {i === 3 && photoMore > 0 && (
                <div className={styles.moreOverlay}>+{photoMore}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 影片區 ─────────────────────────── */}
      {videos.length > 0 && (
        <div className={styles.videoSection}>
          {videos.map((item) => (
            <div
              key={item.id}
              className={styles.videoCard}
              onClick={() => openLightbox(item)}
              role="button"
              tabIndex={0}
              aria-label={`播放影片 ${item.filename}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(item);
                }
              }}
            >
              <div className={styles.videoPreview}>
                <video
                  className={styles.videoPreviewElement}
                  src={item.url}
                  muted
                  preload="metadata"
                  playsInline
                />
                <div className={styles.playIcon}>▶</div>
              </div>
              <div className={styles.videoInfo}>
                <Film size={14} />
                <span className={styles.videoName}>
                  {item.filename || '影片'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 音訊區 ─────────────────────────── */}
      {audios.length > 0 && (
        <div className={styles.audioSection}>
          {audios.map((item) => (
            <div
              key={item.id}
              className={styles.audioCard}
              onClick={() => openLightbox(item)}
              role="button"
              tabIndex={0}
              aria-label={`播放音訊 ${item.filename}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openLightbox(item);
                }
              }}
            >
              <Music size={18} />
              <span className={styles.audioName}>{item.filename || '音訊'}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── 燈箱 ──────────────────────────── */}
      {lightboxIndex !== null && (
        <Lightbox
          media={allMedia}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          isAuthor={isAuthor}
          captions={captions}
          onCaptionUpdate={handleCaptionUpdate}
        />
      )}
    </>
  );
}

/* ── 燈箱子元件 ─────────────────────────────────────────── */

interface LightboxProps {
  media: MediaItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  isAuthor: boolean;
  captions: Record<string, string | null>;
  onCaptionUpdate: (mediaId: string, caption: string | null) => void;
}

function formatTakenAt(dateStr: string): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(/-/g, '/');
}

function Lightbox({
  media,
  currentIndex,
  onClose,
  onNavigate,
  isAuthor,
  captions,
  onCaptionUpdate,
}: LightboxProps) {
  const count = media.length;
  const current = media[currentIndex];
  const [editing, setEditing] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [saving, setSaving] = useState(false);

  // 切換圖片時重置編輯狀態
  useEffect(() => {
    setEditing(false);
    setCaptionText(captions[current.id] || '');
  }, [currentIndex, current.id, captions]);

  const goPrev = useCallback(() => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : count - 1);
  }, [currentIndex, count, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate(currentIndex < count - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, count, onNavigate]);

  // 鍵盤操作
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (editing) return; // 編輯中不攔截鍵盤
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowLeft':
          goPrev();
          break;
        case 'ArrowRight':
          goNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext, editing]);

  const handleSaveCaption = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/media/${current.id}/caption`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: captionText.trim() || null }),
      });
      if (res.ok) {
        onCaptionUpdate(current.id, captionText.trim() || null);
        setEditing(false);
      }
    } catch {
      // 靜默失敗
    } finally {
      setSaving(false);
    }
  };

  const currentCaption = captions[current.id];
  const displayDate = current.takenAt || current.sortOrder !== undefined ? current.takenAt : null;

  return (
    <div
      className={styles.lightboxBackdrop}
      onClick={onClose}
      role="dialog"
      aria-label="媒體燈箱"
      aria-modal="true"
    >
      <div
        className={styles.lightboxContent}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 關閉按鈕 */}
        <button
          type="button"
          className={styles.lightboxClose}
          onClick={onClose}
          aria-label="關閉燈箱"
        >
          <X size={22} />
        </button>

        {/* 上一張 */}
        {count > 1 && (
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxPrev}`}
            onClick={goPrev}
            aria-label="上一張"
          >
            <ChevronLeft size={24} />
          </button>
        )}

        {/* 媒體內容 */}
        <div className={styles.lightboxMediaArea}>
          {current.mimeType.startsWith('video/') ? (
            <video
              className={styles.lightboxImage}
              src={current.url}
              controls
              autoPlay
              playsInline
            />
          ) : current.mimeType.startsWith('audio/') ? (
            <div className={styles.lightboxAudio}>
              <span className={styles.lightboxAudioIcon}>🎵</span>
              <span className={styles.lightboxAudioName}>{current.filename}</span>
              <audio src={current.url} controls autoPlay style={{ width: '100%', marginTop: '16px' }} />
            </div>
          ) : (
            <img
              className={styles.lightboxImage}
              src={current.url}
              alt={current.filename || `照片 ${currentIndex + 1}`}
            />
          )}
        </div>

        {/* 下一張 */}
        {count > 1 && (
          <button
            type="button"
            className={`${styles.lightboxNav} ${styles.lightboxNext}`}
            onClick={goNext}
            aria-label="下一張"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* ── 底部資訊列 ────────────────────── */}
        <div className={styles.lightboxFooter}>
          {/* 拍攝日期 */}
          {current.takenAt && (
            <div className={styles.lightboxDate}>
              📅 拍攝於 {formatTakenAt(current.takenAt)}
            </div>
          )}

          {/* 心情文 */}
          {editing ? (
            <div className={styles.captionEdit}>
              <textarea
                className={styles.captionInput}
                value={captionText}
                onChange={(e) => setCaptionText(e.target.value)}
                placeholder="寫下這張照片的心情…"
                maxLength={500}
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setCaptionText(currentCaption || '');
                  }
                }}
              />
              <div className={styles.captionActions}>
                <span className={styles.captionCount}>
                  {captionText.length}/500
                </span>
                <button
                  type="button"
                  className={styles.captionCancelBtn}
                  onClick={() => {
                    setEditing(false);
                    setCaptionText(currentCaption || '');
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  className={styles.captionSaveBtn}
                  onClick={handleSaveCaption}
                  disabled={saving}
                >
                  <Check size={14} />
                  {saving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.captionDisplay}>
              {currentCaption && (
                <p className={styles.captionText}>💬 {currentCaption}</p>
              )}
              {isAuthor && (
                <button
                  type="button"
                  className={styles.captionEditBtn}
                  onClick={() => {
                    setCaptionText(currentCaption || '');
                    setEditing(true);
                  }}
                >
                  <Pencil size={12} />
                  {currentCaption ? '編輯心情文' : '寫下心情…'}
                </button>
              )}
            </div>
          )}

          {/* 計數 */}
          {count > 1 && (
            <div className={styles.lightboxCounter}>
              {currentIndex + 1} / {count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
