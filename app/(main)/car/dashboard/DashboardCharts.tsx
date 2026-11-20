'use client';

import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import styles from './page.module.css';

// ── 型別定義 ──────────────────────────────────────────────────

export interface ShareData {
  userId: string;
  displayName: string;
  days: number;
  cost: number;
  ratio: number;
}

export interface MonthlyData {
  month: string;
  totalCost: number;
}

export interface FuelPoint {
  date: string;
  efficiency: number | null;
}

// ── 共用色盤 ──────────────────────────────────────────────────

const COLORS = ['#5a7a5a', '#8b6f47', '#1565C0', '#E65100', '#9C27B0'];

// ── 自訂 Tooltip ─────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
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
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.fill || p.stroke || p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' ? p.value.toLocaleString('zh-TW') : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: data } = payload[0];
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e0dcd4',
      borderRadius: 8,
      padding: '8px 12px',
      fontSize: '0.82rem',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <div style={{ fontWeight: 600, color: '#333' }}>{name}</div>
      <div>{typeof value === 'number' ? value.toLocaleString('zh-TW') : value}</div>
      {data?.ratio != null && (
        <div style={{ color: '#8b6f47', fontSize: '0.75rem' }}>
          佔比 {(data.ratio * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

// ── 自訂 Pie label ───────────────────────────────────────────

function renderPieLabel({ name, percent }: any) {
  if (percent < 0.05) return null;
  return `${name} ${(percent * 100).toFixed(0)}%`;
}

// ── Props ────────────────────────────────────────────────────

interface DashboardChartsProps {
  daysShares: ShareData[];
  costShares: ShareData[];
  monthlyData: MonthlyData[];
  fuelData: FuelPoint[];
}

// ── Component ────────────────────────────────────────────────

export default function DashboardCharts({
  daysShares,
  costShares,
  monthlyData,
  fuelData,
}: DashboardChartsProps) {
  const daysPieData = daysShares.map((s) => ({
    name: s.displayName,
    value: s.days,
    ratio: s.ratio,
  }));

  const costPieData = costShares.map((s) => ({
    name: s.displayName,
    value: s.cost,
    ratio: s.ratio,
  }));

  const filteredFuel = fuelData.filter((f) => f.efficiency != null);

  return (
    <>
      {/* ── 圓餅圖：使用天數 & 費用分攤 ── */}
      <div className={styles.chartGrid}>
        {/* 使用天數分配 */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>🥧 使用天數分配</div>
          <div className={styles.chartWrap}>
            {daysPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={daysPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="75%"
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {daysPieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyChart}>暫無資料</div>
            )}
          </div>
        </div>

        {/* 費用分攤比例 */}
        <div className={styles.chartCard}>
          <div className={styles.chartTitle}>💰 費用分攤比例</div>
          <div className={styles.chartWrap}>
            {costPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius="75%"
                    label={renderPieLabel}
                    labelLine={false}
                  >
                    {costPieData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyChart}>暫無資料</div>
            )}
          </div>
        </div>
      </div>

      {/* ── 長條圖：每月費用走勢 ── */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>📊 每月費用走勢</div>
        <div className={styles.chartWrap}>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="totalCost" fill="#5a7a5a" name="月費用" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.emptyChart}>暫無資料</div>
          )}
        </div>
      </div>

      {/* ── 折線圖：油耗趨勢 ── */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitle}>⛽ 油耗趨勢 (km/L)</div>
        <div className={styles.chartWrap}>
          {filteredFuel.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={filteredFuel}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="date" fontSize={11} />
                <YAxis domain={['auto', 'auto']} fontSize={11} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="efficiency"
                  stroke="#8b6f47"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="油耗 (km/L)"
                />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className={styles.emptyChart}>暫無加油記錄</div>
          )}
        </div>
      </div>
    </>
  );
}
