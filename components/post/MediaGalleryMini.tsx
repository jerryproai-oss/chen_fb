import type { MediaItem } from '@/lib/types';
import styles from './MediaGalleryMini.module.css';

/** 最多顯示的縮圖數量 */
const MAX_VISIBLE = 4;

interface MediaGalleryMiniProps {
  media: MediaItem[];
}

/**
 * 小型圖片預覽 — 用在 PostCard 中
 * 最多顯示 4 張小縮圖，超過時最後一張顯示 "+N"
 */
export default function MediaGalleryMini({ media }: MediaGalleryMiniProps) {
  if (media.length === 0) return null;

  const displayItems = media.slice(0, MAX_VISIBLE);
  const moreCount = media.length - MAX_VISIBLE;

  return (
    <div className={styles.grid}>
      {displayItems.map((item, i) => (
        <div key={item.id} className={styles.thumb}>
          <img
            className={styles.thumbImage}
            src={item.url}
            alt={item.filename || `圖片 ${i + 1}`}
            loading="lazy"
          />
          {/* 最後一個縮圖顯示 +N */}
          {i === MAX_VISIBLE - 1 && moreCount > 0 && (
            <div className={styles.thumbMore}>+{moreCount}</div>
          )}
        </div>
      ))}
    </div>
  );
}
