'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

export default function PageHeader({ title, showBack = true, backHref, onBack, rightAction }: PageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {showBack && (
          <button
            className={styles.backBtn}
            onClick={handleBack}
            aria-label="返回上一頁"
            type="button"
          >
            <ArrowLeft size={20} />
          </button>
        )}
      </div>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.right}>
        {rightAction || null}
      </div>
    </header>
  );
}
