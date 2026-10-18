'use client';

import { useEffect, useRef } from 'react';
import type { ReactionType } from '@/lib/types';
import { REACTION_EMOJI, REACTION_LABEL, ALL_REACTION_TYPES } from '@/lib/types';
import styles from './ReactionPicker.module.css';

interface ReactionPickerProps {
  selected: ReactionType | null;
  onSelect: (type: ReactionType) => void;
  onClose: () => void;
}

/**
 * 心情選擇器 — 9 種心情 emoji 三欄排列
 */
export default function ReactionPicker({
  selected,
  onSelect,
  onClose,
}: ReactionPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use setTimeout to avoid capturing the same click event that opened the picker
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div className={styles.picker} ref={pickerRef} role="listbox" aria-label="選擇心情">
      {ALL_REACTION_TYPES.map((type) => (
        <button
          key={type}
          className={`${styles.option} ${selected === type ? styles.optionSelected : ''}`}
          onClick={() => onSelect(type)}
          role="option"
          aria-selected={selected === type}
          type="button"
        >
          <span className={styles.optionEmoji}>{REACTION_EMOJI[type]}</span>
          <span className={styles.optionLabel}>{REACTION_LABEL[type]}</span>
        </button>
      ))}
    </div>
  );
}
