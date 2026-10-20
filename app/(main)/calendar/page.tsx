'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  MapPin,
  Check,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { solarToLunar } from '@/lib/lunar';
import type { FamilyEventItem, UserProfile } from '@/lib/types';
import styles from './page.module.css';

// ── 常數 ────────────────────────────────────────────────────

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const EVENT_COLORS = [
  { value: '#5a7a5a', label: '鼠尾草綠' },
  { value: '#d50000', label: '番茄紅' },
  { value: '#e67c73', label: '火鶴粉' },
  { value: '#f4511e', label: '橘柑橙' },
  { value: '#f6bf26', label: '香蕉黃' },
  { value: '#33b679', label: '羅勒綠' },
  { value: '#039be5', label: '孔雀藍' },
  { value: '#7986cb', label: '藍莓紫' },
  { value: '#8e24aa', label: '葡萄紫' },
  { value: '#616161', label: '石墨灰' },
  { value: '#8b6f47', label: '木棕色' },
  { value: '#3f51b5', label: '薰衣草' },
];

const RECURRING_LABELS: Record<string, string> = {
  DAILY: '每日重複',
  WEEKLY: '每週重複',
  MONTHLY: '每月重複',
  YEARLY: '每年重複',
};

type ViewMode = 'month' | 'week' | 'day';

/** 取得農曆文字標籤：初一時顯示月名，其餘顯示日名 */
function getLunarLabel(dateString: string): { text: string; isFirstDay: boolean } | null {
  const { y, m, d } = parseDateStr(dateString);
  const lunar = solarToLunar(y, m, d);
  if (!lunar) return null;
  if (lunar.day === 1) {
    return { text: lunar.monthName, isFirstDay: true };
  }
  return { text: lunar.dayName, isFirstDay: false };
}

/** 取得完整農曆日期描述 */
function getLunarFullText(dateString: string): string {
  const { y, m, d } = parseDateStr(dateString);
  const lunar = solarToLunar(y, m, d);
  if (!lunar) return '';
  return `${lunar.yearName} ${lunar.monthName}${lunar.dayName}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateStr(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function todayStr(): string {
  const n = new Date();
  return dateStr(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

function parseDateStr(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

/** 格式化日期為 "2026/10/27(二)" */
function formatFullDate(dateString: string): string {
  const { y, m, d } = parseDateStr(dateString);
  const date = new Date(y, m - 1, d);
  return `${y}/${pad2(m)}/${pad2(d)}(${WEEKDAYS[date.getDay()]})`;
}

/** 計算兩個日期之間的天數差（含首尾） */
function calcDaysBetween(startStr: string, endStr: string): number {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  const startDate = new Date(start.y, start.m - 1, start.d);
  const endDate = new Date(end.y, end.m - 1, end.d);
  return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

// 取得某一週的起始日（週日為起始）
function getWeekStart(y: number, m: number, d: number): Date {
  const date = new Date(y, m - 1, d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

// ── 主頁面 ──────────────────────────────────────────────────

export default function CalendarPage() {
  const now = new Date();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [currentYear, setCurrentYear] = useState<number>(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [viewMode, setViewMode] = useState<ViewMode>('month');

  const [events, setEvents] = useState<FamilyEventItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<FamilyEventItem | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formIsAllDay, setFormIsAllDay] = useState(true);
  const [formTime, setFormTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formIsRecurring, setFormIsRecurring] = useState(false);
  const [formRecurringType, setFormRecurringType] = useState<string>('WEEKLY');
  const [formRecurringEndDate, setFormRecurringEndDate] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formColor, setFormColor] = useState('#5a7a5a');
  const [formLocation, setFormLocation] = useState('');
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

  // ── 導航 ──────────────────────────────────────────────────

  function navigate(direction: -1 | 1) {
    if (viewMode === 'month') {
      if (direction === -1) {
        if (currentMonth === 1) { setCurrentYear(p => p - 1); setCurrentMonth(12); }
        else setCurrentMonth(p => p - 1);
      } else {
        if (currentMonth === 12) { setCurrentYear(p => p + 1); setCurrentMonth(1); }
        else setCurrentMonth(p => p + 1);
      }
    } else if (viewMode === 'week') {
      const { y, m, d } = parseDateStr(selectedDate);
      const date = new Date(y, m - 1, d + direction * 7);
      const newDate = dateStr(date.getFullYear(), date.getMonth() + 1, date.getDate());
      setSelectedDate(newDate);
      setCurrentYear(date.getFullYear());
      setCurrentMonth(date.getMonth() + 1);
    } else {
      const { y, m, d } = parseDateStr(selectedDate);
      const date = new Date(y, m - 1, d + direction);
      const newDate = dateStr(date.getFullYear(), date.getMonth() + 1, date.getDate());
      setSelectedDate(newDate);
      setCurrentYear(date.getFullYear());
      setCurrentMonth(date.getMonth() + 1);
    }
  }

  function handleToday() {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    setCurrentYear(y);
    setCurrentMonth(m);
    setSelectedDate(dateStr(y, m, d));
  }

  // ── 導航標題 ──────────────────────────────────────────────

  const navTitleText = useMemo(() => {
    if (viewMode === 'month') {
      return `${currentYear}年 ${currentMonth}月`;
    } else if (viewMode === 'week') {
      const { y, m, d } = parseDateStr(selectedDate);
      const weekStart = getWeekStart(y, m, d);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return `${weekStart.getFullYear()}年${weekStart.getMonth() + 1}月${weekStart.getDate()}日 — ${weekEnd.getMonth() + 1}月${weekEnd.getDate()}日`;
    } else {
      const { y, m, d } = parseDateStr(selectedDate);
      const date = new Date(y, m - 1, d);
      const lunarText = getLunarFullText(selectedDate);
      const base = `${y}年${m}月${d}日 ${WEEKDAYS[date.getDay()]}`;
      return lunarText ? `${base}　${lunarText}` : base;
    }
  }, [viewMode, currentYear, currentMonth, selectedDate]);

  // ── Modal 控制 ────────────────────────────────────────────

  function handleOpenCreateModal(dateValue?: string) {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(dateValue || selectedDate);
    setFormEndDate('');
    setFormIsAllDay(true);
    setFormTime('09:00');
    setFormEndTime('10:00');
    setFormIsRecurring(false);
    setFormRecurringType('WEEKLY');
    setFormRecurringEndDate('');
    setFormDescription('');
    setFormColor('#5a7a5a');
    setFormLocation('');
    setIsModalOpen(true);
  }

  function handleOpenEditModal(event: FamilyEventItem) {
    const realId = event.id.split('_')[0];
    setEditingEvent({ ...event, id: realId });
    setFormTitle(event.title);
    setFormDate(event.eventDate);
    setFormEndDate(event.endDate || '');
    setFormIsAllDay(event.isAllDay);
    setFormTime(event.eventTime || '09:00');
    setFormEndTime(event.endTime || '10:00');
    setFormIsRecurring(event.isRecurring);
    setFormRecurringType(event.recurringType || 'WEEKLY');
    setFormRecurringEndDate(event.recurringEndDate || '');
    setFormDescription(event.description || '');
    setFormColor(event.color || '#5a7a5a');
    setFormLocation(event.location || '');
    setIsModalOpen(true);
  }

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
        endDate: formEndDate || null,
        isAllDay: formIsAllDay,
        eventTime: formIsAllDay ? null : formTime,
        endTime: formIsAllDay ? null : formEndTime,
        isRecurring: formIsRecurring,
        recurringType: formIsRecurring ? formRecurringType : null,
        recurringEndDate: formIsRecurring && formRecurringEndDate ? formRecurringEndDate : null,
        description: formDescription.trim() || null,
        color: formColor,
        location: formLocation.trim() || null,
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

  async function handleDeleteEvent(event: FamilyEventItem) {
    const realId = event.id.split('_')[0];
    if (!window.confirm(`確定要刪除「${event.title}」嗎？`)) return;
    try {
      const res = await fetch(`/api/calendar/${realId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '刪除失敗');
      }
      await fetchMonthEvents(currentYear, currentMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    }
  }

  // ── 計算 ──────────────────────────────────────────────────

  const today = todayStr();

  // 月曆格子建構
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInPrevMonth = new Date(currentYear, currentMonth - 1, 0).getDate();

  const prevMonthCells: { day: number; date: string }[] = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    prevMonthCells.push({ day: d, date: dateStr(prevYear, prevMonth, d) });
  }

  const currentMonthCells: { day: number; date: string }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    currentMonthCells.push({ day: d, date: dateStr(currentYear, currentMonth, d) });
  }

  const totalSlotsSoFar = prevMonthCells.length + currentMonthCells.length;
  const trailingCount = (7 - (totalSlotsSoFar % 7)) % 7;
  const nextMonthCells: { day: number; date: string }[] = [];
  for (let i = 1; i <= trailingCount; i++) {
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    nextMonthCells.push({ day: i, date: dateStr(nextYear, nextMonth, i) });
  }

  // 建立日期→事件的 map（用於週視圖、日視圖、選取日期列表）
  const eventsByDate = useMemo(() => {
    const map: Record<string, FamilyEventItem[]> = {};
    for (const ev of events) {
      if (!map[ev.eventDate]) map[ev.eventDate] = [];
      map[ev.eventDate].push(ev);
    }
    return map;
  }, [events]);

  // ── 月視圖：多天事件橫跨計算（Google Calendar 風格） ────
  const allCells = useMemo(() => [...prevMonthCells, ...currentMonthCells, ...nextMonthCells], [prevMonthCells, currentMonthCells, nextMonthCells]);
  const weeks = useMemo(() => {
    const w: { day: number; date: string }[][] = [];
    for (let i = 0; i < allCells.length; i += 7) {
      w.push(allCells.slice(i, i + 7));
    }
    return w;
  }, [allCells]);

  // 多天事件的每週 segment
  interface EventSegment {
    event: FamilyEventItem;
    startCol: number; // 0-6 (週日=0)
    span: number;     // 跨幾格
    isStart: boolean; // 是否為事件的起始日
    isEnd: boolean;   // 是否為事件的結束日
    row: number;      // 在事件層中的垂直位置
  }

  const { weekSegments, singleEventsByDate } = useMemo(() => {
    const dateToCol = new Map<string, { weekIdx: number; col: number }>();
    weeks.forEach((week, weekIdx) => {
      week.forEach((cell, col) => {
        dateToCol.set(cell.date, { weekIdx, col });
      });
    });

    // 分離：多天事件 vs 單日事件
    const multiDayEvents: FamilyEventItem[] = [];
    const singleMap: Record<string, FamilyEventItem[]> = {};

    for (const ev of events) {
      const isMultiDay = ev.endDate && ev.endDate !== ev.eventDate;
      if (isMultiDay) {
        multiDayEvents.push(ev);
      } else {
        if (!singleMap[ev.eventDate]) singleMap[ev.eventDate] = [];
        singleMap[ev.eventDate].push(ev);
      }
    }

    // 為每週計算多天事件 segments
    const segMap: Record<number, EventSegment[]> = {};
    weeks.forEach((_, i) => { segMap[i] = []; });

    for (const ev of multiDayEvents) {
      const evStart = ev.eventDate;
      const evEnd = ev.endDate!;
      const startInfo = dateToCol.get(evStart);
      const endInfo = dateToCol.get(evEnd);
      if (!startInfo) continue;

      // 事件可能跨多週
      const firstWeek = startInfo.weekIdx;
      const lastWeek = endInfo ? endInfo.weekIdx : weeks.length - 1;

      for (let wi = firstWeek; wi <= Math.min(lastWeek, weeks.length - 1); wi++) {
        const weekStart = weeks[wi][0].date;
        const weekEnd = weeks[wi][6].date;

        const segStartDate = evStart > weekStart ? evStart : weekStart;
        const segEndDate = evEnd < weekEnd ? evEnd : weekEnd;

        const segStartInfo = dateToCol.get(segStartDate);
        const segEndInfo = dateToCol.get(segEndDate);
        if (!segStartInfo || !segEndInfo) continue;

        segMap[wi].push({
          event: ev,
          startCol: segStartInfo.col,
          span: segEndInfo.col - segStartInfo.col + 1,
          isStart: segStartDate === evStart,
          isEnd: segEndDate === evEnd,
          row: 0, // 稍後分配
        });
      }
    }

    // 分配 row（避免重疊）— 類似 Google Calendar 的貪婪演算法
    for (const wi of Object.keys(segMap)) {
      const segs = segMap[Number(wi)];
      // 依 startCol 排序，同位置則長的優先
      segs.sort((a, b) => a.startCol - b.startCol || b.span - a.span);
      const rows: number[] = []; // rows[col] = 已佔用到的最大 row
      for (const seg of segs) {
        // 找到第一個可用 row
        let row = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          let conflict = false;
          for (const other of segs) {
            if (other === seg) continue;
            if (other.row === row &&
              !(other.startCol + other.span <= seg.startCol || seg.startCol + seg.span <= other.startCol)) {
              conflict = true;
              break;
            }
          }
          if (!conflict) break;
          row++;
        }
        seg.row = row;
      }
    }

    return { weekSegments: segMap, singleEventsByDate: singleMap };
  }, [events, weeks]);

  const dayEvents = eventsByDate[selectedDate] || [];

  // 選取日期的格式化標題
  const selectedDateTitle = useMemo(() => {
    const { y, m, d } = parseDateStr(selectedDate);
    const date = new Date(y, m - 1, d);
    const lunarText = getLunarFullText(selectedDate);
    const base = `${y}年${m}月${d}日（${WEEKDAYS[date.getDay()]}）`;
    return lunarText ? `${base} ${lunarText}` : base;
  }, [selectedDate]);

  // ── 週視圖資料 ────────────────────────────────────────────

  const weekDays = useMemo(() => {
    const { y, m, d } = parseDateStr(selectedDate);
    const weekStart = getWeekStart(y, m, d);
    const days: { date: string; dayOfWeek: number; dayNum: number; monthNum: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(weekStart);
      dt.setDate(dt.getDate() + i);
      days.push({
        date: dateStr(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()),
        dayOfWeek: dt.getDay(),
        dayNum: dt.getDate(),
        monthNum: dt.getMonth() + 1,
      });
    }
    return days;
  }, [selectedDate]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // ── 渲染 ──────────────────────────────────────────────────

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>家庭行事曆</h1>
        <p className={styles.pageSubtitle}>掌握家人的重要日子與行程安排</p>
      </div>

      {/* ── 頂部控制列 ─────────────────────────────────────── */}
      <div className={styles.topControls}>
        <div className={styles.navRow}>
          <div className={styles.navTitle}>
            <CalendarIcon size={20} color="var(--color-primary)" />
            {navTitleText}
          </div>
          <div className={styles.navControls}>
            <button type="button" className={styles.todayBtn} onClick={handleToday}>
              今天
            </button>
            <button type="button" className={styles.navBtn} onClick={() => navigate(-1)} aria-label="上一頁">
              <ChevronLeft size={20} />
            </button>
            <button type="button" className={styles.navBtn} onClick={() => navigate(1)} aria-label="下一頁">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        {/* 視圖切換 */}
        <div className={styles.viewSwitcher}>
          {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`${styles.viewTab} ${viewMode === mode ? styles.viewTabActive : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode === 'month' ? '月' : mode === 'week' ? '週' : '日'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>載入行程中…</div>
      ) : (
        <>
          {/* ── 月視圖 ─────────────────────────────────────── */}
          {viewMode === 'month' && (
            <>
              <div className={styles.calendarCard}>
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

                <div className={styles.monthWeeks}>
                  {weeks.map((week, weekIdx) => {
                    const segs = weekSegments[weekIdx] || [];
                    const maxRow = segs.length > 0 ? Math.max(...segs.map(s => s.row)) + 1 : 0;
                    const segLayerHeight = maxRow * 20; // 每個 segment row 高 20px

                    return (
                      <div key={weekIdx} className={styles.weekRow}>
                        {/* 多天事件橫跨層 */}
                        {segLayerHeight > 0 && (
                          <div className={styles.weekSegmentLayer} style={{ height: segLayerHeight }}>
                            {segs.map((seg, segIdx) => (
                              <div
                                key={`${seg.event.id}-${segIdx}`}
                                className={`${styles.spanBar} ${seg.isStart ? styles.spanBarStart : ''} ${seg.isEnd ? styles.spanBarEnd : ''}`}
                                style={{
                                  backgroundColor: seg.event.color || '#5a7a5a',
                                  left: `${(seg.startCol / 7) * 100}%`,
                                  width: `${(seg.span / 7) * 100}%`,
                                  top: seg.row * 20,
                                }}
                                title={seg.event.title}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(seg.event.eventDate);
                                  handleOpenEditModal(seg.event);
                                }}
                              >
                                {seg.isStart ? seg.event.title : `${seg.event.title}`}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* 日期格子 */}
                        <div className={styles.weekDayCells}>
                          {week.map((cell) => {
                            const { m } = parseDateStr(cell.date);
                            const isCurrentMonth = m === currentMonth;
                            const isToday = cell.date === today;
                            const isSelected = cell.date === selectedDate;
                            const singleEvents = singleEventsByDate[cell.date] || [];
                            const maxShow = maxRow > 0 ? 2 : 3;
                            const lunarLabel = getLunarLabel(cell.date);

                            return (
                              <div
                                key={cell.date}
                                className={`${styles.dayCell} ${!isCurrentMonth ? styles.dayDisabled : ''}`}
                                onClick={() => {
                                  setSelectedDate(cell.date);
                                  if (!isCurrentMonth) {
                                    const { y, m: cm } = parseDateStr(cell.date);
                                    setCurrentYear(y);
                                    setCurrentMonth(cm);
                                  }
                                }}
                              >
                                <div className={styles.dayTopRow}>
                                  <span
                                    className={`${styles.dayNumber} ${isToday ? styles.dayNumberToday : ''} ${
                                      isSelected && !isToday ? styles.dayNumberSelected : ''
                                    }`}
                                  >
                                    {cell.day}
                                  </span>
                                  {lunarLabel && (
                                    <span className={`${styles.lunarDay} ${lunarLabel.isFirstDay ? styles.lunarFirstDay : ''}`}>
                                      {lunarLabel.text}
                                    </span>
                                  )}
                                </div>
                                <div className={styles.dayCellEvents}>
                                  {singleEvents.slice(0, maxShow).map((ev) => (
                                    <div
                                      key={ev.id}
                                      className={styles.eventChip}
                                      style={{ backgroundColor: ev.color || '#5a7a5a' }}
                                      title={ev.title}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(cell.date);
                                        handleOpenEditModal(ev);
                                      }}
                                    >
                                      {!ev.isAllDay && ev.eventTime ? `${ev.eventTime} ` : ''}{ev.title}
                                    </div>
                                  ))}
                                  {singleEvents.length > maxShow && (
                                    <div className={styles.moreChip}>
                                      +{singleEvents.length - maxShow} 更多
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 當日事件列表 */}
              <EventsSection
                title={selectedDateTitle}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
            </>
          )}

          {/* ── 週視圖 ─────────────────────────────────────── */}
          {viewMode === 'week' && (
            <>
              <div className={styles.weekViewContainer}>
                {/* 週標頭 */}
                <div className={styles.weekHeader}>
                  <div className={styles.weekHeaderCorner} />
                  {weekDays.map((wd) => (
                    <div key={wd.date} className={styles.weekHeaderDay}>
                      <div className={styles.weekHeaderDayName}>{WEEKDAYS[wd.dayOfWeek]}</div>
                      <div
                        className={`${styles.weekHeaderDayNum} ${wd.date === today ? styles.weekHeaderDayNumToday : ''}`}
                        onClick={() => { setSelectedDate(wd.date); setViewMode('day'); }}
                        style={{ cursor: 'pointer' }}
                      >
                        {wd.dayNum}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 全天事件列 */}
                <div className={styles.weekAllDayRow}>
                  <div className={styles.weekAllDayLabel}>全天</div>
                  {weekDays.map((wd) => {
                    const allDayEvents = (eventsByDate[wd.date] || []).filter(e => e.isAllDay);
                    return (
                      <div key={wd.date} className={styles.weekAllDayCell}>
                        {allDayEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className={styles.eventChip}
                            style={{ backgroundColor: ev.color || '#5a7a5a' }}
                            onClick={() => handleOpenEditModal(ev)}
                          >
                            {ev.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* 時間格 */}
                <div className={styles.weekTimeGrid}>
                  {hours.map((hour) => (
                    <div key={hour} className={styles.weekTimeRow}>
                      <div className={styles.weekTimeLabel}>
                        {pad2(hour)}:00
                      </div>
                      {weekDays.map((wd) => {
                        const hourStr = pad2(hour);
                        const cellEvents = (eventsByDate[wd.date] || []).filter(
                          (e) => !e.isAllDay && e.eventTime && e.eventTime.startsWith(hourStr)
                        );
                        return (
                          <div
                            key={wd.date}
                            className={styles.weekTimeCell}
                            onClick={() => {
                              setSelectedDate(wd.date);
                              handleOpenCreateModal(wd.date);
                            }}
                          >
                            {cellEvents.map((ev) => {
                              // 計算事件高度
                              const startMin = ev.eventTime ? parseInt(ev.eventTime.split(':')[1]) : 0;
                              const endHour = ev.endTime ? parseInt(ev.endTime.split(':')[0]) : hour + 1;
                              const endMin = ev.endTime ? parseInt(ev.endTime.split(':')[1]) : 0;
                              const durationMin = Math.max((endHour - hour) * 60 + endMin - startMin, 20);
                              const topPx = (startMin / 60) * 48;
                              const heightPx = Math.min((durationMin / 60) * 48, 200);

                              return (
                                <div
                                  key={ev.id}
                                  className={styles.weekTimeEvent}
                                  style={{
                                    backgroundColor: ev.color || '#5a7a5a',
                                    top: `${topPx}px`,
                                    height: `${heightPx}px`,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditModal(ev);
                                  }}
                                  title={`${ev.eventTime}${ev.endTime ? ' - ' + ev.endTime : ''} ${ev.title}`}
                                >
                                  {ev.title}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* 選取日事件列表 */}
              <EventsSection
                title={selectedDateTitle}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
            </>
          )}

          {/* ── 日視圖 ─────────────────────────────────────── */}
          {viewMode === 'day' && (
            <>
              <div className={styles.dayViewContainer}>
                <div className={styles.dayViewHeader}>
                  <div className={styles.dayViewTitle}>{selectedDateTitle}</div>
                </div>

                {/* 全天事件 */}
                {dayEvents.some(e => e.isAllDay) && (
                  <div className={styles.dayViewAllDay}>
                    <span className={styles.dayViewAllDayLabel}>全天</span>
                    {dayEvents.filter(e => e.isAllDay).map((ev) => (
                      <div
                        key={ev.id}
                        className={styles.eventChip}
                        style={{ backgroundColor: ev.color || '#5a7a5a', padding: '4px 8px' }}
                        onClick={() => handleOpenEditModal(ev)}
                      >
                        {ev.title}
                      </div>
                    ))}
                  </div>
                )}

                {/* 時間格 */}
                <div className={styles.dayViewTimeGrid}>
                  {hours.map((hour) => {
                    const hourStr = pad2(hour);
                    const hourEvents = dayEvents.filter(
                      (e) => !e.isAllDay && e.eventTime && e.eventTime.startsWith(hourStr)
                    );

                    return (
                      <div key={hour} className={styles.dayViewTimeRow}>
                        <div className={styles.dayViewTimeLabel}>
                          {hourStr}:00
                        </div>
                        <div
                          className={styles.dayViewTimeSlot}
                          onClick={() => handleOpenCreateModal(selectedDate)}
                        >
                          {hourEvents.map((ev) => (
                            <div
                              key={ev.id}
                              className={styles.dayViewTimeEvent}
                              style={{ backgroundColor: ev.color || '#5a7a5a' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(ev);
                              }}
                            >
                              <div className={styles.dayViewEventTitle}>{ev.title}</div>
                              <div className={styles.dayViewEventMeta}>
                                {ev.eventTime}{ev.endTime ? ` — ${ev.endTime}` : ''}
                                {ev.location ? ` · ${ev.location}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 完整事件列表 */}
              <EventsSection
                title={selectedDateTitle}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
            </>
          )}
        </>
      )}

      {/* ── FAB ────────────────────────────────────────────── */}
      <button
        type="button"
        className={styles.fab}
        onClick={() => handleOpenCreateModal()}
        aria-label="建立新事件"
      >
        <Plus size={24} />
      </button>

      {/* ── 建立/編輯 Modal ────────────────────────────────── */}
      {isModalOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
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
                <label className={styles.label} htmlFor="event-title">事件標題 *</label>
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

              {/* 事件顏色 */}
              <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.label}>事件顏色</label>
                <div className={styles.colorPicker}>
                  {EVENT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      className={`${styles.colorDot} ${formColor === c.value ? styles.colorDotActive : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={() => setFormColor(c.value)}
                      title={c.label}
                      aria-label={c.label}
                    >
                      {formColor === c.value && <Check size={14} className={styles.colorDotCheck} />}
                    </button>
                  ))}
                </div>
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

              {/* 日期列 */}
              <div className={styles.formRow} style={{ marginTop: 'var(--space-sm)' }}>
                <div className={styles.formGroup}>
                  <label className={styles.label} htmlFor="event-date">
                    {formIsAllDay ? '日期 *' : '開始日期 *'}
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
                {formIsAllDay ? (
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="event-end-date">結束日期</label>
                    <input
                      id="event-end-date"
                      type="date"
                      className={styles.input}
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      min={formDate}
                    />
                  </div>
                ) : (
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="event-end-date">結束日期</label>
                    <input
                      id="event-end-date"
                      type="date"
                      className={styles.input}
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      min={formDate}
                    />
                  </div>
                )}
              </div>

              {/* 時間列（非全天才顯示） */}
              {!formIsAllDay && (
                <div className={styles.formRow} style={{ marginTop: 'var(--space-xs)' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="event-time">開始時間</label>
                    <input
                      id="event-time"
                      type="time"
                      className={styles.input}
                      value={formTime}
                      onChange={(e) => setFormTime(e.target.value)}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="event-end-time">結束時間</label>
                    <input
                      id="event-end-time"
                      type="time"
                      className={styles.input}
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* 地點 */}
              <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.label} htmlFor="event-location">
                  <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  地點
                </label>
                <input
                  id="event-location"
                  type="text"
                  className={styles.input}
                  placeholder="如：家裡、大安森林公園、101 大樓"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  maxLength={200}
                />
              </div>

              {/* 循環 */}
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

              {formIsRecurring && (
                <div className={styles.formRow} style={{ marginTop: 'var(--space-xs)' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="recurring-type">重複頻率</label>
                    <select
                      id="recurring-type"
                      className={styles.select}
                      value={formRecurringType}
                      onChange={(e) => setFormRecurringType(e.target.value)}
                    >
                      <option value="DAILY">每日重複</option>
                      <option value="WEEKLY">每週重複</option>
                      <option value="MONTHLY">每月重複</option>
                      <option value="YEARLY">每年重複</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label} htmlFor="recurring-end">結束日期</label>
                    <input
                      id="recurring-end"
                      type="date"
                      className={styles.input}
                      value={formRecurringEndDate}
                      onChange={(e) => setFormRecurringEndDate(e.target.value)}
                      min={formDate}
                      placeholder="永不結束"
                    />
                  </div>
                </div>
              )}

              {/* 描述 */}
              <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.label} htmlFor="event-desc">描述或備註</label>
                <textarea
                  id="event-desc"
                  className={styles.textarea}
                  placeholder="備註地點、注意事項等細節"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {/* 按鈕 */}
              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                >
                  取消
                </button>
                <button type="submit" className={styles.saveBtn} disabled={submitting}>
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

// ── 事件列表區塊 ────────────────────────────────────────────

function EventsSection({
  title,
  events,
  currentUser,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  events: FamilyEventItem[];
  currentUser: UserProfile | null;
  onAdd: () => void;
  onEdit: (ev: FamilyEventItem) => void;
  onDelete: (ev: FamilyEventItem) => void;
}) {
  return (
    <section className={styles.eventsSection}>
      <div className={styles.eventsSectionHeader}>
        <h2 className={styles.eventsSectionTitle}>
          {title} ({events.length})
        </h2>
        <button type="button" className={styles.addEventBtn} onClick={onAdd}>
          <Plus size={14} /> 新增行程
        </button>
      </div>

      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyText}>本日尚無安排行程</div>
        </div>
      ) : (
        <div className={styles.eventsList}>
          {events.map((event) => {
            const isOwner = currentUser && currentUser.id === event.authorId;
            return (
              <div
                key={event.id}
                className={styles.eventCard}
                style={{ borderLeftColor: event.color || 'var(--color-primary)' }}
              >
                <div className={styles.eventMetaRow}>
                  <div className={styles.eventBadges}>
                    <span className={styles.timeBadge}>
                      <Clock size={12} />
                      {event.isAllDay
                        ? event.endDate && event.endDate !== event.eventDate
                          ? `${formatFullDate(event.eventDate)} 至 ${formatFullDate(event.endDate)}，共${calcDaysBetween(event.eventDate, event.endDate)}天`
                          : `全天 · ${formatFullDate(event.eventDate)}`
                        : `${formatFullDate(event.eventDate)} ${event.eventTime || '未定時'}${event.endTime ? ' — ' + event.endTime : ''}${event.endDate && event.endDate !== event.eventDate ? ` 至 ${formatFullDate(event.endDate)}` : ''}`}
                    </span>
                    {event.isRecurring && (
                      <span className={styles.recurringBadge}>
                        <Repeat size={12} />
                        {RECURRING_LABELS[event.recurringType || ''] || '定期重複'}
                      </span>
                    )}
                    {event.location && (
                      <span className={styles.locationBadge}>
                        <MapPin size={12} />
                        {event.location}
                      </span>
                    )}
                  </div>

                  {isOwner && (
                    <div className={styles.eventActions}>
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => onEdit(event)}
                        aria-label="編輯事件"
                        title="編輯"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                        onClick={() => onDelete(event)}
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
  );
}
