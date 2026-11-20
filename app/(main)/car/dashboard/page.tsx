'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3, PieChart as PieChartIcon, TrendingUp,
  AlertCircle, CreditCard, Car,
} from 'lucide-react';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR } from '@/lib/car/types';
import type {
  VehicleInfo,
  CarLoanItem,
  FuelRecordItem,
  CostRecordItem,
  CostShareItem,
  PaymentStatusType,
} from '@/lib/car/types';
import styles from './page.module.css';

import type { ShareData, MonthlyData, FuelPoint } from './DashboardCharts';

// recharts 圖表元件 — 動態載入避免 SSR 問題
const DashboardCharts = dynamic(
  () => import('./DashboardCharts'),
  {
    ssr: false,
    loading: () => (
      <div className={styles.chartWrap} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-text-secondary)', fontSize: '13px',
      }}>
        載入圖表中...
      </div>
    ),
  }
);

// ── 型別定義 ──────────────────────────────────────────────────

interface UserInfo {
  id: string;
  role: string;
  displayName: string;
}

interface ReportSummary {
  totalDays: number;
  totalCost: number;
  shares: ShareData[];
}

interface ReportMonthly {
  month: string;
  totalCost: number;
}

interface ReportData {
  summary: ReportSummary;
  monthly: ReportMonthly[];
}

interface UnpaidPerson {
  userId: string;
  displayName: string;
  total: number;
}

// ── 輔助函式 ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString('zh-TW')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ── Main Component ────────────────────────────────────────────

export default function CarDashboardPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [loading, setLoading] = useState(true);

  // 報表資料
  const [report, setReport] = useState<ReportData | null>(null);
  const [fuelRecords, setFuelRecords] = useState<FuelRecordItem[]>([]);
  const [loanInfo, setLoanInfo] = useState<CarLoanItem | null>(null);
  const [unpaidPersons, setUnpaidPersons] = useState<UnpaidPerson[]>([]);

  // 累計資料（全年）
  const [yearReport, setYearReport] = useState<ReportData | null>(null);

  // ── Fetch: 使用者 & 車輛 ───────────────────────────────────

  useEffect(() => {
    async function init() {
      try {
        const [userRes, vehicleRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/car/vehicles'),
        ]);
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData.user || userData);
        }
        if (vehicleRes.ok) {
          const vehicleData = await vehicleRes.json();
          const list: VehicleInfo[] = vehicleData.vehicles || [];
          setVehicles(list);
          const active = list.find((v) => v.isActive);
          if (active) setSelectedVehicleId(active.id);
          else if (list.length > 0) setSelectedVehicleId(list[0].id);
        }
      } catch { /* ignore */ }
    }
    init();
  }, []);

  // ── Fetch: 報表 & 附屬資料 ────────────────────────────────

  useEffect(() => {
    if (!selectedVehicleId) {
      setLoading(false);
      return;
    }

    async function fetchAll() {
      setLoading(true);
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;

      try {
        const [reportRes, yearReportRes, fuelRes, loanRes, unpaidRes] = await Promise.all([
          // 本月報表
          fetch(`/api/car/reports?vehicleId=${selectedVehicleId}&type=monthly&year=${year}&month=${month}`),
          // 全年報表（累計用）
          fetch(`/api/car/reports?vehicleId=${selectedVehicleId}&type=monthly&year=${year}&month=0`),
          // 加油記錄
          fetch(`/api/car/fuel?vehicleId=${selectedVehicleId}&limit=20`),
          // 車貸
          fetch(`/api/car/loans?vehicleId=${selectedVehicleId}`),
          // 未繳費用
          fetch(`/api/car/costs?vehicleId=${selectedVehicleId}&paymentStatus=UNPAID`),
        ]);

        if (reportRes.ok) {
          const data = await reportRes.json();
          setReport(data);
        }
        if (yearReportRes.ok) {
          const data = await yearReportRes.json();
          setYearReport(data);
        }
        if (fuelRes.ok) {
          const data = await fuelRes.json();
          setFuelRecords(data.records || data.fuelRecords || []);
        }
        if (loanRes.ok) {
          const data = await loanRes.json();
          const loans: CarLoanItem[] = data.loans || data.loan ? [data.loan] : [];
          const activeLoan = loans.find((l) => l.isActive) || loans[0] || null;
          setLoanInfo(activeLoan);
        }
        if (unpaidRes.ok) {
          const data = await unpaidRes.json();
          const records: CostRecordItem[] = data.records || [];
          // 彙總每人未繳金額
          const personMap = new Map<string, UnpaidPerson>();
          for (const rec of records) {
            for (const share of rec.shares) {
              if (share.paymentStatus === 'UNPAID') {
                const existing = personMap.get(share.userId);
                if (existing) {
                  existing.total += share.amount;
                } else {
                  personMap.set(share.userId, {
                    userId: share.userId,
                    displayName: share.user.displayName,
                    total: share.amount,
                  });
                }
              }
            }
          }
          setUnpaidPersons(Array.from(personMap.values()));
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }

    fetchAll();
  }, [selectedVehicleId]);

  // ── 衍生資料 ───────────────────────────────────────────────

  const summary = report?.summary;
  const yearSummary = yearReport?.summary;

  // 圖表資料
  const daysShares: ShareData[] = summary?.shares || [];
  const costShares: ShareData[] = summary?.shares || [];

  // 月費用走勢（取最近 12 個月）
  const monthlyData: MonthlyData[] = (yearReport?.monthly || report?.monthly || [])
    .slice(-12)
    .map((m) => ({ month: m.month, totalCost: m.totalCost }));

  // 油耗趨勢
  const fuelData: FuelPoint[] = fuelRecords
    .slice()
    .sort((a, b) => new Date(a.fuelDate).getTime() - new Date(b.fuelDate).getTime())
    .map((f) => ({
      date: `${new Date(f.fuelDate).getMonth() + 1}/${new Date(f.fuelDate).getDate()}`,
      efficiency: f.fuelEfficiency,
    }));

  // 車貸進度
  const loanProgress = loanInfo
    ? Math.round((loanInfo.paidCount / loanInfo.totalInstallments) * 100)
    : 0;

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入中...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <BarChart3 size={28} />
          統計儀表板
        </h1>
        <p className={styles.pageSubtitle}>
          用車費用總覽與數據分析
        </p>
      </div>

      {/* 車輛選擇 */}
      {vehicles.length > 1 && (
        <div className={styles.vehicleSelector}>
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`${styles.vehicleBtn} ${selectedVehicleId === v.id ? styles.vehicleBtnActive : ''}`}
              onClick={() => setSelectedVehicleId(v.id)}
            >
              <Car size={14} />
              {v.name || v.plateNumber}
            </button>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'rgba(90, 122, 90, 0.1)', color: '#5a7a5a' }}>
            <PieChartIcon size={20} />
          </div>
          <div className={styles.summaryNumber}>
            {summary?.totalDays ?? 0}
          </div>
          <div className={styles.summaryLabel}>本月總天數</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'rgba(139, 111, 71, 0.1)', color: '#8b6f47' }}>
            <CreditCard size={20} />
          </div>
          <div className={styles.summaryNumber}>
            {formatCurrency(summary?.totalCost ?? 0)}
          </div>
          <div className={styles.summaryLabel}>本月總費用</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'rgba(21, 101, 192, 0.1)', color: '#1565C0' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.summaryNumber}>
            {yearSummary?.totalDays ?? summary?.totalDays ?? 0}
          </div>
          <div className={styles.summaryLabel}>累計總天數</div>
        </div>

        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon} style={{ background: 'rgba(230, 81, 0, 0.1)', color: '#E65100' }}>
            <BarChart3 size={20} />
          </div>
          <div className={styles.summaryNumber}>
            {formatCurrency(yearSummary?.totalCost ?? summary?.totalCost ?? 0)}
          </div>
          <div className={styles.summaryLabel}>累計總費用</div>
        </div>
      </div>

      {/* Charts (dynamic) */}
      <DashboardCharts
        daysShares={daysShares}
        costShares={costShares}
        monthlyData={monthlyData}
        fuelData={fuelData}
      />

      {/* Unpaid Summary */}
      {unpaidPersons.length > 0 && (
        <div className={styles.unpaidCard}>
          <div className={styles.chartTitle}>
            <AlertCircle size={18} style={{ color: '#D32F2F' }} />
            未繳費用摘要
          </div>
          <div className={styles.unpaidList}>
            {unpaidPersons.map((p) => (
              <div key={p.userId} className={styles.unpaidRow}>
                <span className={styles.unpaidName}>{p.displayName}</span>
                <span
                  className={styles.unpaidBadge}
                  style={{ background: 'rgba(211, 47, 47, 0.1)', color: '#D32F2F' }}
                >
                  {formatCurrency(p.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loan Progress */}
      {loanInfo && (
        <div className={styles.loanCard}>
          <div className={styles.chartTitle}>
            <CreditCard size={18} style={{ color: '#B8860B' }} />
            車貸進度
          </div>

          <div className={styles.loanInfo}>
            <div className={styles.loanRow}>
              <span className={styles.loanLabel}>貸款機構</span>
              <span className={styles.loanValue}>{loanInfo.lender}</span>
            </div>
            <div className={styles.loanRow}>
              <span className={styles.loanLabel}>貸款金額</span>
              <span className={styles.loanValue}>{formatCurrency(loanInfo.loanAmount)}</span>
            </div>
            <div className={styles.loanRow}>
              <span className={styles.loanLabel}>月付金額</span>
              <span className={styles.loanValue}>{formatCurrency(loanInfo.monthlyPayment)}</span>
            </div>
            <div className={styles.loanRow}>
              <span className={styles.loanLabel}>剩餘本金</span>
              <span className={styles.loanValue}>{formatCurrency(loanInfo.remainingBalance)}</span>
            </div>
            <div className={styles.loanRow}>
              <span className={styles.loanLabel}>繳款進度</span>
              <span className={styles.loanValue}>
                {loanInfo.paidCount} / {loanInfo.totalInstallments} 期
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressBar}>
            <div
              className={styles.progressFill}
              style={{ width: `${loanProgress}%` }}
            />
          </div>
          <div className={styles.progressLabel}>
            已完成 {loanProgress}%
          </div>

          {/* Next payment info */}
          {loanInfo.paidCount < loanInfo.totalInstallments && (
            <div className={styles.nextPayment}>
              <span className={styles.nextPaymentLabel}>下次繳款日</span>
              <span className={styles.nextPaymentValue}>
                每月 {loanInfo.paymentDay} 日 · {formatCurrency(loanInfo.monthlyPayment)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!summary && !loanInfo && unpaidPersons.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}><BarChart3 size={48} /></div>
          <div className={styles.emptyText}>尚無統計資料</div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
            新增用車記錄與費用結算後，統計數據將顯示在此
          </p>
        </div>
      )}
    </div>
  );
}
