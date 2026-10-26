/**
 * 農曆（農民曆）工具
 *
 * 使用 lunar-typescript 套件，提供完整的農民曆功能：
 * - 西曆 ⇔ 農曆轉換
 * - 天干地支、生肖、星座
 * - 宜忌、沖煞、節氣、時辰
 * - 彭祖百忌、建除十二值星、吉神凶煞、方位
 *
 * 向下相容：solarToLunar / lunarToSolar 介面不變
 */

import { Solar, Lunar } from 'lunar-typescript';

// ============================================================
// 型別定義
// ============================================================

/** 基本農曆日期（向下相容） */
export interface LunarDate {
  year: number;          // 農曆年
  month: number;         // 農曆月 (1-12)
  day: number;           // 農曆日 (1-30)
  isLeapMonth: boolean;  // 是否閏月
  monthName: string;     // 「正月」「二月」...「閏x月」
  dayName: string;       // 「初一」「初二」...「三十」
  yearName: string;      // 天干地支年名 + 生肖，如「丙午馬年」
}

/** 農民曆日資訊（擴充功能） */
export interface DayInfo {
  // 基本農曆
  lunar: LunarDate;

  // 天干地支
  yearGanZhi: string;    // 年干支，如「丙午」
  monthGanZhi: string;   // 月干支
  dayGanZhi: string;     // 日干支

  // 生肖 + 星座
  shengXiao: string;     // 生肖，如「馬」
  xingZuo: string;       // 星座，如「天蠍」

  // 節氣
  jieQi: string;         // 當日節氣（無則空字串）
  nextJieQi: string;     // 下一個節氣名稱
  nextJieQiDate: string; // 下一個節氣日期（YYYY-MM-DD）

  // 宜忌
  yi: string[];          // 宜（適合做的事）
  ji: string[];          // 忌（不適合做的事）

  // 沖煞
  chong: string;         // 沖（如「牛」）
  sha: string;           // 煞（如「西」）
  chongDesc: string;     // 沖煞描述（如「沖牛煞西」）

  // 建除十二值星
  zhiXing: string;       // 如「建」「除」「滿」等

  // 彭祖百忌
  pengZu: string;        // 彭祖百忌（合併天干+地支）

  // 方位
  xiShen: string;        // 喜神方位
  caiShen: string;       // 財神方位
  fuShen: string;        // 福神方位

  // 吉神凶煞
  jiShen: string[];      // 吉神宜趨
  xiongSha: string[];    // 凶煞宜忌

  // 農曆節日
  festivals: string[];   // 農曆傳統節日
  solarFestivals: string[]; // 西曆節日

  // 五行 / 納音
  naYin: string;         // 日柱納音
}

// ============================================================
// 向下相容：solarToLunar
// ============================================================

/**
 * 西曆轉農曆（向下相容介面）
 */
export function solarToLunar(year: number, month: number, day: number): LunarDate | null {
  try {
    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();

    return {
      year: lunar.getYear(),
      month: Math.abs(lunar.getMonth()),
      day: lunar.getDay(),
      isLeapMonth: lunar.getMonth() < 0,
      monthName: lunar.getMonthInChinese() + '月',
      dayName: lunar.getDayInChinese(),
      yearName: `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年`,
    };
  } catch {
    return null;
  }
}

// ============================================================
// 向下相容：lunarToSolar
// ============================================================

/**
 * 農曆轉西曆
 */
export function lunarToSolar(
  lunarYear: number,
  lunarMonth: number,
  lunarDay: number,
  isLeapMonth = false,
): { year: number; month: number; day: number } | null {
  try {
    const month = isLeapMonth ? -lunarMonth : lunarMonth;
    const lunar = Lunar.fromYmd(lunarYear, month, lunarDay);
    const solar = lunar.getSolar();
    return {
      year: solar.getYear(),
      month: solar.getMonth(),
      day: solar.getDay(),
    };
  } catch {
    return null;
  }
}

// ============================================================
// 向下相容：getSpringFestival
// ============================================================

/**
 * 取得農曆年的春節（正月初一）西曆日期
 */
export function getSpringFestival(lunarYear: number): { month: number; day: number } | null {
  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    const solar = lunar.getSolar();
    return { month: solar.getMonth(), day: solar.getDay() };
  } catch {
    return null;
  }
}

// ============================================================
// 新增 API：getDayInfo — 完整農民曆日資訊
// ============================================================

/**
 * 取得指定日期的完整農民曆資訊
 */
export function getDayInfo(year: number, month: number, day: number): DayInfo | null {
  try {
    const solar = Solar.fromYmd(year, month, day);
    const lunar = solar.getLunar();

    // 節氣
    const jieQi = lunar.getJieQi() || '';

    // 下一個節氣
    let nextJieQi = '';
    let nextJieQiDate = '';
    const jqList = lunar.getJieQiTable();
    const todayMs = Date.UTC(year, month - 1, day);
    let nearestFutureMs = Infinity;
    for (const name of Object.keys(jqList)) {
      const s = jqList[name];
      const ms = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay());
      if (ms > todayMs && ms < nearestFutureMs) {
        nearestFutureMs = ms;
        nextJieQi = name;
        nextJieQiDate = `${s.getYear()}-${String(s.getMonth()).padStart(2, '0')}-${String(s.getDay()).padStart(2, '0')}`;
      }
    }

    // 農曆節日
    const festivals = lunar.getFestivals() || [];
    const solarFestivals = solar.getFestivals() || [];

    // 吉神 / 凶煞
    let jiShen: string[] = [];
    let xiongSha: string[] = [];
    try {
      jiShen = lunar.getDayJiShen() || [];
      xiongSha = lunar.getDayXiongSha() || [];
    } catch {
      // 部分日期可能沒有吉神凶煞資料
    }

    const lunarDate: LunarDate = {
      year: lunar.getYear(),
      month: Math.abs(lunar.getMonth()),
      day: lunar.getDay(),
      isLeapMonth: lunar.getMonth() < 0,
      monthName: lunar.getMonthInChinese() + '月',
      dayName: lunar.getDayInChinese(),
      yearName: `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年`,
    };

    return {
      lunar: lunarDate,
      yearGanZhi: lunar.getYearInGanZhi(),
      monthGanZhi: lunar.getMonthInGanZhi(),
      dayGanZhi: lunar.getDayInGanZhi(),
      shengXiao: lunar.getYearShengXiao(),
      xingZuo: solar.getXingZuo() + '座',
      jieQi,
      nextJieQi,
      nextJieQiDate,
      yi: lunar.getDayYi() || [],
      ji: lunar.getDayJi() || [],
      chong: lunar.getDayChong() || '',
      sha: lunar.getDaySha() || '',
      chongDesc: `沖${lunar.getDayChongDesc() || ''}煞${lunar.getDaySha() || ''}`,
      zhiXing: lunar.getZhiXing() || '',
      pengZu: `${lunar.getPengZuGan() || ''} ${lunar.getPengZuZhi() || ''}`.trim(),
      xiShen: lunar.getDayPositionXiDesc() || '',
      caiShen: lunar.getDayPositionCaiDesc() || '',
      fuShen: lunar.getDayPositionFuDesc() || '',
      jiShen,
      xiongSha,
      festivals: Array.isArray(festivals) ? festivals : [],
      solarFestivals: Array.isArray(solarFestivals) ? solarFestivals : [],
      naYin: lunar.getDayNaYin() || '',
    };
  } catch {
    return null;
  }
}

// ============================================================
// 輔助 API
// ============================================================

/**
 * 取得指定月份的所有節氣
 */
export function getMonthJieQi(year: number, month: number): { name: string; day: number }[] {
  try {
    const result: { name: string; day: number }[] = [];
    const solar = Solar.fromYmd(year, month, 1);
    const lunar = solar.getLunar();
    const jqTable = lunar.getJieQiTable();

    for (const name of Object.keys(jqTable)) {
      const s = jqTable[name];
      if (s.getYear() === year && s.getMonth() === month) {
        result.push({ name, day: s.getDay() });
      }
    }

    return result.sort((a, b) => a.day - b.day);
  } catch {
    return [];
  }
}

/**
 * 根據出生年月日計算星座
 */
export function getXingZuo(month: number, day: number): string {
  try {
    const solar = Solar.fromYmd(2000, month, day);
    return solar.getXingZuo() + '座';
  } catch {
    return '';
  }
}

/**
 * 根據農曆年計算生肖
 */
export function getShengXiao(lunarYear: number): string {
  try {
    const lunar = Lunar.fromYmd(lunarYear, 1, 1);
    return lunar.getYearShengXiao();
  } catch {
    return '';
  }
}
