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
  COMMENT_CREATE: "COMMENT_CREATE",
  COMMENT_DELETE: "COMMENT_DELETE",
  REACTION_SET: "REACTION_SET",
  REACTION_REMOVE: "REACTION_REMOVE",

  // 媒體
  MEDIA_UPLOAD: "MEDIA_UPLOAD",
  MEDIA_DELETE: "MEDIA_DELETE",

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
