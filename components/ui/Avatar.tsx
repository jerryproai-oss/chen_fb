import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

/**
 * 使用者頭像元件
 * 有圖片時顯示圖片，無圖片時顯示首字母圓形
 */
export default function Avatar({
  name,
  avatarUrl,
  size = 'md',
  className = '',
}: AvatarProps) {
  const initial = name.charAt(0).toUpperCase();

  return (
    <div
      className={`${styles.avatar} ${styles[size]} ${className}`}
      aria-label={name}
      title={name}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}
