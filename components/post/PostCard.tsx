'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Users, UserCheck, MessageCircle, Film, Music, Bookmark, ThumbsUp, SmilePlus } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { stripMarkdown } from '@/lib/markdown';
import PollCard from '@/components/post/PollCard';
import ReactionPicker from '@/components/post/ReactionPicker';
import type { PostSummary, Visibility, ReactionType, ReactionSummary } from '@/lib/types';
import { REACTION_EMOJI, REACTION_LABEL } from '@/lib/types';
import styles from './PostCard.module.css';

interface PostCardProps {
  post: PostSummary;
  /** 是否為自己的貼文（journal 頁面用） */
  isOwn?: boolean;
  /** 收藏狀態切換回調 */
  onBookmarkToggle?: (postId: string, bookmarked: boolean) => void;
}

function VisibilityIcon({ visibility }: { visibility: Visibility }) {
  const size = 12;
  switch (visibility) {
    case 'PRIVATE':
      return <Lock size={size} />;
    case 'FAMILY':
      return <Users size={size} />;
    case 'SELECTED':
      return <UserCheck size={size} />;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

/**
 * 貼文卡片 — FB 風格排版
 * 結構：作者列 → 文字內容 → 圖片網格（上2大+下3小） → 統計列 → 互動按鈕列
 */
export default function PostCard({
  post,
  isOwn = false,
  onBookmarkToggle,
}: PostCardProps) {
  const router = useRouter();
  const [bookmarked, setBookmarked] = useState(post.isBookmarked ?? false);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(post.myReaction ?? null);
  const [reactionSummary, setReactionSummary] = useState<ReactionSummary[]>(post.reactionSummary ?? []);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setBookmarked(post.isBookmarked ?? false);
  }, [post.isBookmarked]);

  useEffect(() => {
    setMyReaction(post.myReaction ?? null);
    setReactionSummary(post.reactionSummary ?? []);
  }, [post.myReaction, post.reactionSummary]);

  const handleBookmarkClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !bookmarked;
    setBookmarked(next);
    onBookmarkToggle?.(post.id, next);

    try {
      const res = await fetch(`/api/posts/${post.id}/bookmark`, {
        method: next ? 'PUT' : 'DELETE',
      });
      if (!res.ok) {
        setBookmarked(!next);
        onBookmarkToggle?.(post.id, !next);
      }
    } catch {
      setBookmarked(!next);
      onBookmarkToggle?.(post.id, !next);
    }
  };

  // ── 反應相關 ──────────────────────────────────
  const applyReaction = useCallback(async (type: ReactionType | null) => {
    const prev = myReaction;
    setMyReaction(type);

    // Optimistic update
    setReactionSummary((old) => {
      const updated = old.map((r) => ({ ...r }));
      if (prev) {
        const idx = updated.findIndex((r) => r.type === prev);
        if (idx >= 0) updated[idx] = { ...updated[idx], count: updated[idx].count - 1 };
      }
      if (type) {
        const idx = updated.findIndex((r) => r.type === type);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
        } else {
          updated.push({ type, count: 1 });
        }
      }
      return updated;
    });

    try {
      let res: Response;
      if (type) {
        res = await fetch(`/api/posts/${post.id}/reactions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
      } else {
        res = await fetch(`/api/posts/${post.id}/reactions`, { method: 'DELETE' });
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.error('[reaction] API 回應錯誤:', res.status, errBody);
        // 回滾
        setMyReaction(prev);
        setReactionSummary(post.reactionSummary ?? []);
      }
    } catch (err) {
      console.error('[reaction] 網路錯誤:', err);
      setMyReaction(prev);
      setReactionSummary(post.reactionSummary ?? []);
    }
  }, [myReaction, post.id, post.reactionSummary]);

  /** 點擊讚按鈕：toggle LIKE / 取消現有反應 */
  const handleLikeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (myReaction) {
      applyReaction(null);
    } else {
      applyReaction('LIKE');
    }
  };

  const handlePickerSelect = (type: ReactionType) => {
    if (myReaction === type) {
      applyReaction(null);
    } else {
      applyReaction(type);
    }
    setShowPicker(false);
  };

  /** 點擊留言按鈕：跳轉到貼文詳情頁 */
  const handleCommentClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/posts/${post.id}#comments`);
  };

  const isDraft = post.status === 'DRAFT';
  const hasMedia = post.media && post.media.length > 0;
  const mediaCount = post.media?.length ?? 0;

  // 取前 3 種不重複的 emoji 作為摘要
  const topReactions = reactionSummary
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const totalReactions = reactionSummary.reduce(
    (sum, r) => sum + r.count,
    0,
  );

  // FB 風格：最多顯示 5 張，+N 覆蓋在第 5 張
  const displayCount = Math.min(mediaCount, 5);

  // 根據圖片數量選擇網格 class
  const mediaGridClass =
    mediaCount === 1
      ? styles.mediaGrid1
      : mediaCount === 2
        ? styles.mediaGrid2
        : mediaCount === 3
          ? styles.mediaGrid3
          : mediaCount === 4
            ? styles.mediaGrid4
            : styles.mediaGrid5plus;

  // 讚按鈕文字 & emoji
  const likeEmoji = myReaction ? REACTION_EMOJI[myReaction] : null;
  const likeLabel = myReaction
    ? (myReaction === 'LIKE' ? '讚' : REACTION_LABEL[myReaction])
    : '讚';

  return (
    <article
      className={`${styles.card} ${post.isMilestone ? styles.milestoneCard : ''}`}
      style={post.bgColor ? { backgroundColor: post.bgColor } : undefined}
    >
      <Link href={`/posts/${post.id}`} className={styles.cardLink}>
        {/* ── 作者列 ─────────────────────────── */}
        <div className={styles.header}>
          <Avatar
            name={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="md"
          />
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>
              {post.author.displayName}
            </div>
            <div className={styles.meta}>
              <span>
                {post.publishedAt
                  ? formatDateTime(post.publishedAt)
                  : formatDateTime(post.createdAt)}
              </span>
              <span className={styles.metaDot}>·</span>
              <span className={styles.metaIcon}>
                <VisibilityIcon visibility={post.visibility} />
              </span>
              {isDraft && <span className={styles.draftBadge}>草稿</span>}
              {post.pinnedAt && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.pinnedBadge} title="置頂貼文">📌</span>
                </>
              )}
              {post.locationName && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.locationMeta}>📍 {post.locationName}</span>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            className={`${styles.bookmarkBtn} ${bookmarked ? styles.bookmarkBtnActive : ''}`}
            onClick={handleBookmarkClick}
            aria-label={bookmarked ? '取消收藏' : '收藏貼文'}
            title={bookmarked ? '取消收藏' : '收藏貼文'}
          >
            <Bookmark
              size={18}
              fill={bookmarked ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* ── 文字內容 ───────────────────────── */}
        <div className={styles.content}>
          {post.isMilestone && (
            <div className={styles.milestoneBadge}>
              <span className={styles.milestoneIcon}>🏆</span>
              <span className={styles.milestoneText}>
                人生大事{post.milestoneType ? ` · ${post.milestoneType}` : ''}
              </span>
            </div>
          )}
          <h3 className={styles.title}>{post.title}</h3>
          {post.subtitle && (
            <p className={styles.subtitle}>{post.subtitle}</p>
          )}
          {post.bodyPlainText && (() => {
            const text = stripMarkdown(post.bodyPlainText!);
            // 判斷是否可能超過 3 行：行數 > 3 或字數 > 80
            const lines = text.split('\n');
            const isLong = lines.length > 3 || text.length > 80;
            return (
              <div className={styles.bodyWrapper}>
                <p className={styles.bodyPreview}>
                  {text}
                </p>
                {isLong && (
                  <span className={styles.seeMore}>查看更多</span>
                )}
              </div>
            );
          })()}
          {post.hasPoll && <PollCard hasPoll />}
        </div>

        {/* ── 圖片網格（FB 風格：上2大+下3小） ── */}
        {hasMedia && (
          <div className={`${styles.mediaGrid} ${mediaGridClass}`}>
            {post.media!.slice(0, displayCount).map((item, i) => {
              const isVideo = item.mimeType?.startsWith('video/');
              const isAudio = item.mimeType?.startsWith('audio/');
              return (
                <div key={item.id} className={styles.mediaItem}>
                  {isVideo ? (
                    <div className={styles.mediaPlaceholder}>
                      <Film size={32} />
                      <span>影片</span>
                    </div>
                  ) : isAudio ? (
                    <div className={styles.mediaPlaceholder}>
                      <Music size={32} />
                      <span>音訊</span>
                    </div>
                  ) : (
                    <img
                      className={styles.mediaImage}
                      src={item.url}
                      alt={item.filename || `圖片 ${i + 1}`}
                      loading="lazy"
                    />
                  )}
                  {/* 最後一張顯示 +N 覆蓋 */}
                  {i === displayCount - 1 && mediaCount > displayCount && (
                    <div className={styles.mediaMore}>
                      +{mediaCount - displayCount}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Link>

      {/* ── 統計列（始終顯示） ──────────────── */}
      {(totalReactions > 0 || post.commentCount > 0) && (
        <Link href={`/posts/${post.id}`} className={styles.statsLink}>
          <div className={styles.statsRow}>
            <div className={styles.statsLeft}>
              {topReactions.length > 0 && (
                <>
                  {topReactions.map((r) => (
                    <span key={r.type} className={styles.reactionEmoji}>
                      {REACTION_EMOJI[r.type]}
                    </span>
                  ))}
                </>
              )}
              {totalReactions > 0 && (
                <span className={styles.reactionCount}>
                  {totalReactions}
                </span>
              )}
            </div>
            {post.commentCount > 0 && (
              <span className={styles.statsComment}>
                {post.commentCount} 則留言
              </span>
            )}
          </div>
        </Link>
      )}

      {/* ── 互動按鈕列 ────────────────────── */}
      <div className={styles.actionBar}>
        <div className={styles.actionBtnWrapper}>
          <button
            type="button"
            className={`${styles.actionBtn} ${myReaction ? styles.actionBtnActive : ''}`}
            onClick={handleLikeClick}
            aria-label={myReaction ? '取消反應' : '按讚'}
          >
            {likeEmoji ? (
              <span className={styles.actionEmoji}>{likeEmoji}</span>
            ) : (
              <ThumbsUp size={18} />
            )}
            <span>{likeLabel}</span>
          </button>
        </div>
        <div className={styles.actionBtnWrapper}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnEmoji}`}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPicker(!showPicker); }}
            aria-label="選擇心情"
          >
            <SmilePlus size={18} />
          </button>
          {showPicker && (
            <div className={styles.pickerAnchor}>
              <ReactionPicker
                selected={myReaction}
                onSelect={handlePickerSelect}
                onClose={() => setShowPicker(false)}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleCommentClick}
          aria-label="留言"
        >
          <MessageCircle size={18} />
          <span>留言</span>
        </button>
      </div>
    </article>
  );
}
