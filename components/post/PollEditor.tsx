'use client';

import { useState } from 'react';
import { Plus, X, Image as ImageIcon, Link as LinkIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { PollInput, PollOptionInput } from '@/lib/types';
import styles from './PollEditor.module.css';

interface PollEditorProps {
  poll: PollInput | null;
  onChange: (poll: PollInput | null) => void;
}

function emptyOption(): PollOptionInput {
  return { text: '' };
}

/**
 * 投票編輯器 — 用於寫手札/編輯手札中建立投票
 */
export default function PollEditor({ poll, onChange }: PollEditorProps) {
  const [expanded, setExpanded] = useState(false);

  if (!poll) {
    return (
      <button
        type="button"
        className={styles.addPollBtn}
        onClick={() => {
          onChange({
            question: '',
            multiSelect: false,
            endsAt: null,
            options: [emptyOption(), emptyOption()],
          });
          setExpanded(true);
        }}
      >
        📊 新增投票
      </button>
    );
  }

  function updateOption(index: number, updates: Partial<PollOptionInput>) {
    if (!poll) return;
    const newOptions = [...poll.options];
    newOptions[index] = { ...newOptions[index], ...updates };
    onChange({ ...poll, options: newOptions });
  }

  function removeOption(index: number) {
    if (!poll || poll.options.length <= 2) return;
    const newOptions = poll.options.filter((_, i) => i !== index);
    onChange({ ...poll, options: newOptions });
  }

  function addOption() {
    if (!poll || poll.options.length >= 10) return;
    onChange({ ...poll, options: [...poll.options, emptyOption()] });
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editorHeader}>
        <span className={styles.editorTitle}>📊 投票</span>
        <div className={styles.editorActions}>
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? '收合' : '展開'}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button
            type="button"
            className={styles.removeBtn}
            onClick={() => onChange(null)}
            aria-label="移除投票"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.editorBody}>
          {/* 投票主題 */}
          <input
            type="text"
            className={styles.questionInput}
            placeholder="投票主題（例如：週末去哪裡？）"
            value={poll.question}
            onChange={(e) => onChange({ ...poll, question: e.target.value })}
            maxLength={200}
          />

          {/* 選項列表 */}
          <div className={styles.optionsList}>
            {poll.options.map((opt, i) => (
              <OptionRow
                key={i}
                index={i}
                option={opt}
                canRemove={poll.options.length > 2}
                onChange={(updates) => updateOption(i, updates)}
                onRemove={() => removeOption(i)}
              />
            ))}
          </div>

          {/* 新增選項 */}
          {poll.options.length < 10 && (
            <button
              type="button"
              className={styles.addOptionBtn}
              onClick={addOption}
            >
              <Plus size={14} />
              新增選項（{poll.options.length}/10）
            </button>
          )}

          {/* 設定列 */}
          <div className={styles.settingsRow}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={poll.multiSelect}
                onChange={(e) => onChange({ ...poll, multiSelect: e.target.checked })}
              />
              允許多選
            </label>

            <div className={styles.deadlineField}>
              <label className={styles.deadlineLabel}>截止時間</label>
              <input
                type="datetime-local"
                className={styles.deadlineInput}
                value={poll.endsAt ?? ''}
                onChange={(e) => onChange({ ...poll, endsAt: e.target.value || null })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 單個選項編輯列
 */
function OptionRow({
  index,
  option,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  option: PollOptionInput;
  canRemove: boolean;
  onChange: (updates: Partial<PollOptionInput>) => void;
  onRemove: () => void;
}) {
  const [showExtras, setShowExtras] = useState(false);

  return (
    <div className={styles.optionRow}>
      <div className={styles.optionMain}>
        <span className={styles.optionNum}>{index + 1}</span>
        <input
          type="text"
          className={styles.optionInput}
          placeholder={`選項 ${index + 1}`}
          value={option.text}
          onChange={(e) => onChange({ text: e.target.value })}
          maxLength={100}
        />
        <button
          type="button"
          className={styles.optionExtra}
          onClick={() => setShowExtras(!showExtras)}
          aria-label="更多設定"
          title="說明、圖片、連結"
        >
          ⋯
        </button>
        {canRemove && (
          <button
            type="button"
            className={styles.optionRemove}
            onClick={onRemove}
            aria-label="移除選項"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {showExtras && (
        <div className={styles.optionExtras}>
          <div className={styles.extraField}>
            <ImageIcon size={14} className={styles.extraIcon} />
            <input
              type="text"
              className={styles.extraInput}
              placeholder="圖片 URL（選填，可用 /api/media/xxx）"
              value={option.imageMediaId ?? ''}
              onChange={(e) => onChange({ imageMediaId: e.target.value || undefined })}
            />
          </div>
          <div className={styles.extraField}>
            <LinkIcon size={14} className={styles.extraIcon} />
            <input
              type="text"
              className={styles.extraInput}
              placeholder="連結 URL（選填）"
              value={option.linkUrl ?? ''}
              onChange={(e) => onChange({ linkUrl: e.target.value || undefined })}
            />
          </div>
          <textarea
            className={styles.extraTextarea}
            placeholder="補充說明（選填）"
            value={option.description ?? ''}
            onChange={(e) => onChange({ description: e.target.value || undefined })}
            rows={2}
          />
        </div>
      )}
    </div>
  );
}
