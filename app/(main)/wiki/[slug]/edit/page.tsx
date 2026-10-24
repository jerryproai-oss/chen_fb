'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText, Lock, Users, Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import Avatar from '@/components/ui/Avatar';
import styles from '../../page.module.css';

const MilkdownEditor = dynamic(
  () => import('@/components/wiki/MilkdownEditor'),
  { ssr: false, loading: () => <div className={styles.editorLoading}>載入編輯器中...</div> }
);

// ── 類別與可見度定義 ──────────────────────────────────────────

const CATEGORY_OPTIONS = ['技術指引', '操作手冊', '知識庫', '公告', '其他'];

const VISIBILITY_OPTIONS = [
  { value: 'PRIVATE' as const, label: '僅自己', icon: Lock },
  { value: 'FAMILY' as const, label: '家人可見', icon: Eye },
  { value: 'SELECTED' as const, label: '指定家人', icon: Users },
];

// ── 型別定義 ──────────────────────────────────────────────────

interface FamilyMember {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

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
  permissions?: { userId: string }[];
}

type Visibility = 'PRIVATE' | 'FAMILY' | 'SELECTED';

// ── Main Component ────────────────────────────────────────────

export default function WikiEditPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('其他');
  const [visibility, setVisibility] = useState<Visibility>('FAMILY');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 家庭成員
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // 原始頁面的作者 ID
  const [authorId, setAuthorId] = useState<string | null>(null);

  // ── 取得目前使用者 ─────────────────────────────────────────

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  // ── 取得頁面資料 ──────────────────────────────────────────

  const fetchPage = useCallback(async () => {
    try {
      const res = await fetch(`/api/wiki/pages/${slug}`);
      if (res.ok) {
        const data = await res.json();
        const p = data.page || data;
        setTitle(p.title || '');
        setContent(p.content || '');
        setCategory(p.category || '其他');
        setVisibility(p.visibility || 'FAMILY');
        setAuthorId(p.author?.id || null);
        // 如果有 permissions，提取 userIds
        if (p.permissions && Array.isArray(p.permissions)) {
          setSelectedUserIds(p.permissions.map((perm: { userId: string }) => perm.userId));
        }
      } else if (res.status === 404) {
        setError('找不到此文件');
      } else if (res.status === 403) {
        setError('您沒有權限編輯此文件');
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

  // ── 取得家庭成員 ──────────────────────────────────────────

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await fetch('/api/family/members');
      if (res.ok) {
        const data = await res.json();
        setMembers(
          (data.members || []).map((u: Record<string, unknown>) => ({
            id: u.id as string,
            displayName: u.displayName as string,
            avatarUrl: u.avatarUrl as string | null,
          }))
        );
      }
    } catch {
      /* ignore */
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visibility === 'SELECTED' && members.length === 0) {
      fetchMembers();
    }
  }, [visibility, members.length, fetchMembers]);

  // ── 勾選成員 ──────────────────────────────────────────────

  const toggleMember = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ── 儲存 ──────────────────────────────────────────────────

  const handleSave = async () => {
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    if (!content.trim()) {
      setError('請輸入內容');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        content,
        category,
        visibility,
      };
      if (visibility === 'SELECTED') {
        body.permissionUserIds = selectedUserIds;
      }

      const res = await fetch(`/api/wiki/pages/${slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '儲存失敗');
        return;
      }

      router.push(`/wiki/${slug}`);
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  // 權限檢查：非作者不能編輯
  if (currentUserId && authorId && currentUserId !== authorId) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>只有作者才能編輯此文件</div>
        <Link href={`/wiki/${slug}`} className={styles.btnBack}>
          返回文件
        </Link>
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <Link href="/wiki" className={styles.btnBack}>
          返回知識庫
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <FileText size={28} />
          編輯文件
        </h1>
        <p className={styles.pageSubtitle}>修改文件內容，儲存後將建立新版本</p>
      </div>

      {/* Error */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Form */}
      <div className={styles.formCard}>
        {/* Title */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>標題</label>
          <input
            type="text"
            className={styles.formInput}
            placeholder="輸入文件標題..."
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 200))}
            maxLength={200}
          />
          <span className={styles.charCount}>{title.length}/200</span>
        </div>

        {/* Category */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>分類</label>
          <select
            className={styles.formSelect}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Visibility */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>可見範圍</label>
          <div className={styles.visibilityGroup}>
            {VISIBILITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.visibilityOption} ${visibility === opt.value ? styles.visibilityOptionActive : ''}`}
                  onClick={() => setVisibility(opt.value)}
                >
                  <Icon size={14} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Members */}
        {visibility === 'SELECTED' && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>選擇可見的家人</label>
            {membersLoading ? (
              <div className={styles.loading}>載入家庭成員中...</div>
            ) : members.length === 0 ? (
              <div className={styles.loading}>尚無家庭成員</div>
            ) : (
              <div className={styles.memberList}>
                {members.map((m) => (
                  <label key={m.id} className={styles.memberItem}>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(m.id)}
                      onChange={() => toggleMember(m.id)}
                    />
                    <Avatar avatarUrl={m.avatarUrl} name={m.displayName} size="sm" />
                    {m.displayName}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>內容</label>
          <div className={styles.editorWrap}>
            <MilkdownEditor value={content} onChange={setContent} />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={styles.actionRow}>
        <Link href={`/wiki/${slug}`} className={styles.btnCancel}>
          取消
        </Link>
        <button
          type="button"
          className={styles.btnSave}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '儲存中...' : '儲存變更'}
        </button>
      </div>
    </div>
  );
}
