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
  Bookmark,
  Lock,
  Trash2,
  Heart,
  FileText,
  StickyNote,
  Moon,
  Palette,
  Check,
  Share2,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ImageLightbox from '@/components/ui/ImageLightbox';
import FontSizeSwitcher from '@/components/ui/FontSizeSwitcher';
import ThemeSwitcher from '@/components/ui/ThemeSwitcher';
import { compressImage } from '@/lib/compressImage';
import { CALENDAR_PALETTE, type CalendarColor } from '@/lib/constants/calendar-colors';
import type { UserProfile } from '@/lib/types';
import HelpGuide from '@/components/ui/HelpGuide';
import { profileHelp } from '@/lib/constants/help-content';
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
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [isEditingBirthday, setIsEditingBirthday] = useState(false);
  const [birthdayInput, setBirthdayInput] = useState('');
  const [savingBirthday, setSavingBirthday] = useState(false);
  const [savingColor, setSavingColor] = useState(false);
  const [usedColors, setUsedColors] = useState<Array<{ userId: string; displayName: string; color: string }>>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data: UserProfile) => {
        setUser(data);
        if (data.birthday) {
          setBirthdayInput(data.birthday);
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSaveBirthday() {
    setSavingBirthday(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthday: birthdayInput || null }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }
      const data = await res.json();
      setUser((prev) => (prev ? { ...prev, birthday: data.birthday } : prev));
      setIsEditingBirthday(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新生日失敗');
    } finally {
      setSavingBirthday(false);
    }
  }

  /** 開啟顏色選擇器並載入已用顏色 */
  async function handleOpenColorPicker() {
    setShowColorPicker(true);
    try {
      const res = await fetch('/api/calendar/used-colors');
      if (res.ok) {
        const data = await res.json();
        setUsedColors(data.colors || []);
      }
    } catch { /* ignore */ }
  }

  /** 選擇行事曆顏色 */
  async function handleSelectColor(color: CalendarColor) {
    if (!user) return;
    // 如果選的是已用色，不處理
    if (usedColors.some(uc => uc.color === color.hex && uc.userId !== user.id)) return;
    // 如果已是目前色，取消選色器
    if (user.calendarColor === color.hex) {
      setShowColorPicker(false);
      return;
    }
    setSavingColor(true);
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calendarColor: color.hex }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }
      setUser(prev => prev ? { ...prev, calendarColor: color.hex } : prev);
      setShowColorPicker(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : '更新顏色失敗');
    } finally {
      setSavingColor(false);
    }
  }

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
      // 壓縮圖片（頭像用較小尺寸）
      const compressed = await compressImage(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 512,
      });

      const formData = new FormData();
      formData.append('file', compressed);

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
        <h1 className={styles.pageTitle}>我的 <HelpGuide content={profileHelp} /></h1>
      </div>

      {/* Profile card */}
      <div className={styles.profileCard}>
        <div
          className={styles.avatarWrapper}
          onClick={() => {
            if (user.avatarUrl) {
              setShowAvatarPreview(true);
            } else {
              handleAvatarClick();
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={user.avatarUrl ? '查看大頭照' : '上傳大頭照'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (user.avatarUrl) {
                setShowAvatarPreview(true);
              } else {
                handleAvatarClick();
              }
            }
          }}
        >
          <Avatar
            name={user.displayName}
            avatarUrl={user.avatarUrl}
            size="xl"
          />
          <div
            className={styles.avatarOverlay}
            onClick={(e) => {
              e.stopPropagation();
              handleAvatarClick();
            }}
            role="button"
            tabIndex={0}
            aria-label="更換大頭照"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAvatarClick();
              }
            }}
          >
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

          {/* 生日資訊與編輯 */}
          {isEditingBirthday ? (
            <div className={styles.birthdayForm}>
              <input
                type="date"
                className={styles.birthdayInput}
                value={birthdayInput}
                onChange={(e) => setBirthdayInput(e.target.value)}
                aria-label="選擇生日"
              />
              <button
                type="button"
                className={styles.birthdaySaveBtn}
                onClick={handleSaveBirthday}
                disabled={savingBirthday}
              >
                {savingBirthday ? '儲存中…' : '儲存'}
              </button>
              <button
                type="button"
                className={styles.birthdayCancelBtn}
                onClick={() => {
                  setIsEditingBirthday(false);
                  setBirthdayInput(user.birthday || '');
                }}
                disabled={savingBirthday}
              >
                取消
              </button>
            </div>
          ) : (
            <div className={styles.birthdayRow}>
              {user.birthday ? (
                <button
                  type="button"
                  className={styles.birthdayDisplay}
                  onClick={() => setIsEditingBirthday(true)}
                  title="點擊編輯生日"
                >
                  🎂{' '}
                  {user.birthday.split('-').length >= 3
                    ? `${user.birthday.split('-')[1]}/${user.birthday.split('-')[2]}`
                    : user.birthday}
                </button>
              ) : (
                <span className={styles.birthdayDisplay}>🎂 未設定生日</span>
              )}
              <button
                type="button"
                className={styles.birthdayEditBtn}
                onClick={() => setIsEditingBirthday(true)}
              >
                編輯生日
              </button>
            </div>
          )}

          <div className={styles.badgeRow}>
            <span
              className={`${styles.roleBadge} ${user.role === 'ADMIN' ? styles.roleAdmin : styles.roleMember}`}
            >
              {user.role === 'ADMIN' ? '👑 管理員' : '👤 成員'}
            </span>
            <Link href="/vault" className={styles.vaultBadge} title="特別區">
              <Lock size={13} />
            </Link>
          </div>
        </div>
      </div>

      {/* 行事曆顏色選擇 */}
      <div className={styles.colorSection}>
        <div className={styles.colorSectionHeader}>
          <Palette size={16} />
          <span>行事曆顏色</span>
          <button
            type="button"
            className={styles.colorEditBtn}
            onClick={handleOpenColorPicker}
          >
            {user.calendarColor ? '更換' : '選擇'}
          </button>
        </div>
        {user.calendarColor ? (
          <div className={styles.currentColorDisplay}>
            <span
              className={styles.currentColorDot}
              style={{ backgroundColor: user.calendarColor }}
            />
            <span className={styles.currentColorName}>
              {CALENDAR_PALETTE.find(c => c.hex === user.calendarColor)?.name || '自訂色'}
            </span>
          </div>
        ) : (
          <div className={styles.colorHint}>
            尚未選擇行事曆顏色，點擊「選擇」設定
          </div>
        )}

        {showColorPicker && (
          <div className={styles.colorPickerGrid}>
            {CALENDAR_PALETTE.map((color) => {
              const takenBy = usedColors.find(uc => uc.color === color.hex && uc.userId !== user.id);
              const isSelected = user.calendarColor === color.hex;
              const isTaken = !!takenBy;
              return (
                <button
                  key={color.id}
                  type="button"
                  className={`${styles.paletteColor} ${isSelected ? styles.paletteColorActive : ''} ${isTaken ? styles.paletteColorTaken : ''}`}
                  style={{ backgroundColor: color.hex }}
                  onClick={() => !isTaken && handleSelectColor(color)}
                  disabled={isTaken || savingColor}
                  title={isTaken ? `${color.name}（${takenBy.displayName} 使用中）` : color.name}
                  aria-label={color.name}
                >
                  {isSelected && <Check size={14} style={{ color: '#fff' }} />}
                  {isTaken && <span className={styles.paletteColorTakenLabel}>{takenBy.displayName}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 大頭照錯誤訊息 */}
      {avatarError && (
        <div className={styles.avatarError}>{avatarError}</div>
      )}

      {/* Menu */}
      <div className={styles.menu}>
        {/* 📝 內容管理 */}
        <Link href="/bookmarks" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Bookmark size={18} />
          </span>
          <span className={styles.menuItemLabel}>我的收藏</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/trash" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Trash2 size={18} />
          </span>
          <span className={styles.menuItemLabel}>資源回收桶</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        {/* 🔧 帳號設定 */}
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

        {/* 📚 更多功能 */}
        <Link href="/almanac" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Moon size={18} />
          </span>
          <span className={styles.menuItemLabel}>農民曆</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/notes" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <StickyNote size={18} />
          </span>
          <span className={styles.menuItemLabel}>記事本</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/shares" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Share2 size={18} />
          </span>
          <span className={styles.menuItemLabel}>快捷分享</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/wiki" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <FileText size={18} />
          </span>
          <span className={styles.menuItemLabel}>文件庫</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/health" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Heart size={18} />
          </span>
          <span className={styles.menuItemLabel}>健康記錄</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        <Link href="/vault" className={styles.menuItem}>
          <span className={styles.menuItemIcon}>
            <Lock size={18} />
          </span>
          <span className={styles.menuItemLabel}>特別區</span>
          <span className={styles.menuItemArrow}>
            <ChevronRight size={18} />
          </span>
        </Link>

        {/* 🎨 個人化 */}
        <FontSizeSwitcher />
        <ThemeSwitcher />
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

      {/* 大頭照全螢幕預覽 */}
      {showAvatarPreview && user.avatarUrl && (
        <ImageLightbox
          src={user.avatarUrl}
          alt={user.displayName}
          onClose={() => setShowAvatarPreview(false)}
        />
      )}
    </div>
  );
}
