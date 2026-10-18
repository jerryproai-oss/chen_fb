'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  KeyRound,
  ChevronRight,
  LogOut,
  Users,
  Shield,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { UserProfile } from '@/lib/types';
import styles from './page.module.css';

/**
 * 個人頁面
 * 使用者資訊 + 更改密碼 + 登出 + 管理員入口
 */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setUser(data))
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      setLoggingOut(false);
    }
  }

  if (loading || !user) {
    return (
      <div className={styles.container}>
        <div className={styles.loader}>載入中…</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>我的</h1>
      </div>

      {/* Profile card */}
      <div className={styles.profileCard}>
        <Avatar
          name={user.displayName}
          avatarUrl={user.avatarUrl}
          size="xl"
        />
        <div className={styles.profileInfo}>
          <div className={styles.displayName}>{user.displayName}</div>
          <div className={styles.username}>@{user.username}</div>
          <span
            className={`${styles.roleBadge} ${user.role === 'ADMIN' ? styles.roleAdmin : styles.roleMember}`}
          >
            {user.role === 'ADMIN' ? '👑 管理員' : '👤 成員'}
          </span>
        </div>
      </div>

      {/* Menu */}
      <div className={styles.menu}>
        <Link href="/change-password" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <KeyRound size={18} />
          </span>
          <span className={styles.menuItemLabel}>更改密碼</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        {user.role === 'ADMIN' && (
          <Link href="/admin/family" className={styles.menuItem}>
            <span className={styles.menuItemIcon}>
              <Shield size={18} />
            </span>
            <span className={styles.menuItemLabel}>家庭管理</span>
            <span className={styles.menuItemArrow}>
              <ChevronRight size={18} />
            </span>
          </Link>
        )}
      </div>

      {/* Logout */}
      <div className={styles.logoutSection}>
        <button
          className={styles.logoutBtn}
          onClick={handleLogout}
          disabled={loggingOut}
          type="button"
        >
          <LogOut size={16} />
          {loggingOut ? '登出中…' : '登出'}
        </button>
      </div>
    </div>
  );
}
