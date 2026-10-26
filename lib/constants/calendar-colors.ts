/**
 * 行事曆顏色系統
 *
 * 設計原則：
 * - 24 色調色盤供使用者自選（已被他人選用的不可選）
 * - 用車事件固定色（不隨帳號變化）
 * - 國定假日依類型固定色
 * - 所有顏色皆可在白底上清楚閱讀，並在深色背景配白字
 */

export interface CalendarColor {
  /** 唯一 ID（存入 DB） */
  id: string;
  /** HEX 色碼 */
  hex: string;
  /** 中文名稱 */
  name: string;
}

// ── 24 色使用者調色盤 ────────────────────────────────────────

export const CALENDAR_PALETTE: CalendarColor[] = [
  // 紅色系
  { id: 'tomato',       hex: '#D50000', name: '番茄紅' },
  { id: 'coral',        hex: '#E67C73', name: '珊瑚粉' },
  { id: 'rose',         hex: '#D81B60', name: '玫瑰紅' },

  // 橘黃色系
  { id: 'tangerine',    hex: '#F4511E', name: '橘柑橙' },
  { id: 'pumpkin',      hex: '#EF6C00', name: '南瓜橘' },
  { id: 'mango',        hex: '#F09300', name: '芒果黃' },
  { id: 'banana',       hex: '#F6BF26', name: '香蕉黃' },
  { id: 'amber',        hex: '#E4C441', name: '琥珀金' },

  // 綠色系
  { id: 'apple',        hex: '#7CB342', name: '青蘋果綠' },
  { id: 'sage',         hex: '#33B679', name: '鼠尾草綠' },
  { id: 'basil',        hex: '#0B8043', name: '羅勒綠' },
  { id: 'forest',       hex: '#2E7D32', name: '森林綠' },

  // 藍色系
  { id: 'teal',         hex: '#009688', name: '湖水綠' },
  { id: 'sky',          hex: '#00ACC1', name: '天空藍' },
  { id: 'peacock',      hex: '#039BE5', name: '孔雀藍' },
  { id: 'cornflower',   hex: '#4285F4', name: '矢車菊藍' },

  // 紫色系
  { id: 'blueberry',    hex: '#3F51B5', name: '藍莓紫' },
  { id: 'hyacinth',     hex: '#5C6BC0', name: '風信子紫' },
  { id: 'lavender',     hex: '#7986CB', name: '薰衣草紫' },
  { id: 'grape',        hex: '#8E24AA', name: '葡萄紫' },
  { id: 'magenta',      hex: '#AD1457', name: '洋紅' },

  // 中性色系
  { id: 'cocoa',        hex: '#795548', name: '可可棕' },
  { id: 'graphite',     hex: '#757575', name: '石墨灰' },
  { id: 'slate',        hex: '#546E7A', name: '鐵灰藍' },
];

// ── 固定色：用車事件 ─────────────────────────────────────────

/** 用車事件的固定顏色 — 深藍色，與 24 色調色盤不重疊 */
export const CAR_EVENT_COLOR = '#1565C0';

/** 用車事件的固定顏色名稱 */
export const CAR_EVENT_COLOR_NAME = '用車專用藍';

// ── 固定色：國定假日 ─────────────────────────────────────────

/** 各假日類型的固定顏色 */
export const HOLIDAY_COLORS: Record<string, string> = {
  holiday:       '#C62828',   // 國定假日 — 暗紅
  compensatory:  '#E65100',   // 彈性放假 — 深橘
  memorial:      '#7986CB',   // 紀念日 — 薰衣草藍
  international: '#2E7D32',   // 國際節日 — 深綠
  folk:          '#E67C73',   // 民俗節日 — 珊瑚紅
};

// ── 工具函數 ─────────────────────────────────────────────────

/** 根據 ID 找調色盤顏色 */
export function getColorById(id: string): CalendarColor | undefined {
  return CALENDAR_PALETTE.find(c => c.id === id);
}

/** 根據 hex 找調色盤顏色 */
export function getColorByHex(hex: string): CalendarColor | undefined {
  return CALENDAR_PALETTE.find(c => c.hex.toLowerCase() === hex.toLowerCase());
}

/** 所有調色盤 hex 值的集合（用於驗證） */
export const VALID_PALETTE_HEXES = new Set(CALENDAR_PALETTE.map(c => c.hex));

/** 預設顏色（未選色時的 fallback） */
export const DEFAULT_USER_COLOR = '#5a7a5a';

/**
 * 決定事件在行事曆上的顯示顏色
 *
 * 優先順序：
 * 1. 用車事件 → 固定用車藍
 * 2. 國定假日 → 依假日類型
 * 3. 作者的 calendarColor → 個人色
 * 4. 事件自帶 color → 向下相容
 * 5. 預設色
 */
export function getEventDisplayColor(event: {
  needsCar?: boolean;
  id?: string;
  color?: string | null;
  authorCalendarColor?: string | null;
}): string {
  // 1. 用車事件 → 固定色
  if (event.needsCar) return CAR_EVENT_COLOR;

  // 2. 國定假日（ID 以 holiday_ 開頭）
  if (event.id?.startsWith('holiday_')) {
    return event.color || HOLIDAY_COLORS.holiday;
  }

  // 3. 作者個人色
  if (event.authorCalendarColor) return event.authorCalendarColor;

  // 4. 事件自帶色（向下相容）
  if (event.color) return event.color;

  // 5. 預設色
  return DEFAULT_USER_COLOR;
}
