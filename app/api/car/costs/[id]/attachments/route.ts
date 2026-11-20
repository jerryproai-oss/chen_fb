import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { withAuth } from '@/lib/auth/middleware';
import { logAudit, AuditActions, ResourceTypes, Outcomes } from '@/lib/audit';
import { uploadToGoogleDrive } from '@/lib/google-drive';

type RouteContext = { params: Promise<Record<string, string>> };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// ── GET /api/car/costs/[id]/attachments ────────────────────
// 列出附件

export const GET = withAuth(async (_ctx, _req: NextRequest, routeCtx: RouteContext) => {
  const { id } = await routeCtx.params;

  try {
    const record = await prisma.carCostRecord.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!record) {
      return NextResponse.json({ error: '費用結算不存在' }, { status: 404 });
    }

    const attachments = await prisma.carCostAttachment.findMany({
      where: { costRecordId: id },
      include: {
        uploader: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      docType: a.docType,
      note: a.note,
      uploaderName: a.uploader.displayName,
      createdAt: a.createdAt.toISOString(),
    }));

    return NextResponse.json({ attachments: formatted });
  } catch (error) {
    console.error('[GET /api/car/costs/[id]/attachments] 查詢失敗:', error);
    return NextResponse.json({ error: '無法取得附件列表' }, { status: 500 });
  }
});

// ── POST /api/car/costs/[id]/attachments ───────────────────
// 上傳附件（使用 Google Drive，存放在 car-docs/年月/）

export const POST = withAuth(async ({ user }, req: NextRequest, routeCtx: RouteContext) => {
  const { id } = await routeCtx.params;

  try {
    const record = await prisma.carCostRecord.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!record) {
      return NextResponse.json({ error: '費用結算不存在' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const docType = (formData.get('docType') as string) || 'OTHER';
    const note = formData.get('note') as string | null;

    if (!file) {
      return NextResponse.json({ error: '請選擇要上傳的檔案' }, { status: 400 });
    }

    // 驗證檔案大小
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '檔案大小不得超過 10 MB' }, { status: 400 });
    }

    // 驗證 MIME 類型
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: '不支援的檔案類型，僅接受圖片、PDF、Word、Excel' },
        { status: 400 },
      );
    }

    // 讀取檔案內容
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 存放在 car-docs/年月/ 子資料夾
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // 產生檔案名稱（避免重複）
    const ext = file.name.split('.').pop() || '';
    const uploadFileName = `car-${id.slice(0, 8)}-${Date.now()}.${ext}`;

    // 上傳到 Google Drive（car-docs 子資料夾路徑）
    const { storagePath } = await uploadToGoogleDrive(
      buffer,
      uploadFileName,
      file.type,
      `car-docs-${year}`,
      month,
    );

    // 儲存附件記錄
    const attachment = await prisma.carCostAttachment.create({
      data: {
        costRecordId: id,
        uploaderId: user.id,
        filename: file.name,
        storagePath,
        mimeType: file.type,
        fileSize: file.size,
        docType: docType as import('@prisma/client').DocType,
        note: note || null,
      },
      include: {
        uploader: { select: { id: true, displayName: true } },
      },
    });

    await logAudit({
      actorId: user.id,
      action: AuditActions.MEDIA_UPLOAD,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: attachment.id,
      outcome: Outcomes.SUCCESS,
    });

    return NextResponse.json({
      attachment: {
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        docType: attachment.docType,
        note: attachment.note,
        uploaderName: attachment.uploader.displayName,
        createdAt: attachment.createdAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/car/costs/[id]/attachments] 上傳失敗:', error);
    await logAudit({
      actorId: user.id,
      action: AuditActions.MEDIA_UPLOAD,
      resourceType: ResourceTypes.CAR_COST,
      resourceId: null,
      outcome: Outcomes.FAILURE,
    });
    return NextResponse.json({ error: '上傳附件失敗' }, { status: 500 });
  }
});
