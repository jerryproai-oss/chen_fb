'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import PostCard from '@/components/post/PostCard';
import MediaPool from '@/components/post/MediaPool';
import StoryBar from '@/components/story/StoryBar';
import BirthdayBanner from '@/components/family/BirthdayBanner';
import type { PostSummary } from '@/lib/types';
import styles from './page.module.css';

// 歷年今日的型別，後端的 memory 包含 memoryLabel
interface MemoryPost {
  id: string;
  title: string;
  recordDate: string;
  memoryLabel: string;
  author: {
    displayName: string;
  };
}

/**
 * 家庭動態頁面（Family Feed）
 * 顯示所有可見的已發布共享貼文，按 publishedAt 降序
 * 包含歷年今日區塊
 * 含媒體池 Tab
 */
export default function FamilyPage() {
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [onThisDay, setOnThisDay] = useState<MemoryPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (cursorParam?: string | null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursorParam) params.set('cursor', cursorParam);
      const res = await fetch(`/api/feed/family?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPosts((prev) =>
        cursorParam ? [...prev, ...data.posts] : data.posts,
      );
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
      // 歷年今日只在第一次載入時設定
      if (!cursorParam && data.memories) {
        setOnThisDay(data.memories);
      }
    } catch (err) {
      console.error('Failed to load family feed:', err);
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

  // Infinite scroll
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
        <h1 className={styles.pageTitle}>家庭動態</h1>
        <p className={styles.pageSubtitle}>家人們的生活分享</p>
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
          {/* 限時動態 */}
          <StoryBar />

          {/* 生日提醒 */}
          <BirthdayBanner />

          {/* 歷年今日 */}
          {onThisDay.length > 0 && (
            <section className={styles.onThisDay}>
              <div className={styles.onThisDayHeader}>
                <Calendar size={16} />
                歷年今日
              </div>
              <div className={styles.onThisDayList}>
                {onThisDay.map((item) => (
                  <Link
                    key={item.id}
                    href={`/posts/${item.id}`}
                    className={styles.onThisDayItem}
                  >
                    <span className={styles.onThisDayYear}>
                      {item.memoryLabel}
                    </span>
                    <span className={styles.onThisDayTitle}>
                      {item.author.displayName}：{item.title}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Feed */}
          {initialLoad && loading ? (
            <div className={styles.loader}>載入中…</div>
          ) : posts.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>👨‍👩‍👧‍👦</div>
              <h2 className={styles.emptyTitle}>還沒有家庭動態</h2>
              <p className={styles.emptyText}>
                家人們還沒有分享手札，快來當第一個吧！
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
        </>
      ) : (
        <MediaPool scope="family" />
      )}
    </div>
  );
}
