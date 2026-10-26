'use client';

import { Calendar } from 'lucide-react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
}

/** 使用 Asia/Taipei 時區取得今日日期字串 */
function todayInTaipei(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * 日期選擇器 — 使用原生 date input
 */
export default function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <div className={styles.wrapper}>
      <label className={styles.label} htmlFor="record-date">
        記錄日期
      </label>
      <div className={styles.inputWrap}>
        <span className={styles.icon}>
          <Calendar size={18} />
        </span>
        <input
          id="record-date"
          type="date"
          className={styles.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          max={todayInTaipei()}
        />
      </div>
    </div>
  );
}
