/**
 * 台灣國定假日資料
 *
 * 包含固定日期假日與農曆換算假日（2024-2030）
 * 資料來源：行政院人事行政總處
 */

export interface TaiwanHoliday {
  date: string;      // YYYY-MM-DD
  name: string;      // 假日名稱
  description?: string;
}

// 固定日期假日
const FIXED_HOLIDAYS: { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: '元旦（開國紀念日）' },
  { month: 2, day: 28, name: '和平紀念日（228）' },
  { month: 4, day: 4, name: '兒童節' },
  { month: 5, day: 1, name: '勞動節' },
  { month: 10, day: 10, name: '國慶日' },
];

// 農曆假日 — 每年日期不同，需查表
// 格式：年份 → [{ month, day, name }]
const LUNAR_HOLIDAYS: Record<number, { month: number; day: number; name: string }[]> = {
  2024: [
    { month: 2, day: 8, name: '除夕' },
    { month: 2, day: 9, name: '春節（初一）' },
    { month: 2, day: 10, name: '春節（初二）' },
    { month: 2, day: 11, name: '春節（初三）' },
    { month: 2, day: 12, name: '春節（初四）' },
    { month: 4, day: 4, name: '清明節' },
    { month: 6, day: 10, name: '端午節' },
    { month: 9, day: 17, name: '中秋節' },
  ],
  2025: [
    { month: 1, day: 28, name: '除夕' },
    { month: 1, day: 29, name: '春節（初一）' },
    { month: 1, day: 30, name: '春節（初二）' },
    { month: 1, day: 31, name: '春節（初三）' },
    { month: 2, day: 1, name: '春節（初四）' },
    { month: 4, day: 4, name: '清明節' },
    { month: 5, day: 31, name: '端午節' },
    { month: 10, day: 6, name: '中秋節' },
  ],
  2026: [
    { month: 2, day: 16, name: '除夕' },
    { month: 2, day: 17, name: '春節（初一）' },
    { month: 2, day: 18, name: '春節（初二）' },
    { month: 2, day: 19, name: '春節（初三）' },
    { month: 2, day: 20, name: '春節（初四）' },
    { month: 4, day: 5, name: '清明節' },
    { month: 6, day: 19, name: '端午節' },
    { month: 9, day: 25, name: '中秋節' },
  ],
  2027: [
    { month: 2, day: 5, name: '除夕' },
    { month: 2, day: 6, name: '春節（初一）' },
    { month: 2, day: 7, name: '春節（初二）' },
    { month: 2, day: 8, name: '春節（初三）' },
    { month: 2, day: 9, name: '春節（初四）' },
    { month: 4, day: 5, name: '清明節' },
    { month: 6, day: 9, name: '端午節' },
    { month: 9, day: 15, name: '中秋節' },
  ],
  2028: [
    { month: 1, day: 25, name: '除夕' },
    { month: 1, day: 26, name: '春節（初一）' },
    { month: 1, day: 27, name: '春節（初二）' },
    { month: 1, day: 28, name: '春節（初三）' },
    { month: 1, day: 29, name: '春節（初四）' },
    { month: 4, day: 4, name: '清明節' },
    { month: 5, day: 28, name: '端午節' },
    { month: 10, day: 3, name: '中秋節' },
  ],
  2029: [
    { month: 2, day: 12, name: '除夕' },
    { month: 2, day: 13, name: '春節（初一）' },
    { month: 2, day: 14, name: '春節（初二）' },
    { month: 2, day: 15, name: '春節（初三）' },
    { month: 2, day: 16, name: '春節（初四）' },
    { month: 4, day: 4, name: '清明節' },
    { month: 6, day: 16, name: '端午節' },
    { month: 9, day: 22, name: '中秋節' },
  ],
  2030: [
    { month: 2, day: 2, name: '除夕' },
    { month: 2, day: 3, name: '春節（初一）' },
    { month: 2, day: 4, name: '春節（初二）' },
    { month: 2, day: 5, name: '春節（初三）' },
    { month: 2, day: 6, name: '春節（初四）' },
    { month: 4, day: 5, name: '清明節' },
    { month: 6, day: 5, name: '端午節' },
    { month: 9, day: 12, name: '中秋節' },
  ],
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 取得指定年月的台灣國定假日
 */
export function getTaiwanHolidays(year: number, month: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];

  // 固定假日
  for (const h of FIXED_HOLIDAYS) {
    if (h.month === month) {
      holidays.push({
        date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
        name: h.name,
      });
    }
  }

  // 農曆假日
  const lunarYear = LUNAR_HOLIDAYS[year];
  if (lunarYear) {
    for (const h of lunarYear) {
      if (h.month === month) {
        holidays.push({
          date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
          name: h.name,
        });
      }
    }
  }

  return holidays;
}

/**
 * 取得指定年份所有台灣國定假日
 */
export function getAllTaiwanHolidays(year: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];

  for (const h of FIXED_HOLIDAYS) {
    holidays.push({
      date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
      name: h.name,
    });
  }

  const lunarYear = LUNAR_HOLIDAYS[year];
  if (lunarYear) {
    for (const h of lunarYear) {
      holidays.push({
        date: `${year}-${pad2(h.month)}-${pad2(h.day)}`,
        name: h.name,
      });
    }
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}
