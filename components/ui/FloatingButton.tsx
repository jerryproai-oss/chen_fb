'use client';

import Link from 'next/link';
import { PenSquare } from 'lucide-react';
import styles from './FloatingButton.module.css';

/**
 * 浮動寫手札按鈕 — 僅手機版顯示
 */
export default function FloatingButton() {
  return (
    <Link href="/write" className={styles.fab} aria-label="寫手札">
      <PenSquare size={24} />
    </Link>
  );
}
