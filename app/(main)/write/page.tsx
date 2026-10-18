'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Visibility } from '@/lib/types';
import VisibilityPicker from '@/components/post/VisibilityPicker';
import DatePicker from '@/components/post/DatePicker';
import TextToolbar from '@/components/post/TextToolbar';
import EmojiPicker from '@/components/post/EmojiPicker';
import MediaUploader from '@/components/post/MediaUploader';
import PollEditor from '@/components/post/PollEditor';
import type { PollInput } from '@/lib/types';
import styles from './page.module.css';

function todayStr(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/**
 * 寫手札頁面 — 新建貼文
 */
export default function WritePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('FAMILY');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [recordDate, setRecordDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [poll, setPoll] = useState<PollInput | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const subtitleRef = useRef<HTMLInputElement>(null);

  const canSubmit = title.trim().length > 0 && !saving;

  /** 在 input 的游標位置插入 emoji */
  function insertEmojiToInput(
    inputRef: React.RefObject<HTMLInputElement | null>,
    value: string,
    setter: (v: string) => void,
    emoji: string,
  ) {
    const el = inputRef.current;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const newVal = value.slice(0, start) + emoji + value.slice(end);
      setter(newVal);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setter(value + emoji);
    }
  }

  async function handleSubmit(status: 'DRAFT' | 'PUBLISHED') {
    if (!canSubmit) return;
    setSaving(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        bodyPlainText: body.trim() || null,
        visibility,
        audienceUserIds: visibility === 'SELECTED' ? selectedUserIds : [],
        recordDate,
        status,
        mediaIds: mediaIds.length > 0 ? mediaIds : undefined,
        poll: poll && poll.question.trim() && poll.options.filter(o => o.text.trim()).length >= 2
          ? poll
          : undefined,
      };

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }

      const data = await res.json();
      if (status === 'PUBLISHED') {
        router.push(`/posts/${data.post.id}`);
      } else {
        router.push('/journal');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生錯誤');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>寫手札</h1>
      </div>

      <div className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="title">
            標題<span className={styles.fieldRequired}>*</span>
          </label>
          <div className={styles.inputWithEmoji}>
            <input
              id="title"
              ref={titleRef}
              type="text"
              className={styles.titleInput}
              placeholder="今天發生了什麼？"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
            />
            <EmojiPicker
              onSelect={(emoji) => insertEmojiToInput(titleRef, title, setTitle, emoji)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="subtitle">
            副標題
          </label>
          <div className={styles.inputWithEmoji}>
            <input
              id="subtitle"
              ref={subtitleRef}
              type="text"
              className={styles.subtitleInput}
              placeholder="補充說明（選填）"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={200}
            />
            <EmojiPicker
              onSelect={(emoji) => insertEmojiToInput(subtitleRef, subtitle, setSubtitle, emoji)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="body">
            內容
          </label>
          <textarea
            id="body"
            ref={bodyRef}
            className={`${styles.bodyTextarea} ${styles.bodyTextareaWithToolbar}`}
            placeholder="寫下你想記錄的…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <TextToolbar
            textareaRef={bodyRef}
            body={body}
            onBodyChange={setBody}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>媒體</label>
          <MediaUploader
            mediaIds={mediaIds}
            onMediaChange={setMediaIds}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>投票</label>
          <PollEditor poll={poll} onChange={setPoll} />
        </div>

        <div className={styles.settingsRow}>
          <DatePicker value={recordDate} onChange={setRecordDate} />
          <VisibilityPicker
            value={visibility}
            onChange={setVisibility}
            selectedUserIds={selectedUserIds}
            onSelectedUsersChange={setSelectedUserIds}
          />
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.draftBtn}
            onClick={() => handleSubmit('DRAFT')}
            disabled={!canSubmit}
          >
            {saving ? '儲存中…' : '儲存草稿'}
          </button>
          <button
            type="button"
            className={styles.publishBtn}
            onClick={() => handleSubmit('PUBLISHED')}
            disabled={!canSubmit}
          >
            {saving ? '發布中…' : '發布'}
          </button>
        </div>
      </div>
    </div>
  );
}
