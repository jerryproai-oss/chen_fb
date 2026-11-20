import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { recognizeReceipt } from '@/lib/car/ai-analysis';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/car/receipt-ocr
 *
 * 上傳收據/發票圖片，使用 Gemini Vision 辨識內容
 * 支援 multipart/form-data (file) 或 JSON (base64)
 */
export const POST = withAuth(async (_ctx, req: NextRequest) => {
  try {
    let base64Data: string;
    let mimeType = 'image/jpeg';

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // ── multipart/form-data 模式 ────────────────────────
      const formData = await req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: '請上傳圖片檔案' }, { status: 400 });
      }

      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ error: '僅支援圖片格式' }, { status: 400 });
      }

      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: '圖片大小不能超過 10MB' }, { status: 400 });
      }

      mimeType = file.type;
      const buffer = Buffer.from(await file.arrayBuffer());
      base64Data = buffer.toString('base64');
    } else {
      // ── JSON 模式（base64 直傳）────────────────────────
      const body = await req.json();
      if (!body.image || typeof body.image !== 'string') {
        return NextResponse.json({ error: '請提供 image (base64) 欄位' }, { status: 400 });
      }
      base64Data = body.image;
      if (body.mimeType) mimeType = body.mimeType;
    }

    // 檢查 GEMINI_API_KEY
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'AI 辨識功能未啟用（缺少 GEMINI_API_KEY）' },
        { status: 503 },
      );
    }

    // 呼叫 Gemini Vision 辨識
    const result = await recognizeReceipt(base64Data);

    if (!result) {
      return NextResponse.json(
        { error: '無法辨識圖片內容，請確認圖片清晰度' },
        { status: 422 },
      );
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('[POST /api/car/receipt-ocr] 辨識失敗:', error);
    return NextResponse.json({ error: '收據辨識失敗' }, { status: 500 });
  }
});
