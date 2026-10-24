'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText, Lock, Users, Eye, Pin, Pencil, Trash2,
  ArrowLeft, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { renderMarkdown } from '@/lib/markdown';
import styles from '../page.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

interface WikiPageDetail {
  id: string;
  slug: string;
  title: string;
  content: string;
  category: string | null;
  visibility: 'PRIVATE' | 'FAMILY' | 'SELECTED';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface WikiVersion {
  id: string;
  title: string;
  createdAt: string;
  editedBy: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

// ── 輔助函式 ──────────────────────────────────────────────────

function getVisibilityLabel(visibility: string): string {
  switch (visibility) {
    case 'PRIVATE': return '僅自己';
    case 'SELECTED': return '指定家人';
    default: return '家人可見';
  }
}

function getVisibilityIcon(visibility: string) {
  switch (visibility) {
    case 'PRIVATE': return <Lock size={14} />;
    case 'SELECTED': return <Users size={14} />;
    default: return <Eye size={14} />;
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Main Component ────────────────────────────────────────────

export default function WikiViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const [page, setPage] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 版本歷史
  const [versions, setVersions] = useState<WikiVersion[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // 刪除確認
  const [deleting, setDeleting] = useState(false);

  // ── 取得目前使用者 ID ──────────────────────────────────────

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  // ── Fetch Page ─────────────────────────────────────────────

  const fetchPage = useCallback(async () => {
    try {
      const res = await fetch(`/api/wiki/pages/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setPage(data.page || data);
      } else if (res.status === 404) {
        setError('找不到此文件');
      } else if (res.status === 403) {
        setError('您沒有權限查看此文件');
      } else {
        setError('載入文件失敗');
      }
    } catch {
      setError('網路錯誤');
    }
  }, [slug]);

  useEffect(() => {
    setLoading(true);
    fetchPage().finally(() => setLoading(false));
  }, [fetchPage]);

  // ── Fetch Versions ─────────────────────────────────────────

  const fetchVersions = useCallback(async () => {
    if (versions.length > 0) return; // 已載入
    setVersionsLoading(true);
    try {
      const res = await fetch(`/api/wiki/pages/${slug}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {
      /* ignore */
    } finally {
      setVersionsLoading(false);
    }
  }, [slug, versions.length]);

  const handleToggleVersions = () => {
    if (!versionsOpen) {
      fetchVersions();
    }
    setVersionsOpen((prev) => !prev);
  };

  // ── Delete ─────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!confirm('確定要刪除此文件？此操作無法復原。')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/wiki/pages/${slug}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/wiki');
      } else {
        const data = await res.json();
        setError(data.error || '刪除失敗');
      }
    } catch {
      setError('網路錯誤');
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  if (error && !page) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <Link href="/wiki" className={styles.btnBack}>
          <ArrowLeft size={14} />
          返回知識庫
        </Link>
      </div>
    );
  }

  if (!page) return null;

  const isAuthor = currentUserId === page.author.id;

  return (
    <div className={styles.container}>
      {/* Error Banner */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Back + Actions */}
      <div className={styles.viewActions}>
        <Link href="/wiki" className={styles.btnBack}>
          <ArrowLeft size={14} />
          返回
        </Link>
        {isAuthor && (
          <>
            <Link href={`/wiki/${slug}/edit`} className={styles.btnEdit}>
              <Pencil size={14} />
              編輯
            </Link>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={handleDelete}
              disabled={deleting}
            >
              <Trash2 size={14} />
              {deleting ? '刪除中...' : '刪除'}
            </button>
          </>
        )}
      </div>

      {/* Page Content */}
      <div className={styles.viewCard}>
        <h1 className={styles.viewTitle}>
          {page.pinned && <Pin size={20} style={{ display: 'inline', marginRight: 8, color: 'var(--color-primary)' }} />}
          {page.title}
        </h1>

        <div className={styles.viewMeta}>
          {page.category && (
            <span className={styles.categoryBadge}>{page.category}</span>
          )}
          <span className={styles.viewMetaItem}>
            {getVisibilityIcon(page.visibility)}
            {getVisibilityLabel(page.visibility)}
          </span>
          <span className={styles.viewMetaItem}>
            <Avatar avatarUrl={page.author.avatarUrl} name={page.author.displayName} size="sm" />
            {page.author.displayName}
          </span>
          <span className={styles.viewMetaItem}>
            建立：{formatDateTime(page.createdAt)}
          </span>
          <span className={styles.viewMetaItem}>
            更新：{formatDateTime(page.updatedAt)}
          </span>
        </div>

        <div
          className={styles.viewContent}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }}
        />
      </div>

      {/* Version History */}
      <div className={styles.versionsCard}>
        <div className={styles.versionsHeader} onClick={handleToggleVersions}>
          <span className={styles.versionsTitle}>
            <History size={16} />
            版本歷史
          </span>
          <span className={styles.versionsToggle}>
            {versionsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
        {versionsOpen && (
          versionsLoading ? (
            <div className={styles.loading}>載入版本歷史...</div>
          ) : versions.length === 0 ? (
            <div className={styles.loading}>尚無版本記錄</div>
          ) : (
            versions.map((v) => (
              <div key={v.id} className={styles.versionItem}>
                <span className={styles.versionDate}>{formatDateTime(v.createdAt)}</span>
                <span className={styles.versionTitle}>{v.title}</span>
                <span className={styles.versionEditor}>
                  <Avatar avatarUrl={v.editedBy.avatarUrl} name={v.editedBy.displayName} size="sm" />
                  {v.editedBy.displayName}
                </span>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
