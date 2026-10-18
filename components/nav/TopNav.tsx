'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Users, Calendar, PenSquare, UserCircle, Search, Bell } from 'lucide-react';
import styles from './TopNav.module.css';

const LINKS = [
  { href: '/journal', label: '生活手札', icon: BookOpen },
  { href: '/family', label: '家庭動態', icon: Users },
  { href: '/calendar', label: '行事曆', icon: Calendar },
  { href: '/profile', label: '我的', icon: UserCircle },
] as const;

/**
 * 頂部導航列 — 桌機版
 */
export default function TopNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // 定時（60秒）輪詢未讀通知數
  useEffect(() => {
    let isMounted = true;

    const fetchUnreadCount = async () => {
      try {
        const res = await fetch('/api/notifications/count');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.count === 'number') {
            setUnreadCount(data.count);
          }
        }
      } catch {
        // 忽略背景輪詢異常
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [pathname]);

  return (
    <header className={styles.topNav} aria-label="頂部導航">
      <Link href="/journal" className={styles.brand}>
        拾日
      </Link>

      <nav>
        <ul className={styles.navLinks}>
          {LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={18} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/search"
              className={`${styles.searchBtn} ${pathname.startsWith('/search') ? styles.searchBtnActive : ''}`}
              aria-label="搜尋"
              title="搜尋"
            >
              <Search size={18} />
            </Link>
          </li>
          <li>
            <Link
              href="/notifications"
              className={`${styles.bellBtn} ${pathname.startsWith('/notifications') ? styles.bellBtnActive : ''}`}
              aria-label={`通知${unreadCount > 0 ? ` (${unreadCount} 則未讀)` : ''}`}
              title="通知"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className={styles.badge}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          </li>
          <li>
            <Link href="/write" className={styles.writeBtn}>
              <PenSquare size={18} />
              寫手札
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}

