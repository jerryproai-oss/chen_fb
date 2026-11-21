'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Check, AlertCircle, Landmark } from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './page.module.css';
import HelpGuide from '@/components/ui/HelpGuide';
import { carLoanHelp } from '@/lib/constants/help-content';

// ── 型別 ──────────────────────────────────────────────────────

interface LoanItem {
  id: string;
  vehicleId: string | null;
  vehicle: { id: string; name: string } | null;
  loanType: string;
  loanName: string | null;
  lender: string;
  totalAmount: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  totalInstallments: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string;
  paymentDay: number;
  note: string | null;
  isActive: boolean;
  paidCount: number;
  remainingBalance: number;
  payments: PaymentItem[];
}

interface PaymentItem {
  id: string;
  installmentNo: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  status: 'UPCOMING' | 'PAID' | 'OVERDUE';
  paidAt: string | null;
  note: string | null;
}

interface VehicleOption {
  id: string;
  name: string;
}

interface UserInfo {
  id: string;
  role: string;
}

// ── 貸款類型 ──────────────────────────────────────────────────

type LoanTypeValue = 'CAR_LOAN' | 'MOTORCYCLE_LOAN' | 'PERSONAL_LOAN' | 'OTHER';

const LOAN_TYPE_OPTIONS: { value: LoanTypeValue; label: string; icon: string }[] = [
  { value: 'CAR_LOAN', label: '車貸', icon: '🚗' },
  { value: 'MOTORCYCLE_LOAN', label: '機車貸款', icon: '🏍️' },
  { value: 'PERSONAL_LOAN', label: '個人貸款', icon: '💳' },
  { value: 'OTHER', label: '其他', icon: '📋' },
];

function getLoanTypeLabel(type: string): string {
  return LOAN_TYPE_OPTIONS.find(o => o.value === type)?.label || type;
}

function getLoanTypeIcon(type: string): string {
  return LOAN_TYPE_OPTIONS.find(o => o.value === type)?.icon || '📋';
}

// ── 格式化輔助 ───────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return `NT$ ${n.toLocaleString('zh-TW')}`;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function fmtRate(r: number): string {
  return `${r.toFixed(2)}%`;
}

// ── 狀態色標 ──────────────────────────────────────────────────

function getStatusInfo(status: PaymentItem['status'], dueDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (status === 'PAID') {
    return { icon: '✅', label: '已繳', className: styles.statusPaid };
  }
  if (status === 'OVERDUE' || (status === 'UPCOMING' && daysUntil < 0)) {
    return { icon: '🔴', label: '逾期', className: styles.statusOverdue };
  }
  if (daysUntil <= 7 && daysUntil >= 0) {
    return { icon: '🔵', label: '即將', className: styles.statusUpcoming };
  }
  return { icon: '⬜', label: '待繳', className: styles.statusPending };
}

// ── 主頁面元件 ───────────────────────────────────────────────

export default function CarLoanPage() {
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [markingPayment, setMarkingPayment] = useState<string | null>(null);

  const isAdmin = userInfo?.role === 'ADMIN';

  // ── 取得使用者資訊 ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        const u = data.user || data;
        if (u?.id) {
          setUserInfo({ id: u.id, role: u.role });
        }
      })
      .catch(() => {});
  }, []);

  // ── 取得車貸資料 ───────────────────────────────────────────
  const fetchLoans = useCallback(async () => {
    try {
      setError(null);
      const [loansRes, vehiclesRes] = await Promise.all([
        fetch('/api/car/loans'),
        fetch('/api/car/vehicles'),
      ]);
      if (!loansRes.ok) throw new Error('載入失敗');
      const loansData = await loansRes.json();
      const vehiclesData = vehiclesRes.ok ? await vehiclesRes.json() : { vehicles: [] };

      // 取得每筆車貸的還款記錄
      const loansWithPayments = await Promise.all(
        (loansData.loans || []).map(async (loan: LoanItem) => {
          try {
            const pRes = await fetch(`/api/car/loans/${loan.id}/payments`);
            const pData = pRes.ok ? await pRes.json() : { payments: [] };
            return { ...loan, payments: pData.payments || [] };
          } catch {
            return { ...loan, payments: [] };
          }
        }),
      );

      setLoans(loansWithPayments);
      setVehicles(vehiclesData.vehicles || []);
    } catch {
      setError('無法載入車貸資料');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLoans(); }, [fetchLoans]);

  // ── 標記已繳 ───────────────────────────────────────────────
  const handleMarkPaid = async (loanId: string, paymentId: string, installmentNo: number) => {
    if (!isAdmin) return;
    setMarkingPayment(paymentId);
    try {
      const res = await fetch(`/api/car/loans/${loanId}/payments?installmentNo=${installmentNo}`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '操作失敗');
      }
      await fetchLoans();
    } catch (err) {
      alert(err instanceof Error ? err.message : '標記失敗');
    } finally {
      setMarkingPayment(null);
    }
  };

  // ── 新增車貸 ───────────────────────────────────────────────
  const handleCreateLoan = async (formData: CreateLoanForm) => {
    try {
      const res = await fetch('/api/car/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '建立失敗');
      }
      setShowCreateDialog(false);
      await fetchLoans();
    } catch (err) {
      alert(err instanceof Error ? err.message : '建立車貸失敗');
    }
  };

  // ── 渲染 ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入貸款資料中...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Link href="/calendar" className={styles.backLink}>
        <ArrowLeft size={16} /> 行事曆
      </Link>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.pageTitle}>
            <Landmark size={24} />
            貸款管理
            <HelpGuide content={carLoanHelp} />
          </h1>
          {isAdmin && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus size={16} />
              新增貸款
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {loans.length === 0 ? (
        <div className={styles.emptyState}>
          <Landmark size={48} className={styles.emptyIcon} />
          <p className={styles.emptyText}>尚無貸款記錄</p>
          {isAdmin && (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus size={16} />
              新增第一筆貸款
            </button>
          )}
        </div>
      ) : (
        loans.map(loan => {
          const isExpanded = expandedLoanId === loan.id;
          const progressPercent = loan.totalInstallments > 0
            ? Math.round((loan.paidCount / loan.totalInstallments) * 100)
            : 0;

          return (
            <div key={loan.id} className={styles.loanCard}>
              {/* 車貸資訊卡片 */}
              <div className={styles.loanHeader}>
                <div className={styles.loanTitleRow}>
                  <div className={styles.loanIcon}>{getLoanTypeIcon(loan.loanType)}</div>
                  <div className={styles.loanTitleInfo}>
                    <h2 className={styles.loanTitle}>
                      {loan.loanName || loan.lender}
                    </h2>
                    <span className={styles.loanVehicle}>
                      {loan.vehicle ? loan.vehicle.name : getLoanTypeLabel(loan.loanType)}
                      {loan.loanName && loan.vehicle ? '' : ` · ${loan.lender}`}
                    </span>
                  </div>
                  {!loan.isActive && (
                    <span className={styles.inactiveBadge}>已結清</span>
                  )}
                </div>

                <div className={styles.loanStats}>
                  <div className={styles.loanStat}>
                    <span className={styles.loanStatLabel}>貸款金額</span>
                    <span className={styles.loanStatValue}>{fmtCurrency(loan.loanAmount)}</span>
                  </div>
                  <div className={styles.loanStat}>
                    <span className={styles.loanStatLabel}>年利率</span>
                    <span className={styles.loanStatValue}>{fmtRate(loan.interestRate)}</span>
                  </div>
                  <div className={styles.loanStat}>
                    <span className={styles.loanStatLabel}>期數</span>
                    <span className={styles.loanStatValue}>{loan.totalInstallments} 期</span>
                  </div>
                  <div className={styles.loanStat}>
                    <span className={styles.loanStatLabel}>月付金</span>
                    <span className={styles.loanStatValue}>{fmtCurrency(loan.monthlyPayment)}</span>
                  </div>
                </div>

                {/* 進度條 */}
                <div className={styles.progressSection}>
                  <div className={styles.progressHeader}>
                    <span className={styles.progressLabel}>
                      還款進度：{loan.paidCount} / {loan.totalInstallments} 期
                    </span>
                    <span className={styles.progressPercent}>{progressPercent}%</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className={styles.progressInfo}>
                    <span>起始：{fmtDate(loan.startDate)}</span>
                    <span>到期：{fmtDate(loan.endDate)}</span>
                  </div>
                </div>

                {/* 展開/收合 */}
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp size={16} />
                      收合還款計畫
                    </>
                  ) : (
                    <>
                      <ChevronDown size={16} />
                      展開還款計畫
                    </>
                  )}
                </button>
              </div>

              {/* 還款計畫表 */}
              {isExpanded && (
                <div className={styles.scheduleSection}>
                  <div className={styles.scheduleTableWrap}>
                    <table className={styles.scheduleTable}>
                      <thead>
                        <tr>
                          <th>期數</th>
                          <th>應繳日</th>
                          <th className={styles.alignRight}>月付金</th>
                          <th className={styles.alignRight}>本金</th>
                          <th className={styles.alignRight}>利息</th>
                          <th className={styles.alignRight}>剩餘本金</th>
                          <th>狀態</th>
                          {isAdmin && <th>操作</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {loan.payments.map(p => {
                          const statusInfo = getStatusInfo(p.status, p.dueDate);
                          return (
                            <tr key={p.id} className={statusInfo.className}>
                              <td>{p.installmentNo}</td>
                              <td>{fmtDate(p.dueDate)}</td>
                              <td className={styles.alignRight}>{fmtCurrency(p.amount)}</td>
                              <td className={styles.alignRight}>{fmtCurrency(p.principal)}</td>
                              <td className={styles.alignRight}>{fmtCurrency(p.interest)}</td>
                              <td className={styles.alignRight}>{fmtCurrency(p.remainingBalance)}</td>
                              <td>
                                <span className={styles.statusBadge}>
                                  {statusInfo.icon} {statusInfo.label}
                                </span>
                              </td>
                              {isAdmin && (
                                <td>
                                  {p.status !== 'PAID' && (
                                    <button
                                      type="button"
                                      className={styles.markPaidBtn}
                                      disabled={markingPayment === p.id}
                                      onClick={() => handleMarkPaid(loan.id, p.id, p.installmentNo)}
                                    >
                                      <Check size={14} />
                                      {markingPayment === p.id ? '處理中...' : '標記已繳'}
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* 新增車貸 Dialog */}
      {showCreateDialog && (
        <CreateLoanDialog
          vehicles={vehicles}
          onClose={() => setShowCreateDialog(false)}
          onSubmit={handleCreateLoan}
        />
      )}
    </div>
  );
}

// ── 新增車貸 Dialog ──────────────────────────────────────────

interface CreateLoanForm {
  vehicleId: string;
  loanType: LoanTypeValue;
  loanName: string;
  lender: string;
  totalAmount: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  totalInstallments: number;
  startDate: string;
  paymentDay: number;
  note: string;
}

function CreateLoanDialog({
  vehicles,
  onClose,
  onSubmit,
}: {
  vehicles: VehicleOption[];
  onClose: () => void;
  onSubmit: (data: CreateLoanForm) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateLoanForm>({
    vehicleId: vehicles[0]?.id || '',
    loanType: 'CAR_LOAN',
    loanName: '',
    lender: '',
    totalAmount: 0,
    downPayment: 0,
    loanAmount: 0,
    interestRate: 0,
    totalInstallments: 60,
    startDate: new Date().toISOString().split('T')[0],
    paymentDay: 15,
    note: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // 自動計算貸款金額
  useEffect(() => {
    const loan = form.totalAmount - form.downPayment;
    if (loan >= 0) {
      setForm(prev => ({ ...prev, loanAmount: loan }));
    }
  }, [form.totalAmount, form.downPayment]);

  // 預估月付金
  const estimatedMonthly = (() => {
    if (form.loanAmount <= 0 || form.interestRate <= 0 || form.totalInstallments <= 0) return 0;
    const r = form.interestRate / 12 / 100;
    const n = form.totalInstallments;
    const p = form.loanAmount;
    return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
  })();

  const handleChange = (field: keyof CreateLoanForm, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.loanType === 'CAR_LOAN' && !form.vehicleId) {
      alert('車貸必須選擇車輛');
      return;
    }
    if (!form.lender || form.loanAmount <= 0) {
      alert('請填寫必要欄位');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>新增貸款</h2>
          <button type="button" className={styles.dialogCloseBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.dialogBody}>
          {/* 貸款類型 */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              貸款類型
              <select
                className={styles.formSelect}
                value={form.loanType}
                onChange={e => handleChange('loanType', e.target.value)}
              >
                {LOAN_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                ))}
              </select>
            </label>
            {form.loanType !== 'CAR_LOAN' && (
              <label className={styles.formLabel}>
                貸款名稱
                <input
                  type="text"
                  className={styles.formInput}
                  value={form.loanName}
                  onChange={e => handleChange('loanName', e.target.value)}
                  placeholder="如：機車貸款"
                />
              </label>
            )}
          </div>

          <div className={styles.formRow}>
            {form.loanType === 'CAR_LOAN' && (
              <label className={styles.formLabel}>
                車輛
                <select
                  className={styles.formSelect}
                  value={form.vehicleId}
                  onChange={e => handleChange('vehicleId', e.target.value)}
                  required
                >
                  <option value="">請選擇車輛</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.formLabel}>
              貸款機構
              <input
                type="text"
                className={styles.formInput}
                value={form.lender}
                onChange={e => handleChange('lender', e.target.value)}
                placeholder="如：中國信託"
                required
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              總價
              <input
                type="number"
                className={styles.formInput}
                value={form.totalAmount || ''}
                onChange={e => handleChange('totalAmount', Number(e.target.value))}
                placeholder="0"
                min={0}
                required
              />
            </label>
            <label className={styles.formLabel}>
              頭期款
              <input
                type="number"
                className={styles.formInput}
                value={form.downPayment || ''}
                onChange={e => handleChange('downPayment', Number(e.target.value))}
                placeholder="0"
                min={0}
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              貸款金額（自動計算）
              <input
                type="number"
                className={styles.formInput}
                value={form.loanAmount}
                readOnly
              />
            </label>
            <label className={styles.formLabel}>
              年利率（%）
              <input
                type="number"
                className={styles.formInput}
                value={form.interestRate || ''}
                onChange={e => handleChange('interestRate', Number(e.target.value))}
                placeholder="如 2.5"
                step="0.01"
                min={0}
                required
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              總期數
              <input
                type="number"
                className={styles.formInput}
                value={form.totalInstallments || ''}
                onChange={e => handleChange('totalInstallments', Number(e.target.value))}
                placeholder="60"
                min={1}
                max={360}
                required
              />
            </label>
            <label className={styles.formLabel}>
              每月扣款日
              <input
                type="number"
                className={styles.formInput}
                value={form.paymentDay || ''}
                onChange={e => handleChange('paymentDay', Number(e.target.value))}
                min={1}
                max={31}
                required
              />
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              貸款起始日
              <input
                type="date"
                className={styles.formInput}
                value={form.startDate}
                onChange={e => handleChange('startDate', e.target.value)}
                required
              />
            </label>
          </div>

          {estimatedMonthly > 0 && (
            <div className={styles.estimateBox}>
              預估月付金：<strong>{fmtCurrency(estimatedMonthly)}</strong>
            </div>
          )}

          <label className={styles.formLabel}>
            備註
            <textarea
              className={styles.formTextarea}
              value={form.note}
              onChange={e => handleChange('note', e.target.value)}
              placeholder="選填"
              rows={2}
            />
          </label>

          <div className={styles.dialogFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              取消
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? '建立中...' : '建立貸款'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
