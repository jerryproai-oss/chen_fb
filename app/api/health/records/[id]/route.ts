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
 * 驗證數值型指標是否在合法範圍內。
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
 * PUT /api/health/records/[id]
 *
 * 修改自己的健康記錄。
 */
export const PUT = withAuth(async ({ user }, req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的記錄 ID 格式' },
      { status: 400 },
    );
  }

  // ── 查詢現有記錄並驗證所有權 ────────────────────
  const existing = await prisma.healthRecord.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: '找不到該健康記錄' },
      { status: 404 },
    );
  }

  if (existing.userId !== user.id) {
    return NextResponse.json(
      { error: '只能修改自己的健康記錄' },
      { status: 403 },
    );
  }

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
  let parsedDate: Date | undefined;
  if (recordedAt !== undefined) {
    if (typeof recordedAt !== 'string' || !recordedAt.trim()) {
      return NextResponse.json(
        { error: 'recordedAt 格式不正確' },
        { status: 400 },
      );
    }

    parsedDate = new Date(recordedAt);
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

  // ── 更新記錄 ─────────────────────────────────────
  const record = await prisma.healthRecord.update({
    where: { id },
    data: {
      ...(parsedDate !== undefined ? { recordedAt: parsedDate } : {}),
      systolic: hasSystolic ? Number(systolic) : null,
      diastolic: hasDiastolic ? Number(diastolic) : null,
      heartRate: heartRate != null ? Number(heartRate) : null,
      bloodSugar: bloodSugar != null ? Number(bloodSugar) : null,
      mealTiming: mealTiming != null ? (mealTiming as string) : null,
      temperature: temperature != null ? Number(temperature) : null,
      weight: weight != null ? Number(weight) : null,
      bodyFat: bodyFat != null ? Number(bodyFat) : null,
      oxygenSat: oxygenSat != null ? Number(oxygenSat) : null,
      note: note != null ? (note as string) : null,
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

  return NextResponse.json({ record });
});

/**
 * DELETE /api/health/records/[id]
 *
 * 刪除自己的健康記錄。
 */
export const DELETE = withAuth(async ({ user }, _req: NextRequest, routeCtx) => {
  const { id } = await routeCtx.params;

  if (!id || !UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: '無效的記錄 ID 格式' },
      { status: 400 },
    );
  }

  // ── 查詢記錄並驗證所有權 ────────────────────────
  const existing = await prisma.healthRecord.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: '找不到該健康記錄' },
      { status: 404 },
    );
  }

  if (existing.userId !== user.id) {
    return NextResponse.json(
      { error: '只能刪除自己的健康記錄' },
      { status: 403 },
    );
  }

  await prisma.healthRecord.delete({ where: { id } });

  return NextResponse.json({ message: '已刪除健康記錄' });
});
