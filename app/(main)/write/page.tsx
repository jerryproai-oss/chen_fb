'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Visibility } from '@/lib/types';
import VisibilityPicker from '@/components/post/VisibilityPicker';
import DatePicker from '@/components/post/DatePicker';
import TextToolbar from '@/components/post/TextToolbar';
import MediaUploader from '@/components/post/MediaUploader';
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const canSubmit = title.trim().length > 0 && !saving;

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
          <input
            id="title"
            type="text"
            className={styles.titleInput}
            placeholder="今天發生了什麼？"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="subtitle">
            副標題
          </label>
          <input
            id="subtitle"
            type="text"
            className={styles.subtitleInput}
            placeholder="補充說明（選填）"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            maxLength={200}
          />
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
          <label className={styles.fieldLabel}>照片</label>
          <MediaUploader
            mediaIds={mediaIds}
            onMediaChange={setMediaIds}
          />
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
