'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Bookmark } from 'lucide-react';
import PostCard from '@/components/post/PostCard';
import PageHeader from '@/components/ui/PageHeader';
import type { PostSummary } from '@/lib/types';
import styles from './page.module.css';

/**
 * 收藏手札頁面
 * 顯示目前使用者所有收藏的貼文
 * 支援無限滾動與即時取消收藏
 */
export default function BookmarksPage() {
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
      const res = await fetch(`/api/bookmarks?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPosts((prev) =>
        cursorParam ? [...prev, ...data.posts] : data.posts,
      );
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [loading]);

  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 無限滾動
  useEffect(() => {
    if (!hasMore || loading) return;
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
  }, [hasMore, loading, cursor, fetchPosts]);

  const handleBookmarkToggle = (postId: string, bookmarked: boolean) => {
    if (!bookmarked) {
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader title="我的收藏" />

      {initialLoad && loading ? (
        <div className={styles.loader}>載入中…</div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Bookmark size={48} strokeWidth={1.5} />
          </div>
          <h2 className={styles.emptyTitle}>還沒有收藏的手札</h2>
          <p className={styles.emptyText}>
            在閱讀生活手札或家庭動態時，點擊書籤圖示即可將喜歡的內容收藏至此。
          </p>
          <div className={styles.emptyActions}>
            <Link href="/family" className={styles.emptyBtn}>
              瀏覽家庭動態
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onBookmarkToggle={handleBookmarkToggle}
            />
          ))}

          {loading && <div className={styles.loader}>載入更多…</div>}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        </div>
      )}
    </div>
  );
}
