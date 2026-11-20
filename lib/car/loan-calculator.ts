/**
 * 🏦 車貸計算引擎
 *
 * 支援等額本息（預設）自動產生整期還款計畫表。
 *
 * 公式：
 *   月利率 r = 年利率 / 12 / 100
 *   月付金 M = P × r × (1+r)^n / ((1+r)^n - 1)
 *   每期利息 = 剩餘本金 × r
 *   每期本金 = M - 利息
 */

// ── 型別定義 ──────────────────────────────────────────────────

/** 車貸資訊輸入 */
export interface LoanInput {
  loanAmount: number;        // 實際貸款金額
  interestRate: number;      // 年利率（%，如 2.5 表示 2.5%）
  totalInstallments: number; // 總期數
  startDate: Date;           // 貸款起始日
  paymentDay: number;        // 每月扣款日（1-31）
}

/** 單期還款明細 */
export interface InstallmentDetail {
  installmentNo: number;     // 第幾期
  dueDate: Date;             // 應繳日期
  amount: number;            // 月付金
  principal: number;         // 本金
  interest: number;          // 利息
  remainingBalance: number;  // 剩餘本金
}

/** 還款計畫表 */
export interface AmortizationSchedule {
  loanAmount: number;
  interestRate: number;
  totalInstallments: number;
  monthlyPayment: number;
  totalInterest: number;     // 總利息
  totalPayment: number;      // 總還款金額
  endDate: Date;             // 貸款到期日
  installments: InstallmentDetail[];
}

// ── 核心計算 ──────────────────────────────────────────────────

/**
 * 計算等額本息月付金
 *
 * M = P × r × (1+r)^n / ((1+r)^n - 1)
 *
 * 當利率為 0 時，月付金 = 貸款金額 / 期數
 */
export function calculateMonthlyPayment(
  loanAmount: number,
  annualRate: number,
  totalInstallments: number,
): number {
  if (loanAmount <= 0) throw new Error("貸款金額必須大於 0");
  if (totalInstallments <= 0) throw new Error("總期數必須大於 0");

  // 零利率
  if (annualRate <= 0) {
    return Math.round(loanAmount / totalInstallments);
  }

  const r = annualRate / 100 / 12; // 月利率
  const n = totalInstallments;
  const factor = Math.pow(1 + r, n);

  return Math.round((loanAmount * r * factor) / (factor - 1));
}

/**
 * 產生完整還款計畫表（等額本息）
 */
export function generateAmortizationSchedule(
  input: LoanInput,
): AmortizationSchedule {
  const { loanAmount, interestRate, totalInstallments, startDate, paymentDay } =
    input;

  const monthlyPayment = calculateMonthlyPayment(
    loanAmount,
    interestRate,
    totalInstallments,
  );

  const r = interestRate / 100 / 12; // 月利率
  let remainingBalance = loanAmount;
  const installments: InstallmentDetail[] = [];
  let totalInterest = 0;

  for (let i = 1; i <= totalInstallments; i++) {
    // 計算應繳日期
    const dueDate = calculateDueDate(startDate, i, paymentDay);

    // 計算利息（以剩餘本金計算）
    const interest = r > 0 ? Math.round(remainingBalance * r) : 0;

    // 最後一期特殊處理：本金 = 剩餘本金
    let principal: number;
    let amount: number;

    if (i === totalInstallments) {
      principal = remainingBalance;
      amount = principal + interest;
    } else {
      amount = monthlyPayment;
      principal = amount - interest;
    }

    remainingBalance = Math.max(0, remainingBalance - principal);
    totalInterest += interest;

    installments.push({
      installmentNo: i,
      dueDate,
      amount,
      principal,
      interest,
      remainingBalance,
    });
  }

  const endDate = installments[installments.length - 1].dueDate;
  const totalPayment = loanAmount + totalInterest;

  return {
    loanAmount,
    interestRate,
    totalInstallments,
    monthlyPayment,
    totalInterest,
    totalPayment,
    endDate,
    installments,
  };
}

// ── 車貸摘要 ──────────────────────────────────────────────────

/** 車貸進度摘要 */
export interface LoanProgressSummary {
  totalInstallments: number;
  paidInstallments: number;
  remainingInstallments: number;
  remainingBalance: number;
  progressPercent: number;      // 已繳比例（0~100）
  nextDueDate: Date | null;
  nextAmount: number | null;
  estimatedEndDate: Date;
}

/**
 * 計算車貸進度摘要
 *
 * @param schedule 還款計畫表
 * @param paidCount 已繳期數
 */
export function getLoanProgress(
  schedule: AmortizationSchedule,
  paidCount: number,
): LoanProgressSummary {
  const remaining = schedule.totalInstallments - paidCount;
  const paidInstallment =
    paidCount > 0 ? schedule.installments[paidCount - 1] : null;
  const nextInstallment =
    paidCount < schedule.totalInstallments
      ? schedule.installments[paidCount]
      : null;

  return {
    totalInstallments: schedule.totalInstallments,
    paidInstallments: paidCount,
    remainingInstallments: remaining,
    remainingBalance: paidInstallment
      ? paidInstallment.remainingBalance
      : schedule.loanAmount,
    progressPercent: Math.round(
      (paidCount / schedule.totalInstallments) * 100,
    ),
    nextDueDate: nextInstallment ? nextInstallment.dueDate : null,
    nextAmount: nextInstallment ? nextInstallment.amount : null,
    estimatedEndDate: schedule.endDate,
  };
}

// ── 輔助函式 ──────────────────────────────────────────────────

/**
 * 計算第 N 期的應繳日期
 *
 * 從起始日加 N 個月，扣款日固定。
 * 若扣款日超過該月最大日，取該月最後一天。
 */
function calculateDueDate(
  startDate: Date,
  periodNumber: number,
  paymentDay: number,
): Date {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + periodNumber;

  const targetYear = year + Math.floor(month / 12);
  const targetMonth = month % 12;

  // 取得該月最大天數
  const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
  const day = Math.min(paymentDay, maxDay);

  return new Date(targetYear, targetMonth, day);
}

/**
 * 格式化金額為台幣顯示
 */
export function formatCurrency(amount: number): string {
  return `NT$ ${amount.toLocaleString("zh-TW")}`;
}

/**
 * 格式化日期為 YYYY/MM/DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}
