'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, RefreshCw, Loader2 } from 'lucide-react';
import styles from './AIAssistButton.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

type AITextAction =
  | 'polish'
  | 'simplify'
  | 'expand'
  | 'formal'
  | 'casual'
  | 'generateTitle'
  | 'generateSubtitle';

interface ActionOption {
  action: AITextAction;
  emoji: string;
  label: string;
}

interface AIAssistButtonProps {
  text: string;
  onApply: (newText: string) => void;
  fieldType: 'title' | 'subtitle' | 'body';
  context?: { title?: string; subtitle?: string; body?: string };
}

// ── 各欄位可用動作 ──────────────────────────────────────────────

const TITLE_ACTIONS: ActionOption[] = [
  { action: 'polish', emoji: '✨', label: '潤飾文法' },
  { action: 'simplify', emoji: '✂️', label: '精簡文字' },
  { action: 'generateTitle', emoji: '💡', label: '根據內容生成標題' },
];

const SUBTITLE_ACTIONS: ActionOption[] = [
  { action: 'polish', emoji: '✨', label: '潤飾文法' },
  { action: 'simplify', emoji: '✂️', label: '精簡文字' },
  { action: 'generateSubtitle', emoji: '💡', label: '根據內容生成副標題' },
];

const BODY_ACTIONS: ActionOption[] = [
  { action: 'polish', emoji: '✨', label: '潤飾文法' },
  { action: 'simplify', emoji: '✂️', label: '精簡文字' },
  { action: 'expand', emoji: '📝', label: '擴充內容' },
  { action: 'formal', emoji: '👔', label: '正式語氣' },
  { action: 'casual', emoji: '😊', label: '輕鬆語氣' },
];

function getActions(fieldType: 'title' | 'subtitle' | 'body'): ActionOption[] {
  switch (fieldType) {
    case 'title': return TITLE_ACTIONS;
    case 'subtitle': return SUBTITLE_ACTIONS;
    case 'body': return BODY_ACTIONS;
  }
}

// ── 元件 ──────────────────────────────────────────────────────

export default function AIAssistButton({ text, onApply, fieldType, context }: AIAssistButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState('');
  const [currentAction, setCurrentAction] = useState<AITextAction | null>(null);
  const [error, setError] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 點擊外部關閉下拉選單
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDropdown]);

  const callAPI = useCallback(async (action: AITextAction, inputText: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai/text-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, action, context }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'AI 處理失敗');
      }

      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 處理失敗');
    } finally {
      setLoading(false);
    }
  }, [context]);

  const handleAction = (action: AITextAction) => {
    setShowDropdown(false);
    setOriginalText(text);
    setCurrentAction(action);
    callAPI(action, text);
  };

  const handleApply = () => {
    if (result !== null) {
      onApply(result);
      setResult(null);
      setCurrentAction(null);
      setError('');
    }
  };

  const handleCancel = () => {
    setResult(null);
    setCurrentAction(null);
    setError('');
  };

  const handleRegenerate = () => {
    if (currentAction) {
      callAPI(currentAction, originalText);
    }
  };

  const actions = getActions(fieldType);

  // 判斷是否有可操作的內容
  const hasContent = fieldType === 'title'
    ? (text.trim().length > 0 || (context?.body?.trim().length ?? 0) > 0)
    : fieldType === 'subtitle'
    ? (text.trim().length > 0 || (context?.title?.trim().length ?? 0) > 0 || (context?.body?.trim().length ?? 0) > 0)
    : text.trim().length > 0;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      {/* 主按鈕 */}
      <button
        type="button"
        className={`${styles.aiButton} ${loading ? styles.aiButtonLoading : ''}`}
        onClick={() => !loading && setShowDropdown(!showDropdown)}
        disabled={loading || !hasContent}
        title="AI 輔助"
      >
        <span className={styles.buttonIcon}>
          {loading ? (
            <Loader2 size={14} className={styles.spinner} />
          ) : (
            <Sparkles size={14} />
          )}
        </span>
        <span>{loading ? '處理中…' : 'AI 輔助'}</span>
      </button>

      {/* 下拉選單 */}
      {showDropdown && (
        <div className={styles.dropdown}>
          {actions.map((opt) => (
            <button
              key={opt.action}
              type="button"
              className={styles.dropdownItem}
              onClick={() => handleAction(opt.action)}
            >
              <span className={styles.dropdownItemEmoji}>{opt.emoji}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 預覽 Modal */}
      {(result !== null || error) && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
          <div className={styles.previewModal}>
            <div className={styles.previewHeader}>
              <div className={styles.previewTitle}>
                <Sparkles size={18} />
                AI 輔助結果
              </div>
              <button type="button" className={styles.closeBtn} onClick={handleCancel}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.previewBody}>
              {error ? (
                <div className={styles.errorMsg}>⚠️ {error}</div>
              ) : (
                <>
                  {originalText && (
                    <div className={styles.previewSection}>
                      <div className={styles.previewLabel}>原文</div>
                      <div className={styles.previewOriginal}>{originalText}</div>
                    </div>
                  )}
                  <div className={styles.previewSection}>
                    <div className={styles.previewLabel}>AI 建議</div>
                    <div className={styles.previewResult}>{result}</div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.regenerateBtn}
                onClick={handleRegenerate}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 size={14} className={styles.spinner} />
                ) : (
                  <RefreshCw size={14} />
                )}
                重新生成
              </button>
              <button type="button" className={styles.cancelBtn} onClick={handleCancel}>
                取消
              </button>
              {result !== null && !error && (
                <button type="button" className={styles.applyBtn} onClick={handleApply}>
                  採用
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
