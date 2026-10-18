'use client';

import { Calendar } from 'lucide-react';
import styles from './DatePicker.module.css';

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
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
          max={new Date().toISOString().split('T')[0]}
        />
      </div>
    </div>
  );
}
