import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/health/stats
 *
 * 取得健康記錄統計數據。
 *
 * Query params:
 * - days: 統計天數 (預設 30)
 * - userId: 目標使用者 ID (預設為自己)
 *
 * 回傳每個指標的平均值、最高值、最低值、筆數，
 * 以及異常值統計。
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 參數解析 ─────────────────────────────────────
  const daysParam = searchParams.get('days');
  const days = Math.min(Math.max(parseInt(daysParam || '30', 10) || 30, 1), 365);

  const targetUserId = searchParams.get('userId') || user.id;

  if (targetUserId !== user.id && !UUID_PATTERN.test(targetUserId)) {
    return NextResponse.json(
      { error: '無效的使用者 ID 格式' },
      { status: 400 },
    );
  }

  // ── 權限驗證 ─────────────────────────────────────
  if (targetUserId !== user.id) {
    const permission = await prisma.healthSharePermission.findUnique({
      where: {
        ownerId_viewerId: {
          ownerId: targetUserId,
          viewerId: user.id,
        },
      },
    });

    if (!permission) {
      return NextResponse.json(
        { error: '您沒有權限查看此使用者的健康記錄' },
        { status: 403 },
      );
    }
  }

  // ── 查詢區間 ─────────────────────────────────────
  const since = new Date();
  since.setDate(since.getDate() - days);

  const records = await prisma.healthRecord.findMany({
    where: {
      userId: targetUserId,
      recordedAt: { gte: since },
    },
    select: {
      systolic: true,
      diastolic: true,
      heartRate: true,
      bloodSugar: true,
      mealTiming: true,
      temperature: true,
      weight: true,
      bodyFat: true,
      oxygenSat: true,
    },
  });

  // ── 統計計算 ─────────────────────────────────────

  type FieldStats = {
    avg: number | null;
    max: number | null;
    min: number | null;
    count: number;
  };

  function computeStats(values: number[]): FieldStats {
    if (values.length === 0) {
      return { avg: null, max: null, min: null, count: 0 };
    }
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round((sum / values.length) * 10) / 10,
      max: Math.max(...values),
      min: Math.min(...values),
      count: values.length,
    };
  }

  // 收集各指標的有效數值
  const systolicValues: number[] = [];
  const diastolicValues: number[] = [];
  const heartRateValues: number[] = [];
  const bloodSugarValues: number[] = [];
  const temperatureValues: number[] = [];
  const weightValues: number[] = [];
  const bodyFatValues: number[] = [];
  const oxygenSatValues: number[] = [];

  // 異常值計數
  let highBpCount = 0;       // 血壓 > 140/90
  let highHeartRateCount = 0; // 心率 > 100
  let lowHeartRateCount = 0;  // 心率 < 50
  let highFastingBsCount = 0; // 空腹血糖 > 126
  let highTempCount = 0;      // 體溫 > 37.5

  for (const r of records) {
    if (r.systolic != null) systolicValues.push(r.systolic);
    if (r.diastolic != null) diastolicValues.push(r.diastolic);
    if (r.heartRate != null) heartRateValues.push(r.heartRate);
    if (r.bloodSugar != null) bloodSugarValues.push(r.bloodSugar);
    if (r.temperature != null) temperatureValues.push(r.temperature);
    if (r.weight != null) weightValues.push(r.weight);
    if (r.bodyFat != null) bodyFatValues.push(r.bodyFat);
    if (r.oxygenSat != null) oxygenSatValues.push(r.oxygenSat);

    // 異常值判斷
    if (r.systolic != null && r.diastolic != null) {
      if (r.systolic > 140 || r.diastolic > 90) {
        highBpCount++;
      }
    }

    if (r.heartRate != null) {
      if (r.heartRate > 100) highHeartRateCount++;
      if (r.heartRate < 50) lowHeartRateCount++;
    }

    if (r.bloodSugar != null && r.mealTiming === 'fasting' && r.bloodSugar > 126) {
      highFastingBsCount++;
    }

    if (r.temperature != null && r.temperature > 37.5) {
      highTempCount++;
    }
  }

  return NextResponse.json({
    days,
    totalRecords: records.length,
    stats: {
      systolic: computeStats(systolicValues),
      diastolic: computeStats(diastolicValues),
      heartRate: computeStats(heartRateValues),
      bloodSugar: computeStats(bloodSugarValues),
      temperature: computeStats(temperatureValues),
      weight: computeStats(weightValues),
      bodyFat: computeStats(bodyFatValues),
      oxygenSat: computeStats(oxygenSatValues),
    },
    abnormal: {
      highBloodPressure: highBpCount,
      highHeartRate: highHeartRateCount,
      lowHeartRate: lowHeartRateCount,
      highFastingBloodSugar: highFastingBsCount,
      highTemperature: highTempCount,
    },
  });
});
