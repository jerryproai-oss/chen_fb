'use client';

import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Clock, ExternalLink } from 'lucide-react';
import type { PollData, PollOptionItem } from '@/lib/types';
import styles from './PollDetail.module.css';

interface PollDetailProps {
  postId: string;
}

/**
 * 投票詳情元件 — 顯示在貼文詳情頁
 * 顯示投票選項、結果長條圖、百分比、投票人
 * 支援投票/取消投票
 */
export default function PollDetail({ postId }: PollDetailProps) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const fetchPoll = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${postId}/poll`);
      if (res.status === 404) {
        setPoll(null);
        return;
      }
      if (!res.ok) throw new Error('載入投票失敗');
      const data = await res.json();
      setPoll(data.poll);
      setSelected(new Set(data.poll.myVotes ?? []));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchPoll();
  }, [fetchPoll]);

  if (loading) return null;
  if (!poll) return null;

  const hasVoted = poll.myVotes.length > 0;

  async function handleVote() {
    if (selected.size === 0 || voting) return;
    setVoting(true);
    setError('');

    try {
      const res = await fetch(`/api/posts/${postId}/poll/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionIds: [...selected] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '投票失敗');
      }
      await fetchPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '投票失敗');
    } finally {
      setVoting(false);
    }
  }

  async function handleUnvote() {
    if (voting) return;
    setVoting(true);
    setError('');

    try {
      const res = await fetch(`/api/posts/${postId}/poll/vote`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('取消投票失敗');
      await fetchPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消投票失敗');
    } finally {
      setVoting(false);
    }
  }

  function toggleOption(optionId: string) {
    if (poll!.isExpired) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        if (!poll!.multiSelect) {
          next.clear();
        }
        next.add(optionId);
      }
      return next;
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <BarChart3 size={16} />
        <span className={styles.question}>{poll.question}</span>
      </div>

      {poll.endsAt && (
        <div className={styles.deadline}>
          <Clock size={12} />
          {poll.isExpired
            ? '投票已截止'
            : `截止：${formatDateTime(poll.endsAt)}`}
        </div>
      )}

      <div className={styles.options}>
        {poll.options.map((opt) => (
          <OptionCard
            key={opt.id}
            option={opt}
            isSelected={selected.has(opt.id)}
            isExpired={poll.isExpired}
            totalVotes={poll.totalVotes}
            multiSelect={poll.multiSelect}
            onToggle={() => toggleOption(opt.id)}
          />
        ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.totalVotes}>
          {poll.totalVotes} 人投票
          {poll.multiSelect && ' · 可多選'}
        </span>

        {error && <span className={styles.error}>{error}</span>}

        {!poll.isExpired && (
          <div className={styles.actions}>
            {hasVoted ? (
              <button
                type="button"
                className={styles.unvoteBtn}
                onClick={handleUnvote}
                disabled={voting}
              >
                {voting ? '處理中…' : '取消投票'}
              </button>
            ) : (
              <button
                type="button"
                className={styles.voteBtn}
                onClick={handleVote}
                disabled={voting || selected.size === 0}
              >
                {voting ? '投票中…' : '投票'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OptionCard({
  option,
  isSelected,
  isExpired,
  totalVotes,
  multiSelect,
  onToggle,
}: {
  option: PollOptionItem;
  isSelected: boolean;
  isExpired: boolean;
  totalVotes: number;
  multiSelect: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`${styles.option} ${isSelected ? styles.optionSelected : ''} ${isExpired ? styles.optionExpired : ''}`}
      onClick={isExpired ? undefined : onToggle}
      role={isExpired ? undefined : 'button'}
      tabIndex={isExpired ? undefined : 0}
      onKeyDown={isExpired ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
    >
      {/* 進度條背景 */}
      <div
        className={styles.progressBar}
        style={{ width: `${option.percentage}%` }}
      />

      <div className={styles.optionContent}>
        <div className={styles.optionLeft}>
          {!isExpired && (
            <span className={styles.optionCheckbox}>
              {multiSelect
                ? (isSelected ? '☑' : '☐')
                : (isSelected ? '◉' : '○')
              }
            </span>
          )}
          <div className={styles.optionInfo}>
            <span className={styles.optionText}>{option.text}</span>
            {option.description && (
              <span className={styles.optionDesc}>{option.description}</span>
            )}
            {option.linkUrl && (
              <a
                href={option.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.optionLink}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={12} />
                查看連結
              </a>
            )}
          </div>
        </div>

        <div className={styles.optionRight}>
          <span className={styles.optionPercent}>{option.percentage}%</span>
          <span className={styles.optionCount}>({option.voteCount})</span>
        </div>
      </div>

      {/* 圖片 */}
      {option.imageUrl && (
        <div className={styles.optionImage}>
          <img src={option.imageUrl} alt={option.text} loading="lazy" />
        </div>
      )}

      {/* 投票人列表 */}
      {option.voters.length > 0 && (
        <div className={styles.voters}>
          {option.voters.join('、')}
        </div>
      )}
    </div>
  );
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
