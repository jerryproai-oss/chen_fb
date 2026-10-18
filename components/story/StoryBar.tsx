'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, X, Trash2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { StoryGroup, StoryItem, UserProfile } from '@/lib/types';
import styles from './StoryBar.module.css';

const PRESET_COLORS = [
  { name: '森綠', color: '#4a6741' },
  { name: '經典橄欖', color: '#5a7a5a' },
  { name: '大地棕', color: '#8b6f47' },
  { name: '落日紅', color: '#be5a38' },
  { name: '夜空藍', color: '#2c3e50' },
  { name: '暮光紫', color: '#594f8d' },
];

function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return '剛剛';
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} 小時前`;
  return `${Math.floor(diffHours / 24)} 天前`;
}

export default function StoryBar() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Fullscreen Viewer State
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
  const [currentItemIdx, setCurrentItemIdx] = useState(0);

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [selectedBgColor, setSelectedBgColor] = useState(PRESET_COLORS[0].color);
  const [submitting, setSubmitting] = useState(false);

  // Touch Swipe tracking
  const touchStartX = useRef<number | null>(null);

  // 取得目前使用者與動態
  const fetchStories = useCallback(async () => {
    try {
      const res = await fetch('/api/stories');
      if (res.ok) {
        const data = await res.json();
        setStoryGroups(data.stories || []);
      }
    } catch (err) {
      console.error('Failed to load stories:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        if (user) setCurrentUser(user);
      })
      .catch(() => {});

    fetchStories();
  }, [fetchStories]);

  // 整理自己與家人的動態組
  const myGroup = currentUser
    ? storyGroups.find((g) => g.author.id === currentUser.id)
    : undefined;
  const otherGroups = currentUser
    ? storyGroups.filter((g) => g.author.id !== currentUser.id)
    : storyGroups;

  // 所有可播放的動態組列表 (有動態的排前面)
  const playableGroups: StoryGroup[] = [];
  if (myGroup && myGroup.items.length > 0) {
    playableGroups.push(myGroup);
  }
  for (const g of otherGroups) {
    if (g.items.length > 0) {
      playableGroups.push(g);
    }
  }

  // 開啟播放器
  function handleOpenViewer(group: StoryGroup) {
    const idx = playableGroups.findIndex((g) => g.author.id === group.author.id);
    if (idx !== -1) {
      setCurrentGroupIdx(idx);
      setCurrentItemIdx(0);
      setViewerOpen(true);
    }
  }

  // 下一張動態
  const handleNextStory = useCallback(() => {
    const currentGroup = playableGroups[currentGroupIdx];
    if (!currentGroup) {
      setViewerOpen(false);
      return;
    }

    if (currentItemIdx < currentGroup.items.length - 1) {
      setCurrentItemIdx((prev) => prev + 1);
    } else if (currentGroupIdx < playableGroups.length - 1) {
      setCurrentGroupIdx((prev) => prev + 1);
      setCurrentItemIdx(0);
    } else {
      setViewerOpen(false);
    }
  }, [currentGroupIdx, currentItemIdx, playableGroups]);

  // 上一張動態
  const handlePrevStory = useCallback(() => {
    if (currentItemIdx > 0) {
      setCurrentItemIdx((prev) => prev - 1);
    } else if (currentGroupIdx > 0) {
      const prevGroup = playableGroups[currentGroupIdx - 1];
      setCurrentGroupIdx((prev) => prev - 1);
      setCurrentItemIdx(prevGroup.items.length - 1);
    }
  }, [currentGroupIdx, currentItemIdx, playableGroups]);

  // 鍵盤導航
  useEffect(() => {
    if (!viewerOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNextStory();
      } else if (e.key === 'ArrowLeft') {
        handlePrevStory();
      } else if (e.key === 'Escape') {
        setViewerOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerOpen, handleNextStory, handlePrevStory]);

  // 刪除動態
  async function handleDeleteStory(item: StoryItem) {
    if (!window.confirm('確定要刪除這則限時動態嗎？')) return;
    try {
      const res = await fetch(`/api/stories/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('刪除失敗');

      // 更新本機狀態
      await fetchStories();

      // 若目前播放組只有這張，關閉或切換
      const currentGroup = playableGroups[currentGroupIdx];
      if (currentGroup && currentGroup.items.length <= 1) {
        setViewerOpen(false);
      } else {
        handleNextStory();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    }
  }

  // 發布新動態
  async function handlePublishStory(e: React.FormEvent) {
    e.preventDefault();
    if (!storyText.trim()) {
      alert('請輸入動態文字');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: storyText.trim(),
          bgColor: selectedBgColor,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '發布失敗');
      }

      setStoryText('');
      setCreateModalOpen(false);
      await fetchStories();
    } catch (err) {
      alert(err instanceof Error ? err.message : '發布失敗');
    } finally {
      setSubmitting(false);
    }
  }

  // 觸控滑動切換
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handlePrevStory(); // 往右滑 -> 看上一則
      } else {
        handleNextStory(); // 往左滑 -> 看下一則
      }
    }
    touchStartX.current = null;
  }

  const activeGroup = playableGroups[currentGroupIdx];
  const activeItem = activeGroup?.items[currentItemIdx];

  return (
    <div className={styles.storyBarContainer} aria-label="限時動態">
      <div className={styles.storyList}>
        {/* 1. 自己的頭像 (置於最前) */}
        {currentUser && (
          <div className={styles.storyUserItem}>
            <div
              className={`${styles.avatarRingWrapper} ${
                myGroup && myGroup.items.length > 0
                  ? styles.hasStoryRing
                  : styles.noStoryRing
              }`}
              onClick={() => {
                if (myGroup && myGroup.items.length > 0) {
                  handleOpenViewer(myGroup);
                } else {
                  setCreateModalOpen(true);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="查看或新增你的動態"
            >
              <div className={styles.avatarInner}>
                <Avatar
                  name={currentUser.displayName}
                  avatarUrl={currentUser.avatarUrl}
                  size="md"
                />
              </div>

              {/* 永遠顯示的小加號徽章 */}
              <button
                type="button"
                className={styles.addBadge}
                onClick={(e) => {
                  e.stopPropagation();
                  setCreateModalOpen(true);
                }}
                aria-label="新增限時動態"
                title="新增動態"
              >
                <Plus size={14} />
              </button>
            </div>
            <span className={styles.userNameLabel}>你的動態</span>
          </div>
        )}

        {/* 2. 其他有動態的家人列表 */}
        {otherGroups.map((group) => (
          <button
            key={group.author.id}
            type="button"
            className={styles.storyUserItem}
            onClick={() => handleOpenViewer(group)}
            aria-label={`查看 ${group.author.displayName} 的限時動態`}
          >
            <div className={`${styles.avatarRingWrapper} ${styles.hasStoryRing}`}>
              <div className={styles.avatarInner}>
                <Avatar
                  name={group.author.displayName}
                  avatarUrl={group.author.avatarUrl}
                  size="md"
                />
              </div>
            </div>
            <span className={styles.userNameLabel}>
              {group.author.displayName}
            </span>
          </button>
        ))}
      </div>

      {/* ── 全螢幕動態播放器 (Fullscreen Story Viewer) ───────── */}
      {viewerOpen && activeGroup && activeItem && (
        <div
          className={styles.viewerBackdrop}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* 頂部進度條與作者資訊 */}
          <div className={styles.viewerHeader}>
            <div className={styles.progressBarRow}>
              {activeGroup.items.map((_, idx) => (
                <div key={idx} className={styles.progressBarTrack}>
                  <div
                    className={styles.progressBarFill}
                    style={{
                      width:
                        idx < currentItemIdx
                          ? '100%'
                          : idx === currentItemIdx
                          ? '100%'
                          : '0%',
                    }}
                  />
                </div>
              ))}
            </div>

            <div className={styles.authorRow}>
              <div className={styles.authorMeta}>
                <Avatar
                  name={activeGroup.author.displayName}
                  avatarUrl={activeGroup.author.avatarUrl}
                  size="sm"
                />
                <span className={styles.authorName}>
                  {activeGroup.author.displayName}
                </span>
                <span className={styles.storyTimeTop}>
                  · {formatRelativeTime(activeItem.createdAt)}
                </span>
              </div>

              <div className={styles.viewerControls}>
                {currentUser && currentUser.id === activeGroup.author.id && (
                  <button
                    type="button"
                    className={styles.viewerIconButton}
                    onClick={() => handleDeleteStory(activeItem)}
                    aria-label="刪除此動態"
                    title="刪除"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className={styles.viewerIconButton}
                  onClick={() => setViewerOpen(false)}
                  aria-label="關閉動態"
                  title="關閉"
                >
                  <X size={22} />
                </button>
              </div>
            </div>
          </div>

          {/* 內容區 + 點擊兩側切換 */}
          <div className={styles.viewerContent}>
            <div
              className={styles.touchAreaLeft}
              onClick={handlePrevStory}
              aria-label="上一則"
            />
            <div
              className={styles.touchAreaRight}
              onClick={handleNextStory}
              aria-label="下一則"
            />

            <div
              className={styles.storyCard}
              style={{
                backgroundColor: activeItem.bgColor || 'var(--color-primary)',
              }}
            >
              {activeItem.mediaUrl ? (
                <img
                  src={activeItem.mediaUrl}
                  alt="限時動態圖片"
                  className={styles.storyMedia}
                />
              ) : (
                <div className={styles.storyText}>{activeItem.text}</div>
              )}
            </div>
          </div>

          {/* 底部時間提示 */}
          <div className={styles.viewerFooter}>
            <div className={styles.storyTimeBottom}>
              <Clock size={14} />
              <span>{formatRelativeTime(activeItem.createdAt)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── 建立新限時動態 Modal ─────────────────────────────── */}
      {createModalOpen && (
        <div
          className={styles.createBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCreateModalOpen(false);
          }}
        >
          <div className={styles.createCard} role="dialog" aria-modal="true">
            <div className={styles.createHeader}>
              <h3 className={styles.createTitle}>新增限時動態</h3>
              <button
                type="button"
                className={styles.viewerIconButton}
                style={{ color: 'var(--color-text)' }}
                onClick={() => setCreateModalOpen(false)}
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>

            {/* 即時預覽卡片 */}
            <div
              className={styles.previewContainer}
              style={{ backgroundColor: selectedBgColor }}
            >
              <div className={styles.previewText}>
                {storyText.trim() || '輸入文字預覽效果…'}
              </div>
            </div>

            <form onSubmit={handlePublishStory}>
              {/* 背景顏色選擇 */}
              <div style={{ marginBottom: 'var(--space-sm)' }}>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    marginBottom: 6,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  選擇卡片底色
                </div>
                <div className={styles.colorPickerRow}>
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.color}
                      type="button"
                      className={`${styles.colorBtn} ${
                        selectedBgColor === c.color ? styles.colorBtnSelected : ''
                      }`}
                      style={{ backgroundColor: c.color }}
                      onClick={() => setSelectedBgColor(c.color)}
                      aria-label={c.name}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* 文字輸入框 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <textarea
                  className={styles.textarea}
                  placeholder="分享此刻的所思所想，24 小時後自動消失…"
                  value={storyText}
                  onChange={(e) => setStoryText(e.target.value)}
                  maxLength={500}
                  rows={3}
                  required
                />
                <div className={styles.charCount}>
                  {storyText.length} / 500
                </div>
              </div>

              <div className={styles.createFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setCreateModalOpen(false)}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={styles.publishBtn}
                  disabled={submitting || !storyText.trim()}
                >
                  {submitting ? '發布中…' : '發布動態'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
