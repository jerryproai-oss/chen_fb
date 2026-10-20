/**
 * 台灣國定假日、紀念日、國際節日資料
 *
 * 架構：
 * - 固定假日：每年固定日期的國定假日與紀念日
 * - 農曆節日：透過 lunarToSolar 自動推算（涵蓋 2024-2035）
 * - 年度特定：各年度的補假日與特殊安排
 * - 國際節日：固定與浮動日期
 * - 節氣：清明節、冬至以天文近似公式計算
 *
 * 資料來源：行政院人事行政總處辦公日曆表、中央氣象署
 */

import { lunarToSolar } from './lunar';

export interface TaiwanHoliday {
  date: string;       // YYYY-MM-DD
  name: string;       // 假日名稱
  description?: string;
  type: 'holiday' | 'compensatory' | 'memorial' | 'international' | 'folk';
  // holiday: 國定假日放假
  // compensatory: 補假
  // memorial: 紀念日（不放假）
  // international: 國際節日
  // folk: 民俗節日（元宵、七夕、中元、重陽等）
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function mkDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

interface HEntry {
  month: number;
  day: number;
  name: string;
  type: TaiwanHoliday['type'];
}

function h(month: number, day: number, name: string, type: TaiwanHoliday['type'] = 'holiday'): HEntry {
  return { month, day, name, type };
}

// ── 每年固定日期的假日與紀念日 ─────────────────────────────
// 2025 年修正《紀念日及節日實施辦法》後，
// 教師節(9/28)、光復節(10/25)、行憲紀念日(12/25) 升格為國定假日

const FIXED_HOLIDAYS: HEntry[] = [
  h(1, 1, '元旦（開國紀念日）'),
  h(2, 28, '和平紀念日'),
  h(3, 29, '青年節', 'memorial'),
  h(4, 4, '兒童節'),
  h(5, 1, '勞動節'),
  h(10, 10, '國慶日'),
  h(11, 12, '國父誕辰紀念日', 'memorial'),
];

/**
 * 2025 年起新增的固定國定假日
 * 教師節、光復節、行憲紀念日由紀念日升格
 */
function getFixedHolidaysForYear(year: number): HEntry[] {
  const result = [...FIXED_HOLIDAYS];
  if (year >= 2025) {
    result.push(h(9, 28, '教師節（孔子誕辰紀念日）'));
    result.push(h(10, 25, '台灣光復節'));
    result.push(h(12, 25, '行憲紀念日'));
  } else {
    result.push(h(9, 28, '教師節', 'memorial'));
    result.push(h(10, 25, '台灣光復節', 'memorial'));
    result.push(h(12, 25, '行憲紀念日', 'memorial'));
  }
  return result;
}

// ── 國際節日（固定日期） ─────────────────────────────────────

const INTERNATIONAL_FIXED: HEntry[] = [
  h(2, 14, '西洋情人節', 'international'),
  h(3, 8, '國際婦女節', 'international'),
  h(3, 14, '白色情人節', 'international'),
  h(4, 1, '愚人節', 'international'),
  h(4, 22, '世界地球日', 'international'),
  h(10, 31, '萬聖節', 'international'),
  h(12, 24, '平安夜', 'international'),
  h(12, 25, '聖誕節', 'international'),
  h(12, 31, '跨年夜', 'international'),
];

// ── 浮動日期國際節日（需計算） ────────────────────────────────

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

function computeEaster(year: number): { month: number; day: number } {
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

function getFloatingInternationalHolidays(year: number, month: number): HEntry[] {
  const results: HEntry[] = [];

  // 復活節 (3月或4月)
  if (month === 3 || month === 4) {
    const easter = computeEaster(year);
    if (easter.month === month) {
      results.push(h(easter.month, easter.day, '復活節', 'international'));
    }
  }

  // 母親節：5月第2個星期日
  if (month === 5) {
    const day = getNthWeekdayOfMonth(year, 5, 0, 2);
    if (day) results.push(h(5, day, '母親節', 'international'));
  }

  // 父親節：台灣 8/8
  if (month === 8) {
    results.push(h(8, 8, '父親節（八八節）', 'international'));
  }

  // 感恩節：11月第4個星期四
  if (month === 11) {
    const day = getNthWeekdayOfMonth(year, 11, 4, 4);
    if (day) results.push(h(11, day, '感恩節', 'international'));
  }

  return results;
}

// ── 天文節氣近似公式 ─────────────────────────────────────────

/**
 * 清明節：通常在 4/4 或 4/5
 * 近似公式（21世紀）：⌊Y × D + C⌋ − L
 * Y = 年份後兩位, D = 0.2422, C = 4.81, L = ⌊Y/4⌋
 *
 * 已驗證 2024-2035 輸出與中央氣象署公告一致
 */
function getQingming(year: number): number {
  const Y = year % 100;
  const D = 0.2422;
  const C = 4.81;
  return Math.floor(Y * D + C) - Math.floor(Y / 4);
}

/**
 * 冬至：通常在 12/21 或 12/22
 * 近似公式（21世紀）
 *
 * 已驗證 2024-2035 輸出與香港天文台公告一致
 */
function getDongzhi(year: number): number {
  const Y = year % 100;
  const D = 0.2422;
  const C = 21.94;
  return Math.floor(Y * D + C) - Math.floor(Y / 4);
}

// ── 農曆節日自動推算 ─────────────────────────────────────────

/**
 * 取得該年度的農曆節日西曆日期
 * 使用 lunarToSolar 高效轉換
 */
const lunarFestivalCache = new Map<number, HEntry[]>();

function getLunarFestivals(year: number): HEntry[] {
  if (lunarFestivalCache.has(year)) return lunarFestivalCache.get(year)!;

  const festivals: HEntry[] = [];

  // 春節初一
  const chunjie = lunarToSolar(year, 1, 1);
  if (chunjie) {
    // 除夕：春節前一天（最簡單且正確，避免月末天數溢位問題）
    const chuxiDate = new Date(chunjie.year, chunjie.month - 1, chunjie.day - 1);
    festivals.push(h(chuxiDate.getMonth() + 1, chuxiDate.getDate(), '除夕'));

    // 小年夜：除夕前一天
    const xiaoDate = new Date(chunjie.year, chunjie.month - 1, chunjie.day - 2);
    festivals.push(h(xiaoDate.getMonth() + 1, xiaoDate.getDate(), '小年夜', 'folk'));

    // 春節初一～初三
    festivals.push(h(chunjie.month, chunjie.day, '春節（初一）'));
    const d2 = new Date(chunjie.year, chunjie.month - 1, chunjie.day + 1);
    festivals.push(h(d2.getMonth() + 1, d2.getDate(), '春節（初二）'));
    const d3 = new Date(chunjie.year, chunjie.month - 1, chunjie.day + 2);
    festivals.push(h(d3.getMonth() + 1, d3.getDate(), '春節（初三）'));

    // 春節補假：初一～初三中落在週末的，自動計算補假
    // 2026 起「只補假、不補班」
    if (year >= 2026) {
      const holidayDates = [
        { name: '除夕', date: chuxiDate },
        { name: '春節（初一）', date: new Date(chunjie.year, chunjie.month - 1, chunjie.day) },
        { name: '春節（初二）', date: new Date(chunjie.year, chunjie.month - 1, chunjie.day + 1) },
        { name: '春節（初三）', date: new Date(chunjie.year, chunjie.month - 1, chunjie.day + 2) },
      ];

      // 找出落在週末的假日
      const weekendHolidays = holidayDates.filter(hd => {
        const dow = hd.date.getDay();
        return dow === 0 || dow === 6;
      });

      // 補假安排：在假期區間的最後一天之後，依序往後加工作日
      if (weekendHolidays.length > 0) {
        const lastHoliday = holidayDates[holidayDates.length - 1].date;
        // 收集所有假日日期（含週末本身）以避免重疊
        const allHolidaySet = new Set(
          holidayDates.map(hd => hd.date.getTime())
        );

        let compensatoryDate = new Date(lastHoliday);
        for (let i = 0; i < weekendHolidays.length; i++) {
          // 往後找下一個工作日
          compensatoryDate = new Date(compensatoryDate.getTime() + 86400000);
          while (
            compensatoryDate.getDay() === 0 ||
            compensatoryDate.getDay() === 6 ||
            allHolidaySet.has(compensatoryDate.getTime())
          ) {
            compensatoryDate = new Date(compensatoryDate.getTime() + 86400000);
          }
          allHolidaySet.add(compensatoryDate.getTime());
          festivals.push(h(
            compensatoryDate.getMonth() + 1,
            compensatoryDate.getDate(),
            `${weekendHolidays[i].name}補假`,
            'compensatory',
          ));
        }
      }
    }
  }

  // 元宵節：正月十五
  const yuanxiao = lunarToSolar(year, 1, 15);
  if (yuanxiao) festivals.push(h(yuanxiao.month, yuanxiao.day, '元宵節', 'folk'));

  // 端午節：五月初五
  const duanwu = lunarToSolar(year, 5, 5);
  if (duanwu) {
    festivals.push(h(duanwu.month, duanwu.day, '端午節'));
    // 端午補假
    if (year >= 2026) {
      const duanwuDate = new Date(duanwu.year, duanwu.month - 1, duanwu.day);
      const dow = duanwuDate.getDay();
      if (dow === 6) {
        festivals.push(h(duanwu.month, duanwu.day - 1, '端午節補假', 'compensatory'));
      } else if (dow === 0) {
        const next = new Date(duanwuDate.getTime() + 86400000);
        festivals.push(h(next.getMonth() + 1, next.getDate(), '端午節補假', 'compensatory'));
      }
    }
  }

  // 七夕：七月初七
  const qixi = lunarToSolar(year, 7, 7);
  if (qixi) festivals.push(h(qixi.month, qixi.day, '七夕情人節', 'folk'));

  // 中元節：七月十五
  const zhongyuan = lunarToSolar(year, 7, 15);
  if (zhongyuan) festivals.push(h(zhongyuan.month, zhongyuan.day, '中元節', 'folk'));

  // 中秋節：八月十五
  const zhongqiu = lunarToSolar(year, 8, 15);
  if (zhongqiu) {
    festivals.push(h(zhongqiu.month, zhongqiu.day, '中秋節'));
    // 中秋補假
    if (year >= 2026) {
      const zhongqiuDate = new Date(zhongqiu.year, zhongqiu.month - 1, zhongqiu.day);
      const dow = zhongqiuDate.getDay();
      if (dow === 6) {
        festivals.push(h(zhongqiu.month, zhongqiu.day - 1, '中秋節補假', 'compensatory'));
      } else if (dow === 0) {
        const next = new Date(zhongqiuDate.getTime() + 86400000);
        festivals.push(h(next.getMonth() + 1, next.getDate(), '中秋節補假', 'compensatory'));
      }
    }
  }

  // 重陽節：九月初九
  const chongyang = lunarToSolar(year, 9, 9);
  if (chongyang) festivals.push(h(chongyang.month, chongyang.day, '重陽節', 'folk'));

  lunarFestivalCache.set(year, festivals);
  return festivals;
}

// ── 年度特定補假 ─────────────────────────────────────────────
// 只記錄各年度的「補假」和「特殊安排」
// 農曆節日（除夕/春節/端午/中秋）由 getLunarFestivals 自動計算
// 2026 年起：「只補假、不補班」
//
// 補假規則（2026 起）：
//   假日落在星期六 → 前一天(五)補假
//   假日落在星期日 → 後一天(一)補假
//   兒童節(4/4)與清明節(4/4或4/5)同日 → 只需一個補假
//   跨年補假(如 1/1 星期六) → 前一年 12/31(五)補假，但記在當年
//
// 以下每年補假資料已根據 getDay() 計算驗證

const YEARLY_COMPENSATORY: Record<number, HEntry[]> = {
  2024: [
    h(2, 12, '春節彈性放假', 'compensatory'),
    h(4, 5, '清明節彈性放假', 'compensatory'),
  ],
  2025: [
    h(1, 2, '元旦彈性放假', 'compensatory'),
    h(1, 3, '元旦彈性放假', 'compensatory'),
    h(1, 27, '春節彈性放假', 'compensatory'),
    h(2, 27, '228彈性放假', 'compensatory'),
    h(4, 3, '兒童節彈性放假', 'compensatory'),
    h(5, 30, '端午節彈性放假', 'compensatory'),
    h(9, 29, '教師節補假', 'compensatory'),
    h(10, 9, '國慶日彈性放假', 'compensatory'),
    h(10, 24, '光復節補假', 'compensatory'),
  ],

  // === 2026 年起「只補假、不補班」 ===

  // 2026: 228(六)→2/27(五), 兒童節(六)→4/3(五), 清明(日)→4/6(一),
  //        國慶(六)→10/9(五), 光復(日)→10/26(一)
  //        + 春節特別安排：2/14(六)~2/22(日) 9天連假，含 2/20(五) 小年夜補假
  2026: [
    h(2, 14, '春節假期', 'compensatory'),     // 春節連假起始（六）
    h(2, 20, '春節補假', 'compensatory'),      // 小年夜(日)補假至週五
    h(2, 27, '228補假', 'compensatory'),       // 228(六)→前週五
    h(4, 3, '兒童節補假', 'compensatory'),     // 兒童節(六)→前週五
    h(4, 6, '清明節補假', 'compensatory'),     // 清明節(日)→後週一
    h(10, 9, '國慶日補假', 'compensatory'),    // 國慶(六)→前週五
    h(10, 26, '光復節補假', 'compensatory'),   // 光復節(日)→後週一
  ],

  // 2027: 228(日)→3/1(一), 兒童節(日)→4/5(一), 勞動節(六)→4/30(五),
  //        國慶(日)→10/11(一), 行憲(六)→12/24(五)
  2027: [
    h(3, 1, '228補假', 'compensatory'),        // 228(日)→後週一
    h(4, 5, '兒童節補假', 'compensatory'),     // 兒童節(日)→後週一
    h(4, 30, '勞動節補假', 'compensatory'),    // 勞動節(六)→前週五
    h(10, 11, '國慶日補假', 'compensatory'),   // 國慶(日)→後週一
    h(12, 24, '行憲紀念日補假', 'compensatory'), // 行憲(六)→前週五
  ],

  // 2028: 元旦(六)→前年12/31(五) — 此條記在 2027 年不太直觀
  //        其餘所有固定假日都在平日，無需補假
  //        兒童節(二)、清明(二)同日4/4 — 平日無需補假
  // 注意：元旦 1/1(六) 的補假為 2027/12/31(五)，
  //        由於跨年，在此記為 2028 年的 "前一年底補假"
  //        但顯示時 2027 年 12 月才會看到
  2028: [
    // 2028 年所有固定假日皆為平日（一~五），無需補假
    // 元旦 1/1 為六，但補假的 12/31 屬 2027 年
  ],

  // 2029: 所有固定假日皆為平日，無需補假
  2029: [],

  // 2030: 教師節(六)→9/27(五)
  2030: [
    h(9, 27, '教師節補假', 'compensatory'),    // 教師節(六)→前週五
  ],

  // 2031: 清明(六)→4/4(五)（注意4/4也是兒童節，兒童節(五)本身就放假），
  //        教師節(日)→9/29(一), 光復節(六)→10/24(五)
  // 2031: 兒童節4/4(五)放假, 清明4/5(六)→補假4/3(四)(因4/4已占),
  //        教師節(日)→9/29(一), 光復節(六)→10/24(五)
  2031: [
    h(4, 3, '清明節補假', 'compensatory'),     // 清明4/5(六)→4/3(四)，因4/4兒童節已放假
    h(9, 29, '教師節補假', 'compensatory'),    // 教師節(日)→後週一
    h(10, 24, '光復節補假', 'compensatory'),   // 光復節(六)→前週五
  ],

  // 2032: 228(六)→2/27(五), 兒童節+清明同日4/4(日)→4/5(一),
  //        勞動節(六)→4/30(五), 國慶(日)→10/11(一), 行憲(六)→12/24(五)
  2032: [
    h(2, 27, '228補假', 'compensatory'),       // 228(六)→前週五
    h(4, 5, '兒童節暨清明節補假', 'compensatory'), // 4/4(日) 兒童節+清明同日→後週一
    h(4, 30, '勞動節補假', 'compensatory'),    // 勞動節(六)→前週五
    h(10, 11, '國慶日補假', 'compensatory'),   // 國慶(日)→後週一
    h(12, 24, '行憲紀念日補假', 'compensatory'), // 行憲(六)→前週五
  ],

  // 2033: 元旦(六)→前年12/31(五)記在2032, 勞動節(日)→5/2(一),
  //        行憲(日)→12/26(一)
  //        兒童節+清明同日4/4(一) — 平日無需補假
  2033: [
    h(5, 2, '勞動節補假', 'compensatory'),     // 勞動節(日)→後週一
    h(12, 26, '行憲紀念日補假', 'compensatory'), // 行憲(日)→後週一
  ],

  // 2034: 元旦(日)→1/2(一)
  2034: [
    h(1, 2, '元旦補假', 'compensatory'),       // 元旦(日)→後週一
  ],

  // 2035: 所有固定假日皆為平日，無需補假
  2035: [],
};

// 跨年補假：元旦(六)時，補假日為前一年 12/31(五)
// 需要額外加到前一年的資料中
// 2028 元旦(六) → 2027/12/31(五) 補假
// 2033 元旦(六) → 2032/12/31(五) 補假
const CROSS_YEAR_COMPENSATORY: Record<number, HEntry[]> = {
  // key = 補假實際所在年份
  2027: [
    h(12, 31, '元旦補假', 'compensatory'),     // 2028/1/1(六)→2027/12/31(五)
  ],
  2032: [
    h(12, 31, '元旦補假', 'compensatory'),     // 2033/1/1(六)→2032/12/31(五)
  ],
};

// ── 主要 API ─────────────────────────────────────────────────

/**
 * 取得指定年月的台灣假日
 * （含國定假日、補假、農曆節日、紀念日、國際節日、節氣）
 */
export function getTaiwanHolidays(year: number, month: number): TaiwanHoliday[] {
  const holidays: TaiwanHoliday[] = [];
  const seen = new Set<string>();

  function add(entry: HEntry, overrideYear?: number) {
    if (entry.month !== month) return;
    const y = overrideYear || year;
    const dateKey = mkDate(y, entry.month, entry.day);
    const uniqueKey = `${dateKey}_${entry.name}`;
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      holidays.push({ date: dateKey, name: entry.name, type: entry.type });
    }
  }

  // 1. 固定國定假日
  for (const entry of getFixedHolidaysForYear(year)) {
    add(entry);
  }

  // 2. 農曆節日（自動推算）
  for (const entry of getLunarFestivals(year)) {
    add(entry);
  }

  // 3. 清明節（天文節氣）
  const qmDay = getQingming(year);
  if (qmDay >= 4 && qmDay <= 6) {
    add(h(4, qmDay, '清明節'));
  } else {
    add(h(4, 5, '清明節')); // fallback
  }

  // 4. 冬至（天文節氣）
  const dzDay = getDongzhi(year);
  if (dzDay >= 20 && dzDay <= 23) {
    add(h(12, dzDay, '冬至', 'folk'));
  } else {
    add(h(12, 22, '冬至', 'folk')); // fallback
  }

  // 5. 年度特定補假
  const compensatory = YEARLY_COMPENSATORY[year];
  if (compensatory) {
    for (const entry of compensatory) {
      add(entry);
    }
  }

  // 5b. 跨年補假（前一年末的補假屬於當年度顯示）
  const crossYear = CROSS_YEAR_COMPENSATORY[year];
  if (crossYear) {
    for (const entry of crossYear) {
      add(entry);
    }
  }

  // 6. 國際節日（固定）
  for (const entry of INTERNATIONAL_FIXED) {
    add(entry);
  }

  // 7. 國際節日（浮動）
  for (const entry of getFloatingInternationalHolidays(year, month)) {
    add(entry);
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
