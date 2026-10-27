'use client';

import { useEffect, useCallback } from 'react';
import useSwipe from '@/hooks/useSwipe';
import styles from './ImageLightbox.module.css';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

/**
 * 全螢幕圖片預覽（Lightbox）
 * 點擊背景或按 ESC 關閉、下滑關閉
 */
export default function ImageLightbox({ src, alt = '', onClose }: ImageLightboxProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    // 防止背景滾動
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  // 觸控滑動手勢（下滑關閉）
  const swipeHandlers = useSwipe({
    onSwipeDown: onClose,
    threshold: 50,
  });

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-label="圖片預覽">
      <button className={styles.closeBtn} onClick={onClose} aria-label="關閉預覽">
        ✕
      </button>
      <img
        src={src}
        alt={alt}
        className={styles.image}
        onClick={(e) => e.stopPropagation()}
        {...swipeHandlers}
      />
    </div>
  );
}
