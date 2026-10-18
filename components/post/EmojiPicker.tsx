'use client';

import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';
import styles from './EmojiPicker.module.css';

/** Emoji 分類 */
const EMOJI_CATEGORIES = [
  {
    label: '常用',
    emojis: ['😀', '😂', '🥰', '😎', '🤔', '😊', '😍', '🥹', '😘', '🤗', '😆', '😅', '🙂', '😉', '😌', '🤭', '😏', '😋', '🤩', '😜'],
  },
  {
    label: '情緒',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🩷', '💕', '💖', '💗', '💓', '💝', '🥺', '😢', '😭', '😤', '😡', '🤯', '😱', '😰'],
  },
  {
    label: '手勢',
    emojis: ['👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '👌', '🤙', '💪', '👋', '🫶', '🙏', '☝️', '👆', '👇', '👈', '👉', '✋', '🤚'],
  },
  {
    label: '動物',
    emojis: ['🐶', '🐱', '🐼', '🐻', '🦊', '🐰', '🐸', '🐵', '🐔', '🐧', '🦋', '🐝', '🐞', '🐢', '🐠', '🐬', '🦜', '🦄', '🐲', '🐾'],
  },
  {
    label: '食物',
    emojis: ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🥑', '🍕', '🍔', '🍜', '🍣', '🍰', '🧁', '🍩', '🍪', '☕', '🍵', '🧋', '🍺', '🥤'],
  },
  {
    label: '自然',
    emojis: ['🌸', '🌺', '🌻', '🌹', '🌷', '🍀', '🌿', '🌲', '🌙', '⭐', '🌈', '☀️', '⛅', '🌊', '🔥', '❄️', '🍂', '🍁', '💐', '🌱'],
  },
  {
    label: '活動',
    emojis: ['🎉', '🎊', '🎂', '🎁', '🎈', '🏆', '⚽', '🏀', '🎮', '🎯', '🎵', '🎶', '📸', '🎬', '✈️', '🚗', '🏠', '💼', '📚', '✏️'],
  },
  {
    label: '符號',
    emojis: ['✅', '❌', '⭕', '❗', '❓', '💯', '🔔', '📌', '💡', '🎯', '⏰', '📅', '🏷️', '🔗', '📎', '✨', '💫', '⚡', '🌟', '💖'],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className={styles.wrapper} ref={pickerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen(!open)}
        aria-label="插入表情符號"
        title="插入表情符號"
      >
        <Smile size={20} />
      </button>

      {open && (
        <div className={styles.picker}>
          {/* 分類標籤 */}
          <div className={styles.tabs}>
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                type="button"
                className={`${styles.tab} ${i === activeCategory ? styles.tabActive : ''}`}
                onClick={() => setActiveCategory(i)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Emoji 網格 */}
          <div className={styles.grid}>
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
