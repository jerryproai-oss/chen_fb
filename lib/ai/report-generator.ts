/**
 * 🤖 AI 用車報表分析
 *
 * 根據用車報表資料生成 AI 分析報告，包含：
 * - 費用摘要
 * - 油耗分析
 * - 費用趨勢觀察
 * - 建議與提醒
 */

// ── 型別定義 ──────────────────────────────────────────────────

export interface CarReportData {
  period: string;              // "2024年11月" 或 "2024年第3季"
  vehicleName: string;         // 車輛名稱
  totalBookings: number;       // 用車次數
  totalCostAmount: number;     // 保修費用
  totalFuelAmount: number;     // 油費
  fuelRecords: { date: string; amount: number; liters: number | null; mileage: number; efficiency: number | null; user: string }[];
  userShares: { name: string; days: number; amount: number }[];
  itemCosts: { item: string; amount: number }[];
  paymentSummary: {
    totalShareCount: number;
    unpaidCount: number;
    paidCount: number;
    confirmedCount: number;
    unpaidAmount: number;
  };
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
      console.log(`[report-generator] 嘗試模型: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(contents);
      const text = result.response.text().trim();
      console.log(`[report-generator] ${modelName} 成功回應 (${text.length} chars)`);
      return text;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[report-generator] ${modelName} 失敗: ${msg}`);
      if (i < MODEL_FALLBACKS.length - 1) continue;
      throw error;
    }
  }
  throw new Error('所有 AI 模型都不可用');
}

// ── 報表生成 ──────────────────────────────────────────────────

/**
 * 生成 AI 用車分析報告
 *
 * @param data - 報表資料
 * @returns Markdown 格式的分析報告
 */
export async function generateCarReport(data: CarReportData): Promise<string> {
  const totalExpense = data.totalCostAmount + data.totalFuelAmount;

  // 組裝油耗資料
  const fuelInfo = data.fuelRecords.length > 0
    ? data.fuelRecords.map((f, i) =>
        `${i + 1}. ${f.date} - ${f.user} - NT$${f.amount.toLocaleString()}` +
        (f.liters ? ` - ${f.liters}L` : '') +
        (f.efficiency ? ` - ${f.efficiency.toFixed(1)} km/L` : '')
      ).join('\n')
    : '無加油記錄';

  // 組裝費用項目
  const itemInfo = data.itemCosts.length > 0
    ? data.itemCosts.map(c => `- ${c.item}: NT$${c.amount.toLocaleString()}`).join('\n')
    : '無費用項目記錄';

  // 組裝使用者分攤
  const userInfo = data.userShares.length > 0
    ? data.userShares.map(u => `- ${u.name}: ${u.days} 天, NT$${u.amount.toLocaleString()}`).join('\n')
    : '無分攤記錄';

  const prompt = `你是一位專業的家庭用車費用顧問。請根據以下用車資料，生成一份簡明扼要的分析報告。

## 報表期間
${data.period}

## 車輛
${data.vehicleName}

## 費用概覽
- 用車次數：${data.totalBookings} 次
- 保修費用：NT$${data.totalCostAmount.toLocaleString()}
- 油費：NT$${data.totalFuelAmount.toLocaleString()}
- 總費用：NT$${totalExpense.toLocaleString()}

## 費用項目分佈
${itemInfo}

## 加油記錄
${fuelInfo}

## 使用者分攤
${userInfo}

## 繳款狀態
- 已確認：${data.paymentSummary.confirmedCount} 筆
- 已繳：${data.paymentSummary.paidCount} 筆
- 待繳：${data.paymentSummary.unpaidCount} 筆（NT$${data.paymentSummary.unpaidAmount.toLocaleString()}）

---

請生成以下格式的分析報告（使用繁體中文台灣用語）：

### 📊 本期費用摘要
簡要總結本期費用狀況。

### ⛽ 油耗分析
分析油耗趨勢和效率（如果有加油記錄的話）。

### 📈 費用觀察
觀察費用分佈和趨勢。

### 💡 建議與提醒
根據資料提供實用建議（如保養提醒、節省建議等）。

注意：
- 使用 Markdown 格式
- 語氣親切但專業
- 如果某部分資料不足，簡單說明即可，不要胡亂推測
- 控制在 300-500 字之間`;

  return generateWithFallback([prompt]);
}
