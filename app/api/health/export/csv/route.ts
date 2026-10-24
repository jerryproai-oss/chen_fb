import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** mealTiming 中文映射 */
const MEAL_TIMING_LABELS: Record<string, string> = {
  fasting: '空腹',
  before: '飯前',
  after: '飯後',
};

/**
 * 將字串中的特殊字元安全處理為 CSV 欄位。
 * 若包含逗號、雙引號或換行，則用雙引號包裹並轉義。
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * GET /api/health/export/csv
 *
 * 匯出健康記錄為 CSV 檔案。
 *
 * Query params:
 * - days: 匯出天數 (預設 90)
 * - userId: 目標使用者 ID (預設為自己)
 */
export const GET = withAuth(async ({ user }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);

  // ── 參數解析 ─────────────────────────────────────
  const daysParam = searchParams.get('days');
  const days = Math.min(Math.max(parseInt(daysParam || '90', 10) || 90, 1), 365);

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
        { error: '您沒有權限匯出此使用者的健康記錄' },
        { status: 403 },
      );
    }
  }

  // ── 查詢記錄 ─────────────────────────────────────
  const since = new Date();
  since.setDate(since.getDate() - days);

  const records = await prisma.healthRecord.findMany({
    where: {
      userId: targetUserId,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: 'desc' },
    select: {
      recordedAt: true,
      systolic: true,
      diastolic: true,
      heartRate: true,
      bloodSugar: true,
      mealTiming: true,
      temperature: true,
      weight: true,
      bodyFat: true,
      oxygenSat: true,
      note: true,
    },
  });

  // ── 產生 CSV ─────────────────────────────────────
  // BOM for Excel UTF-8 compatibility
  const BOM = '\uFEFF';

  const header = [
    '記錄時間',
    '收縮壓 (mmHg)',
    '舒張壓 (mmHg)',
    '心率 (bpm)',
    '血糖 (mg/dL)',
    '用餐時間',
    '體溫 (°C)',
    '體重 (kg)',
    '體脂率 (%)',
    '血氧 (%)',
    '備註',
  ].join(',');

  const rows = records.map((r) => {
    const cols = [
      r.recordedAt.toISOString(),
      r.systolic?.toString() ?? '',
      r.diastolic?.toString() ?? '',
      r.heartRate?.toString() ?? '',
      r.bloodSugar?.toString() ?? '',
      r.mealTiming ? (MEAL_TIMING_LABELS[r.mealTiming] ?? r.mealTiming) : '',
      r.temperature?.toString() ?? '',
      r.weight?.toString() ?? '',
      r.bodyFat?.toString() ?? '',
      r.oxygenSat?.toString() ?? '',
      r.note ? csvEscape(r.note) : '',
    ];
    return cols.join(',');
  });

  const csv = BOM + header + '\n' + rows.join('\n');

  // ── 檔名 ────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filename = `健康記錄_${today}.csv`;
  const encodedFilename = encodeURIComponent(filename);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`,
    },
  });
});
