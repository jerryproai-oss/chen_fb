'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, X, Camera, Upload, Sparkles, Loader2, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import type { CostRecordItem, PaymentMethodType } from '@/lib/car/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/car/types';
import { calculateCostShares } from '@/lib/car/cost-calculator';
import type { CostConfig, ChildUsage } from '@/lib/car/cost-calculator';
import { getLocalDate } from '@/lib/car/hooks';
import styles from './page.module.css';

const WARRANTY_KEYWORDS = ['保固', '延保', '延長保固', '原廠保固', '召回', '保固維修', '保固檢查'];

// 常用保固項目快速選擇
const QUICK_ITEMS = [
  '原廠保固', '延長保固', '保固維修', '保固檢查', '召回處理',
  '零件保固', '電池保固', '動力系統保固', '底盤保固', '保固延期',
];

const PAYMENT_METHODS = [
  { value: 'CASH', label: '現金' },
  { value: 'TRANSFER', label: '轉帳' },
  { value: 'CREDIT_CARD', label: '信用卡' },
  { value: 'LINE_PAY', label: 'LINE Pay' },
  { value: 'OTHER', label: '其他' },
];

function isWarranty(item: string): boolean {
  const lower = item.toLowerCase();
  return (
    WARRANTY_KEYWORDS.some(k => item.includes(k)) ||
    lower.includes('warranty') ||
    lower.includes('recall')
  );
}

/** 截斷過長項目名稱 */
function truncateItem(item: string, maxLen = 30): string {
  if (item.length <= maxLen) return item;
  // 嘗試在「、」分隔的情況下取第一項 + 數量
  const parts = item.split('、');
  if (parts.length > 1) {
    const first = parts[0].length > maxLen ? parts[0].slice(0, maxLen - 3) + '...' : parts[0];
    return `${first} 等 ${parts.length} 項`;
  }
  return item.slice(0, maxLen - 3) + '...';
}

// ── 明細行型別 ───────────────────────────────────────────────

interface LineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface LineItemData {
  lineItems: LineItem[];
  vendor?: string;
  ocrConfidence?: number;
}

/** 嘗試從 paymentNote 解析結構化明細 JSON */
function parseLineItems(paymentNote: string | null): LineItemData | null {
  if (!paymentNote) return null;
  try {
    const data = JSON.parse(paymentNote);
    if (data && Array.isArray(data.lineItems)) return data as LineItemData;
  } catch { /* not JSON, that's fine */ }
  return null;
}

/** 從「、」分隔的 item 文字轉成簡易 LineItem（無價格） */
function itemTextToLineItems(item: string): LineItem[] {
  if (!item.includes('、')) return [];
  return item.split('、').map(s => s.trim()).filter(Boolean).map(name => ({
    name,
    quantity: 1,
    unitPrice: 0,
    amount: 0,
  }));
}

/** 取得顯示用的明細列表（優先 JSON，其次拆文字） */
function getDisplayLineItems(record: CostRecordItem): LineItem[] {
  const json = parseLineItems(record.paymentNote);
  if (json) return json.lineItems;
  return itemTextToLineItems(record.item);
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

interface ConfigItem {
  id: string;
  item: string;
  parentRatio: number;
  calcMethod: string;
  dualTrackBaseRatio: number;
}

interface AccumulatedDay {
  userId: string;
  displayName: string;
  totalDays: number;
}

// ── 主頁面 ──────────────────────────────────────────────────

export default function WarrantyPage() {
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

  // 分攤規則 + 累計天數
  const [costConfigs, setCostConfigs] = useState<ConfigItem[]>([]);
  const [formConfigItem, setFormConfigItem] = useState('保固');
  const [accumulatedDays, setAccumulatedDays] = useState<AccumulatedDay[]>([]);

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

  // 展開明細 / 編輯 / 刪除
  const [expandedItem, setExpandedItem] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CostRecordItem | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/car/costs');
      if (res.ok) {
        const data = await res.json();
        const allRecords: CostRecordItem[] = data.records || [];
        const maintenanceRecords = allRecords
          .filter(r => isWarranty(r.item))
          .sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));
        setRecords(maintenanceRecords);
      }
    } catch { /* ignore */ }
  }, []);

  // 載入車輛、使用者、家庭成員、分攤規則
  const fetchFormData = useCallback(async () => {
    try {
      const [vehiclesRes, meRes, membersRes] = await Promise.all([
        fetch('/api/car/vehicles'),
        fetch('/api/me'),
        fetch('/api/family/members'),
      ]);

      let vehicleId = '';

      if (vehiclesRes.ok) {
        const data = await vehiclesRes.json();
        const vList = (data.vehicles || []).map((v: { id: string; name: string }) => ({
          id: v.id,
          name: v.name,
        }));
        setVehicles(vList);
        if (vList.length > 0) vehicleId = vList[0].id;
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

      // 載入分攤規則
      if (vehicleId) {
        try {
          const configRes = await fetch(`/api/car/config?vehicleId=${vehicleId}&isActive=true`);
          if (configRes.ok) {
            const configData = await configRes.json();
            setCostConfigs((configData.configs || []).map((c: ConfigItem) => ({
              id: c.id,
              item: c.item,
              parentRatio: c.parentRatio,
              calcMethod: c.calcMethod,
              dualTrackBaseRatio: c.dualTrackBaseRatio,
            })));
          }
        } catch { /* ignore */ }

        // 載入近 90 天累計用車天數
        try {
          const endDate = getLocalDate();
          const startD = new Date();
          startD.setDate(startD.getDate() - 90);
          const startDate = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, '0')}-${String(startD.getDate()).padStart(2, '0')}`;
          const daysRes = await fetch(`/api/car/accumulated-days?vehicleId=${vehicleId}&startDate=${startDate}&endDate=${endDate}`);
          if (daysRes.ok) {
            const daysData = await daysRes.json();
            setAccumulatedDays(daysData.userDays || []);
          }
        } catch { /* ignore */ }
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
    setFormConfigItem('保固');
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

      // 將明細以結構化 JSON 存入備註，方便後續顯示為表格
      if (result.items?.length > 0) {
        const lineItemData: LineItemData = {
          lineItems: result.items.map((i: { name: string; quantity: number; unitPrice: number; amount: number }) => ({
            name: i.name,
            quantity: i.quantity || 1,
            unitPrice: i.unitPrice || 0,
            amount: i.amount || 0,
          })),
          vendor: result.vendor || undefined,
          ocrConfidence: result.confidence,
        };
        setFormNote(JSON.stringify(lineItemData));
      } else if (result.vendor) {
        setFormNote(`廠商：${result.vendor}`);
      }

      // 保固項目用簡潔的主標題
      if (result.items?.length > 0) {
        const mainItem = result.items.find((i: { name: string }) =>
          /保固|召回|延保|檢查/.test(i.name)
        ) || result.items[0];
        const summary = result.items.length > 1
          ? `${mainItem.name} 等 ${result.items.length} 項`
          : mainItem.name;
        setFormItem(summary);
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
      alert('請輸入保固項目');
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

      // 查找使用者的累計天數
      const shares = allUsers.map(u => {
        const days = accumulatedDays.find(d => d.userId === u.id);
        return {
          userId: u.id,
          displayName: u.displayName,
          usageDays: days?.totalDays || 0,
        };
      });

      // 若有匹配的 config，傳送 config 的 item 名稱讓後端精確匹配規則
      const matchedConfig = costConfigs.find(c => c.item === formConfigItem);

      const payload = {
        vehicleId: vehicles[0].id,
        totalAmount: amount,
        // 若有匹配的規則，用規則的 item 名稱（後端用此名匹配 CarCostConfig）
        // 實際保固項目存在 paymentNote 裡
        item: matchedConfig ? formConfigItem : formItem.trim(),
        paidById: currentUser.id,
        paymentMethod: formPaymentMethod,
        paymentNote: formNote.trim() || null,
        settlementDate: formDate,
        shares,
      };

      // 如果規則 item 與實際保固項目不同，把詳細項目補到 paymentNote
      if (matchedConfig && formItem.trim() && formItem.trim() !== formConfigItem) {
        const existingNote = formNote.trim();
        // 合併：保固內容 + 原有的 JSON 或文字備註
        if (existingNote) {
          try {
            const parsed = JSON.parse(existingNote);
            parsed.maintenanceDetail = formItem.trim();
            payload.paymentNote = JSON.stringify(parsed);
          } catch {
            payload.paymentNote = `保固內容：${formItem.trim()}\n${existingNote}`;
          }
        } else {
          payload.paymentNote = `保固內容：${formItem.trim()}`;
        }
        // 組合 item 名稱：「保固 — 原廠保固 等 N 項」
        const detailSuffix = formItem.trim().length > 20
          ? formItem.trim().slice(0, 20) + '...'
          : formItem.trim();
        payload.item = `${formConfigItem} — ${detailSuffix}`;
      }

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
              note: `保固記錄：${formItem.trim()}`,
            }),
          }).catch(() => {});
        }
      }

      setShowForm(false);
      setCurrentIdx(0);
      await fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : '新增保固記錄失敗');
    } finally {
      setSubmitting(false);
    }
  }

  // ── 刪除記錄 ──────────────────────────────────────────────

  async function handleDelete(record: CostRecordItem) {
    if (!confirm(`確定要刪除「${truncateItem(record.item, 20)}」（NT$ ${Number(record.totalAmount).toLocaleString()}）？\n此操作無法復原。`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/car/costs/${record.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '刪除失敗');
      }
      // 調整 index 避免超出範圍
      if (currentIdx >= records.length - 1 && currentIdx > 0) {
        setCurrentIdx(currentIdx - 1);
      }
      await fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeleting(false);
    }
  }

  // ── 開啟編輯 Dialog ────────────────────────────────────────

  function handleOpenEdit(record: CostRecordItem) {
    setEditingRecord(record);
    setShowEditDialog(true);
  }

  // ── 儲存編輯 ──────────────────────────────────────────────

  async function handleSaveEdit(newItem: string, newAmount: number, reason: string) {
    if (!editingRecord) return;
    try {
      const res = await fetch(`/api/car/costs/${editingRecord.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason,
          item: newItem.trim(),
          totalAmount: newAmount,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '修改失敗');
      }
      setShowEditDialog(false);
      setEditingRecord(null);
      await fetchRecords();
    } catch (err) {
      alert(err instanceof Error ? err.message : '修改失敗');
    }
  }

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/calendar" className={styles.backLink}>
          <ArrowLeft size={16} /> 行事曆
        </Link>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.pageTitle}>📋 保固記錄</h1>
            <p className={styles.pageSubtitle}>瀏覽車輛保固記錄與維修</p>
          </div>
          <button
            type="button"
            className={styles.addBtn}
            onClick={handleOpenForm}
          >
            <Plus size={16} /> 新增保固
          </button>
        </div>
      </div>

      {records.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔧</div>
          <div className={styles.emptyText}>尚無保固記錄</div>
          <button
            type="button"
            className={styles.emptyBtn}
            onClick={handleOpenForm}
          >
            <Plus size={16} /> 新增第一筆保固記錄
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
          {currentRecord && (() => {
            const lineItems = getDisplayLineItems(currentRecord);
            const hasLineItems = lineItems.length > 0;
            const displayTitle = hasLineItems ? truncateItem(currentRecord.item, 40) : currentRecord.item;
            const jsonData = parseLineItems(currentRecord.paymentNote);
            const hasPrices = lineItems.some(li => li.amount > 0);

            return (
            <div className={styles.recordCard}>
              <div className={styles.recordHeader}>
                <div className={styles.recordTitleRow}>
                  {hasLineItems ? (
                    <button
                      type="button"
                      className={styles.recordItemToggle}
                      onClick={() => setExpandedItem(!expandedItem)}
                    >
                      <span className={styles.recordItem}>{displayTitle}</span>
                      {expandedItem ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  ) : (
                    <span className={styles.recordItem}>{displayTitle}</span>
                  )}
                </div>
                <span className={styles.recordDate}>
                  {new Date(currentRecord.settlementDate).toLocaleDateString('zh-TW', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </span>
              </div>

              {/* 展開明細 — 整齊的表格 */}
              {hasLineItems && expandedItem && (
                <div className={styles.lineItemsSection}>
                  {jsonData?.vendor && (
                    <div className={styles.lineItemsVendor}>🏪 {jsonData.vendor}</div>
                  )}
                  <div className={styles.lineItemsTableWrap}>
                    <table className={styles.lineItemsTable}>
                      <thead>
                        <tr>
                          <th className={styles.liColIdx}>#</th>
                          <th className={styles.liColName}>項目</th>
                          <th className={styles.liColQty}>數量</th>
                          {hasPrices && <th className={styles.liColPrice}>單價</th>}
                          {hasPrices && <th className={styles.liColAmount}>小計</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((li, i) => (
                          <tr key={i}>
                            <td className={styles.liColIdx}>{i + 1}</td>
                            <td className={styles.liColName}>{li.name}</td>
                            <td className={styles.liColQty}>{li.quantity}</td>
                            {hasPrices && (
                              <td className={styles.liColPrice}>
                                {li.unitPrice > 0 ? `$${li.unitPrice.toLocaleString()}` : '—'}
                              </td>
                            )}
                            {hasPrices && (
                              <td className={styles.liColAmount}>
                                {li.amount > 0 ? `$${li.amount.toLocaleString()}` : '—'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {hasPrices && (
                        <tfoot>
                          <tr className={styles.liTotalRow}>
                            <td colSpan={3} className={styles.liTotalLabel}>合計</td>
                            <td></td>
                            <td className={styles.liTotalAmount}>
                              ${lineItems.reduce((s, li) => s + li.amount, 0).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

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

              {/* 分攤明細（僅顯示，付款操作在結算頁） */}
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

              {/* 操作按鈕 */}
              <div className={styles.recordActions}>
                <button
                  type="button"
                  className={styles.editRecordBtn}
                  onClick={() => handleOpenEdit(currentRecord)}
                >
                  <Pencil size={14} /> 編輯
                </button>
                <button
                  type="button"
                  className={styles.deleteRecordBtn}
                  onClick={() => handleDelete(currentRecord)}
                  disabled={deleting}
                >
                  <Trash2 size={14} /> {deleting ? '刪除中...' : '刪除'}
                </button>
              </div>
            </div>
            );
          })()}

          {/* Comparison */}
          {prevRecord && (
            <div className={styles.compareCard}>
              <div className={styles.compareTitle}>📊 與上次比較</div>
              <div className={styles.compareGrid}>
                <div className={styles.compareItem}>
                  <span className={styles.compareLabel}>上次項目</span>
                  <span className={styles.compareValue} title={prevRecord.item}>
                    {truncateItem(prevRecord.item)}
                  </span>
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
                  🆕 本次保固項目與上次不同
                </div>
              )}
            </div>
          )}

          {/* List */}
          <div className={styles.listCard}>
            <div className={styles.listTitle}>所有保固記錄</div>
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
                  <span className={styles.listItemName} title={r.item}>
                    {truncateItem(r.item)}
                  </span>
                </div>
                <span className={styles.listItemAmount}>
                  ${Number(r.totalAmount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── 新增保固記錄 Modal ──────────────────────────────── */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>新增保固記錄</h2>
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
                  保固項目 <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.formInput}
                  value={formItem}
                  onChange={e => setFormItem(e.target.value)}
                  placeholder="例如：原廠保固、延長保固"
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

              {/* 費用分攤類型 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>費用分攤類型</label>
                <select
                  className={styles.formSelect}
                  value={formConfigItem}
                  onChange={e => {
                    setFormConfigItem(e.target.value);
                  }}
                >
                  <option value="保固">保固（父母 0%、雙軌制）</option>
                  <option value="延長保固">延長保固（父母 30%、雙軌制）</option>
                  {costConfigs
                    .filter(c => c.item !== '保固' && c.item !== '延長保固')
                    .map(c => (
                      <option key={c.id} value={c.item}>
                        {c.item}（父母 {Math.round(c.parentRatio * 100)}%、{c.calcMethod === 'DUAL_TRACK' ? '雙軌制' : '均分制'}）
                      </option>
                    ))}
                </select>
                <div className={styles.configHint}>
                  依規則計算父母負擔比率與分攤方式，可在設定頁管理規則
                </div>
              </div>

              {/* 分攤預覽 */}
              {formAmount && parseFloat(formAmount) > 0 && (() => {
                const amt = parseFloat(formAmount);
                const matchedCfg = costConfigs.find(c => c.item === formConfigItem);
                const cfg: CostConfig = matchedCfg
                  ? {
                      parentRatio: matchedCfg.parentRatio,
                      calcMethod: matchedCfg.calcMethod as CostConfig['calcMethod'],
                      dualTrackBaseRatio: matchedCfg.dualTrackBaseRatio,
                    }
                  : formConfigItem === '延長保固'
                    ? { parentRatio: 0.3, calcMethod: 'DUAL_TRACK' as const, dualTrackBaseRatio: 0.5 }
                    : { parentRatio: 0, calcMethod: 'DUAL_TRACK' as const, dualTrackBaseRatio: 0.5 };

                const allUsers = currentUser
                  ? [currentUser, ...familyMembers.filter(m => m.id !== currentUser.id)]
                  : familyMembers;

                const childUsages: ChildUsage[] = allUsers.map(u => ({
                  userId: u.id,
                  displayName: u.displayName,
                  usageDays: accumulatedDays.find(d => d.userId === u.id)?.totalDays || 0,
                }));

                if (childUsages.length === 0 || isNaN(amt) || amt <= 0) return null;

                try {
                  const result = calculateCostShares(
                    amt,
                    cfg,
                    childUsages,
                    currentUser?.id || '',
                    currentUser?.displayName || '',
                    currentUser?.id || '',
                  );

                  return (
                    <div className={styles.previewSection}>
                      <div className={styles.previewTitle}>📊 分攤預覽</div>
                      <div className={styles.previewInfo}>
                        父母負擔 {Math.round(cfg.parentRatio * 100)}%
                        {cfg.calcMethod === 'DUAL_TRACK' ? `・雙軌制（均分 ${Math.round(cfg.dualTrackBaseRatio * 100)}% + 天數 ${Math.round((1 - cfg.dualTrackBaseRatio) * 100)}%）` : '・均分制'}
                      </div>
                      {accumulatedDays.length > 0 && (
                        <div className={styles.previewDays}>
                          近 90 天用車：{accumulatedDays.map(d => `${d.displayName} ${d.totalDays}天`).join('、')}
                        </div>
                      )}
                      <div className={styles.previewShares}>
                        {result.shares.map(s => (
                          <div key={s.userId} className={styles.previewShareRow}>
                            <span>{s.displayName}</span>
                            <span className={styles.previewShareAmount}>
                              NT$ {s.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                } catch {
                  return null;
                }
              })()}

              {/* 日期 */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>保固日期</label>
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
                {submitting ? '儲存中...' : '儲存保固記錄'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── 編輯保固記錄 Dialog ─────────────────────────────── */}
      {showEditDialog && editingRecord && (
        <EditRecordDialog
          record={editingRecord}
          onClose={() => { setShowEditDialog(false); setEditingRecord(null); }}
          onSave={handleSaveEdit}
        />
      )}
    </div>
  );
}

// ── 編輯 Dialog 元件 ─────────────────────────────────────────

function EditRecordDialog({
  record,
  onClose,
  onSave,
}: {
  record: CostRecordItem;
  onClose: () => void;
  onSave: (item: string, amount: number, reason: string) => Promise<void>;
}) {
  // 解析既有明細
  const existingLineItems = getDisplayLineItems(record);
  const hasLineItems = existingLineItems.length > 0;

  const [title, setTitle] = useState(
    hasLineItems ? truncateItem(record.item, 100) : record.item
  );
  const [items, setItems] = useState<LineItem[]>(
    hasLineItems
      ? existingLineItems
      : [{ name: record.item, quantity: 1, unitPrice: 0, amount: Number(record.totalAmount) }]
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const totalFromItems = items.reduce((s, li) => s + (li.amount || 0), 0);
  const displayTotal = totalFromItems > 0 ? totalFromItems : Number(record.totalAmount);

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const updated = { ...li, [field]: value };
      // 自動計算小計
      if (field === 'quantity' || field === 'unitPrice') {
        updated.amount = (Number(updated.quantity) || 1) * (Number(updated.unitPrice) || 0);
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    setItems(prev => [...prev, { name: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { alert('請輸入修改原因'); return; }

    // 組合項目名稱：如果只有一項就用該項名稱，多項用摘要
    const validItems = items.filter(li => li.name.trim());
    if (validItems.length === 0) { alert('至少需要一個項目'); return; }

    const finalTitle = validItems.length === 1
      ? validItems[0].name
      : title.trim() || `${validItems[0].name} 等 ${validItems.length} 項`;

    const finalAmount = totalFromItems > 0 ? totalFromItems : Number(record.totalAmount);

    setSaving(true);
    try {
      await onSave(finalTitle, finalAmount, reason);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.editModal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>編輯保固記錄</h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* 主標題 */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>保固主題</label>
            <input
              type="text"
              className={styles.formInput}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例如：原廠保固到期處理"
            />
          </div>

          {/* 明細列表 */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>明細項目</label>
            <div className={styles.editItemsTableWrap}>
              <table className={styles.editItemsTable}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>項目名稱</th>
                    <th>數量</th>
                    <th>單價</th>
                    <th>小計</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((li, i) => (
                    <tr key={i}>
                      <td className={styles.editItemIdx}>{i + 1}</td>
                      <td>
                        <input
                          type="text"
                          className={styles.editItemInput}
                          value={li.name}
                          onChange={e => updateItem(i, 'name', e.target.value)}
                          placeholder="項目名稱"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.editItemNum}
                          value={li.quantity}
                          onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                          min={1}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className={styles.editItemNum}
                          value={li.unitPrice || ''}
                          onChange={e => updateItem(i, 'unitPrice', Number(e.target.value))}
                          placeholder="0"
                          min={0}
                        />
                      </td>
                      <td className={styles.editItemAmount}>
                        ${(li.amount || 0).toLocaleString()}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.editItemRemove}
                          onClick={() => removeItem(i)}
                          disabled={items.length <= 1}
                          title="移除"
                        >
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className={styles.editItemTotalLabel}>
                      <button type="button" className={styles.addItemBtn} onClick={addItem}>
                        <Plus size={14} /> 新增項目
                      </button>
                    </td>
                    <td className={styles.editItemTotalValue}>
                      ${displayTotal.toLocaleString()}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* 修改原因 */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              修改原因 <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.formInput}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="例如：修正項目名稱、更正金額"
              required
            />
            <div className={styles.editHint}>系統會記錄修改歷程</div>
          </div>

          <div className={styles.editDialogFooter}>
            <button type="button" className={styles.editCancelBtn} onClick={onClose}>
              取消
            </button>
            <button type="submit" className={styles.submitBtn} disabled={saving}>
              {saving ? '儲存中...' : '儲存修改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
