'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaItem } from '@/lib/types';
import styles from './MediaGallery.module.css';

interface MediaGalleryProps {
  media: MediaItem[];
}

/**
 * 圖片展示元件
 * 支援多種網格布局 (1/2/3/4+)、點擊開啟燈箱、左右切換
 */
export default function MediaGallery({ media }: MediaGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const count = media.length;
  if (count === 0) return null;

  // 網格最多顯示 4 張
  const displayItems = media.slice(0, 4);
  const moreCount = count - 4;

  // 選擇網格 class
  const gridClass =
    count === 1
      ? styles.grid1
      : count === 2
        ? styles.grid2
        : count === 3
          ? styles.grid3
          : styles.grid4;

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  return (
    <>
      <div className={`${styles.grid} ${gridClass}`}>
        {displayItems.map((item, i) => (
          <div
            key={item.id}
            className={styles.gridItem}
            onClick={() => openLightbox(i)}
            role="button"
            tabIndex={0}
            aria-label={`檢視圖片 ${i + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLightbox(i);
              }
            }}
          >
            <img
              className={styles.gridItemImage}
              src={item.url}
              alt={item.filename || `圖片 ${i + 1}`}
              loading="lazy"
            />
            {/* 最後一格顯示 +N */}
            {i === 3 && moreCount > 0 && (
              <div className={styles.moreOverlay}>+{moreCount}</div>
            )}
          </div>
        ))}
      </div>

      {/* 燈箱 */}
      {lightboxIndex !== null && (
        <Lightbox
          media={media}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNavigate={setLightboxIndex}
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
}

function Lightbox({ media, currentIndex, onClose, onNavigate }: LightboxProps) {
  const count = media.length;

  const goPrev = useCallback(() => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : count - 1);
  }, [currentIndex, count, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate(currentIndex < count - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, count, onNavigate]);

  // 鍵盤操作
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
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
    // 鎖定背景滾動
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  const current = media[currentIndex];

  return (
    <div
      className={styles.lightboxBackdrop}
      onClick={onClose}
      role="dialog"
      aria-label="圖片燈箱"
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

        {/* 圖片 */}
        <img
          className={styles.lightboxImage}
          src={current.url}
          alt={current.filename || `圖片 ${currentIndex + 1}`}
        />

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

        {/* 計數 */}
        {count > 1 && (
          <div className={styles.lightboxCounter}>
            {currentIndex + 1} / {count}
          </div>
        )}
      </div>
    </div>
  );
}
