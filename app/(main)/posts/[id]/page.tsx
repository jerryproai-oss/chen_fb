'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { renderMarkdown } from '@/lib/markdown';
import {
  ArrowLeft,
  Lock,
  Users,
  UserCheck,
  Pencil,
  Trash2,
  X,
  Bookmark,
  Pin,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ReactionBar from '@/components/post/ReactionBar';
import MediaGallery from '@/components/post/MediaGallery';
import PollDetail from '@/components/post/PollDetail';
import type {
  PostDetail,
  ReactionSummary,
  ReactionType,
  CommentItem,
  Visibility,
} from '@/lib/types';
import styles from './page.module.css';

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

function formatRecordDate(dateStr: string): string {
  // recordDate 是 @db.Date（YYYY-MM-DDT00:00:00.000Z），使用 UTC 避免時區偏移
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
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
 * 貼文詳情頁面
 * 顯示完整貼文內容、心情回應、留言列表
 */
export default function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<PostDetail | null>(null);
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [myReaction, setMyReaction] = useState<ReactionType | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [pinning, setPinning] = useState(false);

  // Load post, reactions, comments, bookmark
  useEffect(() => {
    async function load() {
      try {
        const [postRes, meRes] = await Promise.all([
          fetch(`/api/posts/${id}`),
          fetch('/api/me'),
        ]);
        if (!postRes.ok) throw new Error('無法載入貼文');
        const postWrapper = await postRes.json();
        const postData: PostDetail = postWrapper.post;
        setPost(postData);

        if (meRes.ok) {
          const meData = await meRes.json();
          setCurrentUserId(meData.id);
        }

        // Load bookmark status
        const bookmarkRes = await fetch(`/api/posts/${id}/bookmark`);
        if (bookmarkRes.ok) {
          const bookmarkData = await bookmarkRes.json();
          setIsBookmarked(bookmarkData.bookmarked ?? false);
        }

        // Load reactions
        const reactRes = await fetch(`/api/posts/${id}/reactions`);
        if (reactRes.ok) {
          const reactData = await reactRes.json();
          // Convert summary object { LIKE: 3, LOVE: 1 } to ReactionSummary[]
          const summaryObj = (reactData.summary ?? {}) as Record<string, number>;
          const summaryArr: ReactionSummary[] = Object.entries(summaryObj).map(
            ([type, count]) => ({ type: type as ReactionType, count }),
          );
          setReactions(summaryArr);
          setMyReaction(reactData.myReaction ?? null);
        }

        // Load comments
        const commRes = await fetch(`/api/posts/${id}/comments`);
        if (commRes.ok) {
          const commData = await commRes.json();
          setComments(commData.comments ?? []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Handle bookmark
  async function handleToggleBookmark() {
    const next = !isBookmarked;
    setIsBookmarked(next);
    try {
      const res = await fetch(`/api/posts/${id}/bookmark`, {
        method: next ? 'PUT' : 'DELETE',
      });
      if (!res.ok) {
        setIsBookmarked(!next);
      }
    } catch {
      setIsBookmarked(!next);
    }
  }

  // Toggle pin
  async function handleTogglePin() {
    if (!post || pinning) return;
    const isPinned = !!post.pinnedAt;
    setPinning(true);
    try {
      const res = await fetch(`/api/posts/${id}/pin`, {
        method: isPinned ? 'DELETE' : 'PUT',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isPinned ? '取消釘選失敗' : '釘選失敗'));
      }
      const data = await res.json();
      setPost((prev) => (prev ? { ...prev, pinnedAt: data.pinnedAt ?? null } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : '釘選操作失敗');
    } finally {
      setPinning(false);
    }
  }

  // Handle reaction
  async function handleReact(type: ReactionType | null) {
    const prev = myReaction;
    setMyReaction(type);

    // Optimistic update reactions
    setReactions((old) => {
      const updated = [...old];
      // Decrement old
      if (prev) {
        const idx = updated.findIndex((r) => r.type === prev);
        if (idx >= 0) updated[idx] = { ...updated[idx], count: updated[idx].count - 1 };
      }
      // Increment new
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
      if (type) {
        await fetch(`/api/posts/${id}/reactions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
      } else {
        await fetch(`/api/posts/${id}/reactions`, { method: 'DELETE' });
      }
    } catch {
      // Rollback
      setMyReaction(prev);
    }
  }

  // Submit comment
  async function handleSubmitComment() {
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/posts/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyText: commentText.trim() }),
      });
      if (!res.ok) throw new Error('留言失敗');
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setCommentText('');
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingComment(false);
    }
  }

  // Delete comment
  async function handleDeleteComment(commentId: string) {
    try {
      const res = await fetch(`/api/posts/${id}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Delete post
  async function handleDeletePost() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/journal');
      } else {
        throw new Error('刪除失敗');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loader}>載入中…</div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className={styles.container}>
        <div className={styles.errorMsg}>{error || '貼文不存在'}</div>
        <Link href="/journal" className={styles.backLink}>
          <ArrowLeft size={16} />
          返回手札
        </Link>
      </div>
    );
  }

  const isAuthor = currentUserId === post.authorId;

  return (
    <div className={styles.container}>
      <Link href="/journal" className={styles.backLink}>
        <ArrowLeft size={16} />
        返回
      </Link>

      {/* Article */}
      <article
        className={`${styles.article} ${post.isMilestone ? styles.milestoneArticle : ''}`}
        style={post.bgColor ? { backgroundColor: post.bgColor } : undefined}
      >
        <div className={styles.articleHeader}>
          <Avatar
            name={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="md"
          />
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>{post.author.displayName}</div>
            <div className={styles.meta}>
              <span className={styles.recordDate}>
                📅 {formatRecordDate(post.recordDate)}
              </span>
              <span className={styles.metaIcon}>
                <VisibilityIcon visibility={post.visibility} />
              </span>
              {post.status === 'DRAFT' && (
                <span className={styles.draftBadge}>草稿</span>
              )}
              {post.pinnedAt && (
                <span className={styles.pinnedBadge} title="置頂貼文">📌 置頂</span>
              )}
              {post.locationName && (
                <span className={styles.locationMeta}>📍 {post.locationName}</span>
              )}
            </div>
            {/* 發布/編輯時間（小字） */}
            {post.publishedAt && (
              <div className={styles.publishedMeta}>
                {post.updatedAt && post.updatedAt !== post.publishedAt
                  ? `編輯於 ${formatDateTime(post.updatedAt)}`
                  : `發布於 ${formatDateTime(post.publishedAt)}`
                }
              </div>
            )}
          </div>
        </div>

        {post.isMilestone && (
          <div className={styles.milestoneBadge}>
            <span className={styles.milestoneIcon}>🏆</span>
            <span className={styles.milestoneText}>
              人生大事{post.milestoneType ? ` · ${post.milestoneType}` : ''}
            </span>
          </div>
        )}

        <h1 className={styles.title}>{post.title}</h1>
        {post.subtitle && <p className={styles.subtitle}>{post.subtitle}</p>}
        {post.bodyPlainText && (
          <div
            className={styles.body}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.bodyPlainText) }}
          />
        )}

        {post.media && post.media.length > 0 && (
          <MediaGallery media={post.media} />
        )}

        {post.hasPoll && (
          <PollDetail postId={id} />
        )}

        <div className={styles.authorActions}>
          <button
            type="button"
            className={`${styles.bookmarkBtn} ${isBookmarked ? styles.bookmarked : ''}`}
            onClick={handleToggleBookmark}
            aria-label={isBookmarked ? '取消收藏' : '收藏手札'}
          >
            <Bookmark size={14} fill={isBookmarked ? 'currentColor' : 'none'} />
            <span>{isBookmarked ? '已收藏' : '收藏'}</span>
          </button>
          {isAuthor && (
            <>
              <button
                type="button"
                className={`${styles.pinBtn} ${post.pinnedAt ? styles.pinnedActive : ''}`}
                onClick={handleTogglePin}
                disabled={pinning}
                title={post.pinnedAt ? '取消釘選' : '釘選貼文'}
              >
                <Pin size={14} />
                <span>{pinning ? '處理中…' : post.pinnedAt ? '取消釘選' : '釘選貼文'}</span>
              </button>
              <Link href={`/write/${post.id}`} className={styles.editBtn}>
                <Pencil size={14} />
                編輯
              </Link>
              <button
                className={styles.deleteBtn}
                onClick={() => setShowDeleteConfirm(true)}
                type="button"
              >
                <Trash2 size={14} />
                刪除
              </button>
            </>
          )}
        </div>
      </article>

      {/* Reactions */}
      <section className={styles.reactions}>
        <div className={styles.sectionTitle}>心情回應</div>
        <ReactionBar
          postId={id}
          reactions={reactions}
          myReaction={myReaction}
          onReact={handleReact}
        />
      </section>

      {/* Comments */}
      <section className={styles.comments}>
        <div className={styles.sectionTitle}>
          留言 ({comments.length})
        </div>

        {comments.length > 0 ? (
          <div className={styles.commentList}>
            {comments.map((comment) => (
              <div key={comment.id} className={styles.commentItem}>
                <Avatar
                  name={comment.author.displayName}
                  avatarUrl={comment.author.avatarUrl}
                  size="sm"
                />
                <div className={styles.commentContent}>
                  <div>
                    <span className={styles.commentAuthor}>
                      {comment.author.displayName}
                    </span>
                    <span className={styles.commentDate}>
                      {formatDateTime(comment.createdAt)}
                    </span>
                  </div>
                  <div className={styles.commentBody}>{comment.bodyText}</div>
                </div>
                {currentUserId === comment.authorId && (
                  <button
                    className={styles.commentDelete}
                    onClick={() => handleDeleteComment(comment.id)}
                    aria-label="刪除留言"
                    type="button"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyComments}>還沒有留言</div>
        )}

        <div className={styles.commentForm}>
          <textarea
            className={styles.commentInput}
            placeholder="寫個留言…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={1}
          />
          <button
            className={styles.commentSubmit}
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || submittingComment}
            type="button"
          >
            {submittingComment ? '送出中…' : '送出'}
          </button>
        </div>
      </section>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmDialog}>
            <h3 className={styles.confirmTitle}>確定要刪除？</h3>
            <p className={styles.confirmText}>
              刪除後無法復原，所有留言和心情回應也會一起被刪除。
            </p>
            <div className={styles.confirmActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setShowDeleteConfirm(false)}
                type="button"
              >
                取消
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={handleDeletePost}
                disabled={deleting}
                type="button"
              >
                {deleting ? '刪除中…' : '確定刪除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
