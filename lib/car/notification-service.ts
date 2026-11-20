/**
 * 🔔 用車通知服務
 *
 * 建立 CarNotification 並預留 email 擴充接口。
 */

import { prisma } from '@/lib/db/client';
import type { CarNotificationType } from '@prisma/client';

// ── 型別 ──────────────────────────────────────────────────────

export interface NotificationPayload {
  userId: string;
  type: CarNotificationType;
  title: string;
  message: string;
  relatedId?: string | null;
}

export interface NotificationResult {
  id: string;
  userId: string;
  type: CarNotificationType;
  title: string;
  message: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: Date;
}

// ── Email 擴充接口（預留）──────────────────────────────────────

/**
 * 未來可實作 email 通知。
 * 目前為 no-op，待整合 email provider 後啟用。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function sendEmailNotification(_payload: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  // TODO: 整合 email provider (e.g. Resend, SendGrid)
  // await emailClient.send({ ... });
}

// ── 核心函式 ──────────────────────────────────────────────────

/**
 * 建立一則用車通知
 */
export async function createCarNotification(
  userId: string,
  type: CarNotificationType,
  title: string,
  message: string,
  relatedId?: string | null,
): Promise<NotificationResult> {
  const notification = await prisma.carNotification.create({
    data: {
      userId,
      type,
      title,
      message,
      relatedId: relatedId ?? null,
    },
  });

  return notification;
}

/**
 * 通知全家人（所有 ACTIVE 使用者）
 */
export async function notifyAllFamilyMembers(
  type: CarNotificationType,
  title: string,
  message: string,
  relatedId?: string | null,
): Promise<NotificationResult[]> {
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  const results: NotificationResult[] = [];

  for (const user of users) {
    const notification = await createCarNotification(
      user.id,
      type,
      title,
      message,
      relatedId,
    );
    results.push(notification);
  }

  return results;
}

/**
 * 通知特定使用者
 */
export async function notifyUser(
  userId: string,
  type: CarNotificationType,
  title: string,
  message: string,
  relatedId?: string | null,
): Promise<NotificationResult> {
  return createCarNotification(userId, type, title, message, relatedId);
}
