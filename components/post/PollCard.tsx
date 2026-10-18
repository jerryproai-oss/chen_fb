import { BarChart3 } from 'lucide-react';
import styles from './PollCard.module.css';

interface PollCardProps {
  /** 是否有投票（簡單布林標記） */
  hasPoll: boolean;
}

/**
 * 投票卡片預覽 — 在 PostCard 中顯示投票指示
 */
export default function PollCard({ hasPoll }: PollCardProps) {
  if (!hasPoll) return null;

  return (
    <div className={styles.card}>
      <BarChart3 size={14} />
      <span>包含投票</span>
    </div>
  );
}
