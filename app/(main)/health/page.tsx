'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Plus, X, Pencil, Trash2, Download, Share2,
  Heart, Activity, Droplets, Thermometer, Weight, Wind,
  FileText,
} from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import styles from './page.module.css';

// recharts 圖表元件 — 動態載入避免 SSR 問題
const HealthCharts = dynamic(
  () => import('./HealthCharts'),
  { ssr: false, loading: () => <div className={styles.chartWrap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>載入圖表中...</div> }
);

// PDF 匯出元件 — 動態載入（含 jspdf）
const PdfExport = dynamic(
  () => import('./PdfExport'),
  { ssr: false }
);

// ── 指標定義（含說明）─────────────────────────────────────────

const METRIC_INFO = {
  bp: {
    label: '血壓',
    icon: Heart,
    color: '#e53935',
    desc: '收縮壓（高壓）與舒張壓（低壓）。正常值約 120/80 mmHg。高血壓標準：收縮壓 ≥ 140 或舒張壓 ≥ 90 mmHg。',
    normalRange: '120/80 mmHg',
  },
  hr: {
    label: '心率',
    icon: Activity,
    color: '#ff9800',
    desc: '每分鐘心跳次數。靜止心率正常範圍 60-100 bpm。運動員可能更低（40-60）。長期偏高或偏低都應就醫。',
    normalRange: '60-100 bpm',
  },
  sugar: {
    label: '血糖',
    icon: Droplets,
    color: '#9c27b0',
    desc: '血液中的葡萄糖濃度。空腹正常值 70-100 mg/dL，飯後 2 小時正常值 < 140 mg/dL。空腹 ≥ 126 mg/dL 可能為糖尿病。',
    normalRange: '空腹 70-100 mg/dL',
  },
  weight: {
    label: '體重',
    icon: Weight,
    color: '#2196f3',
    desc: '體重變化趨勢。可搭配體脂率一起追蹤。BMI = 體重(kg) ÷ 身高(m)²，正常範圍 18.5-24.9。',
    normalRange: 'BMI 18.5-24.9',
  },
  temp: {
    label: '體溫',
    icon: Thermometer,
    color: '#ff5722',
    desc: '正常體溫約 36.1-37.2°C。超過 37.5°C 視為發燒，超過 38.5°C 為高燒，應及時就醫。',
    normalRange: '36.1-37.2°C',
  },
  oxygen: {
    label: '血氧',
    icon: Wind,
    color: '#009688',
    desc: '血液中的氧飽和度。正常值 95-100%。低於 94% 視為偏低，低於 90% 需立即就醫。',
    normalRange: '95-100%',
  },
} as const;

type MetricKey = keyof typeof METRIC_INFO;

const MEAL_LABELS: Record<string, string> = {
  fasting: '空腹',
  before: '飯前',
  after: '飯後',
};

const PERIOD_OPTIONS = [
  { value: 7, label: '7天' },
  { value: 30, label: '30天' },
  { value: 90, label: '90天' },
  { value: 180, label: '半年' },
  { value: 365, label: '一年' },
];

// ── 型別定義 ──────────────────────────────────────────────────

interface HealthRecord {
  id: string;
  recordedAt: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  bloodSugar: number | null;
  mealTiming: string | null;
  temperature: number | null;
  weight: number | null;
  bodyFat: number | null;
  oxygenSat: number | null;
  note: string | null;
}

interface HealthStats {
  bp: { avg_sys: number; avg_dia: number; max_sys: number; max_dia: number; min_sys: number; min_dia: number; count: number };
  heartRate: { avg: number; max: number; min: number; count: number };
  bloodSugar: { avg: number; max: number; min: number; count: number };
  weight: { avg: number; max: number; min: number; count: number };
  temperature: { avg: number; max: number; min: number; count: number };
  oxygenSat: { avg: number; max: number; min: number; count: number };
  anomalies: { highBp: number; lowHr: number; highHr: number; highSugar: number; fever: number; lowOxygen: number };
}

interface ShareUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

interface FormData {
  recordedAt: string;
  systolic: string;
  diastolic: string;
  heartRate: string;
  bloodSugar: string;
  mealTiming: string;
  temperature: string;
  weight: string;
  bodyFat: string;
  oxygenSat: string;
  note: string;
}

/** 取得本地時間字串（格式：YYYY-MM-DDTHH:mm），供 datetime-local 使用 */
function getLocalDateTimeString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

const defaultForm = (): FormData => ({
  recordedAt: getLocalDateTimeString(),
  systolic: '', diastolic: '', heartRate: '',
  bloodSugar: '', mealTiming: '',
  temperature: '', weight: '', bodyFat: '', oxygenSat: '',
  note: '',
});

// ── Main Component ────────────────────────────────────────────

export default function HealthPage() {
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [stats, setStats] = useState<HealthStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MetricKey>('bp');
  const [days, setDays] = useState(30);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPdfExport, setShowPdfExport] = useState(false);

  // 查看對象（空字串 = 自己）
  const [viewingUserId, setViewingUserId] = useState('');
  const isViewingOther = viewingUserId !== '';

  // 分享
  const [sharedTo, setSharedTo] = useState<ShareUser[]>([]);
  const [sharedFrom, setSharedFrom] = useState<ShareUser[]>([]);
  const [allUsers, setAllUsers] = useState<ShareUser[]>([]);
  const [shareUserId, setShareUserId] = useState('');

  // ── Fetch ──────────────────────────────────────────────────

  const fetchRecords = useCallback(async () => {
    try {
      const userParam = viewingUserId ? `&userId=${viewingUserId}` : '';
      const res = await fetch(`/api/health/records?days=${days}${userParam}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data.records || []);
      }
    } catch { /* ignore */ }
  }, [days, viewingUserId]);

  const fetchStats = useCallback(async () => {
    try {
      const userParam = viewingUserId ? `&userId=${viewingUserId}` : '';
      const res = await fetch(`/api/health/stats?days=${days}${userParam}`);
      if (res.ok) {
        const data = await res.json();
        // API 回傳 { stats: {...}, anomalies: {...} }，合併成 UI 需要的 HealthStats 結構
        const s = data.stats || {};
        setStats({
          bp: s.bp || { avg_sys: 0, avg_dia: 0, max_sys: 0, max_dia: 0, min_sys: 0, min_dia: 0, count: 0 },
          heartRate: s.heartRate || { avg: 0, max: 0, min: 0, count: 0 },
          bloodSugar: s.bloodSugar || { avg: 0, max: 0, min: 0, count: 0 },
          weight: s.weight || { avg: 0, max: 0, min: 0, count: 0 },
          temperature: s.temperature || { avg: 0, max: 0, min: 0, count: 0 },
          oxygenSat: s.oxygenSat || { avg: 0, max: 0, min: 0, count: 0 },
          anomalies: data.anomalies || { highBp: 0, lowHr: 0, highHr: 0, highSugar: 0, fever: 0, lowOxygen: 0 },
        });
      }
    } catch { /* ignore */ }
  }, [days, viewingUserId]);

  const fetchShares = useCallback(async () => {
    try {
      const res = await fetch('/api/health/share');
      if (res.ok) {
        const data = await res.json();
        // API 回傳 sharedTo: [{ id, viewer: { id, displayName, avatarUrl } }]
        // 轉換成 UI 需要的 [{ id, displayName, avatarUrl }] 格式
        setSharedTo(
          (data.sharedTo || []).map((s: Record<string, Record<string, unknown>>) => ({
            id: s.viewer?.id as string,
            displayName: s.viewer?.displayName as string,
            avatarUrl: s.viewer?.avatarUrl as string | null,
          }))
        );
        setSharedFrom(
          (data.sharedFrom || []).map((s: Record<string, Record<string, unknown>>) => ({
            id: s.owner?.id as string,
            displayName: s.owner?.displayName as string,
            avatarUrl: s.owner?.avatarUrl as string | null,
          }))
        );
      }
    } catch { /* ignore */ }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/family/members');
      if (res.ok) {
        const data = await res.json();
        setAllUsers((data.members || []).map((u: Record<string, unknown>) => ({
          id: u.id as string,
          displayName: u.displayName as string,
          avatarUrl: u.avatarUrl as string | null,
        })));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRecords(), fetchStats(), fetchShares(), fetchUsers()])
      .finally(() => setLoading(false));
  }, [fetchRecords, fetchStats, fetchShares, fetchUsers]);

  // ── Handlers ───────────────────────────────────────────────

  const handleOpenAdd = () => {
    setForm(defaultForm());
    setEditingId(null);
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (rec: HealthRecord) => {
    setForm({
      recordedAt: new Date(rec.recordedAt).toISOString().slice(0, 16),
      systolic: rec.systolic?.toString() || '',
      diastolic: rec.diastolic?.toString() || '',
      heartRate: rec.heartRate?.toString() || '',
      bloodSugar: rec.bloodSugar?.toString() || '',
      mealTiming: rec.mealTiming || '',
      temperature: rec.temperature?.toString() || '',
      weight: rec.weight?.toString() || '',
      bodyFat: rec.bodyFat?.toString() || '',
      oxygenSat: rec.oxygenSat?.toString() || '',
      note: rec.note || '',
    });
    setEditingId(rec.id);
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const body: Record<string, unknown> = {};
      // 將本地 datetime-local 值轉換為完整的 ISO 字串（含時區 offset）
      const localDate = new Date(form.recordedAt);
      body.recordedAt = localDate.toISOString();
      if (form.systolic) body.systolic = parseInt(form.systolic);
      if (form.diastolic) body.diastolic = parseInt(form.diastolic);
      if (form.heartRate) body.heartRate = parseInt(form.heartRate);
      if (form.bloodSugar) body.bloodSugar = parseFloat(form.bloodSugar);
      if (form.mealTiming) body.mealTiming = form.mealTiming;
      if (form.temperature) body.temperature = parseFloat(form.temperature);
      if (form.weight) body.weight = parseFloat(form.weight);
      if (form.bodyFat) body.bodyFat = parseFloat(form.bodyFat);
      if (form.oxygenSat) body.oxygenSat = parseFloat(form.oxygenSat);
      if (form.note) body.note = form.note;

      const url = editingId ? `/api/health/records/${editingId}` : '/api/health/records';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
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
      fetchStats();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除此筆記錄？')) return;
    try {
      const res = await fetch(`/api/health/records/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchRecords();
        fetchStats();
      }
    } catch { /* ignore */ }
  };

  const handleExportCSV = () => {
    window.open(`/api/health/export/csv?days=${days}`, '_blank');
  };

  const handleAddShare = async () => {
    if (!shareUserId) return;
    try {
      await fetch('/api/health/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId: shareUserId }),
      });
      setShareUserId('');
      fetchShares();
    } catch { /* ignore */ }
  };

  const handleRemoveShare = async (viewerId: string) => {
    try {
      await fetch('/api/health/share', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId }),
      });
      fetchShares();
    } catch { /* ignore */ }
  };

  // ── Chart Data ─────────────────────────────────────────────

  const chartData = records
    .slice()
    .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
    .map((r) => ({
      date: new Date(r.recordedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }),
      fullDate: new Date(r.recordedAt).toLocaleString('zh-TW'),
      systolic: r.systolic,
      diastolic: r.diastolic,
      heartRate: r.heartRate,
      bloodSugar: r.bloodSugar,
      mealTiming: r.mealTiming,
      temperature: r.temperature,
      weight: r.weight,
      bodyFat: r.bodyFat,
      oxygenSat: r.oxygenSat,
    }));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // ── Render ─────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.container}><div className={styles.loading}>載入中...</div></div>;
  }

  const info = METRIC_INFO[activeTab];
  const InfoIcon = info.icon;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>
          <Heart size={28} />
          健康記錄
        </h1>
        <p className={styles.pageSubtitle}>追蹤您的健康數據，掌握身體狀況</p>
      </div>

      {/* 查看對象切換（有共享給我的成員時顯示）*/}
      {sharedFrom.length > 0 && (
        <div className={styles.viewerSelector}>
          <button
            type="button"
            className={`${styles.viewerBtn} ${!isViewingOther ? styles.viewerBtnActive : ''}`}
            onClick={() => setViewingUserId('')}
          >
            👤 我的記錄
          </button>
          {sharedFrom.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`${styles.viewerBtn} ${viewingUserId === u.id ? styles.viewerBtnActive : ''}`}
              onClick={() => setViewingUserId(u.id)}
            >
              <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size="sm" />
              {u.displayName}
            </button>
          ))}
        </div>
      )}

      {/* 查看他人時的提示 */}
      {isViewingOther && (
        <div className={styles.viewingBanner}>
          👁️ 正在查看 <strong>{sharedFrom.find(u => u.id === viewingUserId)?.displayName}</strong> 的健康記錄（唯讀）
        </div>
      )}

      {/* Controls */}
      <div className={styles.controls}>
        <div className={styles.tabRow}>
          {(Object.entries(METRIC_INFO) as [MetricKey, typeof METRIC_INFO[MetricKey]][]).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.tabBtn} ${activeTab === key ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {m.label}
              </button>
            );
          })}
        </div>
        <div className={styles.actionRow}>
          <button type="button" className={styles.exportBtn} onClick={handleExportCSV}>
            <Download size={14} /> CSV
          </button>
          <button type="button" className={styles.exportBtn} onClick={() => setShowPdfExport(true)}>
            <FileText size={14} /> PDF
          </button>
          {!isViewingOther && (
            <button type="button" className={styles.addBtn} onClick={handleOpenAdd}>
              <Plus size={16} /> 新增量測
            </button>
          )}
        </div>
      </div>

      {/* Period */}
      <div className={styles.periodRow}>
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.value}
            type="button"
            className={`${styles.periodBtn} ${days === p.value ? styles.periodBtnActive : ''}`}
            onClick={() => setDays(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>
          <InfoIcon size={18} style={{ color: info.color }} />
          {info.label}趨勢
          <span className={styles.normalRange}>正常：{info.normalRange}</span>
        </div>
        <p className={styles.chartDesc}>{info.desc}</p>
        <HealthCharts activeTab={activeTab} chartData={chartData} />
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsGrid}>
          {activeTab === 'bp' && stats.bp.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均血壓</div>
              <div className={`${styles.statValue} ${stats.bp.avg_sys >= 140 ? styles.statWarning : ''}`}>
                {Math.round(stats.bp.avg_sys)}/{Math.round(stats.bp.avg_dia)}
              </div>
              <div className={styles.statUnit}>mmHg</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.bp.max_sys}/{stats.bp.max_dia}</div>
              <div className={styles.statUnit}>mmHg</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.bp.min_sys}/{stats.bp.min_dia}</div>
              <div className={styles.statUnit}>mmHg</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.bp.count}</div>
              <div className={styles.statUnit}>次</div>
            </div>
          </>)}
          {activeTab === 'hr' && stats.heartRate.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均心率</div>
              <div className={styles.statValue}>{Math.round(stats.heartRate.avg)}</div>
              <div className={styles.statUnit}>bpm</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.heartRate.max}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.heartRate.min}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.heartRate.count}</div>
            </div>
          </>)}
          {activeTab === 'sugar' && stats.bloodSugar.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均血糖</div>
              <div className={styles.statValue}>{Math.round(stats.bloodSugar.avg)}</div>
              <div className={styles.statUnit}>mg/dL</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.bloodSugar.max}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.bloodSugar.min}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.bloodSugar.count}</div>
            </div>
          </>)}
          {activeTab === 'weight' && stats.weight.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均體重</div>
              <div className={styles.statValue}>{stats.weight.avg.toFixed(1)}</div>
              <div className={styles.statUnit}>kg</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.weight.max}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.weight.min}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.weight.count}</div>
            </div>
          </>)}
          {activeTab === 'temp' && stats.temperature.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均體溫</div>
              <div className={styles.statValue}>{stats.temperature.avg.toFixed(1)}</div>
              <div className={styles.statUnit}>°C</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.temperature.max}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.temperature.min}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.temperature.count}</div>
            </div>
          </>)}
          {activeTab === 'oxygen' && stats.oxygenSat.count > 0 && (<>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均血氧</div>
              <div className={styles.statValue}>{stats.oxygenSat.avg.toFixed(1)}</div>
              <div className={styles.statUnit}>%</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最高</div>
              <div className={styles.statValue}>{stats.oxygenSat.max}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>最低</div>
              <div className={styles.statValue}>{stats.oxygenSat.min}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>量測次數</div>
              <div className={styles.statValue}>{stats.oxygenSat.count}</div>
            </div>
          </>)}
        </div>
      )}

      {/* Anomaly Warnings */}
      {stats && stats.anomalies && (
        (() => {
          const a = stats.anomalies;
          const warnings = [];
          if (a.highBp > 0) warnings.push(`⚠️ ${a.highBp} 次高血壓`);
          if (a.highHr > 0) warnings.push(`⚠️ ${a.highHr} 次心率偏高`);
          if (a.lowHr > 0) warnings.push(`⚠️ ${a.lowHr} 次心率偏低`);
          if (a.highSugar > 0) warnings.push(`⚠️ ${a.highSugar} 次血糖偏高`);
          if (a.fever > 0) warnings.push(`⚠️ ${a.fever} 次發燒`);
          if (a.lowOxygen > 0) warnings.push(`⚠️ ${a.lowOxygen} 次血氧偏低`);
          if (warnings.length === 0) return null;
          return (
            <div className={styles.chartCard} style={{ borderColor: '#e53935' }}>
              <div className={styles.chartTitle} style={{ color: '#e53935' }}>
                ⚠️ 異常值提醒（最近 {days} 天）
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {warnings.map((w, i) => (
                  <span key={i} className={`${styles.recordBadge} ${styles.badgeBp} ${styles.badgeWarning}`}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          );
        })()
      )}

      {/* Records List */}
      <div className={styles.recordsCard}>
        <div className={styles.recordsHeader}>
          <span className={styles.recordsTitle}>量測記錄</span>
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            共 {records.length} 筆
          </span>
        </div>
        {records.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><Heart size={48} /></div>
            <div className={styles.emptyText}>{isViewingOther ? '對方尚無健康記錄' : '尚無健康記錄'}</div>
            {!isViewingOther && (
              <button type="button" className={styles.addBtn} onClick={handleOpenAdd}>
                <Plus size={16} /> 新增第一筆量測
              </button>
            )}
          </div>
        ) : (
          records.map((rec) => (
            <div key={rec.id} className={styles.recordItem}>
              <span className={styles.recordDate}>{formatDate(rec.recordedAt)}</span>
              <div className={styles.recordValues}>
                {rec.systolic != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeBp} ${rec.systolic >= 140 || (rec.diastolic ?? 0) >= 90 ? styles.badgeWarning : ''}`}>
                    🫀 {rec.systolic}/{rec.diastolic}
                  </span>
                )}
                {rec.heartRate != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeHr} ${rec.heartRate > 100 || rec.heartRate < 50 ? styles.badgeWarning : ''}`}>
                    💓 {rec.heartRate}
                  </span>
                )}
                {rec.bloodSugar != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeSugar}`}>
                    🩸 {rec.bloodSugar} {rec.mealTiming ? `(${MEAL_LABELS[rec.mealTiming] || rec.mealTiming})` : ''}
                  </span>
                )}
                {rec.weight != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeWeight}`}>
                    ⚖️ {rec.weight}kg{rec.bodyFat ? ` / ${rec.bodyFat}%` : ''}
                  </span>
                )}
                {rec.temperature != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeTemp} ${rec.temperature >= 37.5 ? styles.badgeWarning : ''}`}>
                    🌡️ {rec.temperature}°C
                  </span>
                )}
                {rec.oxygenSat != null && (
                  <span className={`${styles.recordBadge} ${styles.badgeOxygen} ${rec.oxygenSat < 94 ? styles.badgeWarning : ''}`}>
                    💨 {rec.oxygenSat}%
                  </span>
                )}
              </div>
              {rec.note && <span className={styles.recordNote} title={rec.note}>📝 {rec.note}</span>}
              {!isViewingOther && (
                <div className={styles.recordActions}>
                  <button type="button" className={styles.recordActionBtn} onClick={() => handleOpenEdit(rec)} title="編輯">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className={`${styles.recordActionBtn} ${styles.recordActionBtnDanger}`}
                    onClick={() => handleDelete(rec.id)} title="刪除">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Share Section — 只在查看自己的記錄時顯示 */}
      {!isViewingOther && (
      <div className={styles.shareCard}>
        <div className={styles.shareTitle}>
          <Share2 size={18} /> 資料共享
        </div>
        <p className={styles.chartDesc}>
          選擇要共享健康數據的家庭成員。對方可以查看你的健康記錄與統計圖表。
        </p>
        <div className={styles.shareList}>
          {sharedTo.length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>尚未與任何人共享</p>
          )}
          {sharedTo.map((u) => (
            <div key={u.id} className={styles.shareItem}>
              <div className={styles.shareUser}>
                <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size="sm" />
                <span className={styles.shareUserName}>{u.displayName}</span>
              </div>
              <button type="button" className={styles.shareRemoveBtn} onClick={() => handleRemoveShare(u.id)}>
                取消共享
              </button>
            </div>
          ))}
        </div>
        <div className={styles.shareAddRow}>
          <select className={styles.formSelect} value={shareUserId} onChange={(e) => setShareUserId(e.target.value)}>
            <option value="">選擇家人...</option>
            {allUsers
              .filter(u => !sharedTo.some(s => s.id === u.id))
              .map(u => (
                <option key={u.id} value={u.id}>{u.displayName}</option>
              ))}
          </select>
          <button type="button" className={styles.addBtn} onClick={handleAddShare} disabled={!shareUserId}>
            <Plus size={14} /> 新增
          </button>
        </div>

        {sharedFrom.length > 0 && (
          <>
            <div className={styles.shareTitle} style={{ marginTop: '16px' }}>
              👥 共享給我的成員
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: '8px', fontWeight: 400 }}>
                （點擊上方切換按鈕可查看對方數據）
              </span>
            </div>
            {sharedFrom.map((u) => (
              <div key={u.id} className={styles.shareItem}>
                <div className={styles.shareUser}>
                  <Avatar avatarUrl={u.avatarUrl} name={u.displayName} size="sm" />
                  <span className={styles.shareUserName}>{u.displayName}</span>
                </div>
                <button
                  type="button"
                  className={styles.exportBtn}
                  onClick={() => setViewingUserId(u.id)}
                  style={{ fontSize: '11px' }}
                >
                  👁️ 查看數據
                </button>
              </div>
            ))}
          </>
        )}
      </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? '編輯量測' : '新增量測'}</h2>
              <button type="button" className={styles.modalClose} onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {error && (
                <div style={{ color: '#e53935', fontSize: '13px', marginBottom: '12px', padding: '8px', borderRadius: '8px', background: 'rgba(229,57,53,0.08)' }}>
                  {error}
                </div>
              )}

              {/* 量測時間 */}
              <div className={styles.formSection}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>量測時間</label>
                  <input
                    type="datetime-local"
                    className={styles.formInput}
                    value={form.recordedAt}
                    onChange={(e) => setForm({ ...form, recordedAt: e.target.value })}
                  />
                </div>
              </div>

              {/* 血壓 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Heart size={16} style={{ color: '#e53935' }} /> 血壓
                </div>
                <div className={styles.formSectionDesc}>
                  收縮壓（高壓）與舒張壓（低壓），正常值約 120/80 mmHg
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>收縮壓 (mmHg)</label>
                    <input type="number" className={styles.formInput} placeholder="120"
                      value={form.systolic} onChange={(e) => setForm({ ...form, systolic: e.target.value })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>舒張壓 (mmHg)</label>
                    <input type="number" className={styles.formInput} placeholder="80"
                      value={form.diastolic} onChange={(e) => setForm({ ...form, diastolic: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* 心率 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Activity size={16} style={{ color: '#ff9800' }} /> 心率
                </div>
                <div className={styles.formSectionDesc}>
                  每分鐘心跳次數，靜止正常範圍 60-100 bpm
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>心率 (bpm)</label>
                  <input type="number" className={styles.formInput} placeholder="72"
                    value={form.heartRate} onChange={(e) => setForm({ ...form, heartRate: e.target.value })} />
                </div>
              </div>

              {/* 血糖 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Droplets size={16} style={{ color: '#9c27b0' }} /> 血糖
                </div>
                <div className={styles.formSectionDesc}>
                  空腹正常 70-100 mg/dL，飯後 2 小時 &lt; 140 mg/dL
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>血糖 (mg/dL)</label>
                    <input type="number" className={styles.formInput} placeholder="95"
                      value={form.bloodSugar} onChange={(e) => setForm({ ...form, bloodSugar: e.target.value })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>量測時段</label>
                    <div className={styles.mealTimingRow}>
                      {Object.entries(MEAL_LABELS).map(([key, label]) => (
                        <label key={key} className={styles.mealTimingOption}>
                          <input type="radio" name="mealTiming" value={key}
                            checked={form.mealTiming === key}
                            onChange={(e) => setForm({ ...form, mealTiming: e.target.value })} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 體重/體脂 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Weight size={16} style={{ color: '#2196f3' }} /> 體重/體脂
                </div>
                <div className={styles.formSectionDesc}>
                  BMI = 體重(kg) ÷ 身高(m)²，正常範圍 18.5-24.9
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>體重 (kg)</label>
                    <input type="number" step="0.1" className={styles.formInput} placeholder="65.5"
                      value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>體脂率 (%)</label>
                    <input type="number" step="0.1" className={styles.formInput} placeholder="22.0"
                      value={form.bodyFat} onChange={(e) => setForm({ ...form, bodyFat: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* 體溫 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Thermometer size={16} style={{ color: '#ff5722' }} /> 體溫
                </div>
                <div className={styles.formSectionDesc}>
                  正常 36.1-37.2°C，超過 37.5°C 為發燒
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>體溫 (°C)</label>
                  <input type="number" step="0.1" className={styles.formInput} placeholder="36.5"
                    value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
                </div>
              </div>

              {/* 血氧 */}
              <div className={styles.formSection}>
                <div className={styles.formSectionTitle}>
                  <Wind size={16} style={{ color: '#009688' }} /> 血氧
                </div>
                <div className={styles.formSectionDesc}>
                  正常 95-100%，低於 94% 偏低，低於 90% 需就醫
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>血氧 (%)</label>
                  <input type="number" step="0.1" className={styles.formInput} placeholder="98"
                    value={form.oxygenSat} onChange={(e) => setForm({ ...form, oxygenSat: e.target.value })} />
                </div>
              </div>

              {/* 備註 */}
              <div className={styles.formSection}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>備註（症狀、用藥等）</label>
                  <textarea className={styles.formTextarea} placeholder="例如：今天有頭暈、吃了降壓藥"
                    value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)}>取消</button>
              <button type="button" className={styles.btnSave} onClick={handleSave} disabled={saving}>
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Export Modal */}
      {showPdfExport && (
        <PdfExport onClose={() => setShowPdfExport(false)} />
      )}
    </div>
  );
}
