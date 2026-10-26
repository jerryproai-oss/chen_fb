'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, ScatterChart,
  Scatter, Legend,
} from 'recharts';
import styles from './page.module.css';

interface ChartDataPoint {
  date: string;
  fullDate: string;
  systolic: number | null;
  diastolic: number | null;
  heartRate: number | null;
  bloodSugar: number | null;
  mealTiming: string | null;
  temperature: number | null;
  weight: number | null;
  bodyFat: number | null;
  oxygenSat: number | null;
  count?: number;
}

interface HealthChartsProps {
  activeTab: string;
  chartData: ChartDataPoint[];
}

/** 自訂 Tooltip：顯示均值 + 量測次數 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ChartDataPoint | undefined;
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0dcd4',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: '0.82rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: '#333' }}>{label}</div>
      {point?.count && point.count > 1 && (
        <div style={{ fontSize: '0.75rem', color: '#8b6f47', marginBottom: 4 }}>
          📊 {point.count} 筆量測平均
        </div>
      )}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.stroke || p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function HealthCharts({ activeTab, chartData }: HealthChartsProps) {
  return (
    <div className={styles.chartWrap}>
      {activeTab === 'bp' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.systolic != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[50, 200]} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea y1={90} y2={120} fill="#4caf50" fillOpacity={0.08} />
            <ReferenceLine y={140} stroke="#e53935" strokeDasharray="5 5" label={{ value: '高血壓', fontSize: 10, fill: '#e53935' }} />
            <ReferenceLine y={90} stroke="#ff9800" strokeDasharray="5 5" label={{ value: '高舒張壓', fontSize: 10, fill: '#ff9800' }} />
            <Line type="monotone" dataKey="systolic" stroke="#e53935" strokeWidth={2} dot={{ r: 3 }} name="收縮壓" />
            <Line type="monotone" dataKey="diastolic" stroke="#ff9800" strokeWidth={2} dot={{ r: 3 }} name="舒張壓" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
      {activeTab === 'hr' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.heartRate != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[40, 150]} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea y1={60} y2={100} fill="#4caf50" fillOpacity={0.08} />
            <ReferenceLine y={100} stroke="#e53935" strokeDasharray="5 5" label={{ value: '偏高', fontSize: 10, fill: '#e53935' }} />
            <ReferenceLine y={60} stroke="#2196f3" strokeDasharray="5 5" label={{ value: '偏低', fontSize: 10, fill: '#2196f3' }} />
            <Line type="monotone" dataKey="heartRate" stroke="#ff9800" strokeWidth={2} dot={{ r: 3 }} name="心率" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
      {activeTab === 'sugar' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.bloodSugar != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[40, 300]} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={126} stroke="#e53935" strokeDasharray="5 5" label={{ value: '空腹偏高', fontSize: 10, fill: '#e53935' }} />
            <ReferenceArea y1={70} y2={100} fill="#4caf50" fillOpacity={0.08} />
            <Line type="monotone" dataKey="bloodSugar" stroke="#9c27b0" strokeWidth={2} dot={{ r: 4 }} name="血糖" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
      {activeTab === 'weight' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.weight != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={['auto', 'auto']} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="weight" stroke="#2196f3" strokeWidth={2} dot={{ r: 3 }} name="體重 (kg)" />
            <Line type="monotone" dataKey="bodyFat" stroke="#ff9800" strokeWidth={2} dot={{ r: 3 }} name="體脂率 (%)" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
      {activeTab === 'temp' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.temperature != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[35, 42]} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea y1={36.1} y2={37.2} fill="#4caf50" fillOpacity={0.08} />
            <ReferenceLine y={37.5} stroke="#e53935" strokeDasharray="5 5" label={{ value: '發燒', fontSize: 10, fill: '#e53935' }} />
            <Line type="monotone" dataKey="temperature" stroke="#ff5722" strokeWidth={2} dot={{ r: 3 }} name="體溫 (°C)" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
      {activeTab === 'oxygen' && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData.filter(d => d.oxygenSat != null)}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis domain={[85, 100]} fontSize={11} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea y1={95} y2={100} fill="#4caf50" fillOpacity={0.08} />
            <ReferenceLine y={94} stroke="#ff9800" strokeDasharray="5 5" label={{ value: '偏低', fontSize: 10, fill: '#ff9800' }} />
            <ReferenceLine y={90} stroke="#e53935" strokeDasharray="5 5" label={{ value: '危險', fontSize: 10, fill: '#e53935' }} />
            <Line type="monotone" dataKey="oxygenSat" stroke="#009688" strokeWidth={2} dot={{ r: 3 }} name="血氧 (%)" />
            <Legend />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
