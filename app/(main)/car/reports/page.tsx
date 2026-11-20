'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Calendar, DollarSign, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { PAYMENT_STATUS_LABEL, PAYMENT_STATUS_COLOR } from '@/lib/car/types';
import type { CostRecordItem, PaymentStatusType } from '@/lib/car/types';
import styles from './page.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

type ReportType = 'monthly' | 'quarterly' | 'yearly';

interface ShareSummary {
  userId: string;
  displayName: string;
  days: number;
  cost: number;
  ratio: number;
}

interface ReportSummary {
  totalDays: number;
  totalCost: number;
  shares: ShareSummary[];
}

interface ReportData {
  summary: ReportSummary;
  records: CostRecordItem[];
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

type SortDirection = 'asc' | 'desc';

// ── Main Component ────────────────────────────────────────────

export default function ReportsPage() {
  const now = new Date();

  // 基本狀態
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<ReportType>('monthly');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));

  // 車輛
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  // 報表資料
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [fetchError, setFetchError] = useState('');

  // 表格排序
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  // 匯出中
  const [exporting, setExporting] = useState(false);

  // ── 年份選項（過去 3 年）────────────────────────────────────
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
      // 以季度第一個月代表
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
      if (newMonth < 1) {
        newMonth = 12;
        newYear--;
      } else if (newMonth > 12) {
        newMonth = 1;
        newYear++;
      }
      setMonth(newMonth);
      setYear(newYear);
    } else if (reportType === 'quarterly') {
      let newQ = quarter + delta;
      let newYear = year;
      if (newQ < 1) {
        newQ = 4;
        newYear--;
      } else if (newQ > 4) {
        newQ = 1;
        newYear++;
      }
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

  // ── 排序記錄 ───────────────────────────────────────────────

  const sortedRecords = (() => {
    if (!reportData?.records) return [];
    return [...reportData.records].sort((a, b) => {
      const dateA = new Date(a.settlementDate).getTime();
      const dateB = new Date(b.settlementDate).getTime();
      return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
    });
  })();

  const toggleSort = () => {
    setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  };

  // ── 格式化金額 ─────────────────────────────────────────────

  const formatAmount = (amount: number) =>
    amount.toLocaleString('zh-TW', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ── 取得所有成員名單（從 shares） ─────────────────────────

  const shareMembers = reportData?.summary?.shares || [];

  // ── 取得記錄中某人的分攤金額 ───────────────────────────────

  const getShareAmount = (record: CostRecordItem, userId: string): number => {
    const share = record.shares?.find((s) => s.userId === userId);
    return share?.amount ?? 0;
  };

  const getShareStatus = (record: CostRecordItem, userId: string): PaymentStatusType => {
    const share = record.shares?.find((s) => s.userId === userId);
    return (share?.paymentStatus as PaymentStatusType) ?? 'UNPAID';
  };

  // ── 整體付款狀態 ──────────────────────────────────────────

  const getRecordOverallStatus = (record: CostRecordItem): PaymentStatusType => {
    if (!record.shares || record.shares.length === 0) return 'UNPAID';
    if (record.shares.every((s) => s.paymentStatus === 'CONFIRMED')) return 'CONFIRMED';
    if (record.shares.some((s) => s.paymentStatus === 'PAID' || s.paymentStatus === 'CONFIRMED')) return 'PAID';
    return 'UNPAID';
  };

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
        {/* Vehicle Selector */}
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

        {/* Year Selector */}
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

        {/* Month Selector (monthly only) */}
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

        {/* Quarter Selector (quarterly only) */}
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
            {/* 總天數 */}
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Calendar size={20} />
              </div>
              <div className={styles.summaryNumber}>{reportData.summary.totalDays}</div>
              <div className={styles.summaryLabel}>總天數</div>
            </div>

            {/* 總費用 */}
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <DollarSign size={20} />
              </div>
              <div className={styles.summaryNumber}>${formatAmount(reportData.summary.totalCost)}</div>
              <div className={styles.summaryLabel}>總費用</div>
            </div>

            {/* 各人佔比 */}
            <div className={styles.summaryCard}>
              <div className={styles.summaryIcon}>
                <Users size={20} />
              </div>
              <div className={styles.summaryLabel} style={{ marginBottom: 4 }}>各人佔比</div>
              <div className={styles.sharesList}>
                {shareMembers.map((s) => (
                  <div key={s.userId} className={styles.shareRow}>
                    <span>{s.displayName}</span>
                    <span className={styles.shareRatio}>{(s.ratio * 100).toFixed(1)}%</span>
                  </div>
                ))}
                {shareMembers.length === 0 && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    無資料
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Row — Export */}
          <div className={styles.actionRow}>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              共 {sortedRecords.length} 筆記錄
            </span>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExportCSV}
              disabled={exporting || sortedRecords.length === 0}
            >
              <Download size={14} />
              {exporting ? '匯出中...' : '匯出 CSV'}
            </button>
          </div>

          {/* Detail Table */}
          {sortedRecords.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th
                      className={`${styles.th} ${styles.thActive}`}
                      onClick={toggleSort}
                    >
                      日期
                      <span className={styles.sortIcon}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    </th>
                    <th className={styles.th}>項目</th>
                    <th className={styles.th} style={{ textAlign: 'right' }}>總額</th>
                    <th className={styles.th}>繳費人</th>
                    {shareMembers.map((s) => (
                      <th key={s.userId} className={styles.th} style={{ textAlign: 'right' }}>
                        {s.displayName}
                      </th>
                    ))}
                    <th className={styles.th}>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((record) => {
                    const overallStatus = getRecordOverallStatus(record);
                    return (
                      <tr key={record.id} className={styles.tr}>
                        <td className={styles.td}>{formatDate(record.settlementDate)}</td>
                        <td className={styles.td}>{record.item}</td>
                        <td className={`${styles.td} ${styles.tdAmount}`}>
                          ${formatAmount(record.totalAmount)}
                        </td>
                        <td className={styles.td}>{record.paidBy?.displayName || '-'}</td>
                        {shareMembers.map((s) => (
                          <td key={s.userId} className={`${styles.td} ${styles.tdAmount}`}>
                            ${formatAmount(getShareAmount(record, s.userId))}
                          </td>
                        ))}
                        <td className={styles.td}>
                          <span
                            className={styles.statusBadge}
                            style={{
                              backgroundColor: `${PAYMENT_STATUS_COLOR[overallStatus]}18`,
                              color: PAYMENT_STATUS_COLOR[overallStatus],
                            }}
                          >
                            {PAYMENT_STATUS_LABEL[overallStatus]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
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
