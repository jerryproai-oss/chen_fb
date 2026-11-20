import { prisma } from "@/lib/db/client";

// ── Audit action constants ────────────────────────────────

export const AuditActions = {
  // 認證相關
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILURE: "LOGIN_FAILURE",
  LOGOUT: "LOGOUT",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",

  // 使用者管理
  USER_CREATE: "USER_CREATE",
  USER_UPDATE: "USER_UPDATE",
  USER_DISABLE: "USER_DISABLE",
  USER_ENABLE: "USER_ENABLE",
  USER_PASSWORD_RESET: "USER_PASSWORD_RESET",

  // Session 管理
  SESSION_REVOKE: "SESSION_REVOKE",
  SESSION_REVOKE_ALL: "SESSION_REVOKE_ALL",

  // 貼文系統
  POST_CREATE: "POST_CREATE",
  POST_UPDATE: "POST_UPDATE",
  POST_DELETE: "POST_DELETE",
  POST_RESTORE: "POST_RESTORE",
  POST_PURGE: "POST_PURGE",
  POST_PIN: "POST_PIN",
  COMMENT_CREATE: "COMMENT_CREATE",
  COMMENT_DELETE: "COMMENT_DELETE",
  REACTION_SET: "REACTION_SET",
  REACTION_REMOVE: "REACTION_REMOVE",

  // 媒體
  MEDIA_UPLOAD: "MEDIA_UPLOAD",
  MEDIA_DELETE: "MEDIA_DELETE",

  // 個人資料
  PROFILE_UPDATE: "PROFILE_UPDATE",

  // 投票
  POLL_VOTE: "POLL_VOTE",
  POLL_CREATE: "POLL_CREATE",

  // 行事曆
  CALENDAR_CREATE: "CALENDAR_CREATE",
  CALENDAR_UPDATE: "CALENDAR_UPDATE",
  CALENDAR_DELETE: "CALENDAR_DELETE",

  // 限時動態
  STORY_CREATE: "STORY_CREATE",
  STORY_DELETE: "STORY_DELETE",

  // 收藏
  BOOKMARK_CREATE: "BOOKMARK_CREATE",
  BOOKMARK_DELETE: "BOOKMARK_DELETE",

  // 標籤
  TAG_CREATE: "TAG_CREATE",

  // Wiki
  WIKI_CREATE: "WIKI_CREATE",
  WIKI_UPDATE: "WIKI_UPDATE",
  WIKI_DELETE: "WIKI_DELETE",

  // 通知
  NOTIFICATION_READ: "NOTIFICATION_READ",

  // 通訊錄
  CONTACT_CREATE: "CONTACT_CREATE",
  CONTACT_UPDATE: "CONTACT_UPDATE",
  CONTACT_DELETE: "CONTACT_DELETE",
  CONTACT_SHARE: "CONTACT_SHARE",
  CONTACT_UNSHARE: "CONTACT_UNSHARE",

  // 用車管理
  CAR_BOOKING_CREATE: "CAR_BOOKING_CREATE",
  CAR_BOOKING_UPDATE: "CAR_BOOKING_UPDATE",
  CAR_BOOKING_CANCEL: "CAR_BOOKING_CANCEL",
  CAR_BOOKING_STATUS: "CAR_BOOKING_STATUS",
  CAR_COST_CREATE: "CAR_COST_CREATE",
  CAR_COST_AMEND: "CAR_COST_AMEND",
  CAR_COST_DELETE: "CAR_COST_DELETE",
  CAR_PAYMENT_MARK: "CAR_PAYMENT_MARK",
  CAR_PAYMENT_CONFIRM: "CAR_PAYMENT_CONFIRM",
  CAR_CONFIG_CREATE: "CAR_CONFIG_CREATE",
  CAR_CONFIG_UPDATE: "CAR_CONFIG_UPDATE",
  CAR_LOAN_CREATE: "CAR_LOAN_CREATE",
  CAR_LOAN_PAYMENT: "CAR_LOAN_PAYMENT",
  CAR_FUEL_CREATE: "CAR_FUEL_CREATE",
  CAR_FUEL_UPDATE: "CAR_FUEL_UPDATE",
  CAR_FUEL_DELETE: "CAR_FUEL_DELETE",
  CAR_VEHICLE_CREATE: "CAR_VEHICLE_CREATE",
  CAR_VEHICLE_UPDATE: "CAR_VEHICLE_UPDATE",
  CAR_MILEAGE_LOG: "CAR_MILEAGE_LOG",

  // 系統
  ADMIN_INIT: "ADMIN_INIT",
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

// ── Resource types ────────────────────────────────────────

export const ResourceTypes = {
  USER: "USER",
  SESSION: "SESSION",
  SYSTEM: "SYSTEM",
  POST: "POST",
  COMMENT: "COMMENT",
  MEDIA: "MEDIA",
  POLL: "POLL",
  CALENDAR: "CALENDAR",
  STORY: "STORY",
  BOOKMARK: "BOOKMARK",
  TAG: "TAG",
  NOTIFICATION: "NOTIFICATION",
  WIKI: "WIKI",
  CONTACT: "CONTACT",
  // 用車管理
  CAR_VEHICLE: "CAR_VEHICLE",
  CAR_BOOKING: "CAR_BOOKING",
  CAR_COST: "CAR_COST",
  CAR_PAYMENT: "CAR_PAYMENT",
  CAR_CONFIG: "CAR_CONFIG",
  CAR_LOAN: "CAR_LOAN",
  CAR_FUEL: "CAR_FUEL",
  CAR_MILEAGE: "CAR_MILEAGE",
} as const;

export type ResourceType =
  (typeof ResourceTypes)[keyof typeof ResourceTypes];

// ── Outcomes ──────────────────────────────────────────────

export const Outcomes = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  DENIED: "DENIED",
} as const;

export type Outcome = (typeof Outcomes)[keyof typeof Outcomes];

// ── logAudit ──────────────────────────────────────────────

export interface AuditEntry {
  actorId?: string | null;
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string | null;
  outcome: Outcome;
  requestId?: string | null;
}

/**
 * 寫入一筆稽核日誌到 audit_events 表。
 * 靜默失敗：稽核寫入失敗不應阻擋主流程，但會 console.error。
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        outcome: entry.outcome,
        requestId: entry.requestId ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] 稽核日誌寫入失敗:", error);
  }
}
