'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Clock, Trash2 } from 'lucide-react';
import PostCard from '@/components/post/PostCard';
import type { PostSummary, SearchScope } from '@/lib/types';
import styles from './page.module.css';

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'journal', label: '手札' },
  { value: 'family', label: '家庭' },
];

const STORAGE_KEY = 'shiri_recent_searches';

/**
 * 搜尋頁面
 * 包含頂部搜尋欄、範圍選擇器、300ms debounce 搜尋、
 * 最近搜尋記錄（localStorage 最多 5 筆）與無限滾動結果
 */
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 讀取最近搜尋
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentSearches(parsed.slice(0, 5));
        }
      }
    } catch {
      // 忽略 localStorage 錯誤
    }
  }, []);

  // 儲存最近搜尋
  const saveRecentSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const updated = [trimmed, ...prev.filter((t) => t !== trimmed)].slice(0, 5);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // 忽略 localStorage 錯誤
      }
      return updated;
    });
  }, []);

  // 移除單筆最近搜尋
  const removeRecentSearch = (e: React.MouseEvent, term: string) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((t) => t !== term);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // 忽略 localStorage 錯誤
      }
      return updated;
    });
  };

  // 清除所有最近搜尋
  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略 localStorage 錯誤
    }
  };

  // 搜尋函數
  const performSearch = useCallback(
    async (searchQuery: string, searchScope: SearchScope, cursorParam?: string | null) => {
      const trimmed = searchQuery.trim();
      if (!trimmed) {
        setPosts([]);
        setCursor(null);
        setHasMore(false);
        setHasSearched(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: trimmed,
          scope: searchScope,
          limit: '20',
        });
        if (cursorParam) params.set('cursor', cursorParam);

        const res = await fetch(`/api/search?${params}`);
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();

        setPosts((prev) => (cursorParam ? [...prev, ...data.posts] : data.posts));
        setCursor(data.nextCursor);
        setHasMore(data.hasMore ?? data.nextCursor !== null);
        setHasSearched(true);
        saveRecentSearch(trimmed);
      } catch (err) {
        console.error('Failed to search posts:', err);
      } finally {
        setLoading(false);
      }
    },
    [saveRecentSearch],
  );

  // 300ms Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query, scope);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, scope, performSearch]);

  // 無限滾動
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          performSearch(query, scope, cursor);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, query, scope, cursor, performSearch]);

  const handleClearInput = () => {
    setQuery('');
    setPosts([]);
    setHasSearched(false);
    inputRef.current?.focus();
  };

  const handleSelectRecent = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  return (
    <div className={styles.container}>
      {/* 搜尋欄 */}
      <div className={styles.searchBarWrapper}>
        <div className={styles.searchBar}>
          <Search size={20} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="搜尋標題、副標題或內容…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
            autoFocus
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={handleClearInput}
              aria-label="清除搜尋內容"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Scope 範圍選擇器 */}
        <div className={styles.scopeSelector} role="tablist" aria-label="搜尋範圍">
          {SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={scope === item.value}
              className={`${styles.scopeBtn} ${scope === item.value ? styles.scopeBtnActive : ''}`}
              onClick={() => setScope(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 內容區塊 */}
      {loading && posts.length === 0 ? (
        <div className={styles.loader}>搜尋中…</div>
      ) : !query.trim() ? (
        <div className={styles.idleState}>
          {recentSearches.length > 0 && (
            <div className={styles.recentSection}>
              <div className={styles.recentHeader}>
                <span className={styles.recentTitle}>
                  <Clock size={16} />
                  最近搜尋
                </span>
                <button
                  type="button"
                  className={styles.clearAllRecentBtn}
                  onClick={clearRecentSearches}
                >
                  <Trash2 size={14} />
                  清除全部
                </button>
              </div>
              <div className={styles.recentList}>
                {recentSearches.map((term) => (
                  <div
                    key={term}
                    className={styles.recentItem}
                    onClick={() => handleSelectRecent(term)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectRecent(term);
                      }
                    }}
                  >
                    <span className={styles.recentTerm}>{term}</span>
                    <button
                      type="button"
                      className={styles.removeRecentBtn}
                      onClick={(e) => removeRecentSearch(e, term)}
                      aria-label={`刪除搜尋紀錄 ${term}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <Search size={48} strokeWidth={1.5} />
            </div>
            <h2 className={styles.emptyTitle}>搜尋貼文、手札…</h2>
            <p className={styles.emptyText}>
              輸入關鍵字即可搜尋標題、副標題與手札純文字內容。
            </p>
          </div>
        </div>
      ) : hasSearched && posts.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <Search size={48} strokeWidth={1.5} />
          </div>
          <h2 className={styles.emptyTitle}>找不到相關的手札</h2>
          <p className={styles.emptyText}>
            請嘗試使用其他關鍵字或變更上方「全部 / 手札 / 家庭」的搜尋範圍。
          </p>
        </div>
      ) : (
        <div className={styles.postList}>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}

          {loading && <div className={styles.loader}>載入更多…</div>}
          {hasMore && <div ref={sentinelRef} className={styles.sentinel} />}
        </div>
      )}
    </div>
  );
}
