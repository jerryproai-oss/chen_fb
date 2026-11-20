/**
 * 🚗 用車管理模組 — 前端共用型別
 */

// ── 重新導出計算引擎型別 ──────────────────────────────────────

export type {
  CostConfig,
  ChildUsage,
  ShareResult,
  CostCalculationResult,
  SettlementResult,
} from "./cost-calculator";

export type {
  LoanInput,
  InstallmentDetail,
  AmortizationSchedule,
  LoanProgressSummary,
} from "./loan-calculator";

// ── 車輛相關 ──────────────────────────────────────────────────

export interface VehicleInfo {
  id: string;
  name: string;
  brand: string;
  model: string;
  plateNumber: string;
  purchaseDate: string | null;
  warrantyEnd: string | null;
  insuranceEnd: string | null;
  nextMaintenanceDate: string | null;
  nextMaintenanceMileage: number | null;
  currentMileage: number | null;
  color: string | null;
  vin: string | null;
  note: string | null;
  isActive: boolean;
}

// ── 用車預約 ──────────────────────────────────────────────────

export type BookingStatusType =
  | "RESERVED"
  | "OUT"
  | "COMPLETED"
  | "CANCELLED";

export type RecurringTypeValue = "WEEKLY" | "BIWEEKLY" | "MONTHLY";

export interface CarBookingItem {
  id: string;
  vehicleId: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    calendarColor: string | null;
  };
  startDate: string;
  endDate: string;
  applyDays: number;
  purpose: string;
  status: BookingStatusType;
  countedDays: number;
  startMileage: number | null;
  endMileage: number | null;
  tripDistance: number | null;
  isRecurring: boolean;
  recurringType: RecurringTypeValue | null;
  createdAt: string;
}

// ── 費用結算 ──────────────────────────────────────────────────

export type PaymentMethodType =
  | "CASH"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "BANK_TRANSFER"
  | "LINE_PAY"
  | "APPLE_PAY"
  | "OTHER";

export type CostStatusType = "PENDING" | "CONFIRMED";

export type PaymentStatusType = "UNPAID" | "PAID" | "CONFIRMED";

export interface CostRecordItem {
  id: string;
  vehicleId: string;
  settlementDate: string;
  item: string;
  totalAmount: number;
  parentAmount: number;
  paidBy: {
    id: string;
    displayName: string;
  };
  paymentMethod: PaymentMethodType;
  paymentRef: string | null;
  paymentNote: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  status: CostStatusType;
  shares: CostShareItem[];
  attachmentCount: number;
  createdAt: string;
}

export interface CostShareItem {
  id: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  usageDays: number;
  amount: number;
  paymentStatus: PaymentStatusType;
  paidAt: string | null;
  confirmedAt: string | null;
}

// ── 附件 ──────────────────────────────────────────────────────

export type DocTypeValue =
  | "RECEIPT"
  | "WARRANTY"
  | "INSURANCE"
  | "INSPECTION"
  | "LOAN"
  | "OTHER";

export interface AttachmentItem {
  id: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  docType: DocTypeValue;
  note: string | null;
  createdAt: string;
  uploaderName: string;
}

// ── 加油記錄 ──────────────────────────────────────────────────

export type FuelTypeValue = "GASOLINE" | "DIESEL" | "ELECTRIC" | "OTHER";

export interface FuelRecordItem {
  id: string;
  vehicleId: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
  };
  fuelDate: string;
  fuelType: FuelTypeValue;
  amount: number;
  liters: number | null;
  kwh: number | null;
  pricePerUnit: number | null;
  mileage: number;
  station: string | null;
  paymentMethod: PaymentMethodType;
  note: string | null;
  fuelEfficiency: number | null;  // km/L 或 km/kWh
  createdAt: string;
}

// ── 車貸 ──────────────────────────────────────────────────────

export type LoanPaymentStatusType = "UPCOMING" | "PAID" | "OVERDUE";

export interface CarLoanItem {
  id: string;
  vehicleId: string;
  lender: string;
  totalAmount: number;
  downPayment: number;
  loanAmount: number;
  interestRate: number;
  totalInstallments: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string;
  paymentDay: number;
  note: string | null;
  isActive: boolean;
  paidCount: number;
  remainingBalance: number;
}

export interface LoanPaymentItem {
  id: string;
  installmentNo: number;
  dueDate: string;
  amount: number;
  principal: number;
  interest: number;
  remainingBalance: number;
  status: LoanPaymentStatusType;
  paidAt: string | null;
  note: string | null;
}

// ── 里程記錄 ──────────────────────────────────────────────────

export type MileageSourceType =
  | "MANUAL"
  | "BOOKING_START"
  | "BOOKING_END"
  | "FUEL";

export interface MileageLogItem {
  id: string;
  vehicleId: string;
  userId: string;
  user: {
    id: string;
    displayName: string;
  };
  mileage: number;
  source: MileageSourceType;
  note: string | null;
  recordedAt: string;
}

// ── 通知 ──────────────────────────────────────────────────────

export type CarNotificationTypeValue =
  | "BOOKING_NEW"
  | "BOOKING_CONFLICT"
  | "BOOKING_STATUS"
  | "COST_NEW"
  | "COST_PAYMENT_DUE"
  | "COST_PAYMENT_CONFIRMED"
  | "MAINTENANCE_DUE"
  | "INSURANCE_EXPIRING"
  | "LOAN_PAYMENT_DUE"
  | "CONFIG_CHANGED";

export interface CarNotificationItem {
  id: string;
  userId: string;
  type: CarNotificationTypeValue;
  title: string;
  message: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

// ── UI 常數 ──────────────────────────────────────────────────

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodType, string> = {
  CASH: "現金",
  CREDIT_CARD: "信用卡",
  DEBIT_CARD: "簽帳金融卡",
  BANK_TRANSFER: "銀行轉帳",
  LINE_PAY: "LINE Pay",
  APPLE_PAY: "Apple Pay",
  OTHER: "其他",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatusType, string> = {
  RESERVED: "已預約",
  OUT: "已出車",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

export const BOOKING_STATUS_COLOR: Record<BookingStatusType, string> = {
  RESERVED: "#1565C0",
  OUT: "#E65100",
  COMPLETED: "#2E7D32",
  CANCELLED: "#9E9E9E",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatusType, string> = {
  UNPAID: "待繳",
  PAID: "已繳",
  CONFIRMED: "已確認",
};

export const PAYMENT_STATUS_COLOR: Record<PaymentStatusType, string> = {
  UNPAID: "#D32F2F",
  PAID: "#FF8F00",
  CONFIRMED: "#2E7D32",
};

export const FUEL_TYPE_LABEL: Record<FuelTypeValue, string> = {
  GASOLINE: "汽油",
  DIESEL: "柴油",
  ELECTRIC: "電動",
  OTHER: "其他",
};

export const DOC_TYPE_LABEL: Record<DocTypeValue, string> = {
  RECEIPT: "收據",
  WARRANTY: "保修單",
  INSURANCE: "保險單",
  INSPECTION: "檢驗報告",
  LOAN: "貸款文件",
  OTHER: "其他",
};

export const COST_STATUS_LABEL: Record<CostStatusType, string> = {
  PENDING: "待確認",
  CONFIRMED: "已確認",
};

export const LOAN_PAYMENT_STATUS_LABEL: Record<LoanPaymentStatusType, string> = {
  UPCOMING: "即將到期",
  PAID: "已繳",
  OVERDUE: "逾期",
};

export const MILEAGE_SOURCE_LABEL: Record<MileageSourceType, string> = {
  MANUAL: "手動更新",
  BOOKING_START: "出車記錄",
  BOOKING_END: "還車記錄",
  FUEL: "加油記錄",
};
