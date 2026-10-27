'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MediaPoolItem } from '@/lib/types';
import useSwipe from '@/hooks/useSwipe';
import styles from './MediaPool.module.css';

interface MediaPoolProps {
  scope: 'journal' | 'family';
}

/**
 * 媒體池 — 以網格方式展示貼文中的所有媒體
 * 點擊可開啟燈箱，並可跳轉到原始貼文
 */
export default function MediaPool({ scope }: MediaPoolProps) {
  const router = useRouter();
  const [items, setItems] = useState<MediaPoolItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async (cursorParam?: string | null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope, limit: '30' });
      if (cursorParam) params.set('cursor', cursorParam);
      const res = await fetch(`/api/media/pool?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems((prev) =>
        cursorParam ? [...prev, ...data.items] : data.items,
      );
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      console.error('Failed to load media pool:', err);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [loading, scope]);

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchItems(cursor);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, cursor, fetchItems]);

  if (initialLoad && loading) {
    return <div className={styles.loader}>載入中…</div>;
  }

  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <div className={styles.emptyIcon}>🖼️</div>
        <p className={styles.emptyText}>還沒有媒體檔案</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {items.map((item, i) => (
          <div
            key={item.id}
            className={styles.gridItem}
            onClick={() => setLightboxIndex(i)}
            role="button"
            tabIndex={0}
            aria-label={`檢視媒體 ${i + 1}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setLightboxIndex(i);
              }
            }}
          >
            {item.mimeType.startsWith('video/') ? (
              <div className={styles.videoThumb}>
                <video className={styles.thumb} src={item.url} muted preload="metadata" />
                <div className={styles.playIcon}>▶</div>
              </div>
            ) : item.mimeType.startsWith('audio/') ? (
              <div className={styles.audioThumb}>
                <span className={styles.audioIcon}>🎵</span>
              </div>
            ) : (
              <img
                className={styles.thumb}
                src={item.url}
                alt={item.filename}
                loading="lazy"
              />
            )}
          </div>
        ))}
      </div>

      {loading && <div className={styles.loader}>載入更多…</div>}
      {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}

      {lightboxIndex !== null && (
        <PoolLightbox
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

function PoolLightbox({
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
    <div className={styles.lightboxBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()} {...swipeHandlers}>
        <button type="button" className={styles.lightboxClose} onClick={onClose} aria-label="關閉">
          <X size={22} />
        </button>

        {count > 1 && (
          <button type="button" className={`${styles.lightboxNav} ${styles.lightboxPrev}`} onClick={goPrev} aria-label="上一張">
            <ChevronLeft size={24} />
          </button>
        )}

        {current.mimeType.startsWith('video/') ? (
          <video className={styles.lightboxMedia} src={current.url} controls autoPlay playsInline />
        ) : current.mimeType.startsWith('audio/') ? (
          <div className={styles.lightboxAudio}>
            <span style={{ fontSize: '3rem' }}>🎵</span>
            <span>{current.filename}</span>
            <audio src={current.url} controls autoPlay style={{ width: '100%', marginTop: '16px' }} />
          </div>
        ) : (
          <img className={styles.lightboxMedia} src={current.url} alt={current.filename} />
        )}

        {count > 1 && (
          <button type="button" className={`${styles.lightboxNav} ${styles.lightboxNext}`} onClick={goNext} aria-label="下一張">
            <ChevronRight size={24} />
          </button>
        )}

        <div className={styles.lightboxInfo}>
          <div className={styles.lightboxMeta}>
            <span>{current.authorName}</span>
            <span>{formatDate(current.recordDate)}</span>
          </div>
          <button
            type="button"
            className={styles.lightboxPostLink}
            onClick={() => onGoToPost(current.postId)}
          >
            📄 {current.postTitle}
          </button>
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
