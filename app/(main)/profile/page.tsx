'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  KeyRound,
  ChevronRight,
  LogOut,
  Users,
  Shield,
  Camera,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { UserProfile } from '@/lib/types';
import styles from './page.module.css';

/**
 * 個人頁面
 * 使用者資訊 + 大頭照上傳 + 更改密碼 + 登出 + 管理員入口
 */
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /** 點擊大頭照觸發檔案選擇 */
  function handleAvatarClick() {
    fileInputRef.current?.click();
  }

  /** 上傳大頭照 */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // 前端驗證
    if (!file.type.startsWith('image/')) {
      setAvatarError('請上傳圖片檔案');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('圖片大小不能超過 5MB');
      return;
    }

    setAvatarError(null);
    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/me/avatar', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '上傳失敗');
      }

      const data = await res.json();
      // 更新使用者大頭照 URL
      setUser((prev) =>
        prev ? { ...prev, avatarUrl: data.avatarUrl } : prev,
      );
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploadingAvatar(false);
      // 重置 file input
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        <div
          className={styles.avatarWrapper}
          onClick={handleAvatarClick}
          role="button"
          tabIndex={0}
          aria-label="上傳大頭照"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleAvatarClick();
            }
          }}
        >
          <Avatar
            name={user.displayName}
            avatarUrl={user.avatarUrl}
            size="xl"
          />
          <div className={styles.avatarOverlay}>
            {uploadingAvatar ? (
              <div className={styles.avatarSpinner} />
            ) : (
              <Camera size={18} />
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={styles.fileInput}
            onChange={handleAvatarChange}
          />
        </div>
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

      {/* 大頭照錯誤訊息 */}
      {avatarError && (
        <div className={styles.avatarError}>{avatarError}</div>
      )}

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
