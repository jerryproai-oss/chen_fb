'use client';

import { useState, useEffect } from 'react';
import Avatar from '@/components/ui/Avatar';
import type { BirthdayItem } from '@/lib/types';
import styles from './BirthdayBanner.module.css';

function formatMMDD(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length >= 3) {
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}

export default function BirthdayBanner() {
  const [birthdays, setBirthdays] = useState<BirthdayItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/birthdays')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.birthdays) {
          setBirthdays(data.birthdays);
        }
      })
      .catch((err) => console.error('Failed to load birthdays:', err))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded) return null;

  // 篩選今天與 7 天內的家人生日
  const todayBirthdays = birthdays.filter((b) => b.daysUntil === 0);
  const upcomingBirthdays = birthdays.filter((b) => b.daysUntil > 0 && b.daysUntil <= 7);

  if (todayBirthdays.length === 0 && upcomingBirthdays.length === 0) {
    return null;
  }

  return (
    <section className={styles.birthdaySection} aria-label="家人生日提醒">
      <div className={styles.birthdayHeader}>
        <span>🎂 家人生日提醒</span>
      </div>

      {/* 今日壽星慶祝卡片 */}
      {todayBirthdays.map((b) => (
        <div key={b.userId} className={styles.todayCard}>
          <span className={styles.todayCelebrationEmoji} role="img" aria-label="慶祝">
            🎉
          </span>
          <Avatar name={b.displayName} avatarUrl={b.avatarUrl} size="lg" />
          <div className={styles.todayInfo}>
            <div className={styles.todayTitle}>
              今天是 {b.displayName} 的生日！🎂🎉
            </div>
            <div className={styles.todaySubtitle}>
              快向壽星說一聲生日快樂吧！
            </div>
          </div>
        </div>
      ))}

      {/* 近期 (7天內) 生日橫向列表 */}
      {upcomingBirthdays.length > 0 && (
        <div className={styles.upcomingList}>
          {upcomingBirthdays.map((b) => (
            <div key={b.userId} className={styles.upcomingItem}>
              <Avatar name={b.displayName} avatarUrl={b.avatarUrl} size="sm" />
              <div className={styles.upcomingDetails}>
                <span className={styles.upcomingName}>{b.displayName}</span>
                <span className={styles.upcomingDays}>
                  {b.daysUntil === 1 ? '明天' : `${b.daysUntil} 天後`}生日 ({formatMMDD(b.birthday)})
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
