import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/middleware';
import { aiTextAssist, AITextAction } from '@/lib/ai/text-assistant';

const VALID_ACTIONS: AITextAction[] = [
  'polish', 'simplify', 'expand', 'formal', 'casual', 'generateTitle', 'generateSubtitle',
];

export const POST = withAuth(async (_ctx, req: NextRequest) => {
  try {
    const { text, action, context } = await req.json();

    // 驗證 action
    if (!action || !VALID_ACTIONS.includes(action as AITextAction)) {
      return NextResponse.json(
        { error: `無效的動作，可用動作：${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // 除了 generateTitle / generateSubtitle 以外都需要 text
    if (!text && action !== 'generateTitle' && action !== 'generateSubtitle') {
      return NextResponse.json({ error: '請提供文字' }, { status: 400 });
    }

    // 確認 API key
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'AI 功能未啟用' }, { status: 503 });
    }

    const result = await aiTextAssist(text || '', action as AITextAction, context);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('[ai/text-assist] 處理失敗:', error);
    const message = error instanceof Error ? error.message : '處理失敗';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
