/**
 * 台灣國定假日與紀念日資料
 *
 * 包含固定日期假日、農曆假日（2024-2030）、彈性放假/補假
 * 資料來源：行政院人事行政總處
 */

export interface TaiwanHoliday {
  date: string;       // YYYY-MM-DD
  name: string;       // 假日名稱
  description?: string;
  type: 'holiday' | 'compensatory' | 'memorial';
  // holiday: 國定假日放假
  // compensatory: 彈性放假/補假
  // memorial: 紀念日（不放假）
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function h(month: number, day: number, name: string, type: TaiwanHoliday['type'] = 'holiday'): { month: number; day: number; name: string; type: TaiwanHoliday['type'] } {
  return { month, day, name, type };
}

// ── 每年固定日期的假日與紀念日 ─────────────────────────────

const FIXED_HOLIDAYS = [
  h(1, 1, '元旦（開國紀念日）'),
  h(2, 28, '和平紀念日（228）'),
  h(3, 29, '青年節', 'memorial'),
  h(4, 4, '兒童節'),
  h(5, 1, '勞動節'),
  h(9, 28, '教師節', 'memorial'),
  h(10, 10, '國慶日'),
  h(10, 25, '台灣光復節', 'memorial'),
  h(11, 12, '國父誕辰紀念日', 'memorial'),
  h(12, 25, '行憲紀念日', 'memorial'),
];

// ── 每年不同的農曆假日 + 彈性放假/補假 ────────────────────

const YEARLY_HOLIDAYS: Record<number, { month: number; day: number; name: string; type: TaiwanHoliday['type'] }[]> = {
  2024: [
    // 春節
    h(2, 8, '除夕'),
    h(2, 9, '春節（初一）'),
    h(2, 10, '春節（初二）'),
    h(2, 11, '春節（初三）'),
    h(2, 12, '春節彈性放假'),
    // 清明
    h(4, 4, '清明節'),
    h(4, 5, '清明節彈性放假', 'compensatory'),
    // 端午
    h(6, 10, '端午節'),
    // 中秋
    h(9, 17, '中秋節'),
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
    // 中秋
    h(10, 6, '中秋節'),
    // 國慶
    h(10, 9, '國慶日彈性放假', 'compensatory'),
  ],
  2026: [
    // 元旦連假
    h(1, 2, '元旦彈性放假', 'compensatory'),
    // 春節
    h(2, 14, '春節補班日（補2/19）', 'compensatory'),
    h(2, 16, '除夕'),
    h(2, 17, '春節（初一）'),
    h(2, 18, '春節（初二）'),
    h(2, 19, '春節（初三）'),
    h(2, 20, '春節彈性放假', 'compensatory'),
    // 228
    h(2, 27, '228彈性放假', 'compensatory'),
    // 清明+兒童節
    h(4, 3, '兒童節/清明彈性放假', 'compensatory'),
    h(4, 5, '清明節'),
    h(4, 6, '清明節補假', 'compensatory'),
    // 端午
    h(6, 18, '端午節彈性放假', 'compensatory'),
    h(6, 19, '端午節'),
    // 中秋
    h(9, 25, '中秋節'),
    // 國慶
    h(10, 9, '國慶日彈性放假', 'compensatory'),
  ],
  2027: [
    // 春節
    h(2, 5, '除夕'),
    h(2, 6, '春節（初一）'),
    h(2, 7, '春節（初二）'),
    h(2, 8, '春節（初三）'),
    h(2, 9, '春節彈性放假', 'compensatory'),
    h(2, 10, '春節彈性放假', 'compensatory'),
    // 228
    h(3, 1, '228補假', 'compensatory'),
    // 清明+兒童節
    h(4, 5, '清明節'),
    h(4, 6, '兒童節補假', 'compensatory'),
    // 端午
    h(6, 9, '端午節'),
    // 中秋
    h(9, 15, '中秋節'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
  ],
  2028: [
    // 春節
    h(1, 25, '除夕'),
    h(1, 26, '春節（初一）'),
    h(1, 27, '春節（初二）'),
    h(1, 28, '春節（初三）'),
    // 228
    h(2, 28, '和平紀念日'),
    h(2, 29, '228彈性放假', 'compensatory'),
    // 清明+兒童節
    h(4, 4, '清明節'),
    h(4, 3, '兒童節/清明彈性放假', 'compensatory'),
    // 端午
    h(5, 28, '端午節'),
    h(5, 29, '端午節彈性放假', 'compensatory'),
    // 中秋
    h(10, 3, '中秋節'),
    // 國慶
    h(10, 9, '國慶日彈性放假', 'compensatory'),
  ],
  2029: [
    // 春節
    h(2, 12, '除夕'),
    h(2, 13, '春節（初一）'),
    h(2, 14, '春節（初二）'),
    h(2, 15, '春節（初三）'),
    h(2, 16, '春節彈性放假', 'compensatory'),
    // 228
    h(2, 27, '228彈性放假', 'compensatory'),
    // 清明+兒童節
    h(4, 4, '清明節'),
    h(4, 3, '兒童節/清明彈性放假', 'compensatory'),
    // 端午
    h(6, 16, '端午節'),
    h(6, 18, '端午節彈性放假', 'compensatory'),
    // 中秋
    h(9, 22, '中秋節'),
    h(9, 24, '中秋節彈性放假', 'compensatory'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
  ],
  2030: [
    // 春節
    h(2, 2, '除夕'),
    h(2, 3, '春節（初一）'),
    h(2, 4, '春節（初二）'),
    h(2, 5, '春節（初三）'),
    h(2, 6, '春節彈性放假', 'compensatory'),
    // 228
    h(2, 28, '和平紀念日'),
    // 清明+兒童節
    h(4, 4, '清明節'),
    h(4, 5, '清明節補假', 'compensatory'),
    // 端午
    h(6, 5, '端午節'),
    // 中秋
    h(9, 12, '中秋節'),
    // 國慶
    h(10, 11, '國慶日補假', 'compensatory'),
  ],
};

/**
 * 取得指定年月的台灣假日（含國定假日、彈性放假、紀念日）
 */
export function getTaiwanHolidays(year: number, month: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];
  const seen = new Set<string>(); // 避免重複

  // 固定假日
  for (const h of FIXED_HOLIDAYS) {
    if (h.month === month) {
      const dateKey = `${year}-${pad2(h.month)}-${pad2(h.day)}`;
      if (!seen.has(dateKey)) {
        seen.add(dateKey);
        holidays.push({ date: dateKey, name: h.name, type: h.type });
      }
    }
  }

  // 年度特定假日（農曆+彈性放假）
  const yearlyData = YEARLY_HOLIDAYS[year];
  if (yearlyData) {
    for (const h of yearlyData) {
      if (h.month === month) {
        const dateKey = `${year}-${pad2(h.month)}-${pad2(h.day)}`;
        if (!seen.has(dateKey)) {
          seen.add(dateKey);
          holidays.push({ date: dateKey, name: h.name, type: h.type });
        }
      }
    }
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
