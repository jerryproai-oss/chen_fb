/**
 * 🤖 AI 文字輔助服務
 *
 * 提供手札文字潤飾、精簡、擴充、語氣轉換等 AI 輔助功能。
 * 使用 Gemini API，支援多模型 fallback。
 */

// ── 型別定義 ──────────────────────────────────────────────────

export type AITextAction =
  | 'polish'
  | 'simplify'
  | 'expand'
  | 'formal'
  | 'casual'
  | 'generateTitle'
  | 'generateSubtitle';

export interface AITextContext {
  title?: string;
  subtitle?: string;
  body?: string;
}

// ── Gemini Fallback ──────────────────────────────────────────

const MODEL_FALLBACKS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];

async function generateWithFallback(contents: string[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 未設定');

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  for (let i = 0; i < MODEL_FALLBACKS.length; i++) {
    const modelName = MODEL_FALLBACKS[i];
    try {
      console.log(`[text-assistant] 嘗試模型: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(contents);
      const text = result.response.text().trim();
      console.log(`[text-assistant] ${modelName} 成功回應 (${text.length} chars)`);
      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[text-assistant] ${modelName} 失敗: ${msg}`);
      if (i < MODEL_FALLBACKS.length - 1) continue;
      throw error;
    }
  }
  throw new Error('所有 AI 模型都不可用');
}

// ── Prompt 組裝 ──────────────────────────────────────────────

function buildPrompt(text: string, action: AITextAction, context?: AITextContext): string {
  const baseInstruction = '你是一位專業的繁體中文文字編輯。請直接回覆修改後的文字，不要加任何解釋、前綴或引號。保持繁體中文台灣用語。';

  switch (action) {
    case 'polish':
      return `${baseInstruction}\n\n請潤飾以下文字：修正錯字、改善語句通順度、優化標點使用，但保持原本的意思和風格。\n\n原文：\n${text}`;

    case 'simplify':
      return `${baseInstruction}\n\n請精簡以下文字：刪除冗詞贅句，保留核心意思，讓文字更簡潔有力。\n\n原文：\n${text}`;

    case 'expand':
      return `${baseInstruction}\n\n請擴充以下文字：增加細節描述、感受和畫面感，讓內容更豐富生動，但不改變原意。\n\n原文：\n${text}`;

    case 'formal':
      return `${baseInstruction}\n\n請將以下文字改為正式語氣：使用書面語、正式用詞，適合正式場合或報告。\n\n原文：\n${text}`;

    case 'casual':
      return `${baseInstruction}\n\n請將以下文字改為輕鬆口語風格：像跟朋友聊天一樣自然、親切，可以使用日常口語。\n\n原文：\n${text}`;

    case 'generateTitle': {
      const bodyContent = context?.body || text;
      return `${baseInstruction}\n\n請根據以下內容生成一個適合的標題。標題要簡潔有力、吸引人，10-30字為佳。只回覆標題文字。\n\n內容：\n${bodyContent}`;
    }

    case 'generateSubtitle': {
      const titleText = context?.title || '';
      const bodyContent = context?.body || text;
      return `${baseInstruction}\n\n請根據以下標題和內容生成一個適合的副標題。副標題要補充標題，提供更多資訊或引發興趣，15-50字為佳。只回覆副標題文字。\n\n標題：${titleText}\n\n內容：\n${bodyContent}`;
    }

    default:
      throw new Error(`不支援的 AI 動作: ${action}`);
  }
}

// ── 主要函式 ──────────────────────────────────────────────────

/**
 * AI 文字輔助
 *
 * @param text - 要處理的文字
 * @param action - AI 動作類型
 * @param context - 其他欄位內容作為上下文
 * @returns AI 生成/修改後的文字
 */
export async function aiTextAssist(
  text: string,
  action: AITextAction,
  context?: AITextContext,
): Promise<string> {
  const prompt = buildPrompt(text, action, context);
  const result = await generateWithFallback([prompt]);

  // 移除 AI 可能加上的引號或前綴
  return result
    .replace(/^["「『]/, '')
    .replace(/["」』]$/, '')
    .trim();
}
