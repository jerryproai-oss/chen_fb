/**
 * 🧮 用車費用分攤計算引擎
 *
 * 支援兩種計算方式：
 * - 雙軌制（DUAL_TRACK）：50% 均分 + 50% 依天數分攤
 * - 均分制（EVEN_SPLIT）：直接均分
 *
 * 父母依項目負擔固定比率（0~100%），剩餘由子女分攤。
 */


// ── 型別定義 ──────────────────────────────────────────────────

export type CalcMethodType = "DUAL_TRACK" | "EVEN_SPLIT";

/** 費用分攤規則 */
export interface CostConfig {
  parentRatio: number;         // 父母負擔比率（0~1）
  calcMethod: CalcMethodType;  // 計算方式
  dualTrackBaseRatio: number;  // 雙軌制均分池佔比（預設 0.5）
}

/** 子女使用天數 */
export interface ChildUsage {
  userId: string;
  displayName: string;
  usageDays: number;
}

/** 分攤結算結果 */
export interface ShareResult {
  userId: string;
  displayName: string;
  usageDays: number;
  amount: number;        // 分攤金額（四捨五入到元）
}

/** 完整計算結果 */
export interface CostCalculationResult {
  totalAmount: number;
  parentAmount: number;
  childrenPool: number;
  shares: ShareResult[];
  auditCheck: boolean;    // 加總是否等於總額
  calcMethod: CalcMethodType;
  parentRatio: number;
  paidById: string;       // 代墊人
}

/** 代墊結算結果 */
export interface SettlementResult {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;         // 應付金額
}

// ── 預設規則 ──────────────────────────────────────────────────

export const DEFAULT_CONFIGS: Record<string, CostConfig> = {
  "一般保養": {
    parentRatio: 0,
    calcMethod: "DUAL_TRACK",
    dualTrackBaseRatio: 0.5,
  },
  "大保養": {
    parentRatio: 0.3,
    calcMethod: "DUAL_TRACK",
    dualTrackBaseRatio: 0.5,
  },
  "牌照稅與燃料稅": {
    parentRatio: 0.3,
    calcMethod: "EVEN_SPLIT",
    dualTrackBaseRatio: 0,
  },
  "強制險與超額險": {
    parentRatio: 0.3,
    calcMethod: "EVEN_SPLIT",
    dualTrackBaseRatio: 0,
  },
};

// ── 核心計算函式 ──────────────────────────────────────────────

/**
 * 計算費用分攤
 *
 * @param totalAmount    費用總額
 * @param config         分攤規則
 * @param children       子女使用天數列表
 * @param parentUserId   父母使用者 ID（用於產生父母的 ShareResult）
 * @param parentDisplayName 父母顯示名稱
 * @param paidById       代墊人 ID
 * @returns 完整計算結果
 */
export function calculateCostShares(
  totalAmount: number,
  config: CostConfig,
  children: ChildUsage[],
  parentUserId: string,
  parentDisplayName: string,
  paidById: string,
): CostCalculationResult {
  if (totalAmount <= 0) {
    throw new Error("費用總額必須大於 0");
  }
  if (children.length === 0) {
    throw new Error("至少需要一位子女");
  }
  if (config.parentRatio < 0 || config.parentRatio > 1) {
    throw new Error("父母負擔比率必須在 0 到 1 之間");
  }

  // 1. 計算父母金額
  const parentAmount = Math.round(totalAmount * config.parentRatio);
  const childrenPool = totalAmount - parentAmount;

  // 2. 依計算方式分攤給子女
  let childShares: number[];

  if (config.calcMethod === "DUAL_TRACK") {
    childShares = calculateDualTrack(
      childrenPool,
      children,
      config.dualTrackBaseRatio,
    );
  } else {
    childShares = calculateEvenSplit(childrenPool, children.length);
  }

  // 3. 尾差修正：差額歸最後一位子女
  const sharesSum = childShares.reduce((sum, v) => sum + v, 0);
  const diff = childrenPool - sharesSum;
  if (diff !== 0 && childShares.length > 0) {
    childShares[childShares.length - 1] += diff;
  }

  // 4. 組裝結果
  const shares: ShareResult[] = [];

  // 父母的分攤（如果有的話）
  if (parentAmount > 0) {
    shares.push({
      userId: parentUserId,
      displayName: parentDisplayName,
      usageDays: 0,
      amount: parentAmount,
    });
  }

  // 子女的分攤
  for (let i = 0; i < children.length; i++) {
    shares.push({
      userId: children[i].userId,
      displayName: children[i].displayName,
      usageDays: children[i].usageDays,
      amount: childShares[i],
    });
  }

  // 5. 審計檢核
  const totalShares = shares.reduce((sum, s) => sum + s.amount, 0);
  const auditCheck = totalShares === totalAmount;

  return {
    totalAmount,
    parentAmount,
    childrenPool,
    shares,
    auditCheck,
    calcMethod: config.calcMethod,
    parentRatio: config.parentRatio,
    paidById,
  };
}

// ── 雙軌天數計費制 ────────────────────────────────────────────

/**
 * 雙軌制：均分池 + 天數池
 *
 * 均分池 = childrenPool × baseRatio → 每人均分
 * 天數池 = childrenPool × (1 - baseRatio) → 依天數分攤
 *
 * 若總天數 = 0 → 退化為純均分
 */
function calculateDualTrack(
  childrenPool: number,
  children: ChildUsage[],
  baseRatio: number,
): number[] {
  const count = children.length;
  const totalDays = children.reduce((sum, c) => sum + c.usageDays, 0);

  // 總天數 = 0 → 退化為純均分
  if (totalDays === 0) {
    return calculateEvenSplit(childrenPool, count);
  }

  const evenPool = childrenPool * baseRatio;
  const daysPool = childrenPool * (1 - baseRatio);

  const evenShare = evenPool / count;

  return children.map((child) => {
    const daysShare = daysPool * (child.usageDays / totalDays);
    return Math.round(evenShare + daysShare);
  });
}

// ── 直接均分制 ────────────────────────────────────────────────

function calculateEvenSplit(pool: number, count: number): number[] {
  const share = Math.round(pool / count);
  return Array.from({ length: count }, () => share);
}

// ── 代墊結算計算 ──────────────────────────────────────────────

/**
 * 計算代墊後的實際金流
 *
 * 範例：老大刷信用卡代墊 $8,000
 *   分攤：老大 $3,200 / 老二 $2,400 / 老三 $2,400
 *   老大已代墊 → 不用再付
 *   老二 → 應付 $2,400 給老大
 *   老三 → 應付 $2,400 給老大
 */
export function calculateSettlements(
  result: CostCalculationResult,
  paidByDisplayName: string,
): SettlementResult[] {
  const settlements: SettlementResult[] = [];

  for (const share of result.shares) {
    // 代墊人自己不用付（已從代墊中扣除）
    if (share.userId === result.paidById) continue;
    // 金額為 0 不需結算
    if (share.amount <= 0) continue;

    settlements.push({
      fromUserId: share.userId,
      fromDisplayName: share.displayName,
      toUserId: result.paidById,
      toDisplayName: paidByDisplayName,
      amount: share.amount,
    });
  }

  return settlements;
}

// ── Decimal 轉換輔助 ─────────────────────────────────────────

/** Prisma Decimal / string / number → number */
export function decimalToNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val);
  // Prisma 7 returns Decimal objects with toNumber()
  if (typeof val === "object" && val !== null && "toNumber" in val) {
    return (val as { toNumber(): number }).toNumber();
  }
  return Number(val);
}
