import Link from 'next/link';
import { Lock, Users, UserCheck, MessageCircle } from 'lucide-react';
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
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}/${m}/${day}`;
}

/**
 * 貼文卡片
 * 顯示作者、日期、隱私、標題、內文預覽、心情回應摘要、留言數
 */
export default function PostCard({ post, isOwn = false }: PostCardProps) {
  const isDraft = post.status === 'DRAFT';

  // 取前 3 種不重複的 emoji 作為摘要
  const topReactions = (post.reactionSummary ?? [])
    .filter((r) => r.count > 0)
    .slice(0, 3);

  const totalReactions = (post.reactionSummary ?? []).reduce(
    (sum, r) => sum + r.count,
    0,
  );

  return (
    <article className={styles.card}>
      <Link href={`/posts/${post.id}`} className={styles.cardLink}>
        {/* Header */}
        <div className={styles.header}>
          <Avatar
            name={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="sm"
          />
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>
              {post.author.displayName}
            </div>
            <div className={styles.meta}>
              <span>{formatDate(post.recordDate)}</span>
              <span className={styles.metaIcon}>
                <VisibilityIcon visibility={post.visibility} />
              </span>
              {isDraft && <span className={styles.draftBadge}>草稿</span>}
            </div>
          </div>
        </div>

        {/* Content */}
        <h3 className={styles.title}>{post.title}</h3>
        {post.subtitle && (
          <p className={styles.subtitle}>{post.subtitle}</p>
        )}
        {post.bodyPlainText && (
          <p className={styles.bodyPreview}>{post.bodyPlainText}</p>
        )}

        {/* Footer */}
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
