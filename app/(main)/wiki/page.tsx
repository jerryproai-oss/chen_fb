'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, Lock, Users, Eye, Pin, FileText } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import HelpGuide from '@/components/ui/HelpGuide';
import { wikiHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── 類別定義 ──────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: '全部' },
  { value: '技術指引', label: '技術指引' },
  { value: '操作手冊', label: '操作手冊' },
  { value: '知識庫', label: '知識庫' },
  { value: '公告', label: '公告' },
  { value: '其他', label: '其他' },
];

// ── 型別定義 ──────────────────────────────────────────────────

interface WikiPageItem {
  id: string;
  slug: string;
  title: string;
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

// ── 輔助函式 ──────────────────────────────────────────────────

function getVisibilityIcon(visibility: string) {
  switch (visibility) {
    case 'PRIVATE':
      return <Lock size={14} />;
    case 'SELECTED':
      return <Users size={14} />;
    default:
      return <Eye size={14} />;
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Main Component ────────────────────────────────────────────

export default function WikiListPage() {
  const [pages, setPages] = useState<WikiPageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────

  const fetchPages = useCallback(async (loadMore = false) => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      params.set('limit', '20');
      if (loadMore && cursor) params.set('cursor', cursor);

      const res = await fetch(`/api/wiki/pages?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const newPages: WikiPageItem[] = data.pages || [];
        if (loadMore) {
          setPages((prev) => [...prev, ...newPages]);
        } else {
          setPages(newPages);
        }
        setCursor(data.nextCursor || null);
        setHasMore(!!data.nextCursor);
      }
    } catch {
      /* ignore */
    }
  }, [search, category, cursor]);

  useEffect(() => {
    setLoading(true);
    setCursor(null);
    setHasMore(false);
    // 重置 cursor 後 fetch
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    params.set('limit', '20');

    fetch(`/api/wiki/pages?${params.toString()}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setPages(data.pages || []);
          setCursor(data.nextCursor || null);
          setHasMore(!!data.nextCursor);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, category]);

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchPages(true);
    setLoadingMore(false);
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerRow}>
          <h1 className={styles.pageTitle}>
            <FileText size={28} />
            知識庫
            <HelpGuide content={wikiHelp} />
          </h1>
          <Link href="/wiki/new" className={styles.addBtn}>
            <Plus size={16} />
            新增文件
          </Link>
        </div>
        <p className={styles.pageSubtitle}>家庭共享的知識管理空間</p>
      </div>

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋文件標題或內容..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category Tabs */}
      <div className={styles.tabRow}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            className={`${styles.tabBtn} ${category === cat.value ? styles.tabBtnActive : ''}`}
            onClick={() => setCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.loading}>載入中...</div>
      ) : pages.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><FileText size={48} /></div>
          <div className={styles.emptyText}>
            {search || category ? '找不到符合條件的文件' : '尚無文件'}
          </div>
          {!search && !category && (
            <Link href="/wiki/new" className={styles.addBtn}>
              <Plus size={16} />
              建立第一篇文件
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {pages.map((page) => (
              <Link
                key={page.id}
                href={`/wiki/${page.slug}`}
                className={styles.card}
              >
                <div className={styles.cardHeader}>
                  <span className={styles.cardTitle}>{page.title}</span>
                  <div className={styles.cardBadges}>
                    {page.pinned && (
                      <span className={styles.pinnedBadge} title="已置頂">
                        <Pin size={14} />
                      </span>
                    )}
                    <span className={styles.visibilityIcon} title={
                      page.visibility === 'PRIVATE' ? '僅自己' :
                      page.visibility === 'SELECTED' ? '指定家人' : '家人可見'
                    }>
                      {getVisibilityIcon(page.visibility)}
                    </span>
                  </div>
                </div>
                {page.category && (
                  <span className={styles.categoryBadge}>{page.category}</span>
                )}
                <div className={styles.cardFooter}>
                  <div className={styles.authorInfo}>
                    <Avatar
                      avatarUrl={page.author.avatarUrl}
                      name={page.author.displayName}
                      size="sm"
                    />
                    <span className={styles.authorName}>{page.author.displayName}</span>
                  </div>
                  <span className={styles.cardDate}>
                    {formatDate(page.updatedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Load More */}
          {hasMore && (
            <div className={styles.loadMoreRow}>
              <button
                type="button"
                className={styles.loadMoreBtn}
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? '載入中...' : '載入更多'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
