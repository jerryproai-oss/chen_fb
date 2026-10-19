'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { PenSquare } from 'lucide-react';
import PostCard from '@/components/post/PostCard';
import MediaPool from '@/components/post/MediaPool';
import MediaShowcase from '@/components/post/MediaShowcase';
import type { PostSummary } from '@/lib/types';
import styles from './page.module.css';

/**
 * 生活手札頁面（Journal Feed）
 * 顯示自己的所有貼文（含草稿），按 recordDate 降序
 * 支援無限滾動
 * 含媒體池 Tab
 */
export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (cursorParam?: string | null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursorParam) params.set('cursor', cursorParam);
      const res = await fetch(`/api/feed/journal?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPosts((prev) =>
        cursorParam ? [...prev, ...data.posts] : data.posts,
      );
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      console.error('Failed to load journal:', err);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [loading]);

  // Initial load
  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (activeTab !== 'posts' || !hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          fetchPosts(cursor);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, hasMore, loading, cursor, fetchPosts]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>生活手札</h1>
        <p className={styles.pageSubtitle}>記錄每一天的生活點滴</p>
      </div>

      {/* Tab Bar */}
      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'posts' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          📝 貼文
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'media' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('media')}
        >
          🖼️ 媒體
        </button>
      </div>

      {activeTab === 'posts' ? (
        <>
          {/* 媒體展示 */}
          <MediaShowcase scope="journal" />

          {initialLoad && loading ? (
            <div className={styles.loader}>載入中…</div>
          ) : posts.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>📝</div>
              <h2 className={styles.emptyTitle}>還沒有手札</h2>
              <p className={styles.emptyText}>
                開始記錄你的第一篇生活手札吧！
              </p>
              <Link href="/write" className={styles.emptyBtn}>
                <PenSquare size={16} />
                寫手札
              </Link>
            </div>
          ) : (
            <div className={styles.postList}>
              {posts.map((post) => (
                <PostCard key={post.id} post={post} isOwn />
              ))}

              {loading && <div className={styles.loader}>載入更多…</div>}
              {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
            </div>
          )}
        </>
      ) : (
        <MediaPool scope="journal" />
      )}
    </div>
  );
}
