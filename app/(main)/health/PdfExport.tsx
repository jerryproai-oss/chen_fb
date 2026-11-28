'use client';

import { useState, useCallback } from 'react';
import { X, FileText, Download } from 'lucide-react';
import styles from './page.module.css';

// ── 指標定義 ──────────────────────────────────────────────────

interface MetricDef {
  key: string;
  label: string;
  color: string;
  unit: string;
  normalRange: string;
  normalRef?: { low?: number; high?: number };
}

const ALL_METRICS: MetricDef[] = [
  { key: 'bp', label: '血壓', color: '#e53935', unit: 'mmHg', normalRange: '120/80 mmHg', normalRef: { high: 140 } },
  { key: 'hr', label: '心率', color: '#ff9800', unit: 'bpm', normalRange: '60-100 bpm', normalRef: { low: 60, high: 100 } },
  { key: 'sugar', label: '血糖', color: '#9c27b0', unit: 'mg/dL', normalRange: '空腹 70-100 mg/dL', normalRef: { high: 126 } },
  { key: 'weight', label: '體重', color: '#2196f3', unit: 'kg', normalRange: 'BMI 18.5-24.9' },
  { key: 'temp', label: '體溫', color: '#ff5722', unit: '°C', normalRange: '36.1-37.2°C', normalRef: { high: 37.5 } },
  { key: 'oxygen', label: '血氧', color: '#009688', unit: '%', normalRange: '95-100%', normalRef: { low: 94 } },
];

const PERIOD_OPTIONS = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 180, label: '半年' },
  { value: 365, label: '一年' },
];

// ── 型別 ─────────────────────────────────────────────────────

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

interface StatField {
  avg: number | null;
  max: number | null;
  min: number | null;
  count: number;
}

interface HealthStats {
  bp: { avg_sys: number; avg_dia: number; max_sys: number; max_dia: number; min_sys: number; min_dia: number; count: number };
  heartRate: StatField;
  bloodSugar: StatField;
  weight: StatField;
  temperature: StatField;
  oxygenSat: StatField;
  anomalies: { highBp: number; lowHr: number; highHr: number; highSugar: number; fever: number; lowOxygen: number };
}

interface PdfExportProps {
  onClose: () => void;
}

const MEAL_LABELS: Record<string, string> = {
  fasting: '空腹',
  before: '飯前',
  after: '飯後',
};

// ── 用 Canvas 繪製折線圖 → 轉成 base64 ─────────────────────

interface ChartSeries {
  label: string;
  color: string;
  data: (number | null)[];
}

function drawLineChart(
  dates: string[],
  series: ChartSeries[],
  opts: {
    title: string;
    unit: string;
    refLines?: { value: number; color: string; label: string }[];
    yMin?: number;
    yMax?: number;
  },
): string {
  const W = 760;
  const H = 300;
  const padL = 55, padR = 20, padT = 35, padB = 50;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const canvas = document.createElement('canvas');
  canvas.width = W * 2; // 2x for retina
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 找出 y 軸範圍
  const allValues: number[] = [];
  for (const s of series) {
    for (const v of s.data) {
      if (v != null) allValues.push(v);
    }
  }
  if (opts.refLines) {
    for (const r of opts.refLines) allValues.push(r.value);
  }

  if (allValues.length === 0) {
    ctx.fillStyle = '#999';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('無數據', W / 2, H / 2);
    return canvas.toDataURL('image/png');
  }

  let yMin = opts.yMin ?? Math.min(...allValues);
  let yMax = opts.yMax ?? Math.max(...allValues);
  const yPadding = (yMax - yMin) * 0.15 || 10;
  yMin = Math.floor(yMin - yPadding);
  yMax = Math.ceil(yMax + yPadding);
  if (yMax === yMin) yMax = yMin + 10;

  const toX = (i: number) => padL + (i / Math.max(dates.length - 1, 1)) * chartW;
  const toY = (v: number) => padT + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

  // 標題
  ctx.fillStyle = '#333';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${opts.title}（${opts.unit}）`, padL, 20);

  // 格線
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 0.5;
  const yTicks = 5;
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (yMax - yMin) * (i / yTicks);
    const y = toY(v);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillStyle = '#999';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(v * 10) / 10), padL - 6, y + 3);
  }

  // X 軸標籤
  ctx.fillStyle = '#999';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  const maxLabels = 12;
  const step = Math.max(1, Math.floor(dates.length / maxLabels));
  for (let i = 0; i < dates.length; i += step) {
    ctx.fillText(dates[i], toX(i), H - padB + 16);
  }
  // 最後一個
  if (dates.length > 1) {
    ctx.fillText(dates[dates.length - 1], toX(dates.length - 1), H - padB + 16);
  }

  // 參考線
  if (opts.refLines) {
    for (const ref of opts.refLines) {
      if (ref.value >= yMin && ref.value <= yMax) {
        const y = toY(ref.value);
        ctx.strokeStyle = ref.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = ref.color;
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(ref.label, W - padR + 2, y + 3);
      }
    }
  }

  // 繪製每條折線
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < s.data.length; i++) {
      const v = s.data[i];
      if (v == null) { started = false; continue; }
      const x = toX(i);
      const y = toY(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 圓點
    ctx.fillStyle = s.color;
    for (let i = 0; i < s.data.length; i++) {
      const v = s.data[i];
      if (v == null) continue;
      ctx.beginPath();
      ctx.arc(toX(i), toY(v), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 圖例
  ctx.font = '10px sans-serif';
  let legendX = padL;
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(legendX, H - 14, 12, 3);
    ctx.fillStyle = '#666';
    ctx.textAlign = 'left';
    ctx.fillText(s.label, legendX + 16, H - 10);
    legendX += ctx.measureText(s.label).width + 36;
  }

  return canvas.toDataURL('image/png');
}

// ── Component ─────────────────────────────────────────────────

export default function PdfExport({ onClose }: PdfExportProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(['bp', 'hr', 'sugar', 'weight', 'temp', 'oxygen'])
  );
  const [pdfDays, setPdfDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');

  const toggleMetric = (key: string) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setSelectedMetrics(new Set(ALL_METRICS.map(m => m.key)));
  const selectNone = () => setSelectedMetrics(new Set());

  const metricHasData = useCallback((key: string, records: HealthRecord[]): boolean => {
    switch (key) {
      case 'bp': return records.some(r => r.systolic != null);
      case 'hr': return records.some(r => r.heartRate != null);
      case 'sugar': return records.some(r => r.bloodSugar != null);
      case 'weight': return records.some(r => r.weight != null);
      case 'temp': return records.some(r => r.temperature != null);
      case 'oxygen': return records.some(r => r.oxygenSat != null);
      default: return false;
    }
  }, []);

  // ── 產生 PDF ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (selectedMetrics.size === 0) return;
    setGenerating(true);
    setProgress('載入資料中...');

    try {
      // 1. Fetch
      const [recRes, statsRes] = await Promise.all([
        fetch(`/api/health/records?days=${pdfDays}`),
        fetch(`/api/health/stats?days=${pdfDays}`),
      ]);

      if (!recRes.ok || !statsRes.ok) {
        setProgress('❌ 無法載入資料');
        setGenerating(false);
        return;
      }

      const recData = await recRes.json();
      const statsData = await statsRes.json();
      const records: HealthRecord[] = recData.records || [];
      const st = statsData.stats || {};
      const stats: HealthStats = {
        bp: st.bp || { avg_sys: 0, avg_dia: 0, max_sys: 0, max_dia: 0, min_sys: 0, min_dia: 0, count: 0 },
        heartRate: st.heartRate || { avg: 0, max: 0, min: 0, count: 0 },
        bloodSugar: st.bloodSugar || { avg: 0, max: 0, min: 0, count: 0 },
        weight: st.weight || { avg: 0, max: 0, min: 0, count: 0 },
        temperature: st.temperature || { avg: 0, max: 0, min: 0, count: 0 },
        oxygenSat: st.oxygenSat || { avg: 0, max: 0, min: 0, count: 0 },
        anomalies: statsData.anomalies || { highBp: 0, lowHr: 0, highHr: 0, highSugar: 0, fever: 0, lowOxygen: 0 },
      };

      if (records.length === 0) {
        setProgress('❌ 此期間內無量測記錄');
        setGenerating(false);
        return;
      }

      // Sort by time
      const sorted = records.toSorted((a, b) =>
        new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
      );
      const dates = sorted.map(r => {
        const d = new Date(r.recordedAt);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      });

      // 2. Import jsPDF
      setProgress('準備 PDF 引擎...');
      const { default: jsPDF } = await import('jspdf');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let yPos = margin;

      const checkNewPage = (neededHeight: number) => {
        if (yPos + neededHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      // ── 封面 ──────────────────────────────────────────────
      setProgress('建立封面...');
      const periodLabel = PERIOD_OPTIONS.find(p => p.value === pdfDays)?.label || `${pdfDays} 天`;
      const now = new Date();

      pdf.setFontSize(28);
      pdf.setTextColor(90, 122, 90);
      pdf.text('Health Report', pageWidth / 2, 55, { align: 'center' });

      pdf.setFontSize(12);
      pdf.setTextColor(120, 120, 120);
      pdf.text(`Period: ${periodLabel}  |  Records: ${records.length}`, pageWidth / 2, 68, { align: 'center' });
      pdf.text(`Generated: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, pageWidth / 2, 76, { align: 'center' });

      const includedMetrics = ALL_METRICS.filter(m => selectedMetrics.has(m.key) && metricHasData(m.key, sorted));
      pdf.setFontSize(10);
      pdf.text(`Metrics: ${includedMetrics.map(m => m.label).join(' / ')}`, pageWidth / 2, 86, { align: 'center' });

      // 異常提醒
      const anom = stats.anomalies;
      const anomalyLines: string[] = [];
      if (anom.highBp > 0 && selectedMetrics.has('bp')) anomalyLines.push(`High BP: ${anom.highBp}x`);
      if (anom.highHr > 0 && selectedMetrics.has('hr')) anomalyLines.push(`High HR: ${anom.highHr}x`);
      if (anom.lowHr > 0 && selectedMetrics.has('hr')) anomalyLines.push(`Low HR: ${anom.lowHr}x`);
      if (anom.highSugar > 0 && selectedMetrics.has('sugar')) anomalyLines.push(`High Sugar: ${anom.highSugar}x`);
      if (anom.fever > 0 && selectedMetrics.has('temp')) anomalyLines.push(`Fever: ${anom.fever}x`);
      if (anom.lowOxygen > 0 && selectedMetrics.has('oxygen')) anomalyLines.push(`Low O2: ${anom.lowOxygen}x`);

      if (anomalyLines.length > 0) {
        pdf.setFontSize(11);
        pdf.setTextColor(229, 57, 53);
        pdf.text('Anomaly Alerts', pageWidth / 2, 100, { align: 'center' });
        pdf.setFontSize(9);
        pdf.text(anomalyLines.join('  |  '), pageWidth / 2, 108, { align: 'center' });
      }

      // ── 統計摘要 ──────────────────────────────────────────
      pdf.addPage();
      yPos = margin;
      pdf.setFontSize(16);
      pdf.setTextColor(60, 60, 60);
      pdf.text('Statistics Summary', margin, yPos + 6);
      yPos += 14;

      // 表頭
      const colX = [margin, margin + 50, margin + 82, margin + 112, margin + 142];
      pdf.setFontSize(9);
      pdf.setTextColor(120, 120, 120);
      pdf.text('Metric', colX[0], yPos);
      pdf.text('Average', colX[1], yPos);
      pdf.text('Max', colX[2], yPos);
      pdf.text('Min', colX[3], yPos);
      pdf.text('Count', colX[4], yPos);
      yPos += 2;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 6;

      pdf.setFontSize(10);
      pdf.setTextColor(60, 60, 60);

      if (selectedMetrics.has('bp') && stats.bp.count > 0) {
        pdf.text('BP (mmHg)', colX[0], yPos);
        pdf.text(`${Math.round(stats.bp.avg_sys || 0)}/${Math.round(stats.bp.avg_dia || 0)}`, colX[1], yPos);
        pdf.text(`${stats.bp.max_sys || '-'}/${stats.bp.max_dia || '-'}`, colX[2], yPos);
        pdf.text(`${stats.bp.min_sys || '-'}/${stats.bp.min_dia || '-'}`, colX[3], yPos);
        pdf.text(String(stats.bp.count), colX[4], yPos);
        yPos += 7;
      }

      const fieldMap: { key: string; label: string; field: keyof HealthStats }[] = [
        { key: 'hr', label: 'Heart Rate (bpm)', field: 'heartRate' },
        { key: 'sugar', label: 'Blood Sugar (mg/dL)', field: 'bloodSugar' },
        { key: 'weight', label: 'Weight (kg)', field: 'weight' },
        { key: 'temp', label: 'Temperature (C)', field: 'temperature' },
        { key: 'oxygen', label: 'SpO2 (%)', field: 'oxygenSat' },
      ];
      for (const { key, label, field } of fieldMap) {
        if (!selectedMetrics.has(key)) continue;
        const f = stats[field] as StatField;
        if (f.count === 0) continue;
        pdf.text(label, colX[0], yPos);
        pdf.text(f.avg != null ? String(Math.round(f.avg * 10) / 10) : '-', colX[1], yPos);
        pdf.text(f.max != null ? String(f.max) : '-', colX[2], yPos);
        pdf.text(f.min != null ? String(f.min) : '-', colX[3], yPos);
        pdf.text(String(f.count), colX[4], yPos);
        yPos += 7;
      }

      // ── 圖表 ──────────────────────────────────────────────
      setProgress('繪製圖表...');
      let chartIdx = 0;

      for (const metric of includedMetrics) {
        chartIdx++;
        setProgress(`繪製圖表 (${chartIdx}/${includedMetrics.length}) ${metric.label}...`);

        let imgData = '';

        if (metric.key === 'bp') {
          imgData = drawLineChart(dates, [
            { label: 'Systolic', color: '#e53935', data: sorted.map(r => r.systolic) },
            { label: 'Diastolic', color: '#ff9800', data: sorted.map(r => r.diastolic) },
          ], {
            title: 'Blood Pressure',
            unit: 'mmHg',
            refLines: [
              { value: 140, color: '#e53935', label: 'High' },
              { value: 90, color: '#ff9800', label: 'High Dia' },
            ],
            yMin: 50,
            yMax: 200,
          });
        } else if (metric.key === 'hr') {
          imgData = drawLineChart(dates, [
            { label: 'Heart Rate', color: '#ff9800', data: sorted.map(r => r.heartRate) },
          ], {
            title: 'Heart Rate',
            unit: 'bpm',
            refLines: [
              { value: 100, color: '#e53935', label: 'High' },
              { value: 60, color: '#2196f3', label: 'Low' },
            ],
            yMin: 40, yMax: 150,
          });
        } else if (metric.key === 'sugar') {
          imgData = drawLineChart(dates, [
            { label: 'Blood Sugar', color: '#9c27b0', data: sorted.map(r => r.bloodSugar) },
          ], {
            title: 'Blood Sugar',
            unit: 'mg/dL',
            refLines: [{ value: 126, color: '#e53935', label: 'High Fasting' }],
            yMin: 40, yMax: 300,
          });
        } else if (metric.key === 'weight') {
          imgData = drawLineChart(dates, [
            { label: 'Weight', color: '#2196f3', data: sorted.map(r => r.weight) },
            { label: 'Body Fat %', color: '#ff9800', data: sorted.map(r => r.bodyFat) },
          ], { title: 'Weight / Body Fat', unit: 'kg / %' });
        } else if (metric.key === 'temp') {
          imgData = drawLineChart(dates, [
            { label: 'Temperature', color: '#ff5722', data: sorted.map(r => r.temperature) },
          ], {
            title: 'Temperature',
            unit: '°C',
            refLines: [{ value: 37.5, color: '#e53935', label: 'Fever' }],
            yMin: 35, yMax: 42,
          });
        } else if (metric.key === 'oxygen') {
          imgData = drawLineChart(dates, [
            { label: 'SpO2', color: '#009688', data: sorted.map(r => r.oxygenSat) },
          ], {
            title: 'Blood Oxygen',
            unit: '%',
            refLines: [
              { value: 94, color: '#ff9800', label: 'Low' },
              { value: 90, color: '#e53935', label: 'Danger' },
            ],
            yMin: 85, yMax: 100,
          });
        }

        if (imgData) {
          const imgW = contentWidth;
          const imgH = imgW * (300 / 760);
          checkNewPage(imgH + 10);
          pdf.addImage(imgData, 'PNG', margin, yPos, imgW, imgH);
          yPos += imgH + 8;
        }
      }

      // ── 量測明細 ──────────────────────────────────────────
      setProgress('建立量測明細...');
      pdf.addPage();
      yPos = margin;
      pdf.setFontSize(16);
      pdf.setTextColor(60, 60, 60);
      pdf.text('Measurement Details', margin, yPos + 6);
      yPos += 14;

      const dCols = [margin, margin + 25, margin + 45, margin + 58, margin + 78, margin + 98, margin + 112, margin + 126];
      const dHeaders = ['Date', 'BP', 'HR', 'Sugar', 'Weight', 'Temp', 'SpO2', 'Note'];

      const printDetailHeader = () => {
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        dHeaders.forEach((h, i) => pdf.text(h, dCols[i], yPos));
        yPos += 2;
        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 4;
        pdf.setTextColor(60, 60, 60);
      };

      printDetailHeader();

      pdf.setFontSize(7);
      for (const rec of sorted) {
        if (yPos + 6 > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
          printDetailHeader();
        }

        const dt = new Date(rec.recordedAt);
        const vals = [
          `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`,
          rec.systolic != null ? `${rec.systolic}/${rec.diastolic}` : '',
          rec.heartRate != null ? String(rec.heartRate) : '',
          rec.bloodSugar != null ? `${rec.bloodSugar}${rec.mealTiming ? `(${MEAL_LABELS[rec.mealTiming] || ''})` : ''}` : '',
          rec.weight != null ? `${rec.weight}${rec.bodyFat ? `/${rec.bodyFat}%` : ''}` : '',
          rec.temperature != null ? String(rec.temperature) : '',
          rec.oxygenSat != null ? `${rec.oxygenSat}%` : '',
          rec.note ? (rec.note.length > 10 ? rec.note.slice(0, 10) + '..' : rec.note) : '',
        ];
        vals.forEach((v, i) => pdf.text(v, dCols[i], yPos));
        yPos += 5;
      }

      // ── 頁尾 ──────────────────────────────────────────────
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(180, 180, 180);
        pdf.text(`Shiri Health Report  |  Page ${i}/${totalPages}`, pageWidth / 2, pageHeight - 6, { align: 'center' });
      }

      // ── 下載 ──────────────────────────────────────────────
      const fileName = `HealthReport_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${pdfDays}d.pdf`;
      pdf.save(fileName);
      setProgress('✅ PDF 已下載');
      setTimeout(() => {
        setGenerating(false);
        setProgress('');
        onClose();
      }, 1500);

    } catch (err) {
      console.error('PDF generation error:', err);
      setProgress('❌ PDF Error');
      setGenerating(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            <FileText size={20} style={{ marginRight: 6 }} /> PDF 健康報告
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* 期間選擇 */}
          <div className={styles.formSection}>
            <div className={styles.formSectionTitle}>📅 報告期間</div>
            <div className={styles.periodRow} style={{ marginBottom: 0 }}>
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`${styles.periodBtn} ${pdfDays === p.value ? styles.periodBtnActive : ''}`}
                  onClick={() => setPdfDays(p.value)}
                  disabled={generating}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 指標勾選 */}
          <div className={styles.formSection}>
            <div className={styles.formSectionTitle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📊 包含指標</span>
              <span style={{ fontSize: '11px' }}>
                <button type="button" onClick={selectAll} disabled={generating}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '11px', padding: '0 4px' }}>
                  全選
                </button>
                |
                <button type="button" onClick={selectNone} disabled={generating}
                  style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '11px', padding: '0 4px' }}>
                  取消全選
                </button>
              </span>
            </div>
            <div className={styles.formSectionDesc}>只有包含數據的指標才會產生圖表</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
              {ALL_METRICS.map((m) => (
                <label
                  key={m.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 10px', borderRadius: '10px',
                    border: selectedMetrics.has(m.key) ? `2px solid ${m.color}` : '2px solid var(--color-border-light)',
                    background: selectedMetrics.has(m.key) ? `${m.color}10` : 'var(--color-bg)',
                    cursor: generating ? 'not-allowed' : 'pointer',
                    fontSize: '13px', fontWeight: selectedMetrics.has(m.key) ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  <input type="checkbox" checked={selectedMetrics.has(m.key)}
                    onChange={() => toggleMetric(m.key)} disabled={generating}
                    style={{ accentColor: m.color }} />
                  <span style={{ color: selectedMetrics.has(m.key) ? m.color : 'var(--color-text)' }}>
                    {m.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formSection}>
            <div className={styles.formSectionDesc} style={{ fontSize: '11px', lineHeight: 1.6 }}>
              📄 封面 → 統計摘要表 → 各指標趨勢圖 → 量測明細表<br />
              💡 可提供給醫師作為健康狀況參考
            </div>
          </div>

          {progress && (
            <div style={{
              fontSize: '13px', padding: '10px 14px', borderRadius: '10px', textAlign: 'center',
              background: progress.startsWith('❌') ? 'rgba(229,57,53,0.08)' : 'rgba(90,122,90,0.08)',
              color: progress.startsWith('❌') ? '#e53935' : 'var(--color-primary)',
            }}>
              {generating && !progress.startsWith('❌') && !progress.startsWith('✅') && '⏳ '}
              {progress}
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnCancel} onClick={onClose} disabled={generating}>取消</button>
          <button type="button" className={styles.btnSave} onClick={handleGenerate}
            disabled={generating || selectedMetrics.size === 0}>
            {generating ? '產生中...' : <><Download size={14} style={{ marginRight: 4 }} /> 產生 PDF</>}
          </button>
        </div>
      </div>
    </div>
  );
}
