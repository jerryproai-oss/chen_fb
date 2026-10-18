'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Repeat,
  Pencil,
  Trash2,
  X,
  Calendar as CalendarIcon,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type { FamilyEventItem, UserProfile } from '@/lib/types';
import styles from './page.module.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function padZero(num: number): string {
  return String(num).padStart(2, '0');
}

export default function CalendarPage() {
  const now = new Date();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState<string>(
    `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`,
  );

  const [events, setEvents] = useState<FamilyEventItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEventItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formIsAllDay, setFormIsAllDay] = useState(true);
  const [formTime, setFormTime] = useState('09:00');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurringType, setFormRecurringType] = useState<'YEARLY' | 'MONTHLY' | 'WEEKLY'>('YEARLY');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 取得目前使用者
  useEffect(() => {
    fetch('/api/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setCurrentUser(data);
      })
      .catch(() => {});
  }, []);

  // 取得當月行事曆事件
  const fetchMonthEvents = useCallback(async (year: number, month: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthEvents(currentYear, currentMonth);
  }, [currentYear, currentMonth, fetchMonthEvents]);

  // 切換月份
  function handlePrevMonth() {
    if (currentMonth === 1) {
      setCurrentYear((prev) => prev - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 12) {
      setCurrentYear((prev) => prev + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  }

  function handleToday() {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDate(`${y}-${padZero(m)}-${padZero(d)}`);
  }

  // 開啟建立 Modal
  function handleOpenCreateModal(dateStr?: string) {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(dateStr || selectedDate);
    setFormIsAllDay(true);
    setFormTime('09:00');
    setFormIsRecurring(false);
    setFormRecurringType('YEARLY');
    setFormDescription('');
    setIsModalOpen(true);
  }

  // 開啟編輯 Modal
  function handleOpenEditModal(event: FamilyEventItem) {
    // 若為虛擬展開的週循環事件 (id 含有底線)，取原始事件 id
    const realId = event.id.split('_')[0];
    setEditingEvent({ ...event, id: realId });
    setFormTitle(event.title);
    setFormDate(event.eventDate);
    setFormIsAllDay(event.isAllDay);
    setFormTime(event.eventTime || '09:00');
    setFormIsRecurring(event.isRecurring);
    setFormRecurringType((event.recurringType as 'YEARLY' | 'MONTHLY' | 'WEEKLY') || 'YEARLY');
    setFormDescription(event.description || '');
    setIsModalOpen(true);
  }

  // 儲存事件 (建立或編輯)
  async function handleSubmitEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formDate) {
      alert('請填寫標題與日期');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: formTitle.trim(),
        eventDate: formDate,
        isAllDay: formIsAllDay,
        eventTime: formIsAllDay ? null : formTime,
        isRecurring: formIsRecurring,
        recurringType: formIsRecurring ? formRecurringType : null,
        description: formDescription.trim() || null,
      };

      let res: Response;
      if (editingEvent) {
        res = await fetch(`/api/calendar/${editingEvent.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/calendar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '儲存事件失敗');
      }

      setIsModalOpen(false);
      await fetchMonthEvents(currentYear, currentMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSubmitting(false);
    }
  }

  // 刪除事件
  async function handleDeleteEvent(event: FamilyEventItem) {
    const realId = event.id.split('_')[0];
    if (!window.confirm(`確定要刪除「${event.title}」嗎？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/calendar/${realId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '刪除失敗');
      }
      await fetchMonthEvents(currentYear, currentMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    }
  }

  // ── 計算月曆網格 ──────────────────────────────────────────
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay(); // 0(Sun) - 6(Sat)
  const daysInPrevMonth = new Date(currentYear, currentMonth - 1, 0).getDate();

  const prevMonthCells: number[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    prevMonthCells.push(daysInPrevMonth - i);
  }

  const currentMonthCells: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthCells.push(d);
  }

  const totalSlotsSoFar = prevMonthCells.length + currentMonthCells.length;
  const trailingCount = (7 - (totalSlotsSoFar % 7)) % 7;
  const nextMonthCells: number[] = [];
  for (let i = 1; i <= trailingCount; i++) {
    nextMonthCells.push(i);
  }

  const todayStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;

  // 當前選取日期的事件列表
  const dayEvents = events.filter((ev) => ev.eventDate === selectedDate);

  // 格式化選取日期的標題
  const selectedDateParts = selectedDate.split('-');
  const selectedDateTitle =
    selectedDateParts.length >= 3
      ? `${selectedDateParts[0]}年${parseInt(selectedDateParts[1], 10)}月${parseInt(selectedDateParts[2], 10)}日`
      : selectedDate;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>家庭行事曆</h1>
        <p className={styles.pageSubtitle}>掌握家人的重要日子與行程安排</p>
      </div>

      {/* ── 月份導航 ─────────────────────────────────────── */}
      <div className={styles.navRow}>
        <div className={styles.navTitle}>
          <CalendarIcon size={20} color="var(--color-primary)" />
          {currentYear}年 {currentMonth}月
        </div>
        <div className={styles.navControls}>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={handleToday}
            aria-label="跳至今天"
          >
            今天
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={handlePrevMonth}
            aria-label="上個月"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            className={styles.navBtn}
            onClick={handleNextMonth}
            aria-label="下個月"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* ── 月曆卡片 ─────────────────────────────────────── */}
      <div className={styles.calendarCard}>
        {/* 星期標頭 */}
        <div className={styles.weekdaysGrid}>
          {WEEKDAYS.map((day, idx) => (
            <div
              key={day}
              className={`${styles.weekdayHeader} ${
                idx === 0 ? styles.weekdaySunday : idx === 6 ? styles.weekdaySaturday : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 日期網格 */}
        <div className={styles.daysGrid}>
          {/* 上個月的補齊格子 */}
          {prevMonthCells.map((day) => (
            <div
              key={`prev-${day}`}
              className={`${styles.dayCell} ${styles.dayDisabled}`}
              aria-hidden="true"
            >
              {day}
            </div>
          ))}

          {/* 當月日期格子 */}
          {currentMonthCells.map((day) => {
            const dateStr = `${currentYear}-${padZero(currentMonth)}-${padZero(day)}`;
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasEvents = events.some((e) => e.eventDate === dateStr);

            return (
              <button
                key={dateStr}
                type="button"
                className={`${styles.dayCell} ${isToday ? styles.dayToday : ''} ${
                  isSelected ? styles.daySelected : ''
                }`}
                onClick={() => setSelectedDate(dateStr)}
                aria-label={`${currentYear}年${currentMonth}月${day}日${hasEvents ? '，有事件' : ''}`}
              >
                <span>{day}</span>
                {hasEvents && (
                  <div className={styles.dotsRow}>
                    <span className={styles.dot} />
                  </div>
                )}
              </button>
            );
          })}

          {/* 下個月的補齊格子 */}
          {nextMonthCells.map((day) => (
            <div
              key={`next-${day}`}
              className={`${styles.dayCell} ${styles.dayDisabled}`}
              aria-hidden="true"
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* ── 當日事件列表 ─────────────────────────────────── */}
      <section className={styles.eventsSection}>
        <div className={styles.eventsSectionHeader}>
          <h2 className={styles.eventsSectionTitle}>
            {selectedDateTitle} 行程 ({dayEvents.length})
          </h2>
          <button
            type="button"
            className={styles.todayBtn}
            onClick={() => handleOpenCreateModal(selectedDate)}
          >
            + 新增行程
          </button>
        </div>

        {loading ? (
          <div className={styles.loading}>載入行程中…</div>
        ) : dayEvents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📅</div>
            <div className={styles.emptyText}>本日尚無安排行程</div>
          </div>
        ) : (
          <div className={styles.eventsList}>
            {dayEvents.map((event) => {
              const isOwner = currentUser && currentUser.id === event.authorId;
              return (
                <div key={event.id} className={styles.eventCard}>
                  <div className={styles.eventMetaRow}>
                    <div className={styles.eventBadges}>
                      <span className={styles.timeBadge}>
                        <Clock size={12} />
                        {event.isAllDay ? '全天' : event.eventTime || '未定時'}
                      </span>
                      {event.isRecurring && (
                        <span className={styles.recurringBadge}>
                          <Repeat size={12} />
                          {event.recurringType === 'YEARLY'
                            ? '每年重複'
                            : event.recurringType === 'MONTHLY'
                            ? '每月重複'
                            : event.recurringType === 'WEEKLY'
                            ? '每週重複'
                            : '定期重複'}
                        </span>
                      )}
                    </div>

                    {isOwner && (
                      <div className={styles.eventActions}>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleOpenEditModal(event)}
                          aria-label="編輯事件"
                          title="編輯"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                          onClick={() => handleDeleteEvent(event)}
                          aria-label="刪除事件"
                          title="刪除"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={styles.eventTitle}>{event.title}</div>
                  {event.description && (
                    <div className={styles.eventDescription}>{event.description}</div>
                  )}

                  <div className={styles.eventAuthorRow}>
                    <Avatar
                      name={event.author.displayName}
                      avatarUrl={event.author.avatarUrl}
                      size="sm"
                    />
                    <span>由 {event.author.displayName} 建立</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 右下角浮動按鈕 (FAB) ─────────────────────────── */}
      <button
        type="button"
        className={styles.fab}
        onClick={() => handleOpenCreateModal()}
        aria-label="建立新事件"
      >
        <Plus size={24} />
      </button>

      {/* ── 建立/編輯事件 Modal ───────────────────────────── */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className={styles.modalContent} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {editingEvent ? '編輯行事曆事件' : '新增行事曆事件'}
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsModalOpen(false)}
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitEvent}>
              {/* 標題 */}
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="event-title">
                  事件標題 *
                </label>
                <input
                  id="event-title"
                  type="text"
                  className={styles.input}
                  placeholder="如：家庭聚餐、小明生日、露營旅行"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              {/* 日期 */}
              <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.label} htmlFor="event-date">
                  日期 *
                </label>
                <input
                  id="event-date"
                  type="date"
                  className={styles.input}
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              {/* 全天開關 */}
              <div style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={formIsAllDay}
                    onChange={(e) => setFormIsAllDay(e.target.checked)}
                  />
                  <span className={styles.checkboxLabel}>整天事件</span>
                </label>
              </div>

              {/* 非全天：時間輸入 */}
              {!formIsAllDay && (
                <div className={styles.formGroup} style={{ marginTop: 'var(--space-xs)' }}>
                  <label className={styles.label} htmlFor="event-time">
                    時間 (HH:mm)
                  </label>
                  <input
                    id="event-time"
                    type="time"
                    className={styles.input}
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                  />
                </div>
              )}

              {/* 循環開關 */}
              <div style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={formIsRecurring}
                    onChange={(e) => setFormIsRecurring(e.target.checked)}
                  />
                  <span className={styles.checkboxLabel}>週期性循環事件</span>
                </label>
              </div>

              {/* 循環類型 */}
              {formIsRecurring && (
                <div className={styles.formGroup} style={{ marginTop: 'var(--space-xs)' }}>
                  <label className={styles.label} htmlFor="recurring-type">
                    重複頻率
                  </label>
                  <select
                    id="recurring-type"
                    className={styles.select}
                    value={formRecurringType}
                    onChange={(e) =>
                      setFormRecurringType(
                        e.target.value as 'YEARLY' | 'MONTHLY' | 'WEEKLY',
                      )
                    }
                  >
                    <option value="YEARLY">每年重複（如：生日、紀念日）</option>
                    <option value="MONTHLY">每月重複（如：繳費日、定期家庭日）</option>
                    <option value="WEEKLY">每週重複（如：每週運動、家庭聚會）</option>
                  </select>
                </div>
              )}

              {/* 描述 */}
              <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.label} htmlFor="event-desc">
                  描述或備註（選填）
                </label>
                <textarea
                  id="event-desc"
                  className={styles.textarea}
                  placeholder="備註地點、注意事項等細節"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* 表單按鈕 */}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={submitting}
                >
                  {submitting ? '儲存中…' : '儲存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
