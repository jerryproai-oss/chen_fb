/**
 * 農曆（農民曆）轉換工具
 *
 * 使用查表法，涵蓋 2024-2035 年。
 * 資料來源：中央氣象署、紫金山天文台、香港天文台等權威曆法機構。
 */

// ============================================================
// 型別定義
// ============================================================

export interface LunarDate {
  year: number;        // 農曆年
  month: number;       // 農曆月 (1-12)
  day: number;         // 農曆日 (1-30)
  isLeapMonth: boolean; // 是否閏月
  monthName: string;   // 「正月」「二月」...「十二月」「閏x月」
  dayName: string;     // 「初一」「初二」...「三十」
  yearName: string;    // 天干地支年名 + 生肖，如「丙午馬年」
}

interface LunarYearInfo {
  /** [月, 日] 農曆正月初一的西曆日期 */
  springFestival: [number, number];
  /** 每月天數 (29 或 30)，正常 12 個月 + 可能的閏月（共 12 或 13 個） */
  monthDays: number[];
  /** 閏月位置 (0 = 無閏月，N = 閏 N 月) */
  leapMonth: number;
}

// ============================================================
// 農曆年資料查表（2024-2035，已查證驗證）
// ============================================================

const LUNAR_YEAR_INFO: Record<number, LunarYearInfo> = {
  // 2024 甲辰龍年 354天 無閏月
  2024: {
    springFestival: [2, 10],
    leapMonth: 0,
    monthDays: [29, 30, 29, 29, 30, 29, 30, 30, 29, 30, 30, 29],
  },
  // 2025 乙巳蛇年 384天 閏六月
  2025: {
    springFestival: [1, 29],
    leapMonth: 6,
    monthDays: [30, 29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 30, 29],
  },
  // 2026 丙午馬年 354天 無閏月
  2026: {
    springFestival: [2, 17],
    leapMonth: 0,
    monthDays: [30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 30, 29],
  },
  // 2027 丁未羊年 354天 無閏月
  2027: {
    springFestival: [2, 6],
    leapMonth: 0,
    monthDays: [30, 30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 29],
  },
  // 2028 戊申猴年 384天 閏五月
  2028: {
    springFestival: [1, 26],
    leapMonth: 5,
    monthDays: [30, 30, 30, 29, 30, 29, 29, 30, 29, 29, 30, 30, 29],
  },
  // 2029 己酉雞年 355天 無閏月
  2029: {
    springFestival: [2, 13],
    leapMonth: 0,
    monthDays: [30, 30, 29, 30, 29, 30, 29, 30, 29, 29, 30, 30],
  },
  // 2030 庚戌狗年 354天 無閏月
  2030: {
    springFestival: [2, 3],
    leapMonth: 0,
    monthDays: [29, 30, 29, 30, 30, 29, 30, 29, 30, 29, 30, 29],
  },
  // 2031 辛亥豬年 384天 閏三月
  2031: {
    springFestival: [1, 23],
    leapMonth: 3,
    monthDays: [29, 30, 30, 29, 30, 29, 30, 30, 29, 30, 29, 30, 29],
  },
  // 2032 壬子鼠年 355天 無閏月
  2032: {
    springFestival: [2, 11],
    leapMonth: 0,
    monthDays: [30, 29, 29, 30, 29, 30, 30, 29, 30, 30, 29, 30],
  },
  // 2033 癸丑牛年 384天 閏十一月
  2033: {
    springFestival: [1, 31],
    leapMonth: 11,
    monthDays: [29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 30, 29, 30],
  },
  // 2034 甲寅虎年 354天 無閏月
  2034: {
    springFestival: [2, 19],
    leapMonth: 0,
    monthDays: [29, 30, 29, 29, 30, 29, 30, 29, 30, 30, 29, 30],
  },
  // 2035 乙卯兔年 354天 無閏月
  2035: {
    springFestival: [2, 8],
    leapMonth: 0,
    monthDays: [30, 29, 30, 29, 29, 30, 29, 29, 30, 29, 30, 30],
  },
};

// ============================================================
// 天干地支 / 生肖
// ============================================================

const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const;
const DI_ZHI   = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const;
const SHENG_XIAO = ['鼠', '牛', '虎', '兔', '龍', '蛇', '馬', '羊', '猴', '雞', '狗', '豬'] as const;

const MONTH_NAMES = [
  '正月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
] as const;

const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
] as const;

// ============================================================
// 內部工具函數
// ============================================================

/**
 * 計算兩個西曆日期之間相差的天數（date2 - date1）。
 * 使用 UTC 避免時區 / 日光節約問題。
 */
function daysBetween(
  y1: number, m1: number, d1: number,
  y2: number, m2: number, d2: number,
): number {
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

/**
 * 取得農曆年的天干地支年名 + 生肖。
 * 天干地支以 1984 年（甲子年）為基準。
 */
function getYearName(lunarYear: number): string {
  // 1984 = 甲子年 (index 0)
  const offset = ((lunarYear - 4) % 60 + 60) % 60;
  const ganIdx = offset % 10;
  const zhiIdx = offset % 12;
  return `${TIAN_GAN[ganIdx]}${DI_ZHI[zhiIdx]}${SHENG_XIAO[zhiIdx]}年`;
}

/**
 * 取得農曆月份名稱。
 */
function getMonthName(month: number, isLeapMonth: boolean): string {
  const base = MONTH_NAMES[month - 1];
  return isLeapMonth ? `閏${base}` : base;
}

/**
 * 取得農曆日名稱。
 */
function getDayName(day: number): string {
  return DAY_NAMES[day - 1];
}

// ============================================================
// 找出西曆日期落在哪個農曆年
// ============================================================

/**
 * 判斷西曆日期屬於哪個農曆年（以春節為界）。
 * 如果日期在該年春節前，則屬於前一個農曆年。
 */
function findLunarYear(year: number, month: number, day: number): number | null {
  // 先假設與西曆同年
  const info = LUNAR_YEAR_INFO[year];
  if (info) {
    const [sm, sd] = info.springFestival;
    // 如果西曆日期 >= 當年春節，則屬於當年農曆年
    if (month > sm || (month === sm && day >= sd)) {
      return year;
    }
  }

  // 否則屬於前一年農曆年
  const prevInfo = LUNAR_YEAR_INFO[year - 1];
  if (prevInfo) {
    return year - 1;
  }

  return null;
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 西曆轉農曆。
 *
 * @param year  西曆年 (2024-2035 範圍內，或跨年末尾延伸至 2036 年初)
 * @param month 西曆月 (1-12)
 * @param day   西曆日 (1-31)
 * @returns 對應的農曆日期，超出查表範圍時回傳 null
 */
export function solarToLunar(year: number, month: number, day: number): LunarDate | null {
  const lunarYear = findLunarYear(year, month, day);
  if (lunarYear === null) return null;

  const info = LUNAR_YEAR_INFO[lunarYear];
  if (!info) return null;

  const [sfMonth, sfDay] = info.springFestival;
  // 計算從春節（正月初一）到目標日期的天數差
  let remainingDays = daysBetween(
    lunarYear, sfMonth, sfDay,
    year, month, day,
  );

  if (remainingDays < 0) return null;

  // 逐月扣除天數，找到目標月份
  const { monthDays, leapMonth } = info;
  let lunarMonth = 1;
  let isLeap = false;
  let monthIndex = 0; // 在 monthDays 陣列中的索引

  for (let i = 0; i < monthDays.length; i++) {
    if (remainingDays < monthDays[i]) {
      monthIndex = i;
      break;
    }
    remainingDays -= monthDays[i];
    monthIndex = i + 1;
  }

  // 如果超出所有月份範圍（落到下一個農曆年）
  if (monthIndex >= monthDays.length) {
    // 嘗試下一個農曆年
    const nextYear = lunarYear + 1;
    const nextInfo = LUNAR_YEAR_INFO[nextYear];
    if (!nextInfo) return null;
    return solarToLunar(year, month, day);
  }

  // 根據 monthIndex 和 leapMonth 計算實際農曆月和是否閏月
  if (leapMonth === 0) {
    // 無閏月：monthIndex 直接對應月份 (0=正月, 1=二月, ...)
    lunarMonth = monthIndex + 1;
    isLeap = false;
  } else {
    // 有閏月：leapMonth 之前的月份正常對應
    // leapMonth 對應的 monthIndex = leapMonth (因為前面有 leapMonth 個正常月)
    // leapMonth 所在的 monthIndex = leapMonth 是閏月
    if (monthIndex < leapMonth) {
      // 還沒到閏月
      lunarMonth = monthIndex + 1;
      isLeap = false;
    } else if (monthIndex === leapMonth) {
      // 正好是閏月
      lunarMonth = leapMonth;
      isLeap = true;
    } else {
      // 閏月之後
      lunarMonth = monthIndex; // monthIndex - 1 + 1
      isLeap = false;
    }
  }

  const lunarDay = remainingDays + 1;

  return {
    year: lunarYear,
    month: lunarMonth,
    day: lunarDay,
    isLeapMonth: isLeap,
    monthName: getMonthName(lunarMonth, isLeap),
    dayName: getDayName(lunarDay),
    yearName: getYearName(lunarYear),
  };
}
