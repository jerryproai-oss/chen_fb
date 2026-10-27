'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X, Image } from 'lucide-react';
import type { MediaPoolItem } from '@/lib/types';
import useSwipe from '@/hooks/useSwipe';
import styles from './MediaShowcase.module.css';

interface MediaShowcaseProps {
  scope: 'journal' | 'family';
}

/**
 * 媒體展示列 — 頁面上方的水平滾動媒體預覽
 * 類似 IG story 的水平滑動瀏覽，點擊打開全螢幕燈箱
 */
export default function MediaShowcase({ scope }: MediaShowcaseProps) {
  const router = useRouter();
  const [items, setItems] = useState<MediaPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/media/pool?scope=${scope}&limit=20`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(data.items ?? []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [scope]);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
  };
  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
  };

  if (loading || items.length === 0) return null;

  return (
    <>
      <section className={styles.showcase}>
        <div className={styles.header}>
          <Image size={14} />
          <span>最新媒體</span>
          <span className={styles.count}>{items.length}</span>
        </div>
        <div className={styles.scrollWrapper}>
          <button
            type="button"
            className={`${styles.scrollBtn} ${styles.scrollBtnLeft}`}
            onClick={scrollLeft}
            aria-label="向左捲動"
          >
            <ChevronLeft size={18} />
          </button>
          <div ref={scrollRef} className={styles.scrollTrack}>
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={styles.thumbBtn}
                onClick={() => setLightboxIndex(i)}
                aria-label={`檢視媒體 ${i + 1}`}
              >
                {item.mimeType.startsWith('video/') ? (
                  <div className={styles.videoThumb}>
                    <video
                      className={styles.thumbImg}
                      src={item.url}
                      muted
                      preload="metadata"
                    />
                    <span className={styles.playBadge}>▶</span>
                  </div>
                ) : (
                  <img
                    className={styles.thumbImg}
                    src={item.url}
                    alt={item.filename}
                    loading="lazy"
                  />
                )}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${styles.scrollBtn} ${styles.scrollBtnRight}`}
            onClick={scrollRight}
            aria-label="向右捲動"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      {lightboxIndex !== null && (
        <ShowcaseLightbox
          items={items}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onGoToPost={(postId) => router.push(`/posts/${postId}`)}
        />
      )}
    </>
  );
}

/* ── Lightbox ─────────────────────────────────────────── */

function ShowcaseLightbox({
  items,
  currentIndex,
  onClose,
  onNavigate,
  onGoToPost,
}: {
  items: MediaPoolItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onGoToPost: (postId: string) => void;
}) {
  const count = items.length;
  const current = items[currentIndex];

  const goPrev = useCallback(() => {
    onNavigate(currentIndex > 0 ? currentIndex - 1 : count - 1);
  }, [currentIndex, count, onNavigate]);

  const goNext = useCallback(() => {
    onNavigate(currentIndex < count - 1 ? currentIndex + 1 : 0);
  }, [currentIndex, count, onNavigate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape': onClose(); break;
        case 'ArrowLeft': goPrev(); break;
        case 'ArrowRight': goNext(); break;
      }
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, goPrev, goNext]);

  // 觸控滑動手勢（手機/平板）
  const swipeHandlers = useSwipe({
    onSwipeLeft: goNext,
    onSwipeRight: goPrev,
    onSwipeDown: onClose,
    threshold: 50,
  });

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  return (
    <div className={styles.lbBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.lbContent} onClick={(e) => e.stopPropagation()} {...swipeHandlers}>
        <button type="button" className={styles.lbClose} onClick={onClose} aria-label="關閉">
          <X size={22} />
        </button>

        {count > 1 && (
          <button type="button" className={`${styles.lbNav} ${styles.lbPrev}`} onClick={goPrev} aria-label="上一張">
            <ChevronLeft size={24} />
          </button>
        )}

        {current.mimeType.startsWith('video/') ? (
          <video className={styles.lbMedia} src={current.url} controls autoPlay playsInline />
        ) : current.mimeType.startsWith('audio/') ? (
          <div className={styles.lbAudio}>
            <span style={{ fontSize: '3rem' }}>🎵</span>
            <span>{current.filename}</span>
            <audio src={current.url} controls autoPlay style={{ width: '100%', marginTop: '16px' }} />
          </div>
        ) : (
          <img className={styles.lbMedia} src={current.url} alt={current.filename} />
        )}

        {count > 1 && (
          <button type="button" className={`${styles.lbNav} ${styles.lbNext}`} onClick={goNext} aria-label="下一張">
            <ChevronRight size={24} />
          </button>
        )}

        <div className={styles.lbInfo}>
          <div className={styles.lbMeta}>
            <span>{current.authorName}</span>
            <span>{formatDate(current.recordDate)}</span>
          </div>
          <button
            type="button"
            className={styles.lbPostLink}
            onClick={() => onGoToPost(current.postId)}
          >
            📄 {current.postTitle}
          </button>
          {count > 1 && (
            <div className={styles.lbCounter}>
              {currentIndex + 1} / {count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
