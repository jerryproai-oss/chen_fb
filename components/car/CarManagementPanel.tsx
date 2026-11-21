'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import type {
  CarBookingItem,
  RecurringTypeValue,
  VehicleInfo,
} from '@/lib/car/types';
import {
  BOOKING_STATUS_LABEL,
  BOOKING_STATUS_COLOR,
} from '@/lib/car/types';
import { getLocalDateString } from '@/lib/car/hooks';
import styles from './CarManagementPanel.module.css';

// ── 快速操作按鈕 ──────────────────────────────────────────────

const QUICK_ACTIONS = [
  { emoji: '🚗', label: '預約', href: '' },
  { emoji: '⛽', label: '加油', href: '/car/fuel' },
  { emoji: '🔧', label: '保養', href: '/car/maintenance' },
  { emoji: '📏', label: '里程', href: '' },
  { emoji: '🚙', label: '車輛', href: '/car/vehicle' },
  { emoji: '🧮', label: '結算', href: '/car/calculator' },
  { emoji: '📊', label: '報表', href: '/car/reports' },
  { emoji: '🏦', label: '貸款', href: '/car/loan' },
] as const;

// ── 型別定義 ──────────────────────────────────────────────────

interface BookingForm {
  startDate: string;
  endDate: string;
  purpose: string;
  isRecurring: boolean;
  recurringType: RecurringTypeValue;
}

interface MileageForm {
  mileage: string;
  note: string;
}

interface CarManagementPanelProps {
  /** 外部通知行事曆刷新事件 */
  onRefreshCalendar?: () => void;
}

// ── Main Component ────────────────────────────────────────────

export default function CarManagementPanel({ onRefreshCalendar }: CarManagementPanelProps) {
  const router = useRouter();

  // Data
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null);
  const [bookings, setBookings] = useState<CarBookingItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [showBooking, setShowBooking] = useState(false);
  const [showEditBooking, setShowEditBooking] = useState(false);
  const [editBookingId, setEditBookingId] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [showMileage, setShowMileage] = useState(false);

  // Forms
  const [bookingForm, setBookingForm] = useState<BookingForm>({
    startDate: getLocalDateString(),
    endDate: getLocalDateString(),
    purpose: '',
    isRecurring: false,
    recurringType: 'WEEKLY',
  });
  const [checkoutForm, setCheckoutForm] = useState<MileageForm>({ mileage: '', note: '' });
  const [returnForm, setReturnForm] = useState<MileageForm>({ mileage: '', note: '' });
  const [mileageForm, setMileageForm] = useState<MileageForm>({ mileage: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Fetch ──────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const [vRes, bRes] = await Promise.all([
        fetch('/api/car/vehicles'),
        fetch('/api/car/bookings'),
      ]);
      if (vRes.ok) {
        const vData = await vRes.json();
        const vehicles = vData.vehicles || [];
        const active = vehicles.find((v: VehicleInfo) => v.isActive) || vehicles[0] || null;
        setVehicle(active);
      }
      if (bRes.ok) {
        const bData = await bRes.json();
        setBookings(bData.bookings || []);
      }
    } catch { setError('無法取得車輛或預約資料'); }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const refreshAll = useCallback(() => {
    fetchData();
    onRefreshCalendar?.();
  }, [fetchData, onRefreshCalendar]);

  // ── Handlers ───────────────────────────────────────────────

  const handleQuickAction = (idx: number) => {
    const action = QUICK_ACTIONS[idx];
    if (action.href) {
      router.push(action.href);
    } else if (idx === 0) {
      // 預約
      setError('');
      setBookingForm({
        startDate: getLocalDateString(),
        endDate: getLocalDateString(),
        purpose: '',
        isRecurring: false,
        recurringType: 'WEEKLY',
      });
      setShowBooking(true);
    } else if (idx === 3) {
      // 里程
      setError('');
      setMileageForm({ mileage: vehicle?.currentMileage?.toString() || '', note: '' });
      setShowMileage(true);
    }
  };

  const handleCreateBooking = async () => {
    setSaving(true);
    setError('');
    try {
      if (!vehicle?.id) {
        setError('尚無車輛資料，請先到車輛資訊頁新增車輛');
        setSaving(false);
        return;
      }
      const start = new Date(bookingForm.startDate);
      const end = new Date(bookingForm.endDate);
      if (end < start) { setError('結束日期不能早於開始日期'); setSaving(false); return; }
      const applyDays = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;

      const body: Record<string, unknown> = {
        vehicleId: vehicle.id,
        startDate: bookingForm.startDate,
        endDate: bookingForm.endDate,
        applyDays,
        purpose: bookingForm.purpose.trim(),
        isRecurring: bookingForm.isRecurring,
      };
      if (bookingForm.isRecurring) {
        body.recurringType = bookingForm.recurringType;
      }

      const res = await fetch('/api/car/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '建立失敗');
        return;
      }
      setShowBooking(false);
      refreshAll();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const openEditBooking = (b: CarBookingItem) => {
    setEditBookingId(b.id);
    setBookingForm({
      startDate: b.startDate,
      endDate: b.endDate,
      purpose: b.purpose,
      isRecurring: b.isRecurring,
      recurringType: (b.recurringType as RecurringTypeValue) || 'WEEKLY',
    });
    setError('');
    setShowEditBooking(true);
  };

  const handleUpdateBooking = async () => {
    if (!editBookingId) return;
    setSaving(true);
    setError('');
    try {
      const start = new Date(bookingForm.startDate);
      const end = new Date(bookingForm.endDate);
      if (end < start) { setError('結束日期不能早於開始日期'); setSaving(false); return; }

      const res = await fetch(`/api/car/bookings/${editBookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: bookingForm.startDate,
          endDate: bookingForm.endDate,
          purpose: bookingForm.purpose.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新失敗');
        return;
      }
      setShowEditBooking(false);
      setEditBookingId(null);
      refreshAll();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBooking = async (id: string) => {
    if (!confirm('確定要刪除此預約？此操作無法復原。')) return;
    try {
      const res = await fetch(`/api/car/bookings/${id}`, { method: 'DELETE' });
      if (res.ok) refreshAll();
      else {
        const data = await res.json();
        alert(data.error || '刪除失敗');
      }
    } catch { alert('網路錯誤，刪除預約失敗'); }
  };

  const handleCheckout = async () => {
    if (!activeBookingId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/car/bookings/${activeBookingId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startMileage: checkoutForm.mileage ? parseInt(checkoutForm.mileage) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '出車失敗');
        return;
      }
      setShowCheckout(false);
      refreshAll();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!activeBookingId) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/car/bookings/${activeBookingId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endMileage: returnForm.mileage ? parseInt(returnForm.mileage) : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '還車失敗');
        return;
      }
      setShowReturn(false);
      refreshAll();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateMileage = async () => {
    if (!vehicle) {
      setError('尚無車輛資料，請先到車輛資訊頁設定');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const mileage = parseInt(mileageForm.mileage);
      if (isNaN(mileage) || mileage <= 0) {
        setError('請輸入有效的里程數');
        setSaving(false);
        return;
      }
      const res = await fetch('/api/car/mileage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: vehicle.id,
          mileage,
          source: 'MANUAL',
          note: mileageForm.note.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || '更新失敗');
        return;
      }
      setShowMileage(false);
      refreshAll();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const openCheckout = (id: string) => {
    setActiveBookingId(id);
    setCheckoutForm({ mileage: vehicle?.currentMileage?.toString() || '', note: '' });
    setError('');
    setShowCheckout(true);
  };

  const openReturn = (id: string) => {
    setActiveBookingId(id);
    setReturnForm({ mileage: '', note: '' });
    setError('');
    setShowReturn(true);
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getMonth() + 1}/${dt.getDate()}`;
  };

  // ── Upcoming bookings ─────────────────────────────────────

  const todayStr = getLocalDateString();
  const upcomingBookings = bookings
    .filter(b => b.status !== 'CANCELLED' && b.endDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 5);

  // ── Render ─────────────────────────────────────────────────

  if (loading) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.divider} />

      {/* Quick Actions */}
      <div className={styles.quickActionsHeader}>
        <span className={styles.quickActionsTitle}>🚗 用車管理</span>
      </div>
      <div className={styles.quickActionsGrid}>
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            type="button"
            className={styles.quickActionBtn}
            onClick={() => handleQuickAction(idx)}
          >
            <span className={styles.quickActionEmoji}>{action.emoji}</span>
            <span className={styles.quickActionLabel}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Vehicle Mini Card */}
      {vehicle && (
        <Link href="/car/vehicle" className={styles.vehicleCard}>
          <div className={styles.vehicleInfo}>
            <span className={styles.vehicleName}>{vehicle.name}</span>
            <span className={styles.vehiclePlate}>{vehicle.plateNumber}</span>
          </div>
          <div className={styles.vehicleMileage}>
            {vehicle.currentMileage != null
              ? `${vehicle.currentMileage.toLocaleString()} km`
              : '— km'}
          </div>
        </Link>
      )}

      {/* Upcoming Bookings */}
      <div className={styles.bookingSection}>
        <div className={styles.bookingHeader}>
          <span className={styles.bookingTitle}>預約列表</span>
          <span className={styles.bookingCount}>{upcomingBookings.length} 筆</span>
        </div>
        {upcomingBookings.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🚗</div>
            <div className={styles.emptyText}>目前沒有預約</div>
          </div>
        ) : (
          upcomingBookings.map(b => (
            <div key={b.id} className={styles.bookingItem}>
              <div className={styles.bookingLeft}>
                <Avatar avatarUrl={b.user.avatarUrl} name={b.user.displayName} size="sm" />
                <div className={styles.bookingMeta}>
                  <div className={styles.bookingUser}>{b.user.displayName}</div>
                  <div className={styles.bookingDate}>
                    {formatDate(b.startDate)} ~ {formatDate(b.endDate)} · {b.applyDays}天
                  </div>
                  <div className={styles.bookingPurpose}>{b.purpose}</div>
                </div>
              </div>
              <div className={styles.bookingRight}>
                <span
                  className={styles.statusBadge}
                  style={{ backgroundColor: `${BOOKING_STATUS_COLOR[b.status]}18`, color: BOOKING_STATUS_COLOR[b.status] }}
                >
                  {BOOKING_STATUS_LABEL[b.status]}
                </span>
                <div className={styles.bookingActions}>
                  {b.status === 'RESERVED' && (
                    <>
                      <button type="button" className={styles.actionBtnPrimary} onClick={() => openCheckout(b.id)}>出車</button>
                      <button type="button" className={styles.actionBtnEdit} onClick={() => openEditBooking(b)}>
                        <Pencil size={11} />
                      </button>
                      <button type="button" className={styles.actionBtnDanger} onClick={() => handleDeleteBooking(b.id)}>
                        <Trash2 size={11} />
                      </button>
                    </>
                  )}
                  {b.status === 'OUT' && (
                    <button type="button" className={styles.actionBtnPrimary} onClick={() => openReturn(b.id)}>還車</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <button type="button" className={styles.addBookingBtn} onClick={() => handleQuickAction(0)}>
          <Plus size={14} /> 新增預約
        </button>
      </div>

      {/* ── New Booking Dialog ──────────────────────────── */}
      {showBooking && (
        <div className={styles.modalOverlay} onClick={() => setShowBooking(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>新增預約</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowBooking(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>開始日期</label>
                  <input type="date" className={styles.formInput} value={bookingForm.startDate}
                    onChange={e => setBookingForm({ ...bookingForm, startDate: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>結束日期</label>
                  <input type="date" className={styles.formInput} value={bookingForm.endDate}
                    onChange={e => setBookingForm({ ...bookingForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>用途</label>
                <input type="text" className={styles.formInput} placeholder="例如：上班通勤、買菜"
                  value={bookingForm.purpose}
                  onChange={e => setBookingForm({ ...bookingForm, purpose: e.target.value })} />
              </div>
              <div className={styles.formCheckRow}>
                <label className={styles.formCheckLabel}>
                  <input type="checkbox" checked={bookingForm.isRecurring}
                    onChange={e => setBookingForm({ ...bookingForm, isRecurring: e.target.checked })} />
                  循環預約
                </label>
                {bookingForm.isRecurring && (
                  <select className={styles.formSelect} value={bookingForm.recurringType}
                    style={{ width: 'auto' }}
                    onChange={e => setBookingForm({ ...bookingForm, recurringType: e.target.value as RecurringTypeValue })}>
                    <option value="WEEKLY">每週</option>
                    <option value="BIWEEKLY">雙週</option>
                    <option value="MONTHLY">每月</option>
                  </select>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowBooking(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleCreateBooking} disabled={saving || !bookingForm.purpose.trim()}>
                {saving ? '建立中...' : '建立預約'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Booking Dialog ─────────────────────────── */}
      {showEditBooking && (
        <div className={styles.modalOverlay} onClick={() => { setShowEditBooking(false); setEditBookingId(null); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>編輯預約</h2>
              <button type="button" className={styles.modalClose} onClick={() => { setShowEditBooking(false); setEditBookingId(null); }}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>開始日期</label>
                  <input type="date" className={styles.formInput} value={bookingForm.startDate}
                    onChange={e => setBookingForm({ ...bookingForm, startDate: e.target.value })} />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>結束日期</label>
                  <input type="date" className={styles.formInput} value={bookingForm.endDate}
                    onChange={e => setBookingForm({ ...bookingForm, endDate: e.target.value })} />
                </div>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>用途</label>
                <input type="text" className={styles.formInput} placeholder="例如：上班通勤、買菜"
                  value={bookingForm.purpose}
                  onChange={e => setBookingForm({ ...bookingForm, purpose: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => { setShowEditBooking(false); setEditBookingId(null); }}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleUpdateBooking} disabled={saving || !bookingForm.purpose.trim()}>
                {saving ? '更新中...' : '更新預約'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Checkout Dialog ─────────────────────────────── */}
      {showCheckout && (
        <div className={styles.modalOverlay} onClick={() => setShowCheckout(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>🚗 出車</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowCheckout(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>出車里程 (km)</label>
                <input type="number" className={styles.formInput} placeholder="目前里程"
                  value={checkoutForm.mileage}
                  onChange={e => setCheckoutForm({ ...checkoutForm, mileage: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowCheckout(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleCheckout} disabled={saving}>
                {saving ? '處理中...' : '確認出車'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Dialog ───────────────────────────────── */}
      {showReturn && (
        <div className={styles.modalOverlay} onClick={() => setShowReturn(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>🏠 還車</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowReturn(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>還車里程 (km)</label>
                <input type="number" className={styles.formInput} placeholder="目前里程"
                  value={returnForm.mileage}
                  onChange={e => setReturnForm({ ...returnForm, mileage: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowReturn(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleReturn} disabled={saving}>
                {saving ? '處理中...' : '確認還車'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mileage Dialog ──────────────────────────────── */}
      {showMileage && (
        <div className={styles.modalOverlay} onClick={() => setShowMileage(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>📏 更新里程</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowMileage(false)}>
                <X size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && <div className={styles.errorMsg}>{error}</div>}
              {vehicle?.currentMileage != null && (
                <div className={styles.mileageHint}>
                  目前里程：{vehicle.currentMileage.toLocaleString()} km
                </div>
              )}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>新里程 (km) *</label>
                <input type="number" className={styles.formInput} placeholder="輸入最新里程"
                  value={mileageForm.mileage}
                  onChange={e => setMileageForm({ ...mileageForm, mileage: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>備註</label>
                <input type="text" className={styles.formInput} placeholder="例如：定期回報"
                  value={mileageForm.note}
                  onChange={e => setMileageForm({ ...mileageForm, note: e.target.value })} />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowMileage(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleUpdateMileage} disabled={saving || !mileageForm.mileage}>
                {saving ? '更新中...' : '更新里程'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
