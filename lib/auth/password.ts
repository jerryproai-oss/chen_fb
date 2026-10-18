import argon2 from 'argon2';

/**
 * 使用 argon2id 雜湊密碼。
 *
 * 參數依照 OWASP 建議：
 * - timeCost: 3（迭代次數）
 * - memoryCost: 65536（64 MiB）
 * - parallelism: 1
 *
 * argon2 會自動產生密碼學安全的 salt。
 *
 * @param plain - 明文密碼
 * @returns 雜湊後的密碼字串
 */
export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    timeCost: 3,
    memoryCost: 65536,
    parallelism: 1,
  });
}

/**
 * 驗證明文密碼是否與儲存的雜湊值相符。
 *
 * @param hash - 儲存的 argon2id 雜湊值
 * @param plain - 使用者輸入的明文密碼
 * @returns 密碼是否正確
 */
export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // 雜湊格式不正確等異常一律視為驗證失敗
    return false;
  }
}
