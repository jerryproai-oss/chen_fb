'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pin,
  Trash2,
  X,
  Check,
  Save,
} from 'lucide-react';
import AIAssistButton from '@/components/post/AIAssistButton';
import styles from './page.module.css';

interface NoteAudience {
  userId: string;
  user?: { id: string; displayName: string };
}

interface NoteTag {
  id: string;
  name: string;
}

interface NoteData {
  id?: string;
  title: string;
  content: string;
  color: string | null;
  pinned: boolean;
  visibility: 'PRIVATE' | 'FAMILY' | 'SELECTED';
  tags: NoteTag[];
  audiences: NoteAudience[];
  authorId?: string;
}

interface FamilyMember {
  id: string;
  displayName: string;
}

const NOTE_COLORS = [
  '#f8e8e8', '#fcecd8', '#fdf6d0', '#e3f2e3',
  '#dceefb', '#e8dff5', '#f5e6f0', '#f0ebe3',
  '#d7ecec', '#e8e8e8',
];

interface NoteEditorProps {
  noteData?: NoteData;
  isNew: boolean;
}

export default function NoteEditor({ noteData, isNew }: NoteEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(noteData?.title || '');
  const [content, setContent] = useState(noteData?.content || '');
  const [color, setColor] = useState<string | null>(noteData?.color || null);
  const [pinned, setPinned] = useState(noteData?.pinned || false);
  const [visibility, setVisibility] = useState<'PRIVATE' | 'FAMILY' | 'SELECTED'>(
    noteData?.visibility || 'PRIVATE'
  );
  const [tags, setTags] = useState<string[]>(noteData?.tags?.map((t) => t.name) || []);
  const [tagInput, setTagInput] = useState('');
  const [audienceIds, setAudienceIds] = useState<string[]>(
    noteData?.audiences?.map((a) => a.userId) || []
  );
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [autoSaved, setAutoSaved] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthor = isNew || (noteData?.authorId && noteData.authorId === currentUserId);

  // 取得當前使用者 ID 與家庭成員
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((u) => setCurrentUserId(u.id))
      .catch(() => {});

    fetch('/api/family/members')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setFamilyMembers(data.map((u: { id: string; displayName: string }) => ({
            id: u.id,
            displayName: u.displayName,
          })));
        }
      })
      .catch(() => {});
  }, []);

  // 自動儲存（非新建模式，debounce 2 秒）
  const autoSave = useCallback(async () => {
    if (isNew || !noteData?.id || !title.trim()) return;
    try {
      const res = await fetch(`/api/notes/${noteData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, color, pinned, visibility, audienceIds, tags }),
      });
      if (res.ok) {
        setAutoSaved(true);
        setTimeout(() => setAutoSaved(false), 2000);
      }
    } catch {
      // 忽略自動儲存錯誤
    }
  }, [isNew, noteData?.id, title, content, color, pinned, visibility, audienceIds, tags]);

  useEffect(() => {
    if (isNew || !noteData?.id) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(autoSave, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [title, content, color, pinned, visibility, audienceIds, tags, autoSave, isNew, noteData?.id]);

  async function handleSave() {
    if (!title.trim()) {
      setError('請輸入標題');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const payload = { title, content, color, pinned, visibility, audienceIds, tags };

      const res = isNew
        ? await fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/notes/${noteData?.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }

      const saved = await res.json();
      router.push(`/notes/${saved.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!noteData?.id) return;
    if (!confirm('確定要刪除此記事嗎？此操作無法復原。')) return;
    try {
      const res = await fetch(`/api/notes/${noteData.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '刪除失敗');
      }
      router.push('/notes');
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (((e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/,/g, '');
      if (newTag && !tags.includes(newTag) && tags.length < 20) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function toggleAudience(userId: string) {
    setAudienceIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/notes" className={styles.backLink}>
        <ArrowLeft size={16} /> 記事本
      </Link>

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          {isNew ? '📝 新增記事' : '📝 編輯記事'}
        </h1>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.formCard}>
        {/* 標題 */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>標題</label>
          <div className={styles.fieldRow}>
            <input
              type="text"
              className={styles.formInput}
              placeholder="記事標題"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              disabled={!isAuthor}
            />
            <AIAssistButton
              text={title}
              onApply={(t) => setTitle(t)}
              fieldType="title"
              context={{ title, body: content }}
            />
          </div>
        </div>

        {/* 內容 */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>內容（支援 Markdown）</label>
          <div className={styles.fieldRow}>
            <textarea
              className={styles.formTextarea}
              placeholder="記事內容…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!isAuthor}
            />
            <AIAssistButton
              text={content}
              onApply={(c) => setContent(c)}
              fieldType="body"
              context={{ title, body: content }}
            />
          </div>
        </div>

        {/* 分享設定 */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>可見範圍</label>
          <div className={styles.visibilityGroup}>
            {([
              { value: 'PRIVATE', label: '🔒 僅自己' },
              { value: 'FAMILY', label: '👨‍👩‍👧‍👦 全家人' },
              { value: 'SELECTED', label: '👥 指定家人' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`${styles.visibilityOption} ${visibility === opt.value ? styles.visibilityOptionActive : ''}`}
                onClick={() => isAuthor && setVisibility(opt.value)}
                disabled={!isAuthor}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {visibility === 'SELECTED' && (
            <div className={styles.memberList}>
              {familyMembers
                .filter((m) => m.id !== currentUserId)
                .map((m) => (
                  <label key={m.id} className={styles.memberItem}>
                    <input
                      type="checkbox"
                      checked={audienceIds.includes(m.id)}
                      onChange={() => toggleAudience(m.id)}
                      disabled={!isAuthor}
                    />
                    {m.displayName}
                  </label>
                ))}
            </div>
          )}
        </div>

        {/* 背景色 */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>背景色</label>
          <div className={styles.colorPicker}>
            <button
              type="button"
              className={`${styles.colorDotNone} ${!color ? styles.colorDotNoneActive : ''}`}
              onClick={() => isAuthor && setColor(null)}
              title="無背景色"
              disabled={!isAuthor}
            >
              <X size={12} />
            </button>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`${styles.colorDot} ${color === c ? styles.colorDotActive : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => isAuthor && setColor(c)}
                title={c}
                disabled={!isAuthor}
              >
                {color === c && <Check size={12} style={{ color: '#333', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />}
              </button>
            ))}
          </div>
        </div>

        {/* 標籤 */}
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>標籤</label>
          <div className={styles.tagsInputWrap}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tagBadge}>
                {tag}
                {isAuthor && (
                  <button
                    type="button"
                    className={styles.tagRemove}
                    onClick={() => setTags(tags.filter((t) => t !== tag))}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {isAuthor && (
              <input
                type="text"
                className={styles.tagInput}
                placeholder={tags.length === 0 ? '輸入標籤，按 Enter 新增' : ''}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
              />
            )}
          </div>
        </div>

        {/* 置頂 */}
        {isAuthor && (
          <div className={styles.formGroup}>
            <button
              type="button"
              className={`${styles.pinToggle} ${pinned ? styles.pinToggleActive : ''}`}
              onClick={() => setPinned(!pinned)}
            >
              <Pin size={14} />
              {pinned ? '已置頂' : '置頂'}
            </button>
          </div>
        )}
      </div>

      {/* 操作按鈕 */}
      <div className={styles.actionRow}>
        <div className={styles.actionRowLeft}>
          {!isNew && isAuthor && (
            <button
              type="button"
              className={styles.btnDelete}
              onClick={handleDelete}
            >
              <Trash2 size={14} /> 刪除
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
          {autoSaved && (
            <span className={styles.autoSaveHint}>
              <Check size={12} /> 已自動儲存
            </span>
          )}
          {isAuthor && (
            <button
              type="button"
              className={styles.btnSave}
              onClick={handleSave}
              disabled={saving || !title.trim()}
            >
              <Save size={14} style={{ marginRight: 4 }} />
              {saving ? '儲存中…' : isNew ? '建立記事' : '儲存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
