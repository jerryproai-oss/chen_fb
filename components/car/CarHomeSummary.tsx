'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car, DollarSign, Wrench, Landmark, Fuel,
} from 'lucide-react';
import styles from './CarHomeSummary.module.css';

// ── 型別 ──────────────────────────────────────────────────────

interface CarSummary {
  todayBookings: {
    count: number;
    users: string[];
  };
  unpaidAmount: number;
  nextMaintenance: {
    date: string | null;
    mileage: number | null;
  };
  loanProgress: {
    paidCount: number;
    totalInstallments: number;
    progressPercent: number;
    nextDueDate: string | null;
    nextAmount: number | null;
  } | null;
  weeklyFuel: {
    totalAmount: number;
    totalLiters: number | null;
    avgEfficiency: number | null;
  };
}

// ── 格式化輔助 ───────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n === 0) return 'NT$ 0';
  return `NT$ ${n.toLocaleString('zh-TW')}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric',
  });
}

// ── 主元件 ───────────────────────────────────────────────────

export default function CarHomeSummary() {
  const router = useRouter();
  const [summary, setSummary] = useState<CarSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/car/reports?type=summary')
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => setSummary(data.summary || null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <Car size={18} className={styles.cardIcon} />
          <span className={styles.cardTitle}>用車管理</span>
        </div>
        <div className={styles.loadingText}>載入中...</div>
      </div>
    );
  }

  if (!summary) {
    return null; // 無車輛資料時不顯示
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Car size={18} className={styles.cardIcon} />
        <span className={styles.cardTitle}>用車管理</span>
      </div>

      <div className={styles.summaryGrid}>
        {/* 今日用車 */}
        <button
          type="button"
          className={styles.summaryItem}
          onClick={() => router.push('/car/dashboard')}
        >
          <div className={styles.summaryIcon} style={{ background: 'rgba(21, 101, 192, 0.1)', color: '#1565C0' }}>
            <Car size={16} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>今日用車</span>
            <span className={styles.summaryValue}>
              {summary.todayBookings.count > 0
                ? `${summary.todayBookings.count} 筆`
                : '無預約'}
            </span>
            {summary.todayBookings.users.length > 0 && (
              <span className={styles.summaryDetail}>
                {summary.todayBookings.users.join('、')}
              </span>
            )}
          </div>
        </button>

        {/* 待繳金額 */}
        <button
          type="button"
          className={styles.summaryItem}
          onClick={() => router.push('/car/history')}
        >
          <div className={styles.summaryIcon} style={{ background: 'rgba(211, 47, 47, 0.1)', color: '#D32F2F' }}>
            <DollarSign size={16} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>待繳金額</span>
            <span className={`${styles.summaryValue} ${summary.unpaidAmount > 0 ? styles.valueWarning : ''}`}>
              {fmtCurrency(summary.unpaidAmount)}
            </span>
          </div>
        </button>

        {/* 下次保養 */}
        <button
          type="button"
          className={styles.summaryItem}
          onClick={() => router.push('/car/maintenance')}
        >
          <div className={styles.summaryIcon} style={{ background: 'rgba(90, 122, 90, 0.1)', color: '#5a7a5a' }}>
            <Wrench size={16} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>下次保養</span>
            <span className={styles.summaryValue}>
              {summary.nextMaintenance.date
                ? fmtDate(summary.nextMaintenance.date)
                : summary.nextMaintenance.mileage
                  ? `${summary.nextMaintenance.mileage.toLocaleString()} km`
                  : '--'}
            </span>
          </div>
        </button>

        {/* 車貸進度 */}
        {summary.loanProgress && (
          <button
            type="button"
            className={styles.summaryItem}
            onClick={() => router.push('/car/loan')}
          >
            <div className={styles.summaryIcon} style={{ background: 'rgba(184, 134, 11, 0.1)', color: '#B8860B' }}>
              <Landmark size={16} />
            </div>
            <div className={styles.summaryContent}>
              <span className={styles.summaryLabel}>車貸進度</span>
              <div className={styles.loanProgressRow}>
                <div className={styles.miniProgressBar}>
                  <div
                    className={styles.miniProgressFill}
                    style={{ width: `${summary.loanProgress.progressPercent}%` }}
                  />
                </div>
                <span className={styles.summaryValue}>
                  {summary.loanProgress.progressPercent}%
                </span>
              </div>
              {summary.loanProgress.nextDueDate && (
                <span className={styles.summaryDetail}>
                  下期 {fmtDate(summary.loanProgress.nextDueDate)}
                </span>
              )}
            </div>
          </button>
        )}

        {/* 上週油耗 */}
        <button
          type="button"
          className={styles.summaryItem}
          onClick={() => router.push('/car/fuel')}
        >
          <div className={styles.summaryIcon} style={{ background: 'rgba(139, 111, 71, 0.1)', color: '#8b6f47' }}>
            <Fuel size={16} />
          </div>
          <div className={styles.summaryContent}>
            <span className={styles.summaryLabel}>上週油耗</span>
            <span className={styles.summaryValue}>
              {summary.weeklyFuel.totalAmount > 0
                ? fmtCurrency(summary.weeklyFuel.totalAmount)
                : '--'}
            </span>
            {summary.weeklyFuel.avgEfficiency && (
              <span className={styles.summaryDetail}>
                {summary.weeklyFuel.avgEfficiency.toFixed(1)} km/L
              </span>
            )}
          </div>
        </button>
      </div>
    </div>
  );
}
