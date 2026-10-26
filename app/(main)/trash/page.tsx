'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Trash2, RotateCcw, Trash, Image } from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { trashHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

/** 回收桶中的貼文型別 */
interface TrashPost {
  id: string;
  title: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  authorId: string;
  recordDate: string;
  deletedAt: string;
  mediaCount: number;
  visibility: string;
  status: string;
}

/** 計算相對時間 */
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小時前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  const diffMonth = Math.floor(diffDay / 30);
  if (diffMonth < 12) return `${diffMonth} 個月前`;
  const diffYear = Math.floor(diffMonth / 12);
  return `${diffYear} 年前`;
}

/** 格式化日期 (YYYY-MM-DD) */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 資源回收桶頁面
 * 顯示已軟刪除的貼文，支援還原與永久刪除
 */
export default function TrashPage() {
  const [posts, setPosts] = useState<TrashPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set());
  const [confirmTarget, setConfirmTarget] = useState<TrashPost | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [purgeAllRunning, setPurgeAllRunning] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPosts = useCallback(async (cursorParam?: string | null) => {
    if (loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursorParam) params.set('cursor', cursorParam);
      const res = await fetch(`/api/posts/trash?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPosts((prev) =>
        cursorParam ? [...prev, ...data.posts] : data.posts,
      );
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      console.error('Failed to load trash:', err);
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

  /** 還原貼文 */
  const handleRestore = async (postId: string) => {
    setActionLoading((prev) => new Set(prev).add(postId));
    try {
      const res = await fetch(`/api/posts/${postId}/restore`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '還原失敗');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      alert('還原失敗，請稍後再試');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  /** 永久刪除單篇貼文 */
  const handlePurge = async (postId: string) => {
    setConfirmTarget(null);
    setActionLoading((prev) => new Set(prev).add(postId));
    try {
      const res = await fetch(`/api/posts/${postId}/purge`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '刪除失敗');
        return;
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch {
      alert('刪除失敗，請稍後再試');
    } finally {
      setActionLoading((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  /** 清空回收桶（逐一 purge） */
  const handlePurgeAll = async () => {
    setConfirmAll(false);
    setPurgeAllRunning(true);
    const remaining = [...posts];
    for (const post of remaining) {
      try {
        const res = await fetch(`/api/posts/${post.id}/purge`, { method: 'DELETE' });
        if (res.ok) {
          setPosts((prev) => prev.filter((p) => p.id !== post.id));
        }
      } catch {
        // 繼續處理下一筆
      }
    }
    setPurgeAllRunning(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleGroup}>
            <Trash2 size={24} className={styles.titleIcon} />
            <h1 className={styles.pageTitle}>資源回收桶 <HelpGuide content={trashHelp} /></h1>
          </div>
          {posts.length > 0 && (
            <button
              type="button"
              className={styles.purgeAllBtn}
              onClick={() => setConfirmAll(true)}
              disabled={purgeAllRunning}
            >
              <Trash size={14} />
              {purgeAllRunning ? '清除中…' : '清空回收桶'}
            </button>
          )}
        </div>
        <p className={styles.pageSubtitle}>已刪除的貼文會保留在此，你可以還原或永久刪除</p>
      </div>

      {initialLoad && loading ? (
        <div className={styles.loader}>載入中…</div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Trash2 size={48} />
          </div>
          <h2 className={styles.emptyTitle}>回收桶是空的</h2>
          <p className={styles.emptyText}>
            刪除的貼文會出現在這裡
          </p>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => {
            const isActionLoading = actionLoading.has(post.id);
            return (
              <div key={post.id} className={styles.postItem}>
                <div className={styles.postInfo}>
                  <div className={styles.postTitle}>{post.title}</div>
                  <div className={styles.postMeta}>
                    <span className={styles.metaItem}>
                      {post.author.displayName}
                    </span>
                    <span className={styles.metaItem}>
                      🗓️ {formatDate(post.recordDate)}
                    </span>
                    <span className={styles.metaItem}>
                      🗑️ {relativeTime(post.deletedAt)}
                    </span>
                    {post.mediaCount > 0 && (
                      <span className={styles.metaItem}>
                        <Image size={12} /> {post.mediaCount}
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.postActions}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.restoreBtn}`}
                    title="還原"
                    onClick={() => handleRestore(post.id)}
                    disabled={isActionLoading}
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    title="永久刪除"
                    onClick={() => setConfirmTarget(post)}
                    disabled={isActionLoading}
                  >
                    <Trash size={16} />
                  </button>
                </div>
              </div>
            );
          })}

          {loading && <div className={styles.loader}>載入更多…</div>}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        </div>
      )}

      {/* 單篇永久刪除確認對話框 */}
      {confirmTarget && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmTarget(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>永久刪除貼文</h3>
            <p className={styles.confirmText}>
              確定要永久刪除「{confirmTarget.title}」嗎？此操作無法復原，所有相關的留言、心情回應和媒體檔案都將被刪除。
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={() => setConfirmTarget(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={() => handlePurge(confirmTarget.id)}
              >
                永久刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 清空回收桶確認對話框 */}
      {confirmAll && (
        <div className={styles.confirmOverlay} onClick={() => setConfirmAll(false)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>清空回收桶</h3>
            <p className={styles.confirmText}>
              確定要永久刪除回收桶中的所有 {posts.length} 篇貼文嗎？此操作無法復原。
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.confirmCancelBtn}
                onClick={() => setConfirmAll(false)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={handlePurgeAll}
              >
                全部永久刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
