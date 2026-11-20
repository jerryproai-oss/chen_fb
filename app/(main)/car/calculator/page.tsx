'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calculator, Upload, Send, AlertCircle, CheckCircle, X } from 'lucide-react';
import { calculateCostShares, calculateSettlements } from '@/lib/car/cost-calculator';
import type { CostConfig, ChildUsage, CostCalculationResult } from '@/lib/car/cost-calculator';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL } from '@/lib/car/types';
import type { PaymentMethodType } from '@/lib/car/types';
import styles from './page.module.css';

// ── 型別 ──────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  displayName: string;
  role: string;
}

interface VehicleOption {
  id: string;
  name: string;
  plateNumber: string;
  isActive: boolean;
}

interface FamilyUser {
  id: string;
  displayName: string;
}

interface ConfigItem {
  id: string;
  vehicleId: string;
  item: string;
  parentRatio: number;
  calcMethod: string;
  dualTrackBaseRatio: number;
}

interface AccumulatedDay {
  userId: string;
  displayName: string;
  usageDays: number;
}

// ── 格式化輔助 ────────────────────────────────────────────────

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

function formatAmount(n: number): string {
  return n.toLocaleString('zh-TW');
}

// ── 主頁面 ────────────────────────────────────────────────────

export default function CarCalculatorPage() {
  // Auth
  const [user, setUser] = useState<UserInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Data sources
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [familyUsers, setFamilyUsers] = useState<FamilyUser[]>([]);
  const [days, setDays] = useState<AccumulatedDay[]>([]);

  // Form state
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [paidById, setPaidById] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CREDIT_CARD');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // Calculation results
  const [calcResult, setCalcResult] = useState<CostCalculationResult | null>(null);
  const [settlements, setSettlements] = useState<ReturnType<typeof calculateSettlements>>([]);

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [daysLoading, setDaysLoading] = useState(false);

  // ── 1. Auth check ───────────────────────────────────────────

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((data) => {
        setUser(data);
        setAuthLoading(false);
      })
      .catch(() => setAuthLoading(false));
  }, []);

  // ── 2. Load vehicles ───────────────────────────────────────

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    fetch('/api/car/vehicles')
      .then((r) => r.json())
      .then((data) => {
        const list: VehicleOption[] = data.vehicles ?? data ?? [];
        setVehicles(list);
        const active = list.find((v) => v.isActive);
        if (active) setSelectedVehicleId(active.id);
        else if (list.length > 0) setSelectedVehicleId(list[0].id);
      })
      .catch(() => {});
  }, [user]);

  // ── 3. Load family users ────────────────────────────────────

  useEffect(() => {
    if (!user || user.role !== 'ADMIN') return;
    fetch('/api/family')
      .then((r) => r.json())
      .then((data) => {
        const list: FamilyUser[] = data.users ?? data ?? [];
        setFamilyUsers(list);
        if (list.length > 0 && !paidById) {
          setPaidById(list[0].id);
        }
      })
      .catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Load configs when vehicle changes ────────────────────

  useEffect(() => {
    if (!selectedVehicleId) return;
    setConfigs([]);
    setSelectedItem('');
    fetch(`/api/car/config?vehicleId=${selectedVehicleId}`)
      .then((r) => r.json())
      .then((data) => {
        const list: ConfigItem[] = data.configs ?? [];
        setConfigs(list);
        if (list.length > 0) {
          setSelectedItem(list[0].item);
        }
      })
      .catch(() => {});
  }, [selectedVehicleId]);

  // ── 5. Auto-detect period when item changes ─────────────────

  useEffect(() => {
    if (!selectedVehicleId || !selectedItem) return;
    const today = formatDate(new Date());
    setPeriodEnd(today);

    fetch(
      `/api/car/costs?vehicleId=${selectedVehicleId}&item=${encodeURIComponent(selectedItem)}&limit=1&sort=desc`,
    )
      .then((r) => r.json())
      .then((data) => {
        const records = data.costs ?? data.records ?? data ?? [];
        if (Array.isArray(records) && records.length > 0) {
          const lastRecord = records[0];
          const lastSettlementDate =
            lastRecord.periodEnd ?? lastRecord.settlementDate ?? '';
          if (lastSettlementDate) {
            setPeriodStart(addDays(lastSettlementDate, 1));
          } else {
            setPeriodStart(today);
          }
        } else {
          setPeriodStart(today);
        }
      })
      .catch(() => setPeriodStart(today));
  }, [selectedVehicleId, selectedItem]);

  // ── 6. Fetch accumulated days ───────────────────────────────

  const fetchDays = useCallback(() => {
    if (!selectedVehicleId || !periodStart || !periodEnd) return;
    setDaysLoading(true);
    fetch(
      `/api/car/accumulated-days?vehicleId=${selectedVehicleId}&start=${periodStart}&end=${periodEnd}`,
    )
      .then((r) => r.json())
      .then((data) => {
        setDays(data.days ?? []);
        setDaysLoading(false);
      })
      .catch(() => setDaysLoading(false));
  }, [selectedVehicleId, periodStart, periodEnd]);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  // ── 7. Real-time calculation ────────────────────────────────

  useEffect(() => {
    if (!totalAmount || totalAmount <= 0 || days.length === 0 || !paidById) {
      setCalcResult(null);
      setSettlements([]);
      return;
    }

    const selectedConfig = configs.find((c) => c.item === selectedItem);
    if (!selectedConfig) {
      setCalcResult(null);
      setSettlements([]);
      return;
    }

    const config: CostConfig = {
      parentRatio: selectedConfig.parentRatio,
      calcMethod: selectedConfig.calcMethod as CostConfig['calcMethod'],
      dualTrackBaseRatio: selectedConfig.dualTrackBaseRatio,
    };

    // Separate parent from children in days
    // The first user in family is assumed parent if no explicit marker
    const parentUser = familyUsers.length > 0 ? familyUsers[0] : null;
    const parentId = parentUser?.id ?? '';
    const parentName = parentUser?.displayName ?? '父母';

    const children: ChildUsage[] = days
      .filter((d) => d.userId !== parentId)
      .map((d) => ({
        userId: d.userId,
        displayName: d.displayName,
        usageDays: d.usageDays,
      }));

    if (children.length === 0) {
      setCalcResult(null);
      setSettlements([]);
      return;
    }

    try {
      const result = calculateCostShares(
        totalAmount,
        config,
        children,
        parentId,
        parentName,
        paidById,
      );
      setCalcResult(result);

      const paidByUser = familyUsers.find((u) => u.id === paidById);
      const stlmts = calculateSettlements(result, paidByUser?.displayName ?? '');
      setSettlements(stlmts);
    } catch {
      setCalcResult(null);
      setSettlements([]);
    }
  }, [totalAmount, days, paidById, configs, selectedItem, familyUsers]);

  // ── 8. File handling ────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 9. Submit ───────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!calcResult || !selectedVehicleId || !totalAmount || !paidById) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('vehicleId', selectedVehicleId);
      formData.append('item', selectedItem);
      formData.append('totalAmount', String(totalAmount));
      formData.append('paidById', paidById);
      formData.append('paymentMethod', paymentMethod);
      formData.append('periodStart', periodStart);
      formData.append('periodEnd', periodEnd);
      formData.append('shares', JSON.stringify(calcResult.shares));
      formData.append('parentAmount', String(calcResult.parentAmount));
      formData.append('calcMethod', calcResult.calcMethod);
      formData.append('parentRatio', String(calcResult.parentRatio));

      for (const file of files) {
        formData.append('files', file);
      }

      const res = await fetch('/api/car/costs', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      setSuccess('費用記錄已成功送出！');
      // Reset form
      setTotalAmount('');
      setFiles([]);
      setCalcResult(null);
      setSettlements([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '送出失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────

  const selectedConfig = configs.find((c) => c.item === selectedItem);
  const calcMethodLabel =
    selectedConfig?.calcMethod === 'DUAL_TRACK' ? '雙軌制（均分＋天數）' : '均分制';
  const canSubmit =
    !!calcResult &&
    !!totalAmount &&
    totalAmount > 0 &&
    !!paidById &&
    !!selectedVehicleId &&
    !submitting;

  // ── Render: Loading ─────────────────────────────────────────

  if (authLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入中...</div>
      </div>
    );
  }

  // ── Render: Access denied ───────────────────────────────────

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <div className={styles.accessDeniedIcon}>
            <AlertCircle size={48} />
          </div>
          <p className={styles.accessDeniedText}>無權限存取</p>
          <p className={styles.accessDeniedHint}>此頁面僅限管理員使用</p>
        </div>
      </div>
    );
  }

  // ── Render: Main ────────────────────────────────────────────

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <Calculator size={28} />
          費用計算機
        </h1>
        <p className={styles.pageSubtitle}>
          計算用車費用分攤，自動依累計天數與規則產生分攤結果
        </p>
      </div>

      {/* Error / Success */}
      {error && (
        <div className={styles.errorMsg}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className={styles.successMsg}>
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      {/* Vehicle & Item Selection */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>車輛與費用項目</div>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>車輛</label>
            <select
              className={styles.formSelect}
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.plateNumber})
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>費用項目</label>
            <select
              className={styles.formSelect}
              value={selectedItem}
              onChange={(e) => setSelectedItem(e.target.value)}
            >
              <option value="">請選擇</option>
              {configs.map((c) => (
                <option key={c.id} value={c.item}>
                  {c.item}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Config Info */}
      {selectedConfig && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>分攤規則</div>
          <div className={styles.configInfo}>
            <span className={styles.configTag}>
              父母負擔 {Math.round(selectedConfig.parentRatio * 100)}%
            </span>
            <span className={styles.configTag}>{calcMethodLabel}</span>
            {selectedConfig.calcMethod === 'DUAL_TRACK' && (
              <span className={styles.configTag}>
                均分池 {Math.round(selectedConfig.dualTrackBaseRatio * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Period Display */}
      {periodStart && periodEnd && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>結算期間</div>
          <div className={styles.periodDisplay}>
            📅 {periodStart} ~ {periodEnd}
          </div>
          <div className={styles.formRow} style={{ marginTop: 'var(--space-sm)' }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>起始日（可調整）</label>
              <input
                type="date"
                className={styles.formInput}
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>結束日（可調整）</label>
              <input
                type="date"
                className={styles.formInput}
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Accumulated Days */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>累計用車天數</div>
        {daysLoading ? (
          <div className={styles.loading}>載入天數中...</div>
        ) : days.length > 0 ? (
          <div className={styles.daysGrid}>
            {days.map((d) => (
              <div key={d.userId} className={styles.dayItem}>
                <span className={styles.dayName}>{d.displayName}</span>
                <span className={styles.dayValue}>
                  {d.usageDays}
                  <span className={styles.dayUnit}> 天</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyHint}>尚無用車天數資料</div>
        )}
      </div>

      {/* Amount, PaidBy, Payment Method */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>費用資訊</div>
        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>費用總額</label>
            <input
              type="number"
              className={styles.formInput}
              placeholder="輸入金額"
              min={0}
              value={totalAmount}
              onChange={(e) =>
                setTotalAmount(e.target.value ? Number(e.target.value) : '')
              }
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>代墊人</label>
            <select
              className={styles.formSelect}
              value={paidById}
              onChange={(e) => setPaidById(e.target.value)}
            >
              <option value="">請選擇</option>
              {familyUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>付款方式</label>
          <select
            className={styles.formSelect}
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
          >
            {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethodType, string][]).map(
              ([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      {/* Calculation Preview */}
      {calcResult && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>
            分攤預覽
            <span
              className={`${styles.auditBadge} ${
                calcResult.auditCheck ? styles.auditPass : styles.auditFail
              }`}
            >
              {calcResult.auditCheck ? (
                <>
                  <CheckCircle size={12} /> 驗算通過
                </>
              ) : (
                <>
                  <AlertCircle size={12} /> 驗算異常
                </>
              )}
            </span>
          </div>

          <table className={styles.sharesTable}>
            <thead>
              <tr>
                <th>成員</th>
                <th>用車天數</th>
                <th style={{ textAlign: 'right' }}>分攤金額</th>
              </tr>
            </thead>
            <tbody>
              {calcResult.shares.map((s) => (
                <tr key={s.userId}>
                  <td>{s.displayName}</td>
                  <td>{s.usageDays > 0 ? `${s.usageDays} 天` : '—'}</td>
                  <td className={styles.amountCell}>${formatAmount(s.amount)}</td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td>合計</td>
                <td></td>
                <td className={styles.amountCell}>
                  ${formatAmount(calcResult.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className={styles.cardDesc} style={{ marginTop: 'var(--space-sm)' }}>
            父母負擔 ${formatAmount(calcResult.parentAmount)}（
            {Math.round(calcResult.parentRatio * 100)}%），子女分攤池 $
            {formatAmount(calcResult.childrenPool)}
          </div>
        </div>
      )}

      {/* Settlement (代墊結算) */}
      {settlements.length > 0 && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>代墊結算</div>
          <div className={styles.settlementList}>
            {settlements.map((s, i) => (
              <div key={i} className={styles.settlementItem}>
                <span className={styles.settlementFlow}>
                  {s.fromDisplayName}
                  <span className={styles.settlementArrow}>→</span>
                  {s.toDisplayName}
                </span>
                <span className={styles.settlementAmount}>
                  ${formatAmount(s.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Upload */}
      <div className={styles.card}>
        <div className={styles.cardTitle}>
          <Upload size={18} />
          附件上傳
        </div>
        <label className={styles.uploadArea}>
          <div className={styles.uploadIcon}>
            <Upload size={32} />
          </div>
          <div className={styles.uploadText}>點擊或拖曳上傳收據照片</div>
          <div className={styles.uploadHint}>支援圖片格式，可多選</div>
          <input
            type="file"
            multiple
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </label>
        {files.length > 0 && (
          <div className={styles.uploadedFiles}>
            {files.map((f, i) => (
              <span key={i} className={styles.uploadedFile}>
                {f.name}
                <button
                  type="button"
                  className={styles.removeFileBtn}
                  onClick={() => removeFile(i)}
                  aria-label="移除檔案"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Submit */}
      <button
        className={styles.submitBtn}
        disabled={!canSubmit}
        onClick={handleSubmit}
      >
        <Send size={18} />
        {submitting ? '送出中...' : '送出費用記錄'}
      </button>
    </div>
  );
}
