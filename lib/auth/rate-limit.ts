/**
 * 簡易記憶體內速率限制器。
 *
 * 以滑動視窗方式追蹤每個 key（通常為 IP 位址）的嘗試次數。
 * 注意：此實作僅適用於單一程序，多 instance 部署請改用 Redis。
 */

/** 單一嘗試的時間戳記 */
interface AttemptRecord {
  timestamps: number[];
}

/** 速率限制檢查結果 */
export interface RateLimitResult {
  /** 是否允許此次請求 */
  allowed: boolean;
  /** 若被拒絕，需等待的毫秒數 */
  retryAfterMs: number;
}

/** 嘗試紀錄 Map */
const attempts = new Map<string, AttemptRecord>();

/** 清理計時器的間隔（毫秒），每 5 分鐘清理一次 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 定時清理過期的嘗試紀錄，避免記憶體無限成長。
 * 使用 unref() 讓計時器不阻擋程序結束。
 */
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of attempts) {
    // 移除已超過最大可能視窗的條目（使用 15 分鐘作為保守上限）
    record.timestamps = record.timestamps.filter(
      (ts) => now - ts < 15 * 60 * 1000,
    );
    if (record.timestamps.length === 0) {
      attempts.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

// 不阻擋 Node.js 程序正常結束
if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
  cleanupTimer.unref();
}

/**
 * 檢查指定 key 是否仍在速率限制內。
 *
 * @param key - 識別鍵（例如 IP 位址、使用者帳號）
 * @param maxAttempts - 時間視窗內允許的最大嘗試次數
 * @param windowMs - 時間視窗長度（毫秒）
 * @returns 是否允許以及需等待的時間
 *
 * @example
 * ```ts
 * // 每 15 分鐘最多 10 次登入嘗試
 * const result = checkRateLimit(clientIp, 10, 15 * 60 * 1000);
 * if (!result.allowed) {
 *   return new Response('請求過於頻繁', { status: 429 });
 * }
 * ```
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const record = attempts.get(key);

  if (!record) {
    return { allowed: true, retryAfterMs: 0 };
  }

  // 只計算視窗內的嘗試次數
  const recentAttempts = record.timestamps.filter(
    (ts) => now - ts < windowMs,
  );

  if (recentAttempts.length >= maxAttempts) {
    // 最早的一筆嘗試過期後即可重試
    const oldestInWindow = Math.min(...recentAttempts);
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

/**
 * 記錄一次嘗試。
 *
 * 請在 checkRateLimit 通過後、實際執行動作之前呼叫此函數，
 * 或在動作失敗時呼叫（例如登入失敗後才計數）。
 *
 * @param key - 識別鍵
 * @param windowMs - 時間視窗長度（毫秒），用於清理舊條目
 */
export function recordAttempt(key: string, windowMs: number): void {
  const now = Date.now();
  const record = attempts.get(key);

  if (record) {
    // 清除視窗外的舊紀錄以節省記憶體
    record.timestamps = record.timestamps.filter(
      (ts) => now - ts < windowMs,
    );
    record.timestamps.push(now);
  } else {
    attempts.set(key, { timestamps: [now] });
  }
}
