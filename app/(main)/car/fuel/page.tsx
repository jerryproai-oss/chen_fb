'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { X, Plus, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import type {
  FuelRecordItem,
  FuelTypeValue,
  PaymentMethodType,
} from '@/lib/car/types';
import {
  FUEL_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
} from '@/lib/car/types';
import styles from './page.module.css';

// recharts — 動態載入避免 SSR
const FuelChart = dynamic(
  () => import('./FuelChart'),
  {
    ssr: false,
    loading: () => (
      <div className={styles.chartPlaceholder}>載入圖表中...</div>
    ),
  },
);

function getLocalDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface FuelForm {
  fuelDate: string;
  fuelType: FuelTypeValue;
  amount: string;
  liters: string;
  mileage: string;
  station: string;
  paymentMethod: PaymentMethodType;
  note: string;
}

const defaultForm = (): FuelForm => ({
  fuelDate: getLocalDateString(),
  fuelType: 'GASOLINE',
  amount: '',
  liters: '',
  mileage: '',
  station: '',
  paymentMethod: 'CREDIT_CARD',
  note: '',
});

export default function FuelPage() {
  const [records, setRecords] = useState<FuelRecordItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FuelForm>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchVehicle = useCallback(async () => {
    try {
      const res = await fetch('/api/car/vehicles');
      if (res.ok) {
        const data = await res.json();
        const vehicles = data.vehicles || [];
        const active = vehicles.find((v: { isActive: boolean }) => v.isActive) || vehicles[0];
        if (active) setVehicleId(active.id);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch('/api/car/fuel');
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRecords(), fetchVehicle()]).finally(() => setLoading(false));
  }, [fetchRecords, fetchVehicle]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (!form.amount || !form.mileage) {
        setError('金額與里程為必填');
        setSaving(false);
        return;
      }
      if (!vehicleId) {
        setError('尚無車輛資料，請先到車輛資訊頁設定');
        setSaving(false);
        return;
      }
      const body: Record<string, unknown> = {
        vehicleId,
        fuelDate: form.fuelDate,
        fuelType: form.fuelType,
        amount: parseFloat(form.amount),
        mileage: parseInt(form.mileage),
        paymentMethod: form.paymentMethod,
      };
      if (form.liters) body.liters = parseFloat(form.liters);
      if (form.station) body.station = form.station.trim();
      if (form.note) body.note = form.note.trim();

      const res = await fetch('/api/car/fuel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '儲存失敗');
        return;
      }
      setShowModal(false);
      fetchRecords();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (rec: FuelRecordItem) => {
    setEditingId(rec.id);
    setForm({
      fuelDate: rec.fuelDate,
      fuelType: rec.fuelType as FuelTypeValue,
      amount: String(rec.amount),
      liters: rec.liters ? String(rec.liters) : '',
      mileage: String(rec.mileage),
      station: rec.station || '',
      paymentMethod: rec.paymentMethod as PaymentMethodType,
      note: rec.note || '',
    });
    setError('');
    setShowModal(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setSaving(true);
    setError('');
    try {
      if (!form.amount || !form.mileage) {
        setError('金額與里程為必填');
        setSaving(false);
        return;
      }
      const body: Record<string, unknown> = {
        fuelDate: form.fuelDate,
        fuelType: form.fuelType,
        amount: parseFloat(form.amount),
        mileage: parseInt(form.mileage),
        paymentMethod: form.paymentMethod,
        liters: form.liters ? parseFloat(form.liters) : null,
        station: form.station.trim() || null,
        note: form.note.trim() || null,
      };
      const res = await fetch(`/api/car/fuel/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新失敗');
        return;
      }
      setShowModal(false);
      setEditingId(null);
      fetchRecords();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此加油記錄？')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/car/fuel/${id}`, { method: 'DELETE' });
      if (res.ok) fetchRecords();
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  // 計算油耗
  const calcEfficiency = (rec: FuelRecordItem, prev: FuelRecordItem | null): string => {
    if (!prev || !rec.liters || rec.liters <= 0) return '—';
    const dist = rec.mileage - prev.mileage;
    if (dist <= 0) return '—';
    return (dist / rec.liters).toFixed(1);
  };

  // 近 5 次平均油耗
  const sortedRecords = [...records].sort((a, b) => a.fuelDate.localeCompare(b.fuelDate));
  const recentEfficiencies: number[] = [];
  for (let i = sortedRecords.length - 1; i >= 1 && recentEfficiencies.length < 5; i--) {
    const r = sortedRecords[i];
    const p = sortedRecords[i - 1];
    if (r.liters && r.liters > 0) {
      const dist = r.mileage - p.mileage;
      if (dist > 0) {
        recentEfficiencies.push(dist / r.liters);
      }
    }
  }
  const avgEfficiency = recentEfficiencies.length > 0
    ? (recentEfficiencies.reduce((a, b) => a + b, 0) / recentEfficiencies.length).toFixed(1)
    : '—';

  // Chart data
  const chartData = sortedRecords.slice(1).map((r, idx) => {
    const prev = sortedRecords[idx];
    const dist = r.mileage - prev.mileage;
    const eff = r.liters && r.liters > 0 && dist > 0 ? parseFloat((dist / r.liters).toFixed(1)) : null;
    return {
      date: new Date(r.fuelDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
      efficiency: eff,
      amount: Number(r.amount),
    };
  });

  const displayRecords = [...records].sort((a, b) => b.fuelDate.localeCompare(a.fuelDate));

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
        <h1 className={styles.pageTitle}>⛽ 加油記錄</h1>
        <p className={styles.pageSubtitle}>追蹤加油記錄與油耗表現</p>
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <div />
        <button type="button" className={styles.addBtn} onClick={() => { setEditingId(null); setForm(defaultForm()); setError(''); setShowModal(true); }}>
          <Plus size={16} /> 新增加油
        </button>
      </div>

      {/* Average */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>近 5 次平均油耗</div>
          <div className={styles.statValue}>{avgEfficiency}</div>
          <div className={styles.statUnit}>km/L</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>加油次數</div>
          <div className={styles.statValue}>{records.length}</div>
          <div className={styles.statUnit}>次</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 1 && (
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>油耗趨勢</div>
          <FuelChart data={chartData} />
        </div>
      )}

      {/* Records */}
      <div className={styles.recordsCard}>
        <div className={styles.recordsHeader}>
          <span className={styles.recordsTitle}>加油記錄</span>
          <span className={styles.recordsCount}>共 {records.length} 筆</span>
        </div>
        {displayRecords.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>⛽</div>
            <div className={styles.emptyText}>尚無加油記錄</div>
          </div>
        ) : (
          displayRecords.map((rec) => {
            const prevIdx = sortedRecords.findIndex(r => r.id === rec.id) - 1;
            const prev = prevIdx >= 0 ? sortedRecords[prevIdx] : null;
            const eff = calcEfficiency(rec, prev);
            return (
              <div key={rec.id} className={styles.recordItem}>
                <div className={styles.recordMain}>
                  <div className={styles.recordDate}>
                    {new Date(rec.fuelDate).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}
                  </div>
                  <div className={styles.recordUser}>{rec.user.displayName}</div>
                  <div className={styles.recordBadges}>
                    <span className={styles.badge}>
                      💰 ${Number(rec.amount).toLocaleString()}
                    </span>
                    {rec.liters && (
                      <span className={styles.badge}>
                        ⛽ {Number(rec.liters).toFixed(1)}L
                      </span>
                    )}
                    <span className={styles.badge}>
                      📏 {rec.mileage.toLocaleString()} km
                    </span>
                    <span className={styles.badgeEff}>
                      🔋 {eff} km/L
                    </span>
                  </div>
                </div>
                {rec.station && (
                  <div className={styles.recordStation}>📍 {rec.station}</div>
                )}
                {rec.note && (
                  <div className={styles.recordStation}>📝 {rec.note}</div>
                )}
                <div className={styles.recordActions}>
                  <button
                    type="button"
                    className={styles.actionBtnEdit}
                    onClick={() => openEdit(rec)}
                    title="編輯"
                  >
                    <Pencil size={14} /> 編輯
                  </button>
                  <button
                    type="button"
                    className={styles.actionBtnDelete}
                    onClick={() => handleDelete(rec.id)}
                    disabled={deleting}
                    title="刪除"
                  >
                    <Trash2 size={14} /> 刪除
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? '編輯加油' : '新增加油'}</h2>
              <button type="button" className={styles.modalClose} onClick={() => { setShowModal(false); setEditingId(null); }}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              {!vehicleId && !error && (
                <div className={styles.errorMsg}>尚無車輛資料，請先到車輛資訊頁設定車輛</div>
              )}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>日期</label>
                  <input type="date" className={styles.formInput} value={form.fuelDate}
                    onChange={e => setForm({ ...form, fuelDate: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>油種</label>
                  <select className={styles.formSelect} value={form.fuelType}
                    onChange={e => setForm({ ...form, fuelType: e.target.value as FuelTypeValue })}>
                    {Object.entries(FUEL_TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>金額 (NT$) *</label>
                  <input type="number" className={styles.formInput} placeholder="1200"
                    value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>公升</label>
                  <input type="number" step="0.01" className={styles.formInput} placeholder="35.5"
                    value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>里程 (km) *</label>
                  <input type="number" className={styles.formInput} placeholder="25000"
                    value={form.mileage} onChange={e => setForm({ ...form, mileage: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>繳費方式</label>
                  <select className={styles.formSelect} value={form.paymentMethod}
                    onChange={e => setForm({ ...form, paymentMethod: e.target.value as PaymentMethodType })}>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>加油站</label>
                <input type="text" className={styles.formInput} placeholder="中油○○站"
                  value={form.station} onChange={e => setForm({ ...form, station: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>備註</label>
                <input type="text" className={styles.formInput} placeholder=""
                  value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => { setShowModal(false); setEditingId(null); }}>取消</button>
              <button type="button" className={styles.btnSave} onClick={editingId ? handleUpdate : handleSave} disabled={saving}>
                {saving ? '儲存中...' : (editingId ? '更新' : '儲存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
