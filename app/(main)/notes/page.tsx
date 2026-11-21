'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Search,
  Pin,
  Lock,
  Users,
  UserCheck,
  Tag,
} from 'lucide-react';
import HelpGuide from '@/components/ui/HelpGuide';
import { notesHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

interface NoteTag {
  id: string;
  name: string;
}

interface NoteItem {
  id: string;
  title: string;
  content: string;
  color: string | null;
  pinned: boolean;
  visibility: 'PRIVATE' | 'FAMILY' | 'SELECTED';
  createdAt: string;
  updatedAt: string;
  author: { id: string; displayName: string; avatarUrl: string | null };
  tags: NoteTag[];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '剛剛';
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小時前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} 天前`;
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function getVisibilityIcon(vis: string) {
  switch (vis) {
    case 'PRIVATE':
      return <Lock size={14} />;
    case 'FAMILY':
      return <Users size={14} />;
    case 'SELECTED':
      return <UserCheck size={14} />;
    default:
      return null;
  }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/>\s/g, '')
    .replace(/[-*+]\s/g, '')
    .replace(/\d+\.\s/g, '')
    .trim();
}

export default function NotesListPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedTag) params.set('tag', selectedTag);
      params.set('sort', sortBy);
      params.set('order', 'desc');

      const res = await fetch(`/api/notes?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setNotes(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedTag, sortBy]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // 收集所有標籤
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags.map((t) => t.name))));

  return (
    <div className={styles.container}>
      <Link href="/profile" className={styles.backLink}>
        <ArrowLeft size={16} /> 個人檔案
      </Link>

      <div className={styles.header}>
        <div className={styles.headerRow}>
          <h1 className={styles.pageTitle}>
            📝 記事本 <HelpGuide content={notesHelp} />
          </h1>
          <Link href="/notes/new" className={styles.addBtn}>
            <Plus size={16} /> 新增記事
          </Link>
        </div>
      </div>

      {/* 工具列 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="搜尋記事…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className={styles.sortSelect}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="updatedAt">依修改時間</option>
          <option value="createdAt">依建立時間</option>
          <option value="title">依標題</option>
        </select>
      </div>

      {/* 標籤篩選 */}
      {allTags.length > 0 && (
        <div className={styles.tagRow}>
          <button
            type="button"
            className={`${styles.tagChip} ${!selectedTag ? styles.tagChipActive : ''}`}
            onClick={() => setSelectedTag('')}
          >
            全部
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`${styles.tagChip} ${selectedTag === tag ? styles.tagChipActive : ''}`}
              onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
            >
              <Tag size={12} /> {tag}
            </button>
          ))}
        </div>
      )}

      {/* 內容 */}
      {loading ? (
        <div className={styles.loading}>載入中…</div>
      ) : notes.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📝</div>
          <div className={styles.emptyText}>
            {searchQuery || selectedTag ? '找不到符合的記事' : '還沒有記事，開始寫第一篇吧！'}
          </div>
          {!searchQuery && !selectedTag && (
            <Link href="/notes/new" className={styles.addBtn}>
              <Plus size={16} /> 新增記事
            </Link>
          )}
        </div>
      ) : (
        <div className={styles.grid}>
          {notes.map((note) => (
            <Link
              key={note.id}
              href={`/notes/${note.id}`}
              className={styles.card}
            >
              {note.color && (
                <div
                  className={styles.cardColorBar}
                  style={{ backgroundColor: note.color }}
                />
              )}
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>{note.title}</div>
                <div className={styles.cardBadges}>
                  {note.pinned && (
                    <span className={styles.pinnedBadge} title="已置頂">
                      <Pin size={14} />
                    </span>
                  )}
                  <span className={styles.visibilityIcon} title={
                    note.visibility === 'PRIVATE' ? '僅自己' :
                    note.visibility === 'FAMILY' ? '全家人' : '指定家人'
                  }>
                    {getVisibilityIcon(note.visibility)}
                  </span>
                </div>
              </div>

              {note.content && (
                <div className={styles.cardPreview}>
                  {stripMarkdown(note.content).slice(0, 100)}
                </div>
              )}

              {note.tags.length > 0 && (
                <div className={styles.cardTags}>
                  {note.tags.slice(0, 3).map((t) => (
                    <span key={t.id} className={styles.cardTag}>
                      {t.name}
                    </span>
                  ))}
                  {note.tags.length > 3 && (
                    <span className={styles.cardTag}>+{note.tags.length - 3}</span>
                  )}
                </div>
              )}

              <div className={styles.cardFooter}>
                <span className={styles.cardDate}>{formatDate(note.updatedAt)}</span>
                <span className={styles.cardAuthor}>{note.author.displayName}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
