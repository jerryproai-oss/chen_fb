'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { X, ArrowLeft, Pencil } from 'lucide-react';
import type { VehicleInfo } from '@/lib/car/types';
import styles from './page.module.css';

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function countdownLabel(days: number | null, label: string): { text: string; urgent: boolean } {
  if (days === null) return { text: `${label}：未設定`, urgent: false };
  if (days < 0) return { text: `${label}：已過期 ${Math.abs(days)} 天`, urgent: true };
  if (days === 0) return { text: `${label}：今天到期`, urgent: true };
  if (days <= 30) return { text: `${label}：剩 ${days} 天`, urgent: true };
  return { text: `${label}：剩 ${days} 天`, urgent: false };
}

interface EditForm {
  name: string;
  brand: string;
  model: string;
  plateNumber: string;
  purchaseDate: string;
  warrantyEnd: string;
  insuranceEnd: string;
  nextMaintenanceDate: string;
  nextMaintenanceMileage: string;
  currentMileage: string;
  color: string;
  vin: string;
  note: string;
}

export default function VehiclePage() {
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [form, setForm] = useState<EditForm>({
    name: '', brand: '', model: '', plateNumber: '',
    purchaseDate: '', warrantyEnd: '', insuranceEnd: '',
    nextMaintenanceDate: '', nextMaintenanceMileage: '', currentMileage: '',
    color: '', vin: '', note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchVehicle = useCallback(async () => {
    try {
      const [vRes, uRes] = await Promise.all([
        fetch('/api/car/vehicle'),
        fetch('/api/users/me'),
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        setVehicle(vData.vehicle || null);
      }
      if (uRes.ok) {
        const uData = await uRes.json();
        setIsAdmin((uData.user || uData)?.role === 'ADMIN');
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchVehicle().finally(() => setLoading(false));
  }, [fetchVehicle]);

  const openEdit = () => {
    if (!vehicle) return;
    setForm({
      name: vehicle.name,
      brand: vehicle.brand,
      model: vehicle.model,
      plateNumber: vehicle.plateNumber,
      purchaseDate: vehicle.purchaseDate || '',
      warrantyEnd: vehicle.warrantyEnd || '',
      insuranceEnd: vehicle.insuranceEnd || '',
      nextMaintenanceDate: vehicle.nextMaintenanceDate || '',
      nextMaintenanceMileage: vehicle.nextMaintenanceMileage?.toString() || '',
      currentMileage: vehicle.currentMileage?.toString() || '',
      color: vehicle.color || '',
      vin: vehicle.vin || '',
      note: vehicle.note || '',
    });
    setError('');
    setShowEdit(true);
  };

  const handleSave = async () => {
    if (!vehicle) return;
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        brand: form.brand.trim(),
        model: form.model.trim(),
        plateNumber: form.plateNumber.trim(),
      };
      if (form.purchaseDate) body.purchaseDate = form.purchaseDate;
      if (form.warrantyEnd) body.warrantyEnd = form.warrantyEnd;
      if (form.insuranceEnd) body.insuranceEnd = form.insuranceEnd;
      if (form.nextMaintenanceDate) body.nextMaintenanceDate = form.nextMaintenanceDate;
      if (form.nextMaintenanceMileage) body.nextMaintenanceMileage = parseInt(form.nextMaintenanceMileage);
      if (form.currentMileage) body.currentMileage = parseInt(form.currentMileage);
      if (form.color) body.color = form.color.trim();
      if (form.vin) body.vin = form.vin.trim();
      body.note = form.note.trim() || null;

      const res = await fetch(`/api/car/vehicle/${vehicle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新失敗');
        return;
      }
      setShowEdit(false);
      fetchVehicle();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  if (!vehicle) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/car" className={styles.backLink}><ArrowLeft size={16} /> 用車管理</Link>
          <h1 className={styles.pageTitle}>🚙 車輛資訊</h1>
        </div>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🚙</div>
          <div className={styles.emptyText}>尚未設定車輛資訊</div>
        </div>
      </div>
    );
  }

  const warrantyDays = daysUntil(vehicle.warrantyEnd);
  const insuranceDays = daysUntil(vehicle.insuranceEnd);
  const maintDays = daysUntil(vehicle.nextMaintenanceDate);
  const warranty = countdownLabel(warrantyDays, '保固');
  const insurance = countdownLabel(insuranceDays, '保險');
  const maintenance = countdownLabel(maintDays, '保養');

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <Link href="/car" className={styles.backLink}><ArrowLeft size={16} /> 用車管理</Link>
        <div className={styles.headerRow}>
          <h1 className={styles.pageTitle}>🚙 車輛資訊</h1>
          {isAdmin && (
            <button type="button" className={styles.editBtn} onClick={openEdit}>
              <Pencil size={14} /> 編輯
            </button>
          )}
        </div>
      </div>

      {/* Vehicle Card */}
      <div className={styles.vehicleCard}>
        <div className={styles.vehicleHeader}>
          <h2 className={styles.vehicleName}>{vehicle.name}</h2>
          <span className={styles.vehiclePlate}>{vehicle.plateNumber}</span>
        </div>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>品牌</span>
            <span className={styles.infoValue}>{vehicle.brand}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>車型</span>
            <span className={styles.infoValue}>{vehicle.model}</span>
          </div>
          {vehicle.color && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>車色</span>
              <span className={styles.infoValue}>{vehicle.color}</span>
            </div>
          )}
          {vehicle.purchaseDate && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>購入日期</span>
              <span className={styles.infoValue}>
                {new Date(vehicle.purchaseDate).toLocaleDateString('zh-TW')}
              </span>
            </div>
          )}
          {vehicle.vin && (
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>車身號碼</span>
              <span className={styles.infoValue}>{vehicle.vin}</span>
            </div>
          )}
        </div>
      </div>

      {/* Mileage */}
      <div className={styles.mileageCard}>
        <div className={styles.mileageLabel}>目前里程</div>
        <div className={styles.mileageValue}>
          {vehicle.currentMileage != null ? vehicle.currentMileage.toLocaleString() : '—'}
          <span className={styles.mileageUnit}> km</span>
        </div>
      </div>

      {/* Status Tags */}
      <div className={styles.statusGrid}>
        <div className={`${styles.statusCard} ${warranty.urgent ? styles.statusUrgent : ''}`}>
          <span className={styles.statusIcon}>🛡️</span>
          <span className={styles.statusText}>{warranty.text}</span>
        </div>
        <div className={`${styles.statusCard} ${insurance.urgent ? styles.statusUrgent : ''}`}>
          <span className={styles.statusIcon}>📋</span>
          <span className={styles.statusText}>{insurance.text}</span>
        </div>
        <div className={`${styles.statusCard} ${maintenance.urgent ? styles.statusUrgent : ''}`}>
          <span className={styles.statusIcon}>🔧</span>
          <span className={styles.statusText}>{maintenance.text}</span>
          {vehicle.nextMaintenanceMileage && (
            <span className={styles.statusSub}>
              或 {vehicle.nextMaintenanceMileage.toLocaleString()} km
            </span>
          )}
        </div>
      </div>

      {vehicle.note && (
        <div className={styles.noteCard}>
          <strong>備註：</strong>{vehicle.note}
        </div>
      )}

      {/* Edit Dialog */}
      {showEdit && (
        <div className={styles.modalOverlay} onClick={() => setShowEdit(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>編輯車輛資訊</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowEdit(false)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>名稱</label>
                  <input type="text" className={styles.formInput} value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>品牌</label>
                  <input type="text" className={styles.formInput} value={form.brand}
                    onChange={e => setForm({ ...form, brand: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>車型</label>
                  <input type="text" className={styles.formInput} value={form.model}
                    onChange={e => setForm({ ...form, model: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>車牌號碼</label>
                  <input type="text" className={styles.formInput} value={form.plateNumber}
                    onChange={e => setForm({ ...form, plateNumber: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>車色</label>
                  <input type="text" className={styles.formInput} value={form.color}
                    onChange={e => setForm({ ...form, color: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>目前里程 (km)</label>
                  <input type="number" className={styles.formInput} value={form.currentMileage}
                    onChange={e => setForm({ ...form, currentMileage: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>購入日期</label>
                  <input type="date" className={styles.formInput} value={form.purchaseDate}
                    onChange={e => setForm({ ...form, purchaseDate: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>保固到期日</label>
                  <input type="date" className={styles.formInput} value={form.warrantyEnd}
                    onChange={e => setForm({ ...form, warrantyEnd: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>保險到期日</label>
                  <input type="date" className={styles.formInput} value={form.insuranceEnd}
                    onChange={e => setForm({ ...form, insuranceEnd: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>下次保養日期</label>
                  <input type="date" className={styles.formInput} value={form.nextMaintenanceDate}
                    onChange={e => setForm({ ...form, nextMaintenanceDate: e.target.value })} />
                </div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>下次保養里程</label>
                  <input type="number" className={styles.formInput} value={form.nextMaintenanceMileage}
                    onChange={e => setForm({ ...form, nextMaintenanceMileage: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>車身號碼</label>
                  <input type="text" className={styles.formInput} value={form.vin}
                    onChange={e => setForm({ ...form, vin: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>備註</label>
                <textarea className={styles.formTextarea} value={form.note}
                  onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowEdit(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
