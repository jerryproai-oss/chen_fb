import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { testGeminiConnection } from '@/lib/car/ai-analysis';

/**
 * GET /api/car/ai-test
 *
 * 測試 Gemini AI 連線狀態
 */
export const GET = withAuth(async () => {
  try {
    const result = await testGeminiConnection();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[ai-test] 測試失敗:', error);
    return NextResponse.json({
      success: false,
      model: null,
      error: error instanceof Error ? error.message : '未知錯誤',
    });
  }
});
