'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Users, PenSquare, UserCircle } from 'lucide-react';
import styles from './BottomNav.module.css';

const NAV_ITEMS = [
  { href: '/journal', label: '生活手札', icon: BookOpen },
  { href: '/family', label: '家庭動態', icon: Users },
  { href: '/write', label: '寫手札', icon: PenSquare },
  { href: '/profile', label: '我的', icon: UserCircle },
] as const;

/**
 * 底部導航列 — 手機版四個 tab
 */
export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.bottomNav} aria-label="主要導航">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
    </nav>
  );
}
