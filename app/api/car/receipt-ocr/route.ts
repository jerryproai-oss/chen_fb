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

      console.log(`[receipt-ocr] 收到圖片: ${file.name}, size=${file.size}, type=${mimeType}, base64Length=${base64Data.length}`);
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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[receipt-ocr] GEMINI_API_KEY 未設定');
      return NextResponse.json(
        { error: 'AI 辨識功能未啟用（缺少 GEMINI_API_KEY）' },
        { status: 503 },
      );
    }

    console.log(`[receipt-ocr] 開始 Gemini Vision 辨識, apiKey=${apiKey.substring(0, 8)}...`);

    // 呼叫 Gemini Vision 辨識
    const result = await recognizeReceipt(base64Data, mimeType);

    if (!result) {
      console.error('[receipt-ocr] recognizeReceipt 返回 null');
      return NextResponse.json(
        { error: '辨識失敗，可能是 AI 服務暫時不可用，請稍後再試' },
        { status: 422 },
      );
    }

    console.log(`[receipt-ocr] 辨識成功: vendor=${result.vendor}, amount=${result.totalAmount}, items=${result.items.length}`);

    return NextResponse.json({ result });
  } catch (error) {
    console.error('[POST /api/car/receipt-ocr] 辨識失敗:', error);
    const message = error instanceof Error ? error.message : '收據辨識失敗';
    return NextResponse.json({ error: `收據辨識失敗：${message}` }, { status: 500 });
  }
});
