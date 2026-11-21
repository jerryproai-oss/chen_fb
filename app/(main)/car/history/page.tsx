'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Download, ChevronDown, ChevronUp,
  Check, CheckCheck, Pencil, X, Filter,
} from 'lucide-react';
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
  PAYMENT_METHOD_LABEL,
} from '@/lib/car/types';
import type {
  CostRecordItem,
  CostShareItem,
  PaymentStatusType,
  AttachmentItem,
} from '@/lib/car/types';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './page.module.css';

// ── Types ─────────────────────────────────────────────────────

interface UserInfo {
  id: string;
  role: string;
  displayName: string;
}

interface VehicleInfo {
  id: string;
  name: string;
}

interface ConfigItem {
  id: string;
  item: string;
}

interface AmendmentItem {
  id: string;
  previousAmount: number;
  newAmount: number;
  reason: string;
  amendedBy: { displayName: string };
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString('zh-TW')}`;
}

function getDefaultDateRange(): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 3);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

// ── Main Component ────────────────────────────────────────────

export default function CarHistoryPage() {
  // ── User & Vehicle state ──
  const [user, setUser] = useState<UserInfo | null>(null);
  const [vehicles, setVehicles] = useState<VehicleInfo[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');

  // ── Filter state ──
  const [startDate, setStartDate] = useState(getDefaultDateRange().startDate);
  const [endDate, setEndDate] = useState(getDefaultDateRange().endDate);
  const [itemFilter, setItemFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [configItems, setConfigItems] = useState<ConfigItem[]>([]);

  // ── Data ──
  const [records, setRecords] = useState<CostRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // ── Expand state ──
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Record<string, AttachmentItem[]>>({});
  const [loadingAttachments, setLoadingAttachments] = useState<Record<string, boolean>>({});

  // ── Amendment modal state ──
  const [amendModal, setAmendModal] = useState<{
    recordId: string;
    currentAmount: number;
  } | null>(null);
  const [amendAmount, setAmendAmount] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [amendSaving, setAmendSaving] = useState(false);

  // ── Action loading state ──
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const isAdmin = user?.role === 'ADMIN';

  // ── Fetch user ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user || data);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // ── Fetch vehicles ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/car/vehicles');
        if (res.ok) {
          const data = await res.json();
          const list: VehicleInfo[] = data.vehicles || [];
          setVehicles(list);
          if (list.length > 0 && !selectedVehicleId) {
            setSelectedVehicleId(list[0].id);
          }
        }
      } catch { /* ignore */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch config items (for item filter dropdown) ──
  useEffect(() => {
    if (!selectedVehicleId) return;
    (async () => {
      try {
        const res = await fetch(`/api/car/config?vehicleId=${selectedVehicleId}`);
        if (res.ok) {
          const data = await res.json();
          setConfigItems(data.configs || []);
        }
      } catch { /* ignore */ }
    })();
  }, [selectedVehicleId]);

  // ── Fetch records ──
  const fetchRecords = useCallback(async () => {
    if (!selectedVehicleId) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        vehicleId: selectedVehicleId,
        startDate,
        endDate,
      });
      if (itemFilter) params.set('item', itemFilter);
      if (statusFilter) params.set('paymentStatus', statusFilter);

      const res = await fetch(`/api/car/costs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      } else {
        setError('載入記錄失敗');
      }
    } catch {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleId, startDate, endDate, itemFilter, statusFilter]);

  useEffect(() => {
    if (selectedVehicleId) {
      fetchRecords();
    }
  }, [fetchRecords, selectedVehicleId]);

  // ── Fetch attachments on expand ──
  const fetchAttachments = useCallback(async (recordId: string) => {
    if (attachments[recordId]) return; // already loaded
    setLoadingAttachments((prev) => ({ ...prev, [recordId]: true }));
    try {
      const res = await fetch(`/api/car/costs/${recordId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        setAttachments((prev) => ({
          ...prev,
          [recordId]: data.attachments || [],
        }));
      }
    } catch { /* ignore */ } finally {
      setLoadingAttachments((prev) => ({ ...prev, [recordId]: false }));
    }
  }, [attachments]);

  // ── Toggle expand ──
  const handleToggleExpand = (recordId: string) => {
    if (expandedId === recordId) {
      setExpandedId(null);
    } else {
      setExpandedId(recordId);
      fetchAttachments(recordId);
    }
  };

  // ── Show toast ──
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  // ── Payment actions ──
  const handleMarkPaid = async (shareId: string) => {
    setActionLoading((prev) => ({ ...prev, [shareId]: true }));
    try {
      const res = await fetch(`/api/car/payments/${shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'markPaid' }),
      });
      if (res.ok) {
        showToast('已標記為已繳');
        fetchRecords();
      } else {
        const data = await res.json();
        setError(data.error || '操作失敗');
      }
    } catch {
      setError('網路錯誤');
    } finally {
      setActionLoading((prev) => ({ ...prev, [shareId]: false }));
    }
  };

  const handleConfirmPayment = async (shareId: string) => {
    setActionLoading((prev) => ({ ...prev, [shareId]: true }));
    try {
      const res = await fetch(`/api/car/payments/${shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        showToast('已確認付款');
        fetchRecords();
      } else {
        const data = await res.json();
        setError(data.error || '操作失敗');
      }
    } catch {
      setError('網路錯誤');
    } finally {
      setActionLoading((prev) => ({ ...prev, [shareId]: false }));
    }
  };

  // ── Amendment ──
  const handleOpenAmend = (record: CostRecordItem) => {
    setAmendModal({ recordId: record.id, currentAmount: record.totalAmount });
    setAmendAmount(record.totalAmount.toString());
    setAmendReason('');
  };

  const handleSubmitAmend = async () => {
    if (!amendModal) return;
    const newAmount = parseFloat(amendAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      setError('請輸入有效金額');
      return;
    }
    if (!amendReason.trim()) {
      setError('請輸入修改原因');
      return;
    }
    setAmendSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/car/costs/${amendModal.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalAmount: newAmount,
          reason: amendReason.trim(),
        }),
      });
      if (res.ok) {
        showToast('金額已修改');
        setAmendModal(null);
        fetchRecords();
      } else {
        const data = await res.json();
        setError(data.error || '修改失敗');
      }
    } catch {
      setError('網路錯誤');
    } finally {
      setAmendSaving(false);
    }
  };

  // ── Export ──
  const handleExport = () => {
    const params = new URLSearchParams({
      vehicleId: selectedVehicleId,
      startDate,
      endDate,
    });
    if (itemFilter) params.set('item', itemFilter);
    if (statusFilter) params.set('paymentStatus', statusFilter);
    window.open(`/api/car/reports/export?${params.toString()}`, '_blank');
  };

  // ── Render helpers ──

  const renderStatusBadge = (status: PaymentStatusType) => {
    const color = PAYMENT_STATUS_COLOR[status];
    return (
      <span
        className={styles.statusBadge}
        style={{
          color,
          background: `${color}18`,
        }}
      >
        {status === 'CONFIRMED' && <CheckCheck size={10} />}
        {status === 'PAID' && <Check size={10} />}
        {PAYMENT_STATUS_LABEL[status]}
      </span>
    );
  };

  const renderShareActions = (share: CostShareItem) => {
    if (!user) return null;
    const isOwn = share.userId === user.id;
    const isLoading = actionLoading[share.id];

    return (
      <div className={styles.shareActions}>
        {/* Current user can mark their own share as PAID */}
        {isOwn && share.paymentStatus === 'UNPAID' && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={(e) => { e.stopPropagation(); handleMarkPaid(share.id); }}
            disabled={isLoading}
            title="標記已繳"
          >
            <Check size={12} /> 已繳
          </button>
        )}
        {/* ADMIN can confirm payment */}
        {isAdmin && share.paymentStatus === 'PAID' && (
          <button
            type="button"
            className={styles.btnPrimary}
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={(e) => { e.stopPropagation(); handleConfirmPayment(share.id); }}
            disabled={isLoading}
            title="確認付款"
          >
            <CheckCheck size={12} /> 確認
          </button>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────

  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入中...</div>
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
        <h1 className={styles.pageTitle}>
          <FileText size={28} />
          結算歷史
        </h1>
        <p className={styles.pageSubtitle}>查看費用結算記錄與付款狀態</p>
      </div>

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Error */}
      {error && (
        <div className={styles.error}>
          {error}
          <button
            type="button"
            className={styles.btnIcon}
            onClick={() => setError('')}
            style={{ marginLeft: 8, width: 20, height: 20 }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className={styles.filterBar}>
        {/* Vehicle selector */}
        {vehicles.length > 1 && (
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>車輛</label>
            <select
              className={styles.filterSelect}
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date range */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>起始日期</label>
          <input
            type="date"
            className={styles.filterInput}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>結束日期</label>
          <input
            type="date"
            className={styles.filterInput}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        {/* Item filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>項目</label>
          <select
            className={styles.filterSelect}
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
          >
            <option value="">全部項目</option>
            {configItems.map((c) => (
              <option key={c.id} value={c.item}>{c.item}</option>
            ))}
          </select>
        </div>

        {/* Payment status filter */}
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>付款狀態</label>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">全部狀態</option>
            <option value="UNPAID">待繳</option>
            <option value="PAID">已繳</option>
            <option value="CONFIRMED">已確認</option>
          </select>
        </div>

        {/* Filter actions */}
        <div className={styles.filterActions}>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={fetchRecords}
            style={{ padding: '6px 14px' }}
          >
            <Filter size={14} /> 查詢
          </button>
        </div>
      </div>

      {/* Top actions: Export */}
      <div className={styles.topActions}>
        <button
          type="button"
          className={styles.btnExport}
          onClick={handleExport}
        >
          <Download size={14} /> 匯出
        </button>
      </div>

      {/* Records */}
      {loading ? (
        <div className={styles.loading}>載入中...</div>
      ) : records.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <FileText size={48} />
            </div>
            <div className={styles.emptyText}>
              目前沒有符合條件的結算記錄
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.card}>
          {records.map((record) => {
            const isExpanded = expandedId === record.id;
            const recordAttachments = attachments[record.id] || [];
            const isLoadingAtt = loadingAttachments[record.id];
            const amendments = (record as CostRecordItem & { amendments?: AmendmentItem[] }).amendments;

            return (
              <div key={record.id}>
                {/* Record summary row */}
                <div
                  className={styles.recordItem}
                  onClick={() => handleToggleExpand(record.id)}
                >
                  <div className={styles.recordHeader}>
                    <div className={styles.recordMain}>
                      <div className={styles.recordTopRow}>
                        <span className={styles.recordDate}>
                          {formatDate(record.settlementDate)}
                        </span>
                        <span className={styles.recordItemName}>
                          {record.item}
                        </span>
                        <span className={styles.recordAmount}>
                          {formatCurrency(record.totalAmount)}
                        </span>
                      </div>
                      <div className={styles.recordPaidBy}>
                        墊付：{record.paidBy.displayName}
                        {record.periodStart && record.periodEnd && (
                          <span className={styles.periodInfo} style={{ marginLeft: 8 }}>
                            {formatDate(record.periodStart)} ~ {formatDate(record.periodEnd)}
                          </span>
                        )}
                      </div>
                      {/* Shares summary with status badges */}
                      <div className={styles.recordShares}>
                        {record.shares.map((share) => (
                          <span key={share.id} className={styles.shareBadge}>
                            {share.user.displayName}
                            {' '}
                            {formatCurrency(share.amount)}
                            {' '}
                            {renderStatusBadge(share.paymentStatus)}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Expand/Collapse icon + Admin amend btn */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isAdmin && (
                        <button
                          type="button"
                          className={styles.btnIcon}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenAmend(record);
                          }}
                          title="修改金額"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      <span className={styles.expandIcon}>
                        {isExpanded
                          ? <ChevronUp size={18} />
                          : <ChevronDown size={18} />}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={styles.expandedDetail}>
                    {/* Shares breakdown table */}
                    <div className={styles.detailSection}>
                      <div className={styles.detailTitle}>分攤明細</div>
                      <table className={styles.shareTable}>
                        <thead>
                          <tr>
                            <th>成員</th>
                            <th>使用天數</th>
                            <th>分攤金額</th>
                            <th>狀態</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {record.shares.map((share) => (
                            <tr key={share.id} className={styles.shareRow}>
                              <td>{share.user.displayName}</td>
                              <td>{share.usageDays} 天</td>
                              <td>{formatCurrency(share.amount)}</td>
                              <td>
                                {renderStatusBadge(share.paymentStatus)}
                                {share.paidAt && (
                                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                    繳付：{formatDate(share.paidAt)}
                                  </div>
                                )}
                                {share.confirmedAt && (
                                  <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                                    確認：{formatDate(share.confirmedAt)}
                                  </div>
                                )}
                              </td>
                              <td>{renderShareActions(share)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Payment info */}
                    <div className={styles.detailSection}>
                      <div className={styles.detailTitle}>付款資訊</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        付款方式：{PAYMENT_METHOD_LABEL[record.paymentMethod] || record.paymentMethod}
                        {record.paymentRef && <> · 參考號：{record.paymentRef}</>}
                        {record.paymentNote && <> · 備註：{record.paymentNote}</>}
                      </div>
                    </div>

                    {/* Attachments */}
                    <div className={styles.detailSection}>
                      <div className={styles.detailTitle}>
                        附件 ({record.attachmentCount})
                      </div>
                      {isLoadingAtt ? (
                        <div className={styles.loading} style={{ padding: 'var(--space-sm)' }}>
                          載入附件中...
                        </div>
                      ) : recordAttachments.length > 0 ? (
                        <div className={styles.attachmentList}>
                          {recordAttachments.map((att) => (
                            <div key={att.id} className={styles.attachmentItem}>
                              <FileText size={14} className={styles.attachmentIcon} />
                              <span className={styles.attachmentName}>{att.filename}</span>
                              <span className={styles.attachmentMeta}>
                                {(att.fileSize / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}>
                          無附件
                        </div>
                      )}
                    </div>

                    {/* Amendment history */}
                    {amendments && amendments.length > 0 && (
                      <div className={styles.detailSection}>
                        <div className={styles.detailTitle}>修改紀錄</div>
                        {amendments.map((am) => (
                          <div key={am.id} className={styles.amendmentItem}>
                            <div className={styles.amendmentMeta}>
                              <span>{am.amendedBy.displayName}</span>
                              <span>·</span>
                              <span>{formatDate(am.createdAt)}</span>
                              <span>·</span>
                              <span>
                                {formatCurrency(am.previousAmount)} → {formatCurrency(am.newAmount)}
                              </span>
                            </div>
                            <div className={styles.amendmentReason}>
                              原因：{am.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Amendment Modal */}
      {amendModal && (
        <div className={styles.modalOverlay} onClick={() => setAmendModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>修改金額</span>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setAmendModal(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>目前金額</label>
                <div style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                }}>
                  {formatCurrency(amendModal.currentAmount)}
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>新金額</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={amendAmount}
                  onChange={(e) => setAmendAmount(e.target.value)}
                  min="0"
                  step="1"
                  placeholder="請輸入新金額"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>修改原因</label>
                <textarea
                  className={styles.formTextarea}
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  placeholder="請說明修改原因"
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setAmendModal(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleSubmitAmend}
                disabled={amendSaving}
              >
                {amendSaving ? '儲存中...' : '確認修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
