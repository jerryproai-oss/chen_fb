'use client';

import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import type { ReactionType, ReactionSummary } from '@/lib/types';
import { REACTION_EMOJI } from '@/lib/types';
import ReactionPicker from './ReactionPicker';
import styles from './ReactionBar.module.css';

interface ReactionBarProps {
  postId: string;
  reactions: ReactionSummary[];
  myReaction: ReactionType | null;
  onReact: (type: ReactionType | null) => void;
}

/**
 * 心情回應列 — 顯示現有回應 + 新增/切換回應
 */
export default function ReactionBar({
  postId,
  reactions,
  myReaction,
  onReact,
}: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);

  const handleChipClick = (type: ReactionType) => {
    if (myReaction === type) {
      // 取消回應
      onReact(null);
    } else {
      onReact(type);
    }
  };

  const handlePickerSelect = (type: ReactionType) => {
    if (myReaction === type) {
      onReact(null);
    } else {
      onReact(type);
    }
    setShowPicker(false);
  };

  const visibleReactions = reactions.filter((r) => r.count > 0);

  return (
    <div className={styles.bar}>
      {visibleReactions.map((r) => (
        <button
          key={r.type}
          className={`${styles.chip} ${myReaction === r.type ? styles.chipActive : ''}`}
          onClick={() => handleChipClick(r.type)}
          aria-label={`${REACTION_EMOJI[r.type]} ${r.count}`}
          type="button"
        >
          <span className={styles.chipEmoji}>{REACTION_EMOJI[r.type]}</span>
          <span className={styles.chipCount}>{r.count}</span>
        </button>
      ))}

      <div style={{ position: 'relative' }}>
        <button
          className={styles.addBtn}
          onClick={() => setShowPicker(!showPicker)}
          aria-label="新增心情回應"
          type="button"
        >
          <SmilePlus size={18} />
        </button>
        {showPicker && (
          <ReactionPicker
            selected={myReaction}
            onSelect={handlePickerSelect}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
