'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Lock,
  Users,
  UserCheck,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import ReactionBar from '@/components/post/ReactionBar';
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
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
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

  // Load post, reactions, comments
  useEffect(() => {
    async function load() {
      try {
        const [postRes, meRes] = await Promise.all([
          fetch(`/api/posts/${id}`),
          fetch('/api/me'),
        ]);
        if (!postRes.ok) throw new Error('無法載入貼文');
        const postData: PostDetail = await postRes.json();
        setPost(postData);

        if (meRes.ok) {
          const meData = await meRes.json();
          setCurrentUserId(meData.id);
        }

        // Load reactions
        const reactRes = await fetch(`/api/posts/${id}/reactions`);
        if (reactRes.ok) {
          const reactData = await reactRes.json();
          setReactions(reactData.reactions ?? []);
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
      const newComment = await res.json();
      setComments((prev) => [...prev, newComment]);
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
      <article className={styles.article}>
        <div className={styles.articleHeader}>
          <Avatar
            name={post.author.displayName}
            avatarUrl={post.author.avatarUrl}
            size="md"
          />
          <div className={styles.authorInfo}>
            <div className={styles.authorName}>{post.author.displayName}</div>
            <div className={styles.meta}>
              <span>{formatDate(post.recordDate)}</span>
              <span className={styles.metaIcon}>
                <VisibilityIcon visibility={post.visibility} />
              </span>
              {post.status === 'DRAFT' && (
                <span className={styles.draftBadge}>草稿</span>
              )}
            </div>
          </div>
        </div>

        <h1 className={styles.title}>{post.title}</h1>
        {post.subtitle && <p className={styles.subtitle}>{post.subtitle}</p>}
        {post.bodyPlainText && (
          <div className={styles.body}>{post.bodyPlainText}</div>
        )}

        {isAuthor && (
          <div className={styles.authorActions}>
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
          </div>
        )}
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
