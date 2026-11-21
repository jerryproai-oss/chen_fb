'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Download, Calendar, DollarSign, Users, ChevronLeft, ChevronRight, ArrowLeft, Fuel as FuelIcon } from 'lucide-react';
import styles from './page.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

type ReportType = 'monthly' | 'quarterly' | 'yearly';

interface UserDayItem {
  userId: string;
  displayName: string;
  totalDays: number;
}

interface UserCostItem {
  userId: string;
  displayName: string;
  totalAmount: number;
}

interface ItemCostItem {
  item: string;
  amount: number;
}

interface PaymentSummary {
  totalShareCount: number;
  unpaidCount: number;
  paidCount: number;
  confirmedCount: number;
  unpaidAmount: number;
}

interface FuelTrendItem {
  date: string;
  mileage: number;
  amount: number;
  liters: number | null;
  efficiency: number | null;
  user: string;
}

interface LoanSummary {
  totalDue: number;
  paid: number;
  overdue: number;
  upcoming: number;
  totalDueAmount: number;
}

interface ReportData {
  period: { type: string; year: number; month?: number; startDate: string; endDate: string };
  summary: { totalCostAmount: number; totalFuelAmount: number; totalBookings: number };
  userDays: UserDayItem[];
  userCosts: UserCostItem[];
  itemCosts: ItemCostItem[];
  paymentSummary: PaymentSummary;
  fuelTrend: FuelTrendItem[];
  loanSummary: LoanSummary;
}

interface VehicleInfo {
  id: string;
  name: string;
  isActive: boolean;
}

// ── 常數 ──────────────────────────────────────────────────────

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  monthly: '月報',
  quarterly: '季報',
  yearly: '年報',
};

const QUARTER_LABELS = ['Q1 (1-3月)', 'Q2 (4-6月)', 'Q3 (7-9月)', 'Q4 (10-12月)'];

// ── Main Component ────────────────────────────────────────────

export default function ReportsPage() {
  const now = new Date();

  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));

  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [exporting, setExporting] = useState(false);

  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) {
    yearOptions.push(y);
  }

  // ── 初始載入 ───────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        const vRes = await fetch('/api/car/vehicles');
        if (vRes.ok) {
          const vData = await vRes.json();
          const list: VehicleInfo[] = vData.vehicles || [];
          setVehicles(list);
          const active = list.find((v) => v.isActive);
          if (active) setSelectedVehicleId(active.id);
          else if (list.length > 0) setSelectedVehicleId(list[0].id);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── 取得報表資料 ───────────────────────────────────────────

  const fetchReport = useCallback(async () => {
    if (!selectedVehicleId) return;
    setFetchError('');

    const params = new URLSearchParams({
      vehicleId: selectedVehicleId,
      type: reportType === 'monthly' ? 'month' : reportType === 'quarterly' ? 'quarter' : 'year',
      year: String(year),
    });

    if (reportType === 'monthly') {
      params.set('month', String(month));
    } else if (reportType === 'quarterly') {
      params.set('month', String((quarter - 1) * 3 + 1));
    }

    try {
      const res = await fetch(`/api/car/reports?${params.toString()}`);
      if (res.ok) {
        const data: ReportData = await res.json();
        setReportData(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError((err as Record<string, string>).error || '載入報表失敗');
        setReportData(null);
      }
    } catch {
      setFetchError('網路錯誤');
      setReportData(null);
    }
  }, [selectedVehicleId, reportType, year, month, quarter]);

  useEffect(() => {
    if (!loading && selectedVehicleId) {
      fetchReport();
    }
  }, [loading, selectedVehicleId, fetchReport]);

  // ── 期間導覽 ───────────────────────────────────────────────

  const navigatePeriod = (delta: number) => {
    if (reportType === 'monthly') {
      let newMonth = month + delta;
      let newYear = year;
      if (newMonth < 1) { newMonth = 12; newYear--; }
      else if (newMonth > 12) { newMonth = 1; newYear++; }
      setMonth(newMonth);
      setYear(newYear);
    } else if (reportType === 'quarterly') {
      let newQ = quarter + delta;
      let newYear = year;
      if (newQ < 1) { newQ = 4; newYear--; }
      else if (newQ > 4) { newQ = 1; newYear++; }
      setQuarter(newQ);
      setYear(newYear);
    } else {
      setYear(year + delta);
    }
  };

  const getPeriodLabel = (): string => {
    if (reportType === 'monthly') return `${year}年${month}月`;
    if (reportType === 'quarterly') return `${year}年 Q${quarter}`;
    return `${year}年`;
  };

  // ── 匯出 CSV ──────────────────────────────────────────────

  const handleExportCSV = async () => {
    if (!selectedVehicleId) return;
    setExporting(true);
    try {
      const params = new URLSearchParams({
        vehicleId: selectedVehicleId,
        type: reportType === 'monthly' ? 'month' : reportType === 'quarterly' ? 'quarter' : 'year',
        year: String(year),
        format: 'csv',
      });
      if (reportType === 'monthly') {
        params.set('month', String(month));
      } else if (reportType === 'quarterly') {
        params.set('month', String((quarter - 1) * 3 + 1));
      }

      const res = await fetch(`/api/car/reports/export?${params.toString()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${reportType}_${year}${reportType === 'monthly' ? `_${String(month).padStart(2, '0')}` : reportType === 'quarterly' ? `_Q${quarter}` : ''}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  };

  // ── 格式化金額 ─────────────────────────────────────────────

  const formatAmount = (amount: number | null | undefined) =>
    (amount ?? 0).toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

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
        <Link href="/calendar" className={styles.backLink}>
          <ArrowLeft size={16} /> 行事曆
        </Link>
        <h1 className={styles.pageTitle}>
          <FileText size={28} />
          明細報表
        </h1>
      </div>

      {/* Report Type Tabs */}
      <div className={styles.tabRow}>
        {(Object.entries(REPORT_TYPE_LABELS) as [ReportType, string][]).map(([type, label]) => (
          <button
            key={type}
            type="button"
            className={`${styles.tabBtn} ${reportType === type ? styles.tabBtnActive : ''}`}
            onClick={() => setReportType(type)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className={styles.controlRow}>
        {vehicles.length > 1 && (
          <select
            className={styles.selectControl}
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        )}
        <select
          className={styles.selectControl}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        {reportType === 'monthly' && (
          <select
            className={styles.selectControl}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        )}
        {reportType === 'quarterly' && (
          <select
            className={styles.selectControl}
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value))}
          >
            {QUARTER_LABELS.map((label, i) => (
              <option key={i + 1} value={i + 1}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Period Navigation */}
      <div className={styles.navRow}>
        <button type="button" className={styles.navBtn} onClick={() => navigatePeriod(-1)}>
          <ChevronLeft size={16} />
        </button>
        <span className={styles.periodLabel}>{getPeriodLabel()}</span>
        <button type="button" className={styles.navBtn} onClick={() => navigatePeriod(1)}>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Error */}
      {fetchError && (
        <div className={styles.emptyState}>
          <div className={styles.emptyText}>⚠️ {fetchError}</div>
        </div>
      )}

      {/* Content */}
      {reportData && (
        <>
          {/* Summary Cards */}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Calendar size={20} />
              </div>
              <div className={styles.summaryNumber}>{reportData.summary.totalBookings}</div>
              <div className={styles.summaryLabel}>用車次數</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <DollarSign size={20} />
              </div>
              <div className={styles.summaryNumber}>${formatAmount(reportData.summary.totalCostAmount)}</div>
              <div className={styles.summaryLabel}>保修費用</div>
            </div>

            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <FuelIcon size={20} />
              </div>
              <div className={styles.summaryNumber}>${formatAmount(reportData.summary.totalFuelAmount)}</div>
              <div className={styles.summaryLabel}>油費</div>
            </div>
          </div>

          {/* 各人用車天數 */}
          {reportData.userDays.length > 0 && (
            <div className={styles.summaryCard} style={{ marginBottom: 'var(--space-md)' }}>
              <div className={styles.summaryIcon}><Users size={20} /></div>
              <div className={styles.summaryLabel} style={{ marginBottom: 4 }}>各人用車天數</div>
              <div className={styles.sharesList}>
                {reportData.userDays.map((u) => (
                  <div key={u.userId} className={styles.shareRow}>
                    <span>{u.displayName}</span>
                    <span className={styles.shareRatio}>{u.totalDays} 天</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 各人費用分攤 */}
          {reportData.userCosts.length > 0 && (
            <div className={styles.summaryCard} style={{ marginBottom: 'var(--space-md)' }}>
              <div className={styles.summaryIcon}><DollarSign size={20} /></div>
              <div className={styles.summaryLabel} style={{ marginBottom: 4 }}>各人費用分攤</div>
              <div className={styles.sharesList}>
                {reportData.userCosts.map((u) => (
                  <div key={u.userId} className={styles.shareRow}>
                    <span>{u.displayName}</span>
                    <span className={styles.shareRatio}>${formatAmount(u.totalAmount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 繳款狀態 */}
          {reportData.paymentSummary.totalShareCount > 0 && (
            <div className={styles.summaryCard} style={{ marginBottom: 'var(--space-md)' }}>
              <div className={styles.summaryLabel}>繳款狀態</div>
              <div className={styles.sharesList}>
                <div className={styles.shareRow}>
                  <span>已確認</span>
                  <span style={{ color: '#2E7D32' }}>{reportData.paymentSummary.confirmedCount} 筆</span>
                </div>
                <div className={styles.shareRow}>
                  <span>已繳</span>
                  <span style={{ color: '#FF8F00' }}>{reportData.paymentSummary.paidCount} 筆</span>
                </div>
                <div className={styles.shareRow}>
                  <span>待繳</span>
                  <span style={{ color: '#D32F2F' }}>
                    {reportData.paymentSummary.unpaidCount} 筆
                    {reportData.paymentSummary.unpaidAmount > 0 && (
                      <>（${formatAmount(reportData.paymentSummary.unpaidAmount)}）</>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 費用項目分佈 */}
          {reportData.itemCosts.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>項目</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>金額</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.itemCosts.map((item) => (
                    <tr key={item.item} className={styles.tr}>
                      <td className={styles.td}>{item.item}</td>
                      <td className={`${styles.td} ${styles.tdAmount}`}>
                        ${formatAmount(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 油耗趨勢 */}
          {reportData.fuelTrend.length > 0 && (
            <div className={styles.tableWrap}>
              <div style={{ padding: 'var(--space-sm)', fontWeight: 600 }}>⛽ 加油記錄</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>日期</th>
                    <th className={styles.th}>加油人</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>金額</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>公升</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>油耗(km/L)</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.fuelTrend.map((f, i) => (
                    <tr key={i} className={styles.tr}>
                      <td className={styles.td}>{f.date}</td>
                      <td className={styles.td}>{f.user}</td>
                      <td className={`${styles.td} ${styles.tdAmount}`}>${formatAmount(f.amount)}</td>
                      <td className={`${styles.td} ${styles.tdAmount}`}>{f.liters?.toFixed(1) || '—'}</td>
                      <td className={`${styles.td} ${styles.tdAmount}`}>{f.efficiency?.toFixed(1) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Export */}
          <div className={styles.actionRow}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              期間：{reportData.period.startDate} ~ {reportData.period.endDate}
            </span>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExportCSV}
              disabled={exporting}
            >
              <Download size={14} />
              {exporting ? '匯出中...' : '匯出 CSV'}
            </button>
          </div>

          {/* 無資料 */}
          {reportData.summary.totalCostAmount === 0 &&
            reportData.summary.totalFuelAmount === 0 &&
            reportData.summary.totalBookings === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FileText size={48} />
              </div>
              <div className={styles.emptyText}>此期間無費用記錄</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
