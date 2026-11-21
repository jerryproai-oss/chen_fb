'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Settings, Plus, X, Pencil, ToggleLeft, ToggleRight,
  Sparkles, AlertCircle, ChevronDown, ChevronUp, Shield,
  Zap, Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import styles from './page.module.css';

// ── 型別 ──────────────────────────────────────────────────────

interface CostConfigItem {
  id: string;
  vehicleId: string;
  item: string;
  parentRatio: number;
  calcMethod: 'DUAL_TRACK' | 'EVEN_SPLIT';
  dualTrackBaseRatio: number;
  effectiveFrom: string;
  effectiveMode: 'RETROACTIVE' | 'IMMEDIATE' | 'SCHEDULED';
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

interface VehicleOption {
  id: string;
  name: string;
}

interface UserInfo {
  id: string;
  role: string;
}

// ── 常數 ──────────────────────────────────────────────────────

const CALC_METHOD_LABEL: Record<string, string> = {
  DUAL_TRACK: '雙軌制（均分＋天數）',
  EVEN_SPLIT: '均分制',
};

const EFFECTIVE_MODE_LABEL: Record<string, string> = {
  RETROACTIVE: '含設定前（所有結算適用）',
  IMMEDIATE: '即刻生效',
  SCHEDULED: '指定生效日',
};

// ── 主頁面元件 ───────────────────────────────────────────────

export default function CarSettingsPage() {
  const [configs, setConfigs] = useState<CostConfigItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CostConfigItem | null>(null);
  const [showAiSection, setShowAiSection] = useState(false);

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

  // ── 取得規則資料 ───────────────────────────────────────────
  const fetchConfigs = useCallback(async () => {
    try {
      setError(null);
      const [configRes, vehiclesRes] = await Promise.all([
        fetch('/api/car/config'),
        fetch('/api/car/vehicles'),
      ]);
      if (!configRes.ok) throw new Error('載入失敗');
      const configData = await configRes.json();
      const vehiclesData = vehiclesRes.ok ? await vehiclesRes.json() : { vehicles: [] };
      setConfigs(configData.configs || []);
      setVehicles(vehiclesData.vehicles || []);
    } catch {
      setError('無法載入規則設定');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  // ── 權限檢查 ───────────────────────────────────────────────
  if (!loading && !isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <Shield size={48} />
          <h2>權限不足</h2>
          <p>僅管理員可存取規則設定頁面</p>
        </div>
      </div>
    );
  }

  // ── 新增/編輯規則 ──────────────────────────────────────────
  const handleSaveConfig = async (formData: ConfigFormData) => {
    try {
      const isEditing = !!editingConfig;
      const method = isEditing ? 'PATCH' : 'POST';

      const bodyData = isEditing
        ? { id: editingConfig.id, ...formData }
        : formData;

      const res = await fetch('/api/car/config', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '操作失敗');
      }
      setShowConfigDialog(false);
      setEditingConfig(null);
      await fetchConfigs();
    } catch (err) {
      alert(err instanceof Error ? err.message : '儲存失敗');
    }
  };

  // ── 切換啟用狀態 ───────────────────────────────────────────
  const handleToggleActive = async (config: CostConfigItem) => {
    try {
      const res = await fetch('/api/car/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: config.id, isActive: !config.isActive }),
      });
      if (!res.ok) throw new Error('切換失敗');
      await fetchConfigs();
    } catch {
      alert('切換狀態失敗');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>載入設定中...</div>
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
            <Settings size={24} />
            規則設定
          </h1>
        </div>
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── 費用規則列表 ──────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>📋 費用分攤規則</h2>
          <button
            type="button"
            className={styles.addBtn}
            onClick={() => {
              setEditingConfig(null);
              setShowConfigDialog(true);
            }}
          >
            <Plus size={16} />
            新增規則
          </button>
        </div>

        {configs.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>尚無費用規則，請新增第一筆規則。</p>
          </div>
        ) : (
          <div className={styles.configTableWrap}>
            <table className={styles.configTable}>
              <thead>
                <tr>
                  <th>項目</th>
                  <th>父母比率</th>
                  <th>計算方式</th>
                  <th>生效日期</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {configs.map(config => (
                  <tr key={config.id} className={!config.isActive ? styles.inactiveRow : ''}>
                    <td>
                      <span className={styles.configItem}>{config.item}</span>
                    </td>
                    <td>
                      <div className={styles.ratioCell}>
                        <div className={styles.ratioBar}>
                          <div
                            className={styles.ratioFill}
                            style={{ width: `${config.parentRatio * 100}%` }}
                          />
                        </div>
                        <span className={styles.ratioText}>
                          {Math.round(config.parentRatio * 100)}%
                        </span>
                      </div>
                    </td>
                    <td>{CALC_METHOD_LABEL[config.calcMethod] || config.calcMethod}</td>
                    <td>
                      <span className={styles.dateText}>
                        {new Date(config.effectiveFrom).toLocaleDateString('zh-TW')}
                      </span>
                      <span className={styles.modeTag}>
                        {EFFECTIVE_MODE_LABEL[config.effectiveMode] || config.effectiveMode}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.toggleActiveBtn}
                        onClick={() => handleToggleActive(config)}
                        title={config.isActive ? '停用' : '啟用'}
                      >
                        {config.isActive ? (
                          <ToggleRight size={22} className={styles.toggleOn} />
                        ) : (
                          <ToggleLeft size={22} className={styles.toggleOff} />
                        )}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => {
                          setEditingConfig(config);
                          setShowConfigDialog(true);
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── AI 設定區塊 ───────────────────────────────────────── */}
      <div className={styles.sectionCard}>
        <button
          type="button"
          className={styles.sectionHeaderBtn}
          onClick={() => setShowAiSection(!showAiSection)}
        >
          <div className={styles.sectionHeaderLeft}>
            <Sparkles size={20} className={styles.aiIcon} />
            <h2 className={styles.sectionTitle}>AI 智慧分析設定</h2>
          </div>
          {showAiSection ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>

        {showAiSection && (
          <div className={styles.aiContent}>
            <div className={styles.aiStatusRow}>
              <div className={styles.aiStatusItem}>
                <span className={styles.aiStatusLabel}>Gemini API Key</span>
                <AiKeyStatus />
              </div>
            </div>

            {/* ── AI 連線測試 ────────────────────────────────── */}
            <AiConnectionTest />

            <div className={styles.aiModelInfo}>
              <h3 className={styles.aiSubTitle}>使用模型（依序嘗試）</h3>
              <div className={styles.aiModelRow}>
                <span className={styles.aiModelLabel}>優先</span>
                <span className={styles.aiModelValue}>gemini-3.8-flash</span>
                <span className={styles.aiModelTag}>免費</span>
              </div>
              <div className={styles.aiModelRow}>
                <span className={styles.aiModelLabel}>備用 1</span>
                <span className={styles.aiModelValue}>gemini-3.5-flash</span>
                <span className={styles.aiModelTag}>免費</span>
              </div>
              <div className={styles.aiModelRow}>
                <span className={styles.aiModelLabel}>備用 2</span>
                <span className={styles.aiModelValue}>gemini-2.5-flash</span>
                <span className={styles.aiModelTag}>免費</span>
              </div>
            </div>

            <div className={styles.aiFeatures}>
              <h3 className={styles.aiSubTitle}>功能項目</h3>
              <div className={styles.aiFeatureRow}>
                <span>🔍 保修合理性分析</span>
                <span className={styles.aiFeatureBadge}>加值功能</span>
              </div>
              <div className={styles.aiFeatureRow}>
                <span>🔮 保修預測</span>
                <span className={styles.aiFeatureBadge}>加值功能</span>
              </div>
              <div className={styles.aiFeatureRow}>
                <span>📄 收據 OCR 辨識</span>
                <span className={styles.aiFeatureBadge}>加值功能</span>
              </div>
            </div>

            <div className={styles.aiNote}>
              💡 AI 功能為加值服務，失敗時不會影響主流程。設定 <code>GEMINI_API_KEY</code> 環境變數即可啟用。系統會自動嘗試多個模型，確保最高可用性。
            </div>
          </div>
        )}
      </div>

      {/* 新增/編輯規則 Dialog */}
      {showConfigDialog && (
        <ConfigDialog
          config={editingConfig}
          vehicles={vehicles}
          onClose={() => {
            setShowConfigDialog(false);
            setEditingConfig(null);
          }}
          onSubmit={handleSaveConfig}
        />
      )}
    </div>
  );
}

// ── AI Key 狀態元件 ──────────────────────────────────────────

function AiKeyStatus() {
  const [status, setStatus] = useState<'checking' | 'configured' | 'missing'>('checking');

  useEffect(() => {
    // 透過簡單的 API 呼叫檢查 key 是否已設定
    fetch('/api/car/reports?type=ai-status')
      .then(r => r.json())
      .then(data => {
        setStatus(data.aiEnabled ? 'configured' : 'missing');
      })
      .catch(() => setStatus('missing'));
  }, []);

  if (status === 'checking') {
    return <span className={styles.aiStatusChecking}>檢查中...</span>;
  }
  if (status === 'configured') {
    return <span className={styles.aiStatusOk}>✅ 已設定</span>;
  }
  return <span className={styles.aiStatusMissing}>❌ 未設定</span>;
}

// ── AI 連線測試元件 ──────────────────────────────────────────

interface AiTestResult {
  success: boolean;
  model: string | null;
  error: string | null;
}

function AiConnectionTest() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch('/api/car/ai-test');
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, model: null, error: '網路連線失敗' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.aiTestSection}>
      <h3 className={styles.aiSubTitle}>連線測試</h3>
      <div className={styles.aiTestRow}>
        <button
          type="button"
          className={styles.aiTestBtn}
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? (
            <>
              <Loader2 size={14} className={styles.spinner} />
              測試中...
            </>
          ) : (
            <>
              <Zap size={14} />
              🧪 測試 AI 連線
            </>
          )}
        </button>

        {result && (
          <div className={result.success ? styles.aiTestSuccess : styles.aiTestError}>
            {result.success ? (
              <>✅ 連線成功！使用模型：<code>{result.model}</code></>
            ) : (
              <>❌ {result.error}</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 新增/編輯規則 Dialog ─────────────────────────────────────

interface ConfigFormData {
  vehicleId: string;
  item: string;
  parentRatio: number;
  calcMethod: string;
  dualTrackBaseRatio: number;
  effectiveFrom: string;
  effectiveMode: string;
  isActive: boolean;
  note: string;
}

function ConfigDialog({
  config,
  vehicles,
  onClose,
  onSubmit,
}: {
  config: CostConfigItem | null;
  vehicles: VehicleOption[];
  onClose: () => void;
  onSubmit: (data: ConfigFormData) => Promise<void>;
}) {
  const isEdit = !!config;

  const [form, setForm] = useState<ConfigFormData>({
    vehicleId: config?.vehicleId || vehicles[0]?.id || '',
    item: config?.item || '',
    parentRatio: config?.parentRatio ?? 0.4,
    calcMethod: config?.calcMethod || 'DUAL_TRACK',
    dualTrackBaseRatio: config?.dualTrackBaseRatio ?? 0.5,
    effectiveFrom: config?.effectiveFrom
      ? new Date(config.effectiveFrom).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    effectiveMode: config?.effectiveMode || 'IMMEDIATE',
    isActive: config?.isActive ?? true,
    note: config?.note || '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof ConfigFormData, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item.trim()) {
      alert('請填寫項目名稱');
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
          <h2 className={styles.dialogTitle}>{isEdit ? '編輯規則' : '新增規則'}</h2>
          <button type="button" className={styles.dialogCloseBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.dialogBody}>
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              車輛
              <select
                className={styles.formSelect}
                value={form.vehicleId}
                onChange={e => handleChange('vehicleId', e.target.value)}
                required
                disabled={isEdit}
              >
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <label className={styles.formLabel}>
              項目名稱
              <input
                type="text"
                className={styles.formInput}
                value={form.item}
                onChange={e => handleChange('item', e.target.value)}
                placeholder="如：一般保養"
                required
              />
            </label>
          </div>

          {/* 父母比率滑桿 */}
          <div className={styles.sliderSection}>
            <label className={styles.formLabel}>
              父母負擔比率：{Math.round(form.parentRatio * 100)}%
            </label>
            <div className={styles.sliderRow}>
              <span className={styles.sliderLabel}>0%</span>
              <input
                type="range"
                className={styles.slider}
                min={0}
                max={100}
                value={Math.round(form.parentRatio * 100)}
                onChange={e => handleChange('parentRatio', Number(e.target.value) / 100)}
              />
              <span className={styles.sliderLabel}>100%</span>
            </div>
            <div className={styles.ratioPreview}>
              <span>父母：{Math.round(form.parentRatio * 100)}%</span>
              <span>子女分攤：{Math.round((1 - form.parentRatio) * 100)}%</span>
            </div>
          </div>

          {/* 計算方式 */}
          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              計算方式
              <select
                className={styles.formSelect}
                value={form.calcMethod}
                onChange={e => handleChange('calcMethod', e.target.value)}
              >
                <option value="DUAL_TRACK">雙軌制（50% 均分 + 50% 天數）</option>
                <option value="EVEN_SPLIT">均分制（直接平分）</option>
              </select>
            </label>
            <label className={styles.formLabel}>
              生效方式
              <select
                className={styles.formSelect}
                value={form.effectiveMode}
                onChange={e => handleChange('effectiveMode', e.target.value)}
              >
                <option value="RETROACTIVE">含設定前（所有結算適用）</option>
                <option value="IMMEDIATE">即刻生效</option>
                <option value="SCHEDULED">指定生效日</option>
              </select>
            </label>
          </div>

          <div className={styles.formRow}>
            <label className={styles.formLabel}>
              生效日期
              <input
                type="date"
                className={styles.formInput}
                value={form.effectiveFrom}
                onChange={e => handleChange('effectiveFrom', e.target.value)}
                required
              />
            </label>
          </div>

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
              {submitting ? '儲存中...' : isEdit ? '更新規則' : '新增規則'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
