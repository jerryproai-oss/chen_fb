'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Send } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import HelpGuide from '@/components/ui/HelpGuide';
import { sharesHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── 型別 ────────────────────────────────────────────────────

interface ShareAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface QuickShareItem {
  id: string;
  authorId: string;
  type: 'LINK' | 'LOCATION' | 'MEMO';
  content: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  mapUrl: string | null;
  pinned: boolean;
  visibility: 'PRIVATE' | 'FAMILY';
  createdAt: string;
  author: ShareAuthor;
}

type ShareType = 'LINK' | 'LOCATION' | 'MEMO';
type FilterType = '' | 'LINK' | 'LOCATION' | 'MEMO';

// ── 相對時間 ────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '剛剛';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`;
  if (diff < 172800) return '昨天';
  return `${Math.floor(diff / 86400)} 天前`;
}

// ── 取域名 ──────────────────────────────────────────────────

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── 頁面 ────────────────────────────────────────────────────

export default function QuickSharesPage() {
  // 當前使用者
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // 分享列表
  const [shares, setShares] = useState<QuickShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('');

  // 新增分享表單
  const [createType, setCreateType] = useState<ShareType>('LINK');
  const [content, setContent] = useState('');
  const [locationTitle, setLocationTitle] = useState('');
  const [visibility, setVisibility] = useState<'FAMILY' | 'PRIVATE'>('FAMILY');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 取得當前使用者 ID
  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => setCurrentUserId(data.id))
      .catch(() => {});
  }, []);

  // 取得分享列表
  const fetchShares = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter ? `?type=${filter}` : '';
      const res = await fetch(`/api/quick-shares${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setShares(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  // 建立分享
  async function handleSubmit() {
    if (!content.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      const body: Record<string, string> = {
        type: createType,
        content: content.trim(),
        visibility,
      };
      if (createType === 'LOCATION' && locationTitle.trim()) {
        body.title = locationTitle.trim();
      }

      const res = await fetch('/api/quick-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '分享失敗');
      }

      const newShare = await res.json();
      setShares((prev) => [newShare, ...prev]);
      setContent('');
      setLocationTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '分享失敗');
    } finally {
      setSubmitting(false);
    }
  }

  // 切換置頂
  async function handleTogglePin(share: QuickShareItem) {
    try {
      const res = await fetch(`/api/quick-shares/${share.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !share.pinned }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setShares((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
          .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }),
      );
    } catch {
      // ignore
    }
  }

  // 刪除分享
  async function handleDelete(id: string) {
    if (!confirm('確定要刪除此分享？')) return;
    try {
      const res = await fetch(`/api/quick-shares/${id}`, { method: 'DELETE' });
      if (!res.ok) return;
      setShares((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // ignore
    }
  }

  return (
    <div className={styles.container}>
      <Link href="/bulletin" className={styles.backLink}>
        <ArrowLeft size={16} /> 首頁
      </Link>

      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          📌 快捷分享 <HelpGuide content={sharesHelp} />
        </h1>
        <p className={styles.subtitle}>家人間的快速分享板</p>
      </div>

      {/* ── 新增分享區 ────────────────────────────────────── */}
      <div className={styles.createCard}>
        <div className={styles.typeTabs}>
          {(['LINK', 'LOCATION', 'MEMO'] as ShareType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.typeTab} ${createType === t ? styles.typeTabActive : ''}`}
              onClick={() => { setCreateType(t); setContent(''); setLocationTitle(''); setError(''); }}
            >
              {t === 'LINK' && '🔗 網址'}
              {t === 'LOCATION' && '📍 位置'}
              {t === 'MEMO' && '📝 備忘'}
            </button>
          ))}
        </div>

        <div className={styles.inputGroup}>
          {createType === 'LINK' && (
            <input
              className={styles.input}
              type="url"
              placeholder="輸入或貼上網址…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          )}

          {createType === 'LOCATION' && (
            <>
              <input
                className={styles.input}
                type="text"
                placeholder="位置名稱（選填）"
                value={locationTitle}
                onChange={(e) => setLocationTitle(e.target.value)}
              />
              <input
                className={styles.input}
                type="text"
                placeholder="地址或店名"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              />
            </>
          )}

          {createType === 'MEMO' && (
            <textarea
              className={styles.textarea}
              placeholder="輸入備忘文字…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={500}
              rows={3}
            />
          )}
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.createFooter}>
          <button
            type="button"
            className={`${styles.visibilityToggle} ${visibility === 'FAMILY' ? styles.visibilityFamily : ''}`}
            onClick={() => setVisibility((v) => (v === 'FAMILY' ? 'PRIVATE' : 'FAMILY'))}
          >
            {visibility === 'FAMILY' ? '👨‍👩‍👧‍👦 家庭' : '🔒 私人'}
          </button>

          <button
            type="button"
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
          >
            <Send size={16} />
            {submitting ? '分享中…' : '分享'}
          </button>
        </div>
      </div>

      {/* ── 篩選 Tab ─────────────────────────────────────── */}
      <div className={styles.filterTabs}>
        {([
          { key: '' as FilterType, label: '全部' },
          { key: 'LINK' as FilterType, label: '🔗 網址' },
          { key: 'LOCATION' as FilterType, label: '📍 位置' },
          { key: 'MEMO' as FilterType, label: '📝 備忘' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${styles.filterTab} ${filter === key ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 分享列表 ─────────────────────────────────────── */}
      {loading ? (
        <div className={styles.loading}>載入中…</div>
      ) : shares.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📌</div>
          <div className={styles.emptyText}>
            {filter ? '此分類還沒有分享' : '還沒有分享，快來發第一則吧！'}
          </div>
        </div>
      ) : (
        <div className={styles.shareList}>
          {shares.map((share) => {
            const isAuthor = currentUserId === share.authorId;

            return (
              <div
                key={share.id}
                className={`${styles.shareCard} ${share.pinned ? styles.shareCardPinned : ''} ${share.type === 'MEMO' ? styles.memoCard : ''}`}
              >
                {share.pinned && <span className={styles.pinBadge}>📌</span>}

                {/* LINK */}
                {share.type === 'LINK' && (
                  <div className={styles.linkCard}>
                    {share.imageUrl && (
                      <div className={styles.linkThumb}>
                        <img
                          src={share.imageUrl}
                          alt=""
                          className={styles.linkThumbImg}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className={styles.linkInfo}>
                      <div className={styles.linkHeader}>
                        <span className={styles.linkTitle}>
                          🔗 {share.title || share.content}
                        </span>
                      </div>
                      {share.description && (
                        <div className={styles.linkDesc}>{share.description}</div>
                      )}
                      <div className={styles.linkActions}>
                        <span className={styles.linkDomain}>
                          🌐 {getDomain(share.content)}
                        </span>
                        <a
                          href={share.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.linkOpen}
                        >
                          開啟 →
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* LOCATION */}
                {share.type === 'LOCATION' && (
                  <div>
                    <div className={styles.locationTitle}>
                      📍 {share.title || share.content}
                    </div>
                    {share.title && (
                      <div className={styles.locationAddress}>{share.content}</div>
                    )}
                    {share.description && (
                      <div className={styles.locationAddress}>{share.description}</div>
                    )}
                    {share.mapUrl && (
                      <a
                        href={share.mapUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.locationNavBtn}
                      >
                        🗺️ 開啟導航
                      </a>
                    )}
                  </div>
                )}

                {/* MEMO */}
                {share.type === 'MEMO' && (
                  <div className={styles.memoContent}>
                    📝 {share.content}
                  </div>
                )}

                {/* 底部：作者 + 時間 + 操作 */}
                <div className={styles.cardFooter}>
                  <div className={styles.cardMeta}>
                    <Avatar
                      name={share.author.displayName}
                      avatarUrl={share.author.avatarUrl}
                      size="xs"
                    />
                    <span className={styles.cardAuthor}>{share.author.displayName}</span>
                    <span className={styles.cardTime}>{timeAgo(share.createdAt)}</span>
                    {share.visibility === 'PRIVATE' && (
                      <span className={styles.visibilityBadge}>🔒</span>
                    )}
                  </div>
                  {isAuthor && (
                    <div className={styles.cardActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => handleTogglePin(share)}
                        title={share.pinned ? '取消置頂' : '置頂'}
                      >
                        📌
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() => handleDelete(share.id)}
                        title="刪除"
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
