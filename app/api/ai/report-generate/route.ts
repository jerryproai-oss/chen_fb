import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { generateCarReport, CarReportData } from '@/lib/ai/report-generator';

export const POST = withAuth(async (_ctx, req: NextRequest) => {
  try {
    const data: CarReportData = await req.json();

    // 基本驗證
    if (!data.period || !data.vehicleName) {
      return NextResponse.json(
        { error: '缺少必要欄位：period, vehicleName' },
        { status: 400 },
      );
    }

    // 確認 API key
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'AI 功能未啟用' }, { status: 503 });
    }

    const report = await generateCarReport(data);
    return NextResponse.json({ report });
  } catch (error) {
    console.error('[ai/report-generate] 處理失敗:', error);
    const message = error instanceof Error ? error.message : '報表分析失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
