'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CostRecordItem, PaymentMethodType } from '@/lib/car/types';
import { PAYMENT_METHOD_LABEL } from '@/lib/car/types';
import styles from './page.module.css';

const MAINTENANCE_KEYWORDS = ['保養', '大保養', '輪胎', '煞車', '機油', '冷氣', '保修', '維修', '保固'];

function isMaintenance(item: string): boolean {
  const lower = item.toLowerCase();
  return (
    MAINTENANCE_KEYWORDS.some(k => item.includes(k)) ||
    lower.includes('repair') ||
    lower.includes('maintenance')
  );
}

export default function MaintenancePage() {
  const [records, setRecords] = useState<CostRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);

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

  useEffect(() => {
    setLoading(true);
    fetchRecords().finally(() => setLoading(false));
  }, [fetchRecords]);

  const currentRecord = records[currentIdx] || null;
  const prevRecord = currentIdx < records.length - 1 ? records[currentIdx + 1] : null;

  const amountDiff = currentRecord && prevRecord
    ? Number(currentRecord.totalAmount) - Number(prevRecord.totalAmount)
    : null;

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
        <h1 className={styles.pageTitle}>🔧 保修歷史</h1>
        <p className={styles.pageSubtitle}>瀏覽車輛保養與維修記錄</p>
      </div>

      {records.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔧</div>
          <div className={styles.emptyText}>尚無保修記錄</div>
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
    </div>
  );
}
