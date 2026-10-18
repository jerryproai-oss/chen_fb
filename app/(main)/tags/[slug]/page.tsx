'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Tag as TagIcon } from 'lucide-react';
import PostCard from '@/components/post/PostCard';
import type { PostSummary, TagItem } from '@/lib/types';
import styles from './page.module.css';

/**
 * 標籤貼文頁面
 * 顯示該 tag 下的所有可見貼文，支援無限滾動。
 */
export default function TagPostsPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ? decodeURIComponent(params.slug) : '';

  const [tag, setTag] = useState<TagItem | null>(null);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(
    async (cursorParam?: string | null) => {
      if (!slug || loading) return;
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({ limit: '20' });
        if (cursorParam) queryParams.set('cursor', cursorParam);

        const res = await fetch(
          `/api/tags/${encodeURIComponent(slug)}/posts?${queryParams}`,
        );

        if (!res.ok) {
          if (res.status === 404) {
            setError('找不到該標籤');
          } else {
            setError('載入貼文失敗，請稍後再試');
          }
          return;
        }

        const data = await res.json();
        setTag(data.tag);
        setPosts((prev) =>
          cursorParam ? [...prev, ...data.posts] : data.posts,
        );
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (err) {
        console.error('Failed to load tag posts:', err);
        setError('網路連線異常，請稍後再試');
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [slug, loading],
  );

  // 初次載入
  useEffect(() => {
    fetchPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.navRow}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.back()}
            aria-label="返回上一頁"
          >
            <ArrowLeft size={20} />
          </button>
          <div className={styles.titleArea}>
            <h1 className={styles.tagTitle}>
              #{tag?.name || slug}
            </h1>
            {tag && (
              <span className={styles.tagCount}>
                {tag.postCount} 篇手札
              </span>
            )}
          </div>
        </div>
      </header>

      {initialLoad && loading ? (
        <div className={styles.loader}>載入中…</div>
      ) : error ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏷️</div>
          <h2 className={styles.emptyTitle}>{error}</h2>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.push('/journal')}
          >
            返回手札
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📝</div>
          <h2 className={styles.emptyTitle}>這個標籤還沒有手札</h2>
          <p className={styles.emptyText}>
            在寫手札時輸入 #{tag?.name || slug} 即可將手札分類至此標籤。
          </p>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}

          {loading && <div className={styles.loader}>載入更多…</div>}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        </div>
      )}
    </div>
  );
}
