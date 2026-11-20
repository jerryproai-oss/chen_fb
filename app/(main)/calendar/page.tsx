'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Car,
  Star,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import { solarToLunar, getDayInfo } from '@/lib/lunar';
import { getEventDisplayColor, CAR_EVENT_COLOR } from '@/lib/constants/calendar-colors';
import type { FamilyEventItem, UserProfile } from '@/lib/types';
import HelpGuide from '@/components/ui/HelpGuide';
import WeatherWidget from '@/components/WeatherWidget';
import { calendarHelp } from '@/lib/constants/help-content';
import CarManagementPanel from '@/components/car/CarManagementPanel';
import styles from './page.module.css';

// ── 常數 ────────────────────────────────────────────────────

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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
  const [formLocation, setFormLocation] = useState('');
  const [formNeedsCar, setFormNeedsCar] = useState(false);
  const [formIsImportant, setFormIsImportant] = useState(false);
  const [carConflicts, setCarConflicts] = useState<Array<{ id: string; title: string; author: { displayName: string }; authorId: string; eventTime: string | null; endTime: string | null; isAllDay: boolean }>>([]);
  const [showCarConflictDialog, setShowCarConflictDialog] = useState(false);
  const [carConflictConfirmed, setCarConflictConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 管理員變更用車帳號
  const [formAuthorId, setFormAuthorId] = useState('');
  const [familyMembers, setFamilyMembers] = useState<Array<{ id: string; displayName: string }>>([]);

  /** 取得事件的顯示顏色（用車→固定色 / 假日→依類型 / 一般→作者色） */
  const evColor = useCallback((ev: FamilyEventItem): string => {
    return getEventDisplayColor({
      needsCar: ev.needsCar,
      id: ev.id,
      color: ev.color,
      authorCalendarColor: ev.author?.calendarColor,
    });
  }, []);

  /** 用車事件在行事曆中的顯示標題：「暱稱 用車」 */
  const evDisplayTitle = useCallback((ev: FamilyEventItem): string => {
    if (ev.needsCar && ev.author?.displayName) {
      return `${ev.author.displayName} 用車`;
    }
    return ev.title;
  }, []);

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
    setFormLocation('');
    setFormNeedsCar(false);
    setFormIsImportant(false);
    setCarConflicts([]);
    setCarConflictConfirmed(false);
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
    setFormLocation(event.location || '');
    setFormNeedsCar(event.needsCar || false);
    setFormIsImportant(event.isImportant || false);
    setCarConflicts([]);
    setCarConflictConfirmed(false);
    // 設定用車帳號（管理員編輯用車事件時使用）
    setFormAuthorId(event.authorId);
    // 管理員編輯用車事件時，載入家庭成員列表
    if (currentUser?.role === 'ADMIN' && event.needsCar) {
      fetch('/api/family/members')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.members && currentUser) {
            // 加入自己到列表中
            const allMembers = [
              { id: currentUser.id, displayName: currentUser.displayName },
              ...data.members.map((m: { id: string; displayName: string }) => ({ id: m.id, displayName: m.displayName })),
            ];
            setFamilyMembers(allMembers);
          }
        })
        .catch(() => {});
    }
    setIsModalOpen(true);
  }

  async function handleSubmitEvent(e: React.FormEvent) {
    e.preventDefault();
    // 如果勾了「需要用車」且標題為空，自動填入「暱稱 用車」
    const effectiveTitle = formTitle.trim() || (formNeedsCar && currentUser ? `${currentUser.displayName} 用車` : '');
    if (!effectiveTitle || !formDate) {
      alert('請填寫標題與日期');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: effectiveTitle,
        eventDate: formDate,
        endDate: formEndDate || null,
        isAllDay: formIsAllDay,
        eventTime: formIsAllDay ? null : formTime,
        endTime: formIsAllDay ? null : formEndTime,
        isRecurring: formIsRecurring,
        recurringType: formIsRecurring ? formRecurringType : null,
        recurringEndDate: formIsRecurring && formRecurringEndDate ? formRecurringEndDate : null,
        description: formDescription.trim() || null,
        location: formLocation.trim() || null,
        needsCar: formNeedsCar,
        isImportant: formIsImportant,
      };

      // 管理員編輯用車事件時，若變更了用車帳號，帶上 authorId
      if (editingEvent && currentUser?.role === 'ADMIN' && formNeedsCar && formAuthorId && formAuthorId !== editingEvent.authorId) {
        payload.authorId = formAuthorId;
      }

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

  const { weekSegments, singleEventsByDate, multiDayEvents } = useMemo(() => {
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

    return { weekSegments: segMap, singleEventsByDate: singleMap, multiDayEvents };
  }, [events, weeks]);

  // 取得某日期的所有事件（含跨日事件），用於 tooltip
  const getAllEventsForDate = useCallback((date: string) => {
    const singles = singleEventsByDate[date] || [];
    const multis = multiDayEvents.filter(ev => {
      return date >= ev.eventDate && date <= (ev.endDate || ev.eventDate);
    });
    return [...multis, ...singles];
  }, [singleEventsByDate, multiDayEvents]);

  const dayEvents = eventsByDate[selectedDate] || [];

  // 選取日期的格式化標題（主標題 + 農曆副標題）
  const selectedDateInfo = useMemo(() => {
    const { y, m, d } = parseDateStr(selectedDate);
    const date = new Date(y, m - 1, d);
    const lunarText = getLunarFullText(selectedDate);
    const main = `${y}年${m}月${d}日（${WEEKDAYS[date.getDay()]}）`;
    return { main, lunar: lunarText || '' };
  }, [selectedDate]);
  // 保留相容
  const selectedDateTitle = selectedDateInfo.lunar
    ? `${selectedDateInfo.main} ${selectedDateInfo.lunar}`
    : selectedDateInfo.main;

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
        <h1 className={styles.pageTitle}>家庭行事曆 <HelpGuide content={calendarHelp} /></h1>
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
            <div className={styles.calendarLayout}>
              <div className={styles.calendarPane}>
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

                    return (
                      <div key={weekIdx} className={styles.weekRow}>
                        {/* 日期格子 — 多天事件段直接渲染在每個 dayCell 內 */}
                        <div className={styles.weekDayCells}>
                          {week.map((cell, colIdx) => {
                            const { m } = parseDateStr(cell.date);
                            const isCurrentMonth = m === currentMonth;
                            const isToday = cell.date === today;
                            const isSelected = cell.date === selectedDate;
                            const singleEvents = singleEventsByDate[cell.date] || [];
                            const maxShow = maxRow > 0 ? 3 : 4;
                            const lunarLabel = getLunarLabel(cell.date);
                            const allDayEvents = getAllEventsForDate(cell.date);
                            const hasEvents = allDayEvents.length > 0;

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
                                {/* 多天事件段區（每個 row 一格） */}
                                {maxRow > 0 && (
                                  <div className={styles.segmentSlots}>
                                    {Array.from({ length: maxRow }, (_, rowIdx) => {
                                      // 找到佔用此 row + 此 col 的 segment
                                      const seg = segs.find(s =>
                                        s.row === rowIdx &&
                                        colIdx >= s.startCol &&
                                        colIdx < s.startCol + s.span
                                      );
                                      if (!seg) {
                                        // 空佔位
                                        return <div key={rowIdx} className={`${styles.segmentSlot} ${styles.segmentSlotEmpty}`} />;
                                      }
                                      const isSegStart = colIdx === seg.startCol;
                                      const isSegEnd = colIdx === seg.startCol + seg.span - 1;
                                      const isEvStart = seg.isStart && isSegStart;
                                      const isEvEnd = seg.isEnd && isSegEnd;
                                      const barClasses = [styles.spanBar, styles.segmentSlot];
                                      if (isEvStart) barClasses.push(styles.spanBarStart);
                                      if (isEvEnd) barClasses.push(styles.spanBarEnd);
                                      if (!isEvStart && !isEvEnd) barClasses.push(styles.spanBarMiddle);

                                      return (
                                        <div
                                          key={rowIdx}
                                          className={barClasses.join(' ')}
                                          style={{ backgroundColor: evColor(seg.event) }}
                                          title={evDisplayTitle(seg.event)}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedDate(seg.event.eventDate);
                                            handleOpenEditModal(seg.event);
                                          }}
                                        >
                                          {isSegStart ? evDisplayTitle(seg.event) : ''}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className={styles.dayCellEvents}>
                                  {singleEvents.slice(0, maxShow).map((ev) => (
                                    <div
                                      key={ev.id}
                                      className={styles.eventChip}
                                      style={{ backgroundColor: evColor(ev) }}
                                      title={evDisplayTitle(ev)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(cell.date);
                                        handleOpenEditModal(ev);
                                      }}
                                    >
                                      {ev.needsCar && <Car size={9} style={{ flexShrink: 0 }} />}
                                      {ev.isImportant && <Star size={9} style={{ flexShrink: 0 }} />}
                                      {!ev.isAllDay && ev.eventTime ? `${ev.eventTime} ` : ''}{evDisplayTitle(ev)}
                                    </div>
                                  ))}
                                  {singleEvents.length > maxShow && (
                                    <div className={styles.moreChip}>
                                      +{singleEvents.length - maxShow} 更多
                                    </div>
                                  )}
                                </div>
                                {/* Hover 預覽所有行程 */}
                                {hasEvents && (
                                  <div className={styles.dayTooltip}>
                                    <div className={styles.dayTooltipHeader}>
                                      {parseDateStr(cell.date).m}/{parseDateStr(cell.date).d} 行程（{allDayEvents.length}）
                                    </div>
                                    {allDayEvents.map((ev) => (
                                      <div key={ev.id} className={styles.dayTooltipItem}>
                                        <span
                                          className={styles.dayTooltipDot}
                                          style={{ backgroundColor: evColor(ev) }}
                                        />
                                        <span className={styles.dayTooltipTime}>
                                          {ev.isAllDay
                                            ? '全天'
                                            : ev.endDate && ev.endDate !== ev.eventDate
                                              ? '跨日'
                                              : ev.eventTime || ''}
                                        </span>
                                        <span className={styles.dayTooltipTitle}>{evDisplayTitle(ev)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>

              {/* 當日事件列表 — 桌面版在右側 */}
              <div className={styles.eventsPane}>
              <EventsSection
                title={selectedDateInfo.main}
                lunar={selectedDateInfo.lunar}
                selectedDate={selectedDate}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
              <CarManagementPanel onRefreshCalendar={() => fetchMonthEvents(currentYear, currentMonth)} />
              </div>
            </div>
          )}

          {/* ── 週視圖 ─────────────────────────────────────── */}
          {viewMode === 'week' && (
            <div className={styles.calendarLayout}>
              <div className={styles.calendarPane}>
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
                            style={{ backgroundColor: evColor(ev) }}
                            onClick={() => handleOpenEditModal(ev)}
                          >
                            {evDisplayTitle(ev)}
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
                                    backgroundColor: evColor(ev),
                                    top: `${topPx}px`,
                                    height: `${heightPx}px`,
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEditModal(ev);
                                  }}
                                  title={`${ev.eventTime}${ev.endTime ? ' - ' + ev.endTime : ''} ${evDisplayTitle(ev)}`}
                                >
                                  {evDisplayTitle(ev)}
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
              </div>

              {/* 選取日事件列表 */}
              <div className={styles.eventsPane}>
              <EventsSection
                title={selectedDateInfo.main}
                lunar={selectedDateInfo.lunar}
                selectedDate={selectedDate}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
              <CarManagementPanel onRefreshCalendar={() => fetchMonthEvents(currentYear, currentMonth)} />
              </div>
            </div>
          )}

          {/* ── 日視圖 ─────────────────────────────────────── */}
          {viewMode === 'day' && (
            <div className={styles.calendarLayout}>
              <div className={styles.calendarPane}>
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
                        style={{ backgroundColor: evColor(ev), padding: '4px 8px' }}
                        onClick={() => handleOpenEditModal(ev)}
                      >
                        {evDisplayTitle(ev)}
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
                              style={{ backgroundColor: evColor(ev) }}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(ev);
                              }}
                            >
                              <div className={styles.dayViewEventTitle}>{evDisplayTitle(ev)}</div>
                              <div className={styles.dayViewEventMeta}>
                                {ev.eventTime}{ev.endTime ? ` — ${ev.endTime}` : ''}
                                {ev.location ? (
                                  <>
                                    {' · '}
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={styles.locationLink}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {ev.location}
                                    </a>
                                  </>
                                ) : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              </div>

              {/* 完整事件列表 */}
              <div className={styles.eventsPane}>
              <EventsSection
                title={selectedDateInfo.main}
                lunar={selectedDateInfo.lunar}
                selectedDate={selectedDate}
                events={dayEvents}
                currentUser={currentUser}
                onAdd={() => handleOpenCreateModal(selectedDate)}
                onEdit={handleOpenEditModal}
                onDelete={handleDeleteEvent}
              />
              <CarManagementPanel onRefreshCalendar={() => fetchMonthEvents(currentYear, currentMonth)} />
              </div>
            </div>
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
                <label className={styles.label} htmlFor="event-title">
                  事件標題{formNeedsCar ? '' : ' *'}
                </label>
                <input
                  id="event-title"
                  type="text"
                  className={styles.input}
                  placeholder={formNeedsCar ? `可不填，預設為「${currentUser?.displayName || ''} 用車」` : '如：家庭聚餐、小明生日、露營旅行'}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  maxLength={100}
                  required={!formNeedsCar}
                />
              </div>

              {/* 事件顏色提示 — 依個人設定自動帶入 */}
              {currentUser?.calendarColor && (
                <div className={styles.formGroup} style={{ marginTop: 'var(--space-sm)' }}>
                  <label className={styles.label}>事件顏色</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        backgroundColor: formNeedsCar ? CAR_EVENT_COLOR : currentUser.calendarColor,
                        border: '2px solid rgba(0,0,0,0.15)',
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      {formNeedsCar ? '用車專用色（固定）' : '依個人設定（可於個人頁修改）'}
                    </span>
                  </div>
                </div>
              )}

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

              {/* 🚗 需要用車 + ⭐ 重要行程 */}
              <div style={{ marginTop: 'var(--space-sm)' }}>
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={formNeedsCar}
                    onChange={async (e) => {
                      const checked = e.target.checked;
                      if (checked && formDate) {
                        // 不論有無衝突，都彈出提醒對話框
                        try {
                          const res = await fetch(`/api/calendar/car-conflicts?date=${formDate}`);
                          if (res.ok) {
                            const conflictData = await res.json();
                            // 排除自己（編輯模式）
                            const otherConflicts = editingEvent
                              ? conflictData.conflicts.filter((c: { id: string }) => c.id !== editingEvent.id)
                              : conflictData.conflicts;
                            setCarConflicts(otherConflicts);
                          } else {
                            setCarConflicts([]);
                          }
                        } catch {
                          setCarConflicts([]);
                        }
                        // 無論查詢結果如何，都顯示確認對話框
                        setShowCarConflictDialog(true);
                        return;
                      }
                      setFormNeedsCar(checked);
                      if (!checked) {
                        setCarConflictConfirmed(false);
                        setCarConflicts([]);
                      }
                    }}
                  />
                  <span className={styles.checkboxLabel}>
                    <Car size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    需要用車
                  </span>
                </label>

                {/* 管理員：用車帳號選擇器 */}
                {editingEvent && currentUser?.role === 'ADMIN' && formNeedsCar && familyMembers.length > 0 && (
                  <div className={styles.formGroup} style={{ marginTop: 'var(--space-xs)', marginLeft: 'calc(20px + var(--space-sm))' }}>
                    <label className={styles.label} htmlFor="car-author">
                      <Car size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      用車帳號
                    </label>
                    <select
                      id="car-author"
                      className={styles.select}
                      value={formAuthorId}
                      onChange={(e) => setFormAuthorId(e.target.value)}
                    >
                      {familyMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.displayName}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 衝突靜態提示 */}
                {formNeedsCar && carConflictConfirmed && carConflicts.length > 0 && (
                  <div className={styles.carConflictHint}>
                    ⚠️ 當日{' '}
                    {carConflicts.map((c) =>
                      `${c.author.displayName}${c.isAllDay ? '' : ` ${c.eventTime || ''}${c.endTime ? '–' + c.endTime : ''}`}`
                    ).join('、')}{' '}
                    也需要用車，請注意協調
                  </div>
                )}

                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={formIsImportant}
                    onChange={(e) => setFormIsImportant(e.target.checked)}
                  />
                  <span className={styles.checkboxLabel}>
                    <Star size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    重要行程（顯示於公佈欄）
                  </span>
                </label>
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
      {/* ── 用車衝突確認對話視窗 ─────────────────────────────── */}
      {showCarConflictDialog && (
        <div
          className={styles.modalBackdrop}
          style={{ zIndex: 1100 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCarConflictDialog(false);
            }
          }}
        >
          <div className={styles.modalContent} style={{ maxWidth: 420 }} role="alertdialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Car size={20} style={{ marginRight: 6, color: '#039be5' }} />
                用車時段提醒
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowCarConflictDialog(false)}
                aria-label="關閉"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {carConflicts.length > 0 ? (
                <>
                  <p style={{ marginBottom: 'var(--space-sm)' }}>當日已有其他家人預約用車：</p>
                  {carConflicts.map((c) => (
                    <div key={c.id} style={{
                      padding: '8px 12px',
                      background: 'rgba(3, 155, 229, 0.08)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: 'var(--space-xs)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-sm)',
                    }}>
                      <Car size={16} style={{ color: '#039be5', flexShrink: 0 }} />
                      <div>
                        <strong style={{ color: 'var(--color-text)' }}>{c.author.displayName}</strong>
                        {' '}
                        {c.isAllDay
                          ? '（全天）'
                          : `${c.eventTime || ''}${c.endTime ? ' — ' + c.endTime : ''}`
                        }
                        {' '}
                        {c.title}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <p style={{ marginBottom: 'var(--space-sm)' }}>
                  目前該日尚無其他人登錄用車，但不代表沒有家人需要用車。
                </p>
              )}
              <p style={{ marginTop: 'var(--space-sm)', color: 'var(--color-text)' }}>
                請先跟家人溝通確認，避免用車時間衝突。
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => {
                  setShowCarConflictDialog(false);
                  setFormNeedsCar(false);
                  setCarConflicts([]);
                }}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={() => {
                  setShowCarConflictDialog(false);
                  setFormNeedsCar(true);
                  setCarConflictConfirmed(true);
                }}
              >
                ✅ 已確認，繼續登錄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 事件列表區塊 ────────────────────────────────────────────

function EventsSection({
  title,
  lunar,
  selectedDate,
  events,
  currentUser,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string;
  lunar?: string;
  selectedDate?: string;
  events: FamilyEventItem[];
  currentUser: UserProfile | null;
  onAdd: () => void;
  onEdit: (ev: FamilyEventItem) => void;
  onDelete: (ev: FamilyEventItem) => void;
}) {
  // 農民曆摘要（宜忌 + 沖煞）
  const almanacSummary = useMemo(() => {
    if (!selectedDate) return null;
    const { y, m, d } = parseDateStr(selectedDate);
    return getDayInfo(y, m, d);
  }, [selectedDate]);

  return (
    <section className={styles.eventsSection}>
      <div className={styles.eventsSectionHeader}>
        <div className={styles.eventsSectionTitleGroup}>
          <h2 className={styles.eventsSectionTitle}>
            {title}
          </h2>
          {lunar && (
            <span className={styles.eventsSectionLunar}>{lunar}</span>
          )}
        </div>
        <div className={styles.eventsSectionRight}>
          <span className={styles.eventsSectionCount}>{events.length}</span>
          <button type="button" className={styles.addEventBtn} onClick={onAdd}>
            <Plus size={14} /> 新增行程
          </button>
        </div>
      </div>

      {/* 農民曆摘要 */}
      {almanacSummary && (
        <div className={styles.almanacSummary}>
          <div className={styles.almanacBadges}>
            <span className={styles.almanacBadge}>🐾 {almanacSummary.shengXiao}</span>
            <span className={styles.almanacBadge}>⭐ {almanacSummary.xingZuo}</span>
            {almanacSummary.jieQi && (
              <span className={styles.almanacBadge}>🌿 {almanacSummary.jieQi}</span>
            )}
            <span className={styles.almanacBadge}>⚔️ {almanacSummary.chongDesc}</span>
          </div>
          <div className={styles.almanacYiji}>
            <span className={styles.almanacYi}>
              ✅ {almanacSummary.yi.slice(0, 4).join('、') || '無'}{almanacSummary.yi.length > 4 ? '…' : ''}
            </span>
            <span className={styles.almanacJi}>
              ❌ {almanacSummary.ji.slice(0, 4).join('、') || '無'}{almanacSummary.ji.length > 4 ? '…' : ''}
            </span>
          </div>
        </div>
      )}

      {/* 天氣預報 */}
      <WeatherWidget />

      {events.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📅</div>
          <div className={styles.emptyText}>本日尚無安排行程</div>
        </div>
      ) : (
        <div className={styles.eventsList}>
          {events.map((event) => {
            const isOwner = currentUser && currentUser.id === event.authorId;
            const isAdmin = currentUser && currentUser.role === 'ADMIN';
            const canEdit = isOwner || (isAdmin && event.needsCar);
            return (
              <div
                key={event.id}
                className={styles.eventCard}
                style={{ borderLeftColor: getEventDisplayColor({ needsCar: event.needsCar, id: event.id, color: event.color, authorCalendarColor: event.author?.calendarColor }) }}
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
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.locationBadge}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin size={12} />
                        {event.location}
                      </a>
                    )}
                    {event.needsCar && (
                      <span className={styles.carBadge}>
                        <Car size={12} />
                        用車
                      </span>
                    )}
                    {event.isImportant && (
                      <span className={styles.importantBadge}>
                        <Star size={12} />
                        重要
                      </span>
                    )}
                  </div>

                  {canEdit && (
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

                <div className={styles.eventTitle}>
                  {event.needsCar && event.author?.displayName
                    ? `${event.author.displayName} 用車`
                    : event.title}
                </div>
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
