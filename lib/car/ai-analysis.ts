/**
 * 🤖 AI 分析服務（Gemini API）
 *
 * - analyzeMaintenance: 分析保修合理性
 * - predictNextMaintenance: 預測下次保修
 * - recognizeReceipt: 收據 OCR 辨識
 *
 * AI 功能為加值服務，失敗時回傳 null 而非拋錯。
 */

// ── 型別定義 ──────────────────────────────────────────────────

/** 收據辨識結果 */
export interface ReceiptRecognitionResult {
  date: string | null;
  vendor: string | null;
  totalAmount: number | null;
  items: ReceiptItem[];
  suggestedCategory: string | null;
  confidence: number; // 0~1
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

/** 保修分析結果 */
export interface MaintenanceAnalysis {
  isReasonable: boolean;
  reasoning: string;
  suggestedActions: string[];
  priceAssessment: 'LOW' | 'FAIR' | 'HIGH' | 'UNKNOWN';
  warnings: string[];
}

/** 保修預測結果 */
export interface MaintenancePrediction {
  predictedDate: string | null;
  predictedMileage: number | null;
  maintenanceType: string;
  confidence: number; // 0~1
  reasoning: string;
}

/** 保修記錄（通用輸入格式） */
export interface MaintenanceRecord {
  date: string;
  item: string;
  amount: number;
  mileage?: number | null;
  vendor?: string | null;
  note?: string | null;
}

/** 車輛資訊（預測用） */
export interface VehicleBasicInfo {
  brand: string;
  model: string;
  currentMileage: number | null;
  purchaseDate: string | null;
}

// ── Gemini Client 初始化 ─────────────────────────────────────

async function getGenerativeModel(modelName: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[ai-analysis] GEMINI_API_KEY 未設定，AI 功能停用');
    return null;
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: modelName });
  } catch (error) {
    console.error('[ai-analysis] Gemini 初始化失敗:', error);
    return null;
  }
}

// ── 保修分析 ──────────────────────────────────────────────────

/**
 * 分析保修記錄的合理性
 *
 * @param currentRecord - 本次保修記錄
 * @param previousRecords - 歷史保修記錄
 * @returns 分析結果，或失敗時 null
 */
export async function analyzeMaintenance(
  currentRecord: MaintenanceRecord,
  previousRecords: MaintenanceRecord[],
): Promise<MaintenanceAnalysis | null> {
  try {
    const model = await getGenerativeModel('gemini-2.0-flash');
    if (!model) return null;

    const prompt = `你是一位經驗豐富的汽車保養專家。請分析以下保修記錄的合理性。

## 本次保修
- 日期：${currentRecord.date}
- 項目：${currentRecord.item}
- 金額：NT$ ${currentRecord.amount.toLocaleString()}
${currentRecord.mileage ? `- 里程：${currentRecord.mileage.toLocaleString()} km` : ''}
${currentRecord.vendor ? `- 廠商：${currentRecord.vendor}` : ''}
${currentRecord.note ? `- 備註：${currentRecord.note}` : ''}

## 歷史保修記錄（近 10 筆）
${previousRecords.length > 0
  ? previousRecords.slice(-10).map((r, i) =>
    `${i + 1}. ${r.date} - ${r.item} - NT$ ${r.amount.toLocaleString()}${r.mileage ? ` (${r.mileage.toLocaleString()} km)` : ''}`
  ).join('\n')
  : '無歷史記錄'
}

請以 JSON 格式回覆，包含以下欄位：
{
  "isReasonable": boolean,
  "reasoning": "詳細分析說明",
  "suggestedActions": ["建議行動1", "建議行動2"],
  "priceAssessment": "LOW" | "FAIR" | "HIGH" | "UNKNOWN",
  "warnings": ["警告訊息（如有）"]
}

僅回覆 JSON，不要加其他文字。`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // 嘗試解析 JSON（可能被包在 markdown code block 中）
    const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as MaintenanceAnalysis;

    return {
      isReasonable: Boolean(parsed.isReasonable),
      reasoning: String(parsed.reasoning || ''),
      suggestedActions: Array.isArray(parsed.suggestedActions) ? parsed.suggestedActions : [],
      priceAssessment: ['LOW', 'FAIR', 'HIGH', 'UNKNOWN'].includes(parsed.priceAssessment)
        ? parsed.priceAssessment
        : 'UNKNOWN',
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    };
  } catch (error) {
    console.error('[ai-analysis] 保修分析失敗:', error);
    return null;
  }
}

// ── 保修預測 ──────────────────────────────────────────────────

/**
 * 根據歷史記錄預測下次保修
 *
 * @param records - 歷史保修記錄
 * @param vehicle - 車輛基本資訊
 * @returns 預測結果，或失敗時 null
 */
export async function predictNextMaintenance(
  records: MaintenanceRecord[],
  vehicle: VehicleBasicInfo,
): Promise<MaintenancePrediction | null> {
  try {
    const model = await getGenerativeModel('gemini-2.0-flash');
    if (!model) return null;

    const today = new Date().toISOString().split('T')[0];

    const prompt = `你是一位汽車保養專家。請根據以下車輛資訊和保修歷史，預測下次最需要的保修項目。

## 車輛資訊
- 品牌/型號：${vehicle.brand} ${vehicle.model}
${vehicle.currentMileage ? `- 目前里程：${vehicle.currentMileage.toLocaleString()} km` : ''}
${vehicle.purchaseDate ? `- 購車日期：${vehicle.purchaseDate}` : ''}
- 今天日期：${today}

## 保修歷史（近 20 筆）
${records.length > 0
  ? records.slice(-20).map((r, i) =>
    `${i + 1}. ${r.date} - ${r.item} - NT$ ${r.amount.toLocaleString()}${r.mileage ? ` (${r.mileage.toLocaleString()} km)` : ''}`
  ).join('\n')
  : '無歷史記錄'
}

請以 JSON 格式回覆：
{
  "predictedDate": "YYYY-MM-DD 或 null",
  "predictedMileage": number 或 null,
  "maintenanceType": "預測的保修項目",
  "confidence": 0到1之間的數字,
  "reasoning": "預測依據說明"
}

僅回覆 JSON，不要加其他文字。`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr) as MaintenancePrediction;

    return {
      predictedDate: parsed.predictedDate || null,
      predictedMileage: typeof parsed.predictedMileage === 'number' ? parsed.predictedMileage : null,
      maintenanceType: String(parsed.maintenanceType || '一般保養'),
      confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (error) {
    console.error('[ai-analysis] 保修預測失敗:', error);
    return null;
  }
}

// ── 收據 OCR 辨識 ────────────────────────────────────────────

/**
 * 辨識收據圖片內容
 *
 * @param imageBase64 - Base64 編碼的圖片資料
 * @returns 辨識結果，或失敗時 null
 */
export async function recognizeReceipt(
  imageBase64: string,
  imageMimeType: string = 'image/jpeg',
): Promise<ReceiptRecognitionResult | null> {
  try {
    const model = await getGenerativeModel('gemini-2.0-flash');
    if (!model) return null;

    const prompt = `你是一個收據/發票辨識專家。請分析這張圖片中的收據資訊。

請以 JSON 格式回覆：
{
  "date": "YYYY-MM-DD 或 null",
  "vendor": "商家/廠商名稱 或 null",
  "totalAmount": 總金額數字 或 null,
  "items": [
    {
      "name": "項目名稱",
      "quantity": 數量,
      "unitPrice": 單價,
      "amount": 金額
    }
  ],
  "suggestedCategory": "建議的用車費用類別（如：加油、保養、維修、停車、洗車、保險、稅費、其他）或 null",
  "confidence": 0到1之間的信心度
}

如果看不清楚某些欄位，請設為 null。金額請用數字表示（不含逗號和貨幣符號）。
僅回覆 JSON，不要加其他文字。`;

    // 移除 data:image/...;base64, 前綴（如有）
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: imageMimeType,
          data: base64Data,
        },
      },
    ]);

    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(jsonStr);

    return {
      date: parsed.date || null,
      vendor: parsed.vendor || null,
      totalAmount: typeof parsed.totalAmount === 'number' ? parsed.totalAmount : null,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item: Record<string, unknown>) => ({
            name: String(item.name || ''),
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            amount: Number(item.amount) || 0,
          }))
        : [],
      suggestedCategory: parsed.suggestedCategory || null,
      confidence: typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.5,
    };
  } catch (error) {
    console.error('[ai-analysis] 收據辨識失敗:', error);
    // 將錯誤上拋，讓 API route 可以取得詳細訊息
    throw error;
  }
}
