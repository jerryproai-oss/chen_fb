import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth, withAdmin } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { extractDriveFileId, downloadFromGoogleDrive, deleteByStoragePath } from '@/lib/google-drive';

type RouteContext = { params: Promise<Record<string, string>> };

// ── GET /api/car/costs/[id]/attachments/[attachmentId] ─────
// 下載附件（從 Google Drive 代理下載）

export const GET = withAuth(async (_ctx, _req: NextRequest, routeCtx: RouteContext) => {
  const { id, attachmentId } = await routeCtx.params;

  try {
    const attachment = await prisma.carCostAttachment.findFirst({
      where: { id: attachmentId, costRecordId: id },
    });

    if (!attachment) {
      return NextResponse.json({ error: '附件不存在' }, { status: 404 });
    }

    const fileId = extractDriveFileId(attachment.storagePath);
    if (!fileId) {
      return NextResponse.json({ error: '無法解析儲存路徑' }, { status: 500 });
    }

    const buffer = await downloadFromGoogleDrive(fileId);

    // 轉換為 Uint8Array 以符合 BodyInit 型別
    const responseBody = new Uint8Array(buffer);

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.filename)}"`,
        'Content-Length': String(responseBody.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[GET /api/car/costs/[id]/attachments/[attachmentId]] 下載失敗:', error);
    return NextResponse.json({ error: '下載附件失敗' }, { status: 500 });
  }
});

// ── DELETE /api/car/costs/[id]/attachments/[attachmentId] (ADMIN)
// 刪除附件

export const DELETE = withAdmin(async ({ user }, _req: NextRequest, routeCtx: RouteContext) => {
  const { id, attachmentId } = await routeCtx.params;

  try {
    const attachment = await prisma.carCostAttachment.findFirst({
      where: { id: attachmentId, costRecordId: id },
    });

    if (!attachment) {
      return NextResponse.json({ error: '附件不存在' }, { status: 404 });
    }

    // 從 Google Drive 刪除
    await deleteByStoragePath(attachment.storagePath);

    // 從資料庫刪除
    await prisma.carCostAttachment.delete({ where: { id: attachmentId } });

    await logAudit({
      actorId: user.id,
      action: AuditActions.MEDIA_DELETE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: attachmentId,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({ success: true, message: '附件已刪除' });
  } catch (error) {
    console.error('[DELETE /api/car/costs/[id]/attachments/[attachmentId]] 刪除失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.MEDIA_DELETE,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: attachmentId,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '刪除附件失敗' }, { status: 500 });
  }
});
