'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Lock, Users, Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import Avatar from '@/components/ui/Avatar';
import styles from '../page.module.css';

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

type Visibility = 'PRIVATE' | 'FAMILY' | 'SELECTED';

// ── Main Component ────────────────────────────────────────────

export default function WikiNewPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('其他');
  const [visibility, setVisibility] = useState<Visibility>('FAMILY');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 家庭成員（SELECTED 時使用）
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

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

      const res = await fetch('/api/wiki/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '儲存失敗');
        return;
      }

      const data = await res.json();
      router.push(`/wiki/${data.page?.slug || data.slug || ''}`);
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Header */}
      <Link href="/wiki" className={styles.backLink}>
        <ArrowLeft size={16} /> 知識庫
      </Link>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <FileText size={28} />
          新增文件
        </h1>
        <p className={styles.pageSubtitle}>建立新的知識庫文件</p>
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
        <Link href="/wiki" className={styles.btnCancel}>
          取消
        </Link>
        <button
          type="button"
          className={styles.btnSave}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? '儲存中...' : '建立文件'}
        </button>
      </div>
    </div>
  );
}
