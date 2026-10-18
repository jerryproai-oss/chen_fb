import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';

/** UUID v4 格式驗證 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PUT /api/notifications/read
 *
 * 標記通知為已讀。
 * - 無 body 或 ids 為空時：標記所有未讀通知為已讀
 * - body 包含 { ids: string[] } 時：標記指定通知為已讀
 */
export const PUT = withAuth(async ({ user }, req: NextRequest) => {
  let ids: string[] | undefined;

  try {
    const body = await req.json();
    if (body && Array.isArray(body.ids)) {
      ids = body.ids.filter(
        (id: unknown) => typeof id === 'string' && UUID_PATTERN.test(id),
      );
    }
  } catch {
    // 若無 request body 或非 JSON，視為標記全部已讀
  }

  if (ids && ids.length > 0) {
    await prisma.notification.updateMany({
      where: {
        id: { in: ids },
        userId: user.id,
      },
      data: {
        isRead: true,
      },
    });
  } else {
    await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });
  }

  // 稽核
  await logAudit({
    actorId: user.id,
    action: AuditActions.NOTIFICATION_READ,
    resourceType: ResourceTypes.NOTIFICATION,
    outcome: Outcomes.SUCCESS,
  });

  return NextResponse.json({ success: true });
});
