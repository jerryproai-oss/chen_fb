'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Users, PenSquare, UserCircle } from 'lucide-react';
import styles from './TopNav.module.css';

const LINKS = [
  { href: '/journal', label: '生活手札', icon: BookOpen },
  { href: '/family', label: '家庭動態', icon: Users },
  { href: '/profile', label: '我的', icon: UserCircle },
] as const;

/**
 * 頂部導航列 — 桌機版
 */
export default function TopNav() {
  const pathname = usePathname();

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
