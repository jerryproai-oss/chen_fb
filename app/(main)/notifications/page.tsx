'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, MessageSquare, Heart, Sparkles } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { NotificationItem } from '@/lib/types';
import styles from './page.module.css';

/** 格式化相對時間 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffHours < 24) return `${diffHours} 小時前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays} 天前`;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

/** 取得通知類型的 Emoji 標記 */
function getNotificationEmoji(type: string): string {
  switch (type.toUpperCase()) {
    case 'COMMENT':
      return '💬';
    case 'REACTION':
      return '❤️';
    case 'MENTION':
      return '📣';
    case 'BIRTHDAY':
      return '🎂';
    default:
      return '🔔';
  }
}

/**
 * 通知中心頁面
 */
export default function NotificationsPage() {
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(
    async (cursorParam?: string | null) => {
      if (loading) return;
      setLoading(true);

      try {
        const queryParams = new URLSearchParams({ limit: '20' });
        if (cursorParam) queryParams.set('cursor', cursorParam);

        const res = await fetch(`/api/notifications?${queryParams}`);
        if (!res.ok) throw new Error('Failed to load notifications');

        const data = await res.json();
        setNotifications((prev) =>
          cursorParam ? [...prev, ...data.notifications] : data.notifications,
        );
        setCursor(data.nextCursor);
        setHasMore(data.nextCursor !== null);
        if (typeof data.unreadCount === 'number') {
          setUnreadCount(data.unreadCount);
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
    },
    [loading],
  );

  // 初次載入
  useEffect(() => {
    fetchNotifications();
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
          fetchNotifications(cursor);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, cursor, fetchNotifications]);

  /** 標記單一通知已讀並前往該連結 */
  async function handleNotificationClick(n: NotificationItem) {
    if (!n.isRead) {
      // 樂觀更新前端狀態
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === n.id ? { ...item, isRead: true } : item,
        ),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // 發送 API 標記已讀
      fetch('/api/notifications/read', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [n.id] }),
      }).catch(console.error);
    }

    if (n.linkUrl) {
      router.push(n.linkUrl);
    }
  }

  /** 全部標記為已讀 */
  async function handleMarkAllAsRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);

    try {
      const res = await fetch('/api/notifications/read', {
        method: 'PUT',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((item) => ({ ...item, isRead: true })),
        );
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>通知</h1>
        {notifications.length > 0 && (
          <button
            type="button"
            className={styles.markAllBtn}
            onClick={handleMarkAllAsRead}
            disabled={markingAll || unreadCount === 0}
          >
            <CheckCheck size={16} />
            {markingAll ? '處理中…' : '全部標記已讀'}
          </button>
        )}
      </header>

      {initialLoad && loading ? (
        <div className={styles.loader}>載入中…</div>
      ) : notifications.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🔔</div>
          <h2 className={styles.emptyTitle}>暫無通知</h2>
          <p className={styles.emptyText}>
            當家人在你的手札留言或回應時，通知會顯示在這裡。
          </p>
        </div>
      ) : (
        <div className={styles.notificationList}>
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`${styles.notificationItem} ${
                !n.isRead ? styles.unreadItem : ''
              }`}
              onClick={() => handleNotificationClick(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNotificationClick(n);
                }
              }}
            >
              <div className={styles.avatarArea}>
                <Avatar
                  name={n.actor?.displayName || '系統'}
                  avatarUrl={n.actor?.avatarUrl}
                  size="md"
                />
                <span className={styles.typeBadge}>
                  {getNotificationEmoji(n.type)}
                </span>
              </div>

              <div className={styles.content}>
                <div className={styles.titleRow}>
                  <div className={styles.title}>{n.title}</div>
                  <time className={styles.time} dateTime={n.createdAt}>
                    {formatRelativeTime(n.createdAt)}
                  </time>
                </div>
                {n.body && <div className={styles.body}>{n.body}</div>}
              </div>

              {!n.isRead && <span className={styles.unreadDot} />}
            </div>
          ))}

          {loading && <div className={styles.loader}>載入更多…</div>}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        </div>
      )}
    </div>
  );
}
