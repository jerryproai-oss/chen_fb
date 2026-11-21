'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Home, Car, Star, AlertTriangle, Plus, Calendar } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { getEventDisplayColor } from '@/lib/constants/calendar-colors';
import type { FamilyEventItem } from '@/lib/types';
import HelpGuide from '@/components/ui/HelpGuide';
import { bulletinHelp } from '@/lib/constants/help-content';
import styles from './page.module.css';

// ── 常數 ────────────────────────────────────────────────────

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

type TabType = 'all' | 'car';

type RangeType = '14' | '30' | '90' | '365';

const RANGE_OPTIONS: { value: RangeType; label: string }[] = [
  { value: '14', label: '二週' },
  { value: '30', label: '一個月' },
  { value: '90', label: '一季' },
  { value: '365', label: '一年' },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 格式化日期為 "10/28（一）" */
function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d}（${WEEKDAYS[date.getDay()]}）`;
}

/** 格式化日期為 "2026/10/28（一）" */
function formatFullDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${y}/${pad2(m)}/${pad2(d)}（${WEEKDAYS[date.getDay()]}）`;
}

/** 判斷是否為今天 */
function isToday(dateStr: string): boolean {
  const now = new Date();
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  return dateStr === today;
}

// ── 主頁面 ──────────────────────────────────────────────────

interface BulletinData {
  events: FamilyEventItem[];
  importantEvents: FamilyEventItem[];
  carSchedule: FamilyEventItem[];
  carConflicts: Array<{ date: string; events: FamilyEventItem[] }>;
}

export default function BulletinPage() {
  const [data, setData] = useState<BulletinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [range, setRange] = useState<RangeType>('14');

  useEffect(() => {
    let cancelled = false;
    async function fetchBulletin() {
      setLoading(true);
      try {
        const res = await fetch(`/api/bulletin?days=${range}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.error('Failed to load bulletin:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchBulletin();
    return () => { cancelled = true; };
  }, [range]);

  // 衝突日期 Set
  const conflictDates = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.carConflicts.map((c) => c.date));
  }, [data]);

  // 按日期分組（多日事件只顯示在起始日）
  const groupedEvents = useMemo(() => {
    if (!data) return {};
    const source = activeTab === 'car' ? data.carSchedule : data.events;
    // 多日事件只歸入 eventDate（起始日），不拆天
    const groups: Record<string, FamilyEventItem[]> = {};
    // 追蹤已出現的多日事件 ID，避免重複
    const seenMultiDay = new Set<string>();
    for (const ev of source) {
      // 如果已處理過的多日事件（同 ID 或相同標題/日期範圍），跳過
      if (ev.endDate && ev.endDate !== ev.eventDate) {
        const dedupeKey = `${ev.title}|${ev.eventDate}|${ev.endDate}`;
        if (seenMultiDay.has(dedupeKey)) continue;
        seenMultiDay.add(dedupeKey);
      }
      if (!groups[ev.eventDate]) groups[ev.eventDate] = [];
      groups[ev.eventDate].push(ev);
    }
    return groups;
  }, [data, activeTab]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedEvents).sort();
  }, [groupedEvents]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入首頁…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入失敗，請稍後重試</div>
      </div>
    );
  }

  const totalCount = data.events.length;
  const carCount = data.carSchedule.length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <Home size={24} />
          首頁
          <HelpGuide content={bulletinHelp} />
        </h1>
        <p className={styles.pageSubtitle}>
          {RANGE_OPTIONS.find((r) => r.value === range)?.label || '未來'}的重要行程與用車排程一覽
        </p>
      </div>

      {/* 快捷分享入口 */}
      <Link href="/shares" className={styles.quickShareLink}>
        📌 快捷分享 — 分享網址、位置、備忘給家人
      </Link>

      {/* 時間範圍選擇 */}
      <div className={styles.rangeSelector}>
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`${styles.rangeBtn} ${range === opt.value ? styles.rangeBtnActive : ''}`}
            onClick={() => setRange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'all' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('all')}
        >
          全部
          <span className={styles.tabCount}>{totalCount}</span>
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'car' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('car')}
        >
          <Car size={16} />
          用車排程
          <span className={styles.tabCount}>{carCount}</span>
        </button>
      </div>

      {/* 衝突警示 */}
      {data.carConflicts.length > 0 && activeTab === 'all' && (
        <div style={{ marginBottom: 'var(--space-md)' }}>
          {data.carConflicts.map((conflict) => (
            <div
              key={conflict.date}
              className={styles.eventCard}
              style={{
                borderLeft: '4px solid var(--color-error)',
                background: 'rgba(213, 0, 0, 0.04)',
                marginBottom: 'var(--space-xs)',
              }}
            >
              <div className={styles.eventIcon}>⚠️</div>
              <div className={styles.eventInfo}>
                <div className={styles.eventTitle} style={{ color: 'var(--color-error)' }}>
                  {formatShortDate(conflict.date)} 用車衝突！
                </div>
                <div className={styles.eventMeta}>
                  {conflict.events.map((ev) => (
                    <span key={ev.id}>
                      {ev.author.displayName}
                      {ev.eventTime ? ` ${ev.eventTime}` : ''}
                      {' '}
                      {ev.title}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 事件列表 */}
      {sortedDates.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            {activeTab === 'car' ? '🚗' : '📋'}
          </div>
          <div className={styles.emptyText}>
            {activeTab === 'car'
              ? `${RANGE_OPTIONS.find((r) => r.value === range)?.label || '此期間'}內沒有用車排程`
              : `${RANGE_OPTIONS.find((r) => r.value === range)?.label || '此期間'}內沒有重要行程或用車排程`}
          </div>
        </div>
      ) : (
        sortedDates.map((date) => {
          const eventsForDate = groupedEvents[date];
          const hasConflict = conflictDates.has(date) && eventsForDate.some((e) => e.needsCar);
          const todayFlag = isToday(date);

          return (
            <div key={date} className={styles.dateGroup}>
              <div
                className={`${styles.dateGroupHeader} ${hasConflict ? styles.dateGroupHeaderConflict : ''}`}
              >
                <Calendar size={14} />
                {formatFullDate(date)}
                {todayFlag && <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>（今天）</span>}
                {hasConflict && (
                  <span className={styles.conflictWarning}>
                    <AlertTriangle size={12} />
                    用車衝突
                  </span>
                )}
              </div>

              {eventsForDate.map((ev) => (
                <Link
                  key={ev.id}
                  href={`/calendar?date=${ev.eventDate}`}
                  className={styles.eventCard}
                  style={{
                    textDecoration: 'none',
                    borderLeftColor: getEventDisplayColor({
                      needsCar: ev.needsCar,
                      id: ev.id,
                      color: ev.color,
                      authorCalendarColor: ev.author?.calendarColor,
                    }),
                  }}
                >
                  <div className={styles.eventIcon}>
                    {ev.needsCar && ev.isImportant ? '🚗⭐' : ev.needsCar ? '🚗' : '⭐'}
                  </div>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventTitle}>{ev.title}</div>
                    <div className={styles.eventMeta}>
                      {!ev.isAllDay && ev.eventTime && (
                        <span>
                          {ev.eventTime}
                          {ev.endTime ? ` — ${ev.endTime}` : ''}
                        </span>
                      )}
                      {ev.isAllDay && !ev.endDate && <span>全天</span>}
                      {ev.isAllDay && ev.endDate && (
                        <span>
                          {formatShortDate(ev.eventDate)} ~ {formatShortDate(ev.endDate)}
                        </span>
                      )}
                      {ev.location && <span>📍 {ev.location}</span>}
                      {ev.needsCar && (
                        <span className={`${styles.eventBadge} ${styles.carBadge}`}>
                          <Car size={11} /> 用車
                        </span>
                      )}
                      {ev.isImportant && (
                        <span className={`${styles.eventBadge} ${styles.importantBadge}`}>
                          <Star size={11} /> 重要
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.eventAuthor}>
                    <Avatar
                      name={ev.author.displayName}
                      avatarUrl={ev.author.avatarUrl}
                      size="sm"
                    />
                    <span className={styles.eventAuthorName}>
                      {ev.author.displayName}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          );
        })
      )}

      {/* FAB → 跳到行事曆新增 */}
      <Link href="/calendar" className={styles.fab}>
        <Plus size={18} />
        新增行程
      </Link>
    </div>
  );
}
