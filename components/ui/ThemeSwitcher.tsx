'use client';

import { useState, useEffect } from 'react';
import { Palette } from 'lucide-react';
import styles from './ThemeSwitcher.module.css';

type ThemeKey = 'default' | 'facebook' | 'instagram' | 'twitter' | 'dark' | 'sakura';

interface ThemeOption {
  value: ThemeKey;
  label: string;
  preview: string; // CSS gradient / color for the preview swatch
}

const THEMES: ThemeOption[] = [
  { value: 'default', label: '拾日', preview: 'linear-gradient(135deg, #5a7a5a, #8b6f47)' },
  { value: 'facebook', label: 'Facebook', preview: 'linear-gradient(135deg, #1877f2, #42b72a)' },
  { value: 'instagram', label: 'Instagram', preview: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' },
  { value: 'twitter', label: 'X / Twitter', preview: 'linear-gradient(135deg, #1da1f2, #14171a)' },
  { value: 'sakura', label: '櫻花', preview: 'linear-gradient(135deg, #f8b4c8, #fce4ec)' },
  { value: 'dark', label: '深色', preview: 'linear-gradient(135deg, #1a1a2e, #16213e)' },
];

/**
 * 佈景主題切換器
 * 提供多種預設色彩主題，存於 localStorage，透過 data-theme 屬性套用
 */
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeKey>('default');

  useEffect(() => {
    const saved = localStorage.getItem('shiri-theme') as ThemeKey | null;
    if (saved && THEMES.some((t) => t.value === saved)) {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  function applyTheme(newTheme: ThemeKey) {
    if (newTheme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  }

  function handleChange(newTheme: ThemeKey) {
    setTheme(newTheme);
    localStorage.setItem('shiri-theme', newTheme);
    applyTheme(newTheme);
  }

  return (
    <div className={styles.container}>
      <div className={styles.label}>
        <Palette size={16} />
        佈景主題
      </div>
      <div className={styles.options}>
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`${styles.option} ${theme === t.value ? styles.active : ''}`}
            onClick={() => handleChange(t.value)}
            aria-pressed={theme === t.value}
          >
            <span
              className={styles.swatch}
              style={{ background: t.preview }}
            />
            <span className={styles.optionLabel}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
