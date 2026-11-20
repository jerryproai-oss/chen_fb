'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Camera, Upload, Sparkles, Loader2 } from 'lucide-react';
import type { CostRecordItem, PaymentMethodType } from '@/lib/car/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/car/types';
import styles from './page.module.css';

const MAINTENANCE_KEYWORDS = ['保養', '大保養', '輪胎', '煞車', '機油', '冷氣', '保修', '維修', '保固'];

// 常用保修項目快速選擇
const QUICK_ITEMS = [
  '定期保養', '大保養', '機油更換', '輪胎更換', '煞車來令片',
  '冷氣保養', '雨刷更換', '電瓶更換', '冷卻液更換', '變速箱油更換',
];

const PAYMENT_METHODS = [
  { value: 'CASH', label: '現金' },
  { value: 'TRANSFER', label: '轉帳' },
  { value: 'CREDIT_CARD', label: '信用卡' },
  { value: 'LINE_PAY', label: 'LINE Pay' },
  { value: 'OTHER', label: '其他' },
];

function isMaintenance(item: string): boolean {
  const lower = item.toLowerCase();
  return (
    MAINTENANCE_KEYWORDS.some(k => item.includes(k)) ||
    lower.includes('repair') ||
    lower.includes('maintenance')
  );
}

function getLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── 型別 ────────────────────────────────────────────────────

interface VehicleOption {
  id: string;
  name: string;
}

interface FamilyUser {
  id: string;
  displayName: string;
}

// ── 主頁面 ──────────────────────────────────────────────────

export default function MaintenancePage() {
  const [records, setRecords] = useState<CostRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);

  // 新增表單
  const [showForm, setShowForm] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyUser[]>([]);
  const [currentUser, setCurrentUser] = useState<FamilyUser | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formItem, setFormItem] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(getLocalDate());
  const [formPaymentMethod, setFormPaymentMethod] = useState('CASH');
  const [formNote, setFormNote] = useState('');
  const [formMileage, setFormMileage] = useState('');

  // 收據上傳 + AI 辨識
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<{
    date: string | null;
    vendor: string | null;
    totalAmount: number | null;
    items: Array<{ name: string; quantity: number; unitPrice: number; amount: number }>;
    suggestedCategory: string | null;
    confidence: number;
  } | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/car/costs');
      if (res.ok) {
        const data = await res.json();
        const allRecords: CostRecordItem[] = data.records || [];
        const maintenanceRecords = allRecords
          .filter(r => isMaintenance(r.item))
          .sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));
        setRecords(maintenanceRecords);
      }
    } catch { /* ignore */ }
  }, []);

  // 載入車輛、使用者、家庭成員
  const fetchFormData = useCallback(async () => {
    try {
      const [vehiclesRes, meRes, membersRes] = await Promise.all([
        fetch('/api/car/vehicles'),
        fetch('/api/me'),
        fetch('/api/family/members'),
      ]);

      if (vehiclesRes.ok) {
        const data = await vehiclesRes.json();
        setVehicles((data.vehicles || []).map((v: { id: string; name: string }) => ({
          id: v.id,
          name: v.name,
        })));
      }

      if (meRes.ok) {
        const me = await meRes.json();
        setCurrentUser({ id: me.id, displayName: me.displayName });
      }

      if (membersRes.ok) {
        const data = await membersRes.json();
        setFamilyMembers((data.members || []).map((m: { id: string; displayName: string }) => ({
          id: m.id,
          displayName: m.displayName,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRecords().finally(() => setLoading(false));
  }, [fetchRecords]);

  const currentRecord = records[currentIdx] || null;
  const prevRecord = currentIdx < records.length - 1 ? records[currentIdx + 1] : null;

  const amountDiff = currentRecord && prevRecord
    ? Number(currentRecord.totalAmount) - Number(prevRecord.totalAmount)
    : null;

  // ── 開啟新增表單 ──────────────────────────────────────────

  function handleOpenForm() {
    fetchFormData();
    setFormItem('');
    setFormAmount('');
    setFormDate(getLocalDate());
    setFormPaymentMethod('CASH');
    setFormNote('');
    setFormMileage('');
    setReceiptFile(null);
    setReceiptPreview(null);
    setOcrResult(null);
    setOcrError(null);
    setShowForm(true);
  }

  // ── 收據上傳 + AI 辨識 ──────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('僅支援圖片格式');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('圖片大小不能超過 10MB');
      return;
    }
    setReceiptFile(file);
    setOcrResult(null);
    setOcrError(null);

    // 預覽
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReceiptPreview(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleOcr() {
    if (!receiptFile) return;

    setOcrLoading(true);
    setOcrError(null);
    setOcrResult(null);

    try {
      const formData = new FormData();
      formData.append('file', receiptFile);

      const res = await fetch('/api/car/receipt-ocr', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '辨識失敗');
      }

      const data = await res.json();
      const result = data.result;
      setOcrResult(result);

      // 自動填入表單
      if (result.totalAmount) setFormAmount(String(result.totalAmount));
      if (result.date) setFormDate(result.date);
      if (result.vendor) {
        // 如果有廠商名稱，加入備註
        setFormNote(prev => prev ? `${prev}\n廠商：${result.vendor}` : `廠商：${result.vendor}`);
      }
      // 用項目名稱或建議分類填入保修項目
      if (result.items?.length > 0) {
        const itemNames = result.items.map((i: { name: string }) => i.name).filter(Boolean).join('、');
        if (itemNames) setFormItem(itemNames);
      } else if (result.suggestedCategory) {
        setFormItem(result.suggestedCategory);
      }
    } catch (err) {
      setOcrError(err instanceof Error ? err.message : '辨識失敗');
    } finally {
      setOcrLoading(false);
    }
  }

  // ── 提交新增 ──────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formItem.trim()) {
      alert('請輸入保修項目');
      return;
    }
    const amount = parseFloat(formAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('請輸入有效的金額');
      return;
    }
    if (vehicles.length === 0) {
      alert('尚無車輛資料，請先到車輛資訊頁設定');
      return;
    }
    if (!currentUser) {
      alert('無法取得使用者資訊');
      return;
    }

    setSubmitting(true);
    try {
      // 建立分攤人列表（所有家庭成員 + 自己）
      const allUsers = [
        currentUser,
        ...familyMembers.filter(m => m.id !== currentUser.id),
      ];
      const shares = allUsers.map(u => ({
        userId: u.id,
        displayName: u.displayName,
        usageDays: 0,
      }));

      const payload = {
        vehicleId: vehicles[0].id,
        totalAmount: amount,
        item: formItem.trim(),
        paidById: currentUser.id,
        paymentMethod: formPaymentMethod,
        paymentNote: formNote.trim() || null,
        settlementDate: formDate,
        shares,
      };

      const res = await fetch('/api/car/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '新增失敗');
      }

      // 如果有里程數，順便記錄里程
      if (formMileage.trim()) {
        const mileage = parseInt(formMileage, 10);
        if (!isNaN(mileage) && mileage > 0) {
          await fetch('/api/car/mileage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vehicleId: vehicles[0].id,
              mileage,
              source: 'MANUAL',
              note: `保修記錄：${formItem.trim()}`,
            }),
          }).catch(() => {});
        }
      }

      setShowForm(false);
      setCurrentIdx(0);
      await fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增保修記錄失敗');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/car" className={styles.backLink}>
          <ArrowLeft size={16} /> 用車管理
        </Link>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>🔧 保修歷史</h1>
            <p className={styles.pageSubtitle}>瀏覽車輛保養與維修記錄</p>
          </div>
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleOpenForm}
          >
            <Plus size={16} /> 新增保修
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔧</div>
          <div className={styles.emptyText}>尚無保修記錄</div>
          <button
            type="button"
            className={styles.emptyBtn}
            onClick={handleOpenForm}
          >
            <Plus size={16} /> 新增第一筆保修記錄
          </button>
        </div>
      ) : (
        <>
          {/* Navigation */}
          <div className={styles.navRow}>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentIdx >= records.length - 1}
              onClick={() => setCurrentIdx(currentIdx + 1)}
            >
              <ChevronLeft size={16} /> 上一次
            </button>
            <span className={styles.navLabel}>
              第 {records.length - currentIdx} / {records.length} 次
            </span>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentIdx <= 0}
              onClick={() => setCurrentIdx(currentIdx - 1)}
            >
              下一次 <ChevronRight size={16} />
            </button>
          </div>

          {/* Current Record */}
          {currentRecord && (
            <div className={styles.recordCard}>
              <div className={styles.recordHeader}>
                <span className={styles.recordItem}>{currentRecord.item}</span>
                <span className={styles.recordDate}>
                  {new Date(currentRecord.settlementDate).toLocaleDateString('zh-TW', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>金額</span>
                  <span className={styles.detailValue}>
                    NT$ {Number(currentRecord.totalAmount).toLocaleString()}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>繳費人</span>
                  <span className={styles.detailValue}>{currentRecord.paidBy.displayName}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>繳費方式</span>
                  <span className={styles.detailValue}>
                    {PAYMENT_METHOD_LABEL[currentRecord.paymentMethod as PaymentMethodType] || currentRecord.paymentMethod}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>附件</span>
                  <span className={styles.detailValue}>{currentRecord.attachmentCount} 個</span>
                </div>
              </div>

              {/* 分攤明細 */}
              {currentRecord.shares.length > 0 && (
                <div className={styles.sharesSection}>
                  <div className={styles.sharesTitle}>分攤明細</div>
                  {currentRecord.shares.map(s => (
                    <div key={s.id} className={styles.shareItem}>
                      <span className={styles.shareName}>{s.user.displayName}</span>
                      <span className={styles.shareAmount}>
                        NT$ {Number(s.amount).toLocaleString()}
                      </span>
                      <span
                        className={styles.shareBadge}
                        style={{
                          backgroundColor: s.paymentStatus === 'CONFIRMED' ? 'rgba(46,125,50,0.1)' : s.paymentStatus === 'PAID' ? 'rgba(255,143,0,0.1)' : 'rgba(211,47,47,0.1)',
                          color: s.paymentStatus === 'CONFIRMED' ? '#2E7D32' : s.paymentStatus === 'PAID' ? '#FF8F00' : '#D32F2F',
                        }}
                      >
                        {s.paymentStatus === 'CONFIRMED' ? '已確認' : s.paymentStatus === 'PAID' ? '已繳' : '待繳'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 附件預覽 */}
              {currentRecord.attachmentCount > 0 && (
                <div className={styles.attachSection}>
                  <div className={styles.attachTitle}>📎 附件 ({currentRecord.attachmentCount})</div>
                  <div className={styles.attachHint}>
                    前往費用結算頁面查看附件詳細內容
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Comparison */}
          {prevRecord && (
            <div className={styles.compareCard}>
              <div className={styles.compareTitle}>📊 與上次比較</div>
              <div className={styles.compareGrid}>
                <div className={styles.compareItem}>
                  <span className={styles.compareLabel}>上次項目</span>
                  <span className={styles.compareValue}>{prevRecord.item}</span>
                </div>
                <div className={styles.compareItem}>
                  <span className={styles.compareLabel}>上次金額</span>
                  <span className={styles.compareValue}>
                    NT$ {Number(prevRecord.totalAmount).toLocaleString()}
                  </span>
                </div>
                <div className={styles.compareItem}>
                  <span className={styles.compareLabel}>上次日期</span>
                  <span className={styles.compareValue}>
                    {new Date(prevRecord.settlementDate).toLocaleDateString('zh-TW')}
                  </span>
                </div>
                {amountDiff !== null && (
                  <div className={styles.compareItem}>
                    <span className={styles.compareLabel}>金額差異</span>
                    <span className={`${styles.compareValue} ${amountDiff > 0 ? styles.diffUp : amountDiff < 0 ? styles.diffDown : ''}`}>
                      {amountDiff > 0 ? '+' : ''}{amountDiff.toLocaleString()} 元
                    </span>
                  </div>
                )}
              </div>

              {currentRecord && prevRecord && currentRecord.item !== prevRecord.item && (
                <div className={styles.newItemBadge}>
                  🆕 本次保養項目與上次不同
                </div>
              )}
            </div>
          )}

          {/* List */}
          <div className={styles.listCard}>
            <div className={styles.listTitle}>所有保修記錄</div>
            {records.map((r, idx) => (
              <div
                key={r.id}
                className={`${styles.listItem} ${idx === currentIdx ? styles.listItemActive : ''}`}
                onClick={() => setCurrentIdx(idx)}
              >
                <div className={styles.listItemLeft}>
                  <span className={styles.listItemDate}>
                    {new Date(r.settlementDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                  </span>
                  <span className={styles.listItemName}>{r.item}</span>
                </div>
                <span className={styles.listItemAmount}>
                  ${Number(r.totalAmount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 新增保修記錄 Modal ──────────────────────────────── */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>新增保修記錄</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowForm(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              {/* ── 收據上傳 + AI 辨識 ─────────────────────── */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>📸 收據/發票辨識</label>
                <div className={styles.uploadArea}>
                  {receiptPreview ? (
                    <div className={styles.previewContainer}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={receiptPreview} alt="收據預覽" className={styles.previewImg} />
                      <div className={styles.previewActions}>
                        <button
                          type="button"
                          className={styles.ocrBtn}
                          onClick={handleOcr}
                          disabled={ocrLoading}
                        >
                          {ocrLoading ? (
                            <><Loader2 size={14} className={styles.spinning} /> AI 辨識中...</>
                          ) : (
                            <><Sparkles size={14} /> AI 辨識並填入</>
                          )}
                        </button>
                        <button
                          type="button"
                          className={styles.removeImgBtn}
                          onClick={() => {
                            setReceiptFile(null);
                            setReceiptPreview(null);
                            setOcrResult(null);
                            setOcrError(null);
                          }}
                        >
                          <X size={14} /> 移除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.uploadButtons}>
                      <button
                        type="button"
                        className={styles.uploadBtn}
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera size={18} />
                        <span>拍攝收據</span>
                      </button>
                      <button
                        type="button"
                        className={styles.uploadBtn}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload size={18} />
                        <span>選擇圖片</span>
                      </button>
                    </div>
                  )}
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* OCR 結果 */}
                {ocrResult && (
                  <div className={styles.ocrResult}>
                    <div className={styles.ocrResultHeader}>
                      <Sparkles size={14} />
                      <span>AI 辨識結果（信心度 {Math.round(ocrResult.confidence * 100)}%）</span>
                    </div>
                    {ocrResult.vendor && (
                      <div className={styles.ocrResultRow}>
                        <span className={styles.ocrLabel}>廠商</span>
                        <span>{ocrResult.vendor}</span>
                      </div>
                    )}
                    {ocrResult.totalAmount !== null && (
                      <div className={styles.ocrResultRow}>
                        <span className={styles.ocrLabel}>總額</span>
                        <span>NT$ {ocrResult.totalAmount.toLocaleString()}</span>
                      </div>
                    )}
                    {ocrResult.items.length > 0 && (
                      <div className={styles.ocrItems}>
                        {ocrResult.items.map((item, i) => (
                          <div key={i} className={styles.ocrResultRow}>
                            <span className={styles.ocrLabel}>{item.name}</span>
                            <span>×{item.quantity} = NT$ {item.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles.ocrHint}>已自動填入上方表單欄位</div>
                  </div>
                )}

                {ocrError && (
                  <div className={styles.ocrErrorMsg}>⚠️ {ocrError}</div>
                )}
              </div>

              <div className={styles.formDivider} />

              {/* 快速選擇 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>快速選擇</label>
                <div className={styles.quickItems}>
                  {QUICK_ITEMS.map(item => (
                    <button
                      key={item}
                      type="button"
                      className={`${styles.quickItem} ${formItem === item ? styles.quickItemActive : ''}`}
                      onClick={() => setFormItem(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              {/* 項目名稱 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  保修項目 <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={formItem}
                  onChange={e => setFormItem(e.target.value)}
                  placeholder="例如：定期保養、輪胎更換"
                  required
                />
              </div>

              {/* 金額 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  金額 (NT$) <span className={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  placeholder="0"
                  min="1"
                  required
                />
              </div>

              {/* 日期 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>保修日期</label>
                <input
                  type="date"
                  className={styles.formInput}
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                />
              </div>

              {/* 當時里程 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>當時里程 (km)</label>
                <input
                  type="number"
                  className={styles.formInput}
                  value={formMileage}
                  onChange={e => setFormMileage(e.target.value)}
                  placeholder="選填，例如 15000"
                  min="0"
                />
              </div>

              {/* 付款方式 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>付款方式</label>
                <select
                  className={styles.formSelect}
                  value={formPaymentMethod}
                  onChange={e => setFormPaymentMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map(pm => (
                    <option key={pm.value} value={pm.value}>{pm.label}</option>
                  ))}
                </select>
              </div>

              {/* 備註 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>備註</label>
                <textarea
                  className={styles.formTextarea}
                  value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  placeholder="例如：更換 5W-30 全合成機油"
                  rows={3}
                />
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={submitting}
              >
                {submitting ? '儲存中...' : '儲存保修記錄'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
