/**
 * 台灣國定假日、紀念日、國際節日資料
 *
 * 包含固定日期假日、農曆假日（2024-2030）、彈性放假/補假、國際節日
 * 資料來源：行政院人事行政總處 + 國際通用節日
 */

export interface TaiwanHoliday {
  date: string;       // YYYY-MM-DD
  name: string;       // 假日名稱
  description?: string;
  type: 'holiday' | 'compensatory' | 'memorial' | 'international' | 'folk';
  // holiday: 國定假日放假
  // compensatory: 彈性放假/補假
  // memorial: 紀念日（不放假）
  // international: 國際節日
  // folk: 民俗節日（元宵、七夕、中元、重陽等）
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function h(month: number, day: number, name: string, type: TaiwanHoliday['type'] = 'holiday'): { month: number; day: number; name: string; type: TaiwanHoliday['type'] } {
  return { month, day, name, type };
}

// ── 每年固定日期的假日與紀念日 ─────────────────────────────
// 注意：2025年修正《紀念日及節日實施辦法》後，
// 教師節(9/28)、光復節(10/25)、行憲紀念日(12/25) 由紀念日升格為國定假日
// 這些節日的處理依年份放在 YEARLY_HOLIDAYS 中

const FIXED_HOLIDAYS = [
  h(1, 1, '元旦（開國紀念日）'),
  h(2, 28, '和平紀念日（228）'),
  h(3, 29, '青年節', 'memorial'),
  h(4, 4, '兒童節'),
  h(5, 1, '勞動節'),
  h(10, 10, '國慶日'),
  h(11, 12, '國父誕辰紀念日', 'memorial'),
];

// ── 國際節日（固定日期） ─────────────────────────────────────

const INTERNATIONAL_FIXED_HOLIDAYS = [
  h(1, 1, '新年 New Year\'s Day', 'international'),
  h(2, 14, '西洋情人節 Valentine\'s Day', 'international'),
  h(3, 8, '國際婦女節', 'international'),
  h(3, 14, '白色情人節 White Day', 'international'),
  h(4, 1, '愚人節 April Fools\' Day', 'international'),
  h(4, 22, '世界地球日 Earth Day', 'international'),
  h(6, 1, '國際兒童節', 'international'),
  h(10, 31, '萬聖節 Halloween', 'international'),
  h(11, 11, '光棍節 / 購物節', 'international'),
  h(12, 24, '平安夜 Christmas Eve', 'international'),
  h(12, 25, '聖誕節 Christmas', 'international'),
  h(12, 31, '跨年夜 New Year\'s Eve', 'international'),
];

// ── 浮動日期國際節日（需計算） ────────────────────────────────

/**
 * 取得指定月份第 N 個星期幾的日期
 * @param year 年份
 * @param month 月份 (1-12)
 * @param weekday 星期幾 (0=日, 1=一, ..., 6=六)
 * @param nth 第幾個 (1-based)
 * @returns 日期 (1-31) 或 null
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): number | null {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() === weekday) {
      count++;
      if (count === nth) return d;
    }
  }
  return null;
}

/**
 * 取得指定月份最後一個星期幾的日期
 */
function getLastWeekdayOfMonth(year: number, month: number, weekday: number): number | null {
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = daysInMonth; d >= 1; d--) {
    if (new Date(year, month - 1, d).getDay() === weekday) return d;
  }
  return null;
}

/**
 * 取得浮動日期的國際節日
 */
function getFloatingInternationalHolidays(year: number, month: number): { month: number; day: number; name: string; type: TaiwanHoliday['type'] }[] {
  const results: { month: number; day: number; name: string; type: TaiwanHoliday['type'] }[] = [];

  // 復活節 (3月或4月) — 使用匿名格里曆演算法
  if (month === 3 || month === 4) {
    const easter = computeEaster(year);
    if (easter && easter.month === month) {
      results.push(h(easter.month, easter.day, '復活節 Easter', 'international'));
    }
  }

  // 母親節：5月第2個星期日
  if (month === 5) {
    const day = getNthWeekdayOfMonth(year, 5, 0, 2);
    if (day) results.push(h(5, day, '母親節 Mother\'s Day', 'international'));
  }

  // 父親節：台灣 8/8（八八節）
  if (month === 8) {
    results.push(h(8, 8, '父親節（八八節）', 'international'));
  }

  // 美國感恩節：11月第4個星期四（台灣外商也會慶祝）
  if (month === 11) {
    const day = getNthWeekdayOfMonth(year, 11, 4, 4);
    if (day) results.push(h(11, day, '感恩節 Thanksgiving', 'international'));
  }

  return results;
}

/**
 * 計算復活節日期（匿名格里曆演算法）
 */
function computeEaster(year: number): { month: number; day: number } | null {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const month = Math.floor((hh + l - 7 * m + 114) / 31);
  const day = ((hh + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

// ── 每年不同的農曆假日 + 補假 + 紀念日升格 ──────────────────
// 2025年修法後：教師節/光復節/行憲紀念日 由紀念日升格為國定假日
// 2026年起：廢除彈性放假+補班，改為週末遇假日一律前/後工作日補假

const YEARLY_HOLIDAYS: Record<number, { month: number; day: number; name: string; type: TaiwanHoliday['type'] }[]> = {
  2024: [
    // 春節
    h(2, 8, '除夕'),
    h(2, 9, '春節（初一）'),
    h(2, 10, '春節（初二）'),
    h(2, 11, '春節（初三）'),
    h(2, 12, '春節彈性放假', 'compensatory'),
    // 清明
    h(4, 4, '清明節'),
    h(4, 5, '清明節彈性放假', 'compensatory'),
    // 端午
    h(6, 10, '端午節'),
    // 中秋
    h(9, 17, '中秋節'),
    // 2024年：教師節/光復節/行憲紀念日仍為紀念日（不放假）
    h(9, 28, '教師節', 'memorial'),
    h(10, 25, '台灣光復節', 'memorial'),
    h(12, 25, '行憲紀念日', 'memorial'),
    // 民俗節日
    h(2, 24, '元宵節', 'folk'),
    h(8, 10, '七夕情人節', 'folk'),
    h(8, 18, '中元節', 'folk'),
    h(10, 11, '重陽節', 'folk'),
    h(12, 21, '冬至', 'folk'),
  ],
  2025: [
    // 元旦連假
    h(1, 2, '元旦彈性放假', 'compensatory'),
    h(1, 3, '元旦彈性放假', 'compensatory'),
    // 春節
    h(1, 27, '春節彈性放假', 'compensatory'),
    h(1, 28, '除夕'),
    h(1, 29, '春節（初一）'),
    h(1, 30, '春節（初二）'),
    h(1, 31, '春節（初三）'),
    // 228
    h(2, 27, '228彈性放假', 'compensatory'),
    // 清明+兒童節
    h(4, 3, '兒童節/清明彈性放假', 'compensatory'),
    h(4, 4, '清明節'),
    // 端午
    h(5, 30, '端午節彈性放假', 'compensatory'),
    h(5, 31, '端午節'),
    // 2025年修法後：教師節/光復節升格為國定假日
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    h(9, 29, '教師節補假', 'compensatory'),
    // 中秋
    h(10, 6, '中秋節'),
    // 國慶
    h(10, 9, '國慶日彈性放假', 'compensatory'),
    // 光復節
    h(10, 24, '光復節補假', 'compensatory'),
    h(10, 25, '台灣光復節'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    // 民俗節日
    h(2, 12, '元宵節', 'folk'),
    h(8, 29, '七夕情人節', 'folk'),
    h(9, 6, '中元節', 'folk'),
    h(10, 29, '重陽節', 'folk'),
    h(12, 21, '冬至', 'folk'),
  ],
  2026: [
    // === 2026年起無補班制度 ===
    // 春節（含小年夜）
    h(2, 15, '小年夜'),
    h(2, 16, '除夕'),
    h(2, 17, '春節（初一）'),
    h(2, 18, '春節（初二）'),
    h(2, 19, '春節（初三）'),
    // 228
    h(2, 27, '228補假', 'compensatory'),
    // 清明+兒童節
    h(4, 3, '兒童節補假', 'compensatory'),
    h(4, 5, '清明節'),
    h(4, 6, '清明節補假', 'compensatory'),
    // 端午
    h(6, 19, '端午節'),
    // 中秋
    h(9, 25, '中秋節'),
    // 教師節
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    // 國慶
    h(10, 9, '國慶日補假', 'compensatory'),
    // 光復節
    h(10, 25, '台灣光復節'),
    h(10, 26, '光復節補假', 'compensatory'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    // 民俗節日
    h(3, 3, '元宵節', 'folk'),
    h(8, 19, '七夕情人節', 'folk'),
    h(8, 27, '中元節', 'folk'),
    h(10, 18, '重陽節', 'folk'),
    h(12, 22, '冬至', 'folk'),
  ],
  2027: [
    // 春節
    h(2, 5, '除夕'),
    h(2, 6, '春節（初一）'),
    h(2, 7, '春節（初二）'),
    h(2, 8, '春節（初三）'),
    // 228
    h(3, 1, '228補假', 'compensatory'),
    // 清明+兒童節
    h(4, 5, '清明節'),
    h(4, 6, '兒童節補假', 'compensatory'),
    // 端午
    h(6, 9, '端午節'),
    // 中秋
    h(9, 15, '中秋節'),
    // 教師節
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
    // 光復節
    h(10, 25, '台灣光復節'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    h(12, 26, '行憲紀念日補假', 'compensatory'),
    // 民俗節日
    h(2, 20, '元宵節', 'folk'),
    h(8, 8, '七夕情人節', 'folk'),
    h(8, 16, '中元節', 'folk'),
    h(10, 8, '重陽節', 'folk'),
    h(12, 22, '冬至', 'folk'),
  ],
  2028: [
    // 春節
    h(1, 25, '除夕'),
    h(1, 26, '春節（初一）'),
    h(1, 27, '春節（初二）'),
    h(1, 28, '春節（初三）'),
    // 228
    h(2, 28, '和平紀念日'),
    h(2, 29, '228補假', 'compensatory'),
    // 清明+兒童節
    h(4, 3, '兒童節補假', 'compensatory'),
    h(4, 4, '清明節'),
    // 端午
    h(5, 28, '端午節'),
    h(5, 29, '端午節補假', 'compensatory'),
    // 教師節
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    // 中秋
    h(10, 3, '中秋節'),
    // 國慶
    h(10, 9, '國慶日補假', 'compensatory'),
    // 光復節
    h(10, 25, '台灣光復節'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    // 民俗節日
    h(2, 9, '元宵節', 'folk'),
    h(8, 26, '七夕情人節', 'folk'),
    h(9, 3, '中元節', 'folk'),
    h(10, 26, '重陽節', 'folk'),
    h(12, 21, '冬至', 'folk'),
  ],
  2029: [
    // 春節
    h(2, 12, '除夕'),
    h(2, 13, '春節（初一）'),
    h(2, 14, '春節（初二）'),
    h(2, 15, '春節（初三）'),
    // 228
    h(2, 27, '228補假', 'compensatory'),
    // 清明+兒童節
    h(4, 3, '兒童節補假', 'compensatory'),
    h(4, 4, '清明節'),
    // 端午
    h(6, 16, '端午節'),
    h(6, 18, '端午節補假', 'compensatory'),
    // 教師節
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    // 中秋
    h(9, 22, '中秋節'),
    h(9, 24, '中秋節補假', 'compensatory'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
    // 光復節
    h(10, 25, '台灣光復節'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    // 民俗節日
    h(2, 27, '元宵節', 'folk'),
    h(8, 16, '七夕情人節', 'folk'),
    h(8, 24, '中元節', 'folk'),
    h(10, 16, '重陽節', 'folk'),
    h(12, 21, '冬至', 'folk'),
  ],
  2030: [
    // 春節
    h(2, 2, '除夕'),
    h(2, 3, '春節（初一）'),
    h(2, 4, '春節（初二）'),
    h(2, 5, '春節（初三）'),
    // 228
    h(2, 28, '和平紀念日'),
    // 清明+兒童節
    h(4, 4, '清明節'),
    h(4, 5, '清明節補假', 'compensatory'),
    // 端午
    h(6, 5, '端午節'),
    // 中秋
    h(9, 12, '中秋節'),
    // 教師節
    h(9, 28, '教師節（孔子誕辰紀念日）'),
    h(9, 29, '教師節補假', 'compensatory'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
    // 光復節
    h(10, 25, '台灣光復節'),
    h(10, 26, '光復節補假', 'compensatory'),
    // 行憲紀念日
    h(12, 25, '行憲紀念日'),
    // 民俗節日
    h(2, 17, '元宵節', 'folk'),
    h(8, 6, '七夕情人節', 'folk'),
    h(8, 13, '中元節', 'folk'),
    h(10, 5, '重陽節', 'folk'),
    h(12, 22, '冬至', 'folk'),
  ],
};

/**
 * 取得指定年月的台灣假日（含國定假日、彈性放假、紀念日、國際節日）
 */
export function getTaiwanHolidays(year: number, month: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];
  const seen = new Set<string>(); // 避免重複（用 date+name 組合鍵）

  function addHoliday(entry: { month: number; day: number; name: string; type: TaiwanHoliday['type'] }) {
    if (entry.month !== month) return;
    const dateKey = `${year}-${pad2(entry.month)}-${pad2(entry.day)}`;
    const uniqueKey = `${dateKey}_${entry.name}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      holidays.push({ date: dateKey, name: entry.name, type: entry.type });
    }
  }

  // 固定假日
  for (const entry of FIXED_HOLIDAYS) {
    addHoliday(entry);
  }

  // 年度特定假日（農曆+彈性放假）
  const yearlyData = YEARLY_HOLIDAYS[year];
  if (yearlyData) {
    for (const entry of yearlyData) {
      addHoliday(entry);
    }
  }

  // 國際節日（固定日期）
  for (const entry of INTERNATIONAL_FIXED_HOLIDAYS) {
    addHoliday(entry);
  }

  // 國際節日（浮動日期：母親節、父親節、感恩節、復活節等）
  const floating = getFloatingInternationalHolidays(year, month);
  for (const entry of floating) {
    addHoliday(entry);
  }

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 取得指定年份所有台灣假日
 */
export function getAllTaiwanHolidays(year: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];
  for (let m = 1; m <= 12; m++) {
    holidays.push(...getTaiwanHolidays(year, m));
  }
  return holidays;
}
