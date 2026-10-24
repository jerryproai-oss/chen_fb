import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 合法的 mealTiming 值 */
const VALID_MEAL_TIMINGS = ['fasting', 'before', 'after'] as const;

/** 各指標的範圍限制 */
const RANGES = {
  systolic: { min: 60, max: 300, label: '收縮壓' },
  diastolic: { min: 30, max: 200, label: '舒張壓' },
  heartRate: { min: 30, max: 250, label: '心率' },
  bloodSugar: { min: 20, max: 600, label: '血糖' },
  temperature: { min: 34, max: 42, label: '體溫' },
  weight: { min: 1, max: 500, label: '體重' },
  bodyFat: { min: 1, max: 70, label: '體脂率' },
  oxygenSat: { min: 50, max: 100, label: '血氧' },
} as const;

/**
 * 驗證使用者是否有權查看目標使用者的健康記錄。
 * 若 targetUserId 與 currentUserId 相同，直接回傳 true。
 * 否則查詢 HealthSharePermission 確認授權。
 */
async function canViewHealthData(
  currentUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (currentUserId === targetUserId) return true;

  const permission = await prisma.healthSharePermission.findUnique({
    where: {
      ownerId_viewerId: {
        ownerId: targetUserId,
        viewerId: currentUserId,
      },
    },
  });

  return !!permission;
}

/**
 * 驗證數值型指標是否在合法範圍內。
 * 回傳驗證失敗的錯誤訊息，或 null 表示通過。
 */
function validateNumericField(
  value: unknown,
  fieldKey: keyof typeof RANGES,
): string | null {
  if (value === undefined || value === null) return null;

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return `${RANGES[fieldKey].label}必須為數字`;
  }

  const { min, max, label } = RANGES[fieldKey];
  if (num < min || num > max) {
    return `${label}須在 ${min}–${max} 之間`;
  }

  return null;
}

/**
 * GET /api/health/records
 *
 * 列出健康記錄。
 *
 * Query params:
 * - days: 查詢天數 (預設 30)
 * - userId: 目標使用者 ID (預設為自己，需要 HealthSharePermission 授權)
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
    const allowed = await canViewHealthData(user.id, targetUserId);
    if (!allowed) {
      return NextResponse.json(
        { error: '您沒有權限查看此使用者的健康記錄' },
        { status: 403 },
      );
    }
  }

  // ── 查詢 ─────────────────────────────────────────
  const since = new Date();
  since.setDate(since.getDate() - days);

  const records = await prisma.healthRecord.findMany({
    where: {
      userId: targetUserId,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: 'desc' },
    select: {
      id: true,
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
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ records });
});

/**
 * POST /api/health/records
 *
 * 新增健康記錄。
 *
 * Body:
 * - recordedAt: ISO 日期時間字串 (必填，不可為未來)
 * - systolic?: number (60–300)
 * - diastolic?: number (30–200)
 * - heartRate?: number (30–250)
 * - bloodSugar?: number (20–600)
 * - mealTiming?: 'fasting' | 'before' | 'after'
 * - temperature?: number (34–42)
 * - weight?: number (1–500)
 * - bodyFat?: number (1–70)
 * - oxygenSat?: number (50–100)
 * - note?: string
 */
export const POST = withAuth(async ({ user }, req: NextRequest) => {
  // ── 解析 Body ────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: '無效的請求格式' },
      { status: 400 },
    );
  }

  const {
    recordedAt,
    systolic,
    diastolic,
    heartRate,
    bloodSugar,
    mealTiming,
    temperature,
    weight,
    bodyFat,
    oxygenSat,
    note,
  } = body as Record<string, unknown>;

  // ── 驗證 recordedAt ──────────────────────────────
  if (typeof recordedAt !== 'string' || !recordedAt.trim()) {
    return NextResponse.json(
      { error: 'recordedAt 為必填欄位' },
      { status: 400 },
    );
  }

  const parsedDate = new Date(recordedAt);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: '無效的日期時間格式' },
      { status: 400 },
    );
  }

  if (parsedDate.getTime() > Date.now()) {
    return NextResponse.json(
      { error: '記錄時間不能是未來' },
      { status: 400 },
    );
  }

  // ── 至少填一項指標 ───────────────────────────────
  const indicators = [
    systolic, diastolic, heartRate, bloodSugar,
    temperature, weight, bodyFat, oxygenSat,
  ];
  const hasAnyIndicator = indicators.some(
    (v) => v !== undefined && v !== null,
  );

  if (!hasAnyIndicator) {
    return NextResponse.json(
      { error: '至少需要填寫一項健康指標' },
      { status: 400 },
    );
  }

  // ── 血壓必須同時填寫 ────────────────────────────
  const hasSystolic = systolic !== undefined && systolic !== null;
  const hasDiastolic = diastolic !== undefined && diastolic !== null;

  if (hasSystolic !== hasDiastolic) {
    return NextResponse.json(
      { error: '收縮壓與舒張壓必須同時填寫' },
      { status: 400 },
    );
  }

  // ── 各指標範圍驗證 ──────────────────────────────
  const fieldsToValidate: Array<[unknown, keyof typeof RANGES]> = [
    [systolic, 'systolic'],
    [diastolic, 'diastolic'],
    [heartRate, 'heartRate'],
    [bloodSugar, 'bloodSugar'],
    [temperature, 'temperature'],
    [weight, 'weight'],
    [bodyFat, 'bodyFat'],
    [oxygenSat, 'oxygenSat'],
  ];

  for (const [value, key] of fieldsToValidate) {
    const error = validateNumericField(value, key);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
  }

  // ── 驗證 mealTiming ─────────────────────────────
  if (mealTiming !== undefined && mealTiming !== null) {
    if (
      typeof mealTiming !== 'string' ||
      !VALID_MEAL_TIMINGS.includes(mealTiming as typeof VALID_MEAL_TIMINGS[number])
    ) {
      return NextResponse.json(
        { error: 'mealTiming 可用值：fasting、before、after' },
        { status: 400 },
      );
    }
  }

  // ── 驗證 note ───────────────────────────────────
  if (note !== undefined && note !== null && typeof note !== 'string') {
    return NextResponse.json(
      { error: '備註格式不正確' },
      { status: 400 },
    );
  }

  if (typeof note === 'string' && note.length > 500) {
    return NextResponse.json(
      { error: '備註長度上限 500 字' },
      { status: 400 },
    );
  }

  // ── 建立記錄 ─────────────────────────────────────
  const record = await prisma.healthRecord.create({
    data: {
      userId: user.id,
      recordedAt: parsedDate,
      systolic: hasSystolic ? Number(systolic) : null,
      diastolic: hasDiastolic ? Number(diastolic) : null,
      heartRate: heartRate != null ? Number(heartRate) : null,
      bloodSugar: bloodSugar != null ? Number(bloodSugar) : null,
      mealTiming: (mealTiming as string) ?? null,
      temperature: temperature != null ? Number(temperature) : null,
      weight: weight != null ? Number(weight) : null,
      bodyFat: bodyFat != null ? Number(bodyFat) : null,
      oxygenSat: oxygenSat != null ? Number(oxygenSat) : null,
      note: (note as string) ?? null,
    },
    select: {
      id: true,
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
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ record }, { status: 201 });
});
