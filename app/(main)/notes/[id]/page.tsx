'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import NoteEditor from '../NoteEditor';
import styles from '../page.module.css';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [noteData, setNoteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/notes/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('記事不存在');
          } else if (res.status === 403) {
            setError('無權存取此記事');
          } else {
            setError('載入失敗');
          }
          return;
        }
        const data = await res.json();
        setNoteData(data);
      } catch {
        setError('載入失敗');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
      </div>
    );
  }

  return <NoteEditor noteData={noteData} isNew={false} />;
}
