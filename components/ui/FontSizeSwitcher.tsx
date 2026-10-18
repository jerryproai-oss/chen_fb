'use client';

import { useState, useEffect } from 'react';
import { Type } from 'lucide-react';
import styles from './FontSizeSwitcher.module.css';

type FontSize = 'small' | 'medium' | 'large';

const OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
];

/**
 * 字級大小切換器
 * 提供小/中/大三級字體大小選擇，存於 localStorage
 */
export default function FontSizeSwitcher() {
  const [size, setSize] = useState<FontSize>('medium');

  useEffect(() => {
    const saved = localStorage.getItem('shiri-font-size') as FontSize | null;
    if (saved && ['small', 'medium', 'large'].includes(saved)) {
      setSize(saved);
    }
  }, []);

  function handleChange(newSize: FontSize) {
    setSize(newSize);
    localStorage.setItem('shiri-font-size', newSize);
    if (newSize === 'medium') {
      document.documentElement.removeAttribute('data-font-size');
    } else {
      document.documentElement.setAttribute('data-font-size', newSize);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.label}>
        <Type size={16} />
        字級大小
      </div>
      <div className={styles.options}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`${styles.option} ${size === opt.value ? styles.active : ''}`}
            onClick={() => handleChange(opt.value)}
            aria-pressed={size === opt.value}
          >
            <span className={styles[`size${opt.value.charAt(0).toUpperCase() + opt.value.slice(1)}`]}>
              A
            </span>
            <span className={styles.optionLabel}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
