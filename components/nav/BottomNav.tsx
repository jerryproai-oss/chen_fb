'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  BookOpen,
  Users,
  Calendar,
  PenSquare,
  MoreHorizontal,
  BookUser,
  StickyNote,
  Moon,
  FileText,
  UserCircle,
  Search,
  Bell,
  Heart,
  X,
} from 'lucide-react';
import styles from './BottomNav.module.css';

/** 主要 4 個固定 tab */
const MAIN_ITEMS = [
  { href: '/bulletin', label: '首頁', icon: Home },
  { href: '/journal', label: '手札', icon: BookOpen },
  { href: '/family', label: '動態', icon: Users },
  { href: '/calendar', label: '行事曆', icon: Calendar },
] as const;

/** 「更多」選單內的功能 */
const MORE_ITEMS = [
  { href: '/contacts', label: '通訊錄', icon: BookUser },
  { href: '/notes', label: '記事本', icon: StickyNote },
  { href: '/almanac', label: '農民曆', icon: Moon },
  { href: '/health', label: '健康紀錄', icon: Heart },
  { href: '/wiki', label: '文件庫', icon: FileText },
  { href: '/search', label: '搜尋', icon: Search },
  { href: '/notifications', label: '通知', icon: Bell },
  { href: '/write', label: '寫手札', icon: PenSquare },
  { href: '/profile', label: '我的', icon: UserCircle },
] as const;

/**
 * 底部導航列 — 手機版
 * 固定 4 個 tab + 「更多」展開選單
 */
export default function BottomNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // 路由變化時關閉選單
  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  // 點擊外部關閉選單
  useEffect(() => {
    if (!showMore) return;

    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMore]);

  // 判斷「更多」按鈕是否高亮（當前路徑在 MORE_ITEMS 中）
  const isMoreActive = MORE_ITEMS.some(({ href }) => pathname.startsWith(href));

  return (
    <>
      {/* 更多選單面板 */}
      {showMore && (
        <div className={styles.moreOverlay} onClick={() => setShowMore(false)}>
          <div
            ref={moreRef}
            className={styles.morePanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.morePanelHeader}>
              <span className={styles.morePanelTitle}>更多功能</span>
              <button
                type="button"
                className={styles.morePanelClose}
                onClick={() => setShowMore(false)}
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>
            <div className={styles.moreGrid}>
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`${styles.moreItem} ${isActive ? styles.moreItemActive : ''}`}
                    onClick={() => setShowMore(false)}
                  >
                    <div className={styles.moreItemIcon}>
                      <Icon size={22} />
                    </div>
                    <span className={styles.moreItemLabel}>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 底部導航 */}
      <nav className={styles.bottomNav} aria-label="主要導航">
        {MAIN_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={22} />
              <span className={styles.navLabel}>{label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          className={`${styles.navItem} ${isMoreActive ? styles.active : ''} ${showMore ? styles.active : ''}`}
          onClick={() => setShowMore(!showMore)}
          aria-label="更多功能"
          aria-expanded={showMore}
        >
          <MoreHorizontal size={22} />
          <span className={styles.navLabel}>更多</span>
        </button>
      </nav>
    </>
  );
}
