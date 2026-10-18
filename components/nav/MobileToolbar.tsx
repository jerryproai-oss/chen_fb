'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import styles from './MobileToolbar.module.css';

/**
 * 手機版工具列 — 顯示在頁面頂部
 * 包含搜尋和通知按鈕（桌機版隱藏，因為 TopNav 已有）
 */
export default function MobileToolbar() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications/count');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.count === 'number') {
            setUnreadCount(data.count);
          }
        }
      } catch {
        // 忽略
      }
    };

    fetchCount();
    const interval = setInterval(fetchCount, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pathname]);

  // 在搜尋頁和通知頁不顯示
  if (pathname.startsWith('/search') || pathname.startsWith('/notifications')) {
    return null;
  }

  return (
    <div className={styles.toolbar}>
      <Link
        href="/search"
        className={styles.iconBtn}
        aria-label="搜尋"
      >
        <Search size={20} />
      </Link>
      <Link
        href="/notifications"
        className={styles.iconBtn}
        aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 則未讀)` : ''}`}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    </div>
  );
}
