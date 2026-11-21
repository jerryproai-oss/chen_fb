'use client';

import { useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { getDayInfo, type DayInfo } from '@/lib/lunar';
import HelpGuide from '@/components/ui/HelpGuide';
import { helpContents } from '@/lib/constants/help-content';
import styles from './page.module.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'] as const;

export default function AlmanacPage() {
  const [date, setDate] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  });
  const dateInputRef = useRef<HTMLInputElement>(null);

  const info = useMemo<DayInfo | null>(
    () => getDayInfo(date.year, date.month, date.day),
    [date.year, date.month, date.day],
  );

  const weekday = useMemo(() => {
    const d = new Date(date.year, date.month - 1, date.day);
    return `星期${WEEKDAYS[d.getDay()]}`;
  }, [date.year, date.month, date.day]);

  const isToday = useMemo(() => {
    const now = new Date();
    return date.year === now.getFullYear() && date.month === now.getMonth() + 1 && date.day === now.getDate();
  }, [date.year, date.month, date.day]);

  // ── 日期導航 ─────────────────────────────────
  const navigate = (offset: number) => {
    const d = new Date(date.year, date.month - 1, date.day + offset);
    setDate({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  };

  const goToday = () => {
    const now = new Date();
    setDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (!v) return;
    const [y, m, d] = v.split('-').map(Number);
    if (y && m && d) setDate({ year: y, month: m, day: d });
  };

  if (!info) {
    return (
      <div className={styles.container}>
        <Link href="/calendar" className={styles.backLink}>
          <ArrowLeft size={16} /> 行事曆
        </Link>
        <h1 className={styles.pageTitle}>📅 農民曆</h1>
        <div className={styles.loading}><div className={styles.spinner} /></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/calendar" className={styles.backLink}>
        <ArrowLeft size={16} /> 行事曆
      </Link>
      <h1 className={styles.pageTitle}>
        📅 農民曆
        {helpContents.almanac && <HelpGuide content={helpContents.almanac} />}
      </h1>

      {/* 日期導航 */}
      <div className={styles.dateNav}>
        <button className={styles.dateBtn} onClick={() => navigate(-1)} title="前一天">
          <ChevronLeft size={18} />
        </button>

        <div className={styles.dateDisplay} onClick={() => dateInputRef.current?.showPicker()}>
          <div className={styles.dateMain}>
            {date.year} 年 {date.month} 月 {date.day} 日
          </div>
          <div className={styles.dateLunar}>
            {info.lunar.yearName} {info.lunar.monthName}{info.lunar.dayName}
          </div>
          <input
            ref={dateInputRef}
            type="date"
            className={styles.dateInput}
            value={`${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`}
            onChange={handleDateChange}
          />
        </div>

        <button className={styles.dateBtn} onClick={() => navigate(1)} title="後一天">
          <ChevronRight size={18} />
        </button>

        {!isToday && (
          <button className={styles.todayBtn} onClick={goToday}>
            今天
          </button>
        )}
      </div>

      {/* 主卡片 */}
      <div className={styles.heroCard}>
        <div className={styles.heroDate}>{date.day}</div>
        <div className={styles.heroWeekday}>{weekday}</div>
        <div className={styles.heroLunar}>
          {info.lunar.monthName}{info.lunar.dayName}
        </div>
        <div className={styles.heroGanZhi}>
          {info.yearGanZhi}年 {info.monthGanZhi}月 {info.dayGanZhi}日
        </div>
        <div className={styles.heroZodiac}>
          <span className={styles.heroBadge}>🐾 {info.shengXiao}</span>
          <span className={styles.heroBadge}>⭐ {info.xingZuo}</span>
          <span className={styles.heroBadge}>🏷️ {info.zhiXing}</span>
          {info.naYin && <span className={styles.heroBadge}>🎵 {info.naYin}</span>}
        </div>
        {info.jieQi && (
          <div className={styles.heroJieQi}>
            🌿 今日節氣：{info.jieQi}
          </div>
        )}
      </div>

      {/* 節日 */}
      {(info.festivals.length > 0 || info.solarFestivals.length > 0) && (
        <div className={styles.festivalsSection}>
          <div className={styles.festivalTitle}>🎉 節日</div>
          <div className={styles.festivalTags}>
            {info.festivals.map((f, i) => (
              <span key={`l${i}`} className={styles.festivalTag}>{f}</span>
            ))}
            {info.solarFestivals.map((f, i) => (
              <span key={`s${i}`} className={styles.festivalTag}>{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* 宜忌 */}
      <div className={styles.yijiSection}>
        <div className={styles.yiCard}>
          <div className={`${styles.yijiTitle} ${styles.yiTitle}`}>
            ✅ 宜
          </div>
          <div className={styles.yijiList}>
            {info.yi.length > 0
              ? info.yi.map((item, i) => (
                  <span key={i} className={styles.yiTag}>{item}</span>
                ))
              : <span className={styles.yiTag}>無</span>
            }
          </div>
        </div>
        <div className={styles.jiCard}>
          <div className={`${styles.yijiTitle} ${styles.jiTitle}`}>
            ❌ 忌
          </div>
          <div className={styles.yijiList}>
            {info.ji.length > 0
              ? info.ji.map((item, i) => (
                  <span key={i} className={styles.jiTag}>{item}</span>
                ))
              : <span className={styles.jiTag}>無</span>
            }
          </div>
        </div>
      </div>

      {/* 資訊卡片 */}
      <div className={styles.infoGrid}>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>沖煞</div>
          <div className={styles.infoValue}>{info.chongDesc}</div>
        </div>
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>值星</div>
          <div className={styles.infoValue}>{info.zhiXing}</div>
        </div>
        {info.nextJieQi && (
          <div className={styles.infoCard}>
            <div className={styles.infoLabel}>下一節氣</div>
            <div className={styles.infoValue}>{info.nextJieQi}</div>
            <div className={styles.infoValueSmall}>{info.nextJieQiDate}</div>
          </div>
        )}
        <div className={styles.infoCard}>
          <div className={styles.infoLabel}>日柱納音</div>
          <div className={styles.infoValue}>{info.naYin || '—'}</div>
        </div>
      </div>

      {/* 方位 */}
      <div className={styles.positionSection}>
        <div className={styles.positionTitle}>🧭 吉神方位</div>
        <div className={styles.positionGrid}>
          <div className={styles.positionItem}>
            <div className={styles.positionLabel}>喜神</div>
            <div className={styles.positionValue}>{info.xiShen || '—'}</div>
          </div>
          <div className={styles.positionItem}>
            <div className={styles.positionLabel}>財神</div>
            <div className={styles.positionValue}>{info.caiShen || '—'}</div>
          </div>
          <div className={styles.positionItem}>
            <div className={styles.positionLabel}>福神</div>
            <div className={styles.positionValue}>{info.fuShen || '—'}</div>
          </div>
        </div>
      </div>

      {/* 彭祖百忌 */}
      {info.pengZu && (
        <div className={styles.pengZuSection}>
          <div className={styles.pengZuTitle}>📜 彭祖百忌</div>
          <div className={styles.pengZuText}>{info.pengZu}</div>
        </div>
      )}

      {/* 吉神凶煞 */}
      {(info.jiShen.length > 0 || info.xiongSha.length > 0) && (
        <div className={styles.shenShaSection}>
          {info.jiShen.length > 0 && (
            <div className={styles.shenCard}>
              <div className={styles.shenTitle}>🌟 吉神宜趨</div>
              <div className={styles.shenList}>
                {info.jiShen.join('、')}
              </div>
            </div>
          )}
          {info.xiongSha.length > 0 && (
            <div className={styles.shenCard}>
              <div className={styles.shaTitle}>⚠️ 凶煞宜忌</div>
              <div className={styles.shenList}>
                {info.xiongSha.join('、')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
