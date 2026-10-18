import Link from 'next/link';
import { Lock, Users, UserCheck, MessageCircle, Film, Music } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { PostSummary, Visibility } from '@/lib/types';
import { REACTION_EMOJI } from '@/lib/types';
import styles from './PostCard.module.css';

interface PostCardProps {
  post: PostSummary;
  /** 是否為自己的貼文（journal 頁面用） */
  isOwn?: boolean;
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
 * 結構：作者列 → 文字內容 → 圖片網格（上2大+下3小） → 互動列
 */
export default function PostCard({ post, isOwn = false }: PostCardProps) {
  const isDraft = post.status === 'DRAFT';
  const hasMedia = post.media && post.media.length > 0;
  const mediaCount = post.media?.length ?? 0;

  // 取前 3 種不重複的 emoji 作為摘要
  const topReactions = (post.reactionSummary ?? [])
    .filter((r) => r.count > 0)
    .slice(0, 3);

  const totalReactions = (post.reactionSummary ?? []).reduce(
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

  return (
    <article className={styles.card}>
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
            </div>
          </div>
        </div>

        {/* ── 文字內容 ───────────────────────── */}
        <div className={styles.content}>
          <h3 className={styles.title}>{post.title}</h3>
          {post.subtitle && (
            <p className={styles.subtitle}>{post.subtitle}</p>
          )}
          {post.bodyPlainText && (() => {
            const text = post.bodyPlainText!;
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

        {/* ── 互動列 ────────────────────────── */}
        {(totalReactions > 0 || post.commentCount > 0) && (
          <div className={styles.footer}>
            <div className={styles.reactions}>
              {topReactions.map((r) => (
                <span key={r.type} className={styles.reactionEmoji}>
                  {REACTION_EMOJI[r.type]}
                </span>
              ))}
              {totalReactions > 0 && (
                <span className={styles.reactionCount}>
                  {totalReactions}
                </span>
              )}
            </div>
            {post.commentCount > 0 && (
              <span className={styles.commentCount}>
                <MessageCircle size={14} />
                {post.commentCount} 則留言
              </span>
            )}
          </div>
        )}
      </Link>
    </article>
  );
}
