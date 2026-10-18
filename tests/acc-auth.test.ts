#!/usr/bin/env tsx
/**
 * ACC-01 ~ ACC-06 整合測試
 *
 * 對 Next.js dev server 發出真實 HTTP 請求，驗證認證系統的正向與負向行為。
 * 需要先啟動 dev server 並連接到真實 PostgreSQL。
 *
 * 執行方式:
 *   1. 確保 NAS DB 可連接 (compose up db + port expose)
 *   2. npm run dev
 *   3. npx tsx tests/acc-auth.test.ts
 *
 * 測試會自動建立/清理測試資料。
 */

import { prisma } from '../lib/db/client';
import { hashPassword } from '../lib/auth/password';

// ── 設定 ──────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const COOKIE_NAME = 'shiri_session';

// ── 測試工具 ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
let currentGroup = '';

function group(name: string) {
  currentGroup = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.error(`  ❌ ${message} [${currentGroup}]`);
  }
}

function extractCookie(response: Response): string | null {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const sc of setCookies) {
    if (sc.startsWith(`${COOKIE_NAME}=`)) {
      const value = sc.split(';')[0].split('=').slice(1).join('=');
      return value;
    }
  }
  return null;
}

function extractCookieAttributes(response: Response): Record<string, string> {
  const setCookies = response.headers.getSetCookie?.() ?? [];
  const attrs: Record<string, string> = {};
  for (const sc of setCookies) {
    if (sc.startsWith(`${COOKIE_NAME}=`)) {
      const parts = sc.split(';').map((p) => p.trim());
      for (const part of parts.slice(1)) {
        const [key, val] = part.split('=');
        attrs[key.toLowerCase()] = val ?? 'true';
      }
    }
  }
  return attrs;
}

async function login(
  username: string,
  password: string,
): Promise<{ status: number; body: Record<string, unknown>; cookie: string | null; response: Response }> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  });
  const body = await res.json();
  const cookie = extractCookie(res);
  return { status: res.status, body, cookie, response: res };
}

async function apiGet(
  path: string,
  cookie?: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (cookie) headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, { headers, redirect: 'manual' });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON response
  }
  return { status: res.status, body };
}

async function apiPost(
  path: string,
  data: unknown,
  cookie?: string | null,
): Promise<{ status: number; body: Record<string, unknown>; response: Response }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
    redirect: 'manual',
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON
  }
  return { status: res.status, body, response: res };
}

async function apiPut(
  path: string,
  data: unknown,
  cookie?: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data),
    redirect: 'manual',
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON
  }
  return { status: res.status, body };
}

async function apiPatch(
  path: string,
  data: unknown,
  cookie?: string | null,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = `${COOKIE_NAME}=${cookie}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
    redirect: 'manual',
  });
  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON
  }
  return { status: res.status, body };
}

// ── 測試資料準備 ──────────────────────────────────────────

const TEST_ADMIN = { username: 'test_admin_a', displayName: '測試管理員A', password: 'Admin1234!' };
const TEST_MEMBER_B = { username: 'test_member_b', displayName: '測試成員B', password: 'Member1234!' };
const TEST_MEMBER_C = { username: 'test_member_c', displayName: '測試成員C', password: 'Member5678!' };
const TEST_DISABLED = { username: 'test_disabled_d', displayName: '測試停用D', password: 'Disabled1234!' };

async function setupTestData() {
  console.log('\n🔧 準備測試資料...');

  // 清除舊測試資料（如果有的話）
  await prisma.session.deleteMany({
    where: { user: { usernameNormalized: { startsWith: 'test_' } } },
  });
  await prisma.auditEvent.deleteMany({
    where: { actorId: { not: null } },
  });
  await prisma.user.deleteMany({
    where: { usernameNormalized: { startsWith: 'test_' } },
  });

  // A: 管理員
  await prisma.user.create({
    data: {
      username: TEST_ADMIN.username,
      usernameNormalized: TEST_ADMIN.username.toLowerCase(),
      displayName: TEST_ADMIN.displayName,
      passwordHash: await hashPassword(TEST_ADMIN.password),
      role: 'ADMIN',
      status: 'ACTIVE',
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });

  // B: 一般成員
  await prisma.user.create({
    data: {
      username: TEST_MEMBER_B.username,
      usernameNormalized: TEST_MEMBER_B.username.toLowerCase(),
      displayName: TEST_MEMBER_B.displayName,
      passwordHash: await hashPassword(TEST_MEMBER_B.password),
      role: 'MEMBER',
      status: 'ACTIVE',
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });

  // C: 一般成員
  await prisma.user.create({
    data: {
      username: TEST_MEMBER_C.username,
      usernameNormalized: TEST_MEMBER_C.username.toLowerCase(),
      displayName: TEST_MEMBER_C.displayName,
      passwordHash: await hashPassword(TEST_MEMBER_C.password),
      role: 'MEMBER',
      status: 'ACTIVE',
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });

  // D: 停用帳號
  await prisma.user.create({
    data: {
      username: TEST_DISABLED.username,
      usernameNormalized: TEST_DISABLED.username.toLowerCase(),
      displayName: TEST_DISABLED.displayName,
      passwordHash: await hashPassword(TEST_DISABLED.password),
      role: 'MEMBER',
      status: 'DISABLED',
      mustChangePassword: false,
      passwordVersion: 1,
    },
  });

  console.log('  ✅ 測試資料就緒 (A=admin, B=member, C=member, D=disabled)\n');
}

async function cleanupTestData() {
  console.log('\n🧹 清理測試資料...');
  await prisma.session.deleteMany({
    where: { user: { usernameNormalized: { startsWith: 'test_' } } },
  });
  await prisma.user.deleteMany({
    where: { usernameNormalized: { startsWith: 'test_' } },
  });
  console.log('  ✅ 清理完成');
}

// ── ACC-01: ID 正規化登入 ─────────────────────────────────

async function testACC01() {
  group('ACC-01 ID 正規化登入');

  // 正常登入
  const r1 = await login(TEST_ADMIN.username, TEST_ADMIN.password);
  assert(r1.status === 200, '正常登入成功 (200)');
  assert(r1.cookie !== null && r1.cookie.length > 0, '收到 session cookie');

  // 大寫帳號也能登入
  const r2 = await login('TEST_ADMIN_A', TEST_ADMIN.password);
  assert(r2.status === 200, '大寫帳號正規化後可登入');

  // 混合大小寫
  const r3 = await login('Test_Admin_A', TEST_ADMIN.password);
  assert(r3.status === 200, '混合大小寫帳號正規化後可登入');

  // 前後空白
  const r4 = await login('  test_admin_a  ', TEST_ADMIN.password);
  assert(r4.status === 200, '帳號前後空白 trim 後可登入');

  // 密碼不 trim（密碼前後加空白應該失敗）
  const r5 = await login(TEST_ADMIN.username, `  ${TEST_ADMIN.password}  `);
  assert(r5.status === 401, '密碼不 trim — 前後加空白登入失敗');

  // 密碼大小寫敏感
  const r6 = await login(TEST_ADMIN.username, TEST_ADMIN.password.toUpperCase());
  assert(r6.status === 401, '密碼大小寫敏感 — 全大寫密碼登入失敗');

  // 無 email/SMTP/OAuth 依賴（API 不接受 email 欄位）
  const r7 = await login(TEST_ADMIN.username, TEST_ADMIN.password);
  assert(!('email' in r7.body), '回應不含 email 欄位');
  assert(r7.body.user !== undefined, '回應含 user 物件');
}

// ── ACC-02: 不存在/錯密碼/停用/反覆失敗 ───────────────────

async function testACC02() {
  group('ACC-02 登入失敗情境');

  // 不存在帳號
  const r1 = await login('nonexistent_user_xyz', 'somepassword');
  assert(r1.status === 401, '不存在帳號回 401');
  assert((r1.body.error as string)?.includes('帳號或密碼錯誤'), '不洩露帳號不存在');

  // 錯密碼
  const r2 = await login(TEST_ADMIN.username, 'wrongpassword123');
  assert(r2.status === 401, '錯誤密碼回 401');
  assert((r2.body.error as string)?.includes('帳號或密碼錯誤'), '錯密碼也顯示相同錯誤訊息');

  // 確認不存在和錯密碼的錯誤訊息相同（不洩露存在與否）
  assert(r1.body.error === r2.body.error, '不存在帳號與錯密碼的錯誤訊息完全相同');

  // 停用帳號
  const r3 = await login(TEST_DISABLED.username, TEST_DISABLED.password);
  assert(r3.status === 401, '停用帳號回 401');
  assert((r3.body.error as string)?.includes('帳號或密碼錯誤'), '停用帳號也顯示相同錯誤（不洩漏帳號狀態）');

  // 空帳號/密碼
  const r4 = await login('', TEST_ADMIN.password);
  assert(r4.status === 400, '空帳號回 400');

  const r5 = await login(TEST_ADMIN.username, '');
  assert(r5.status === 400, '空密碼回 400');

  // 超長帳號
  const r6 = await login('a'.repeat(31), TEST_ADMIN.password);
  assert(r6.status === 400, '超長帳號 (31字) 回 400');

  // 超長密碼
  const r7 = await login(TEST_ADMIN.username, 'a'.repeat(129));
  assert(r7.status === 400, '超長密碼 (129字) 回 400');
}

// ── ACC-02 補充: Rate limit（放最後執行避免汙染其他測試）──

async function testACC02_RateLimit() {
  group('ACC-02 補充: Rate Limit');

  // 反覆失敗觸發 rate limit（注意：rate limit 是 per IP）
  // 使用獨特的帳號名稱以確保只計算這裡的嘗試
  console.log('  ⏳ 測試 rate limit（連續 10 次錯誤登入）...');
  for (let i = 0; i < 10; i++) {
    await login('rate_limit_final_test', 'wrongpassword');
  }
  const r8 = await login('rate_limit_final_test', 'wrongpassword');
  assert(r8.status === 429, 'Rate limit 觸發後回 429');
  assert(
    (r8.body.error as string)?.includes('稍後再試'),
    'Rate limit 錯誤訊息提示稍後再試',
  );
}

// ── ACC-03: 臨時密碼 & 改密碼 ────────────────────────────

async function testACC03() {
  group('ACC-03 臨時密碼與改密碼');

  // 先以 admin 登入取得 cookie
  const adminLogin = await login(TEST_ADMIN.username, TEST_ADMIN.password);
  const adminCookie = adminLogin.cookie;
  assert(adminCookie !== null, 'Admin 登入取得 cookie');

  if (!adminCookie) {
    console.error('  ⚠️ Admin 登入失敗，跳過 ACC-03 剩餘測試（可能因 rate limit）');
    return;
  }

  // 用 admin 建立臨時密碼使用者
  const tempPassword = 'TempPass123!';
  const createRes = await apiPost(
    '/api/admin/users',
    { username: 'test_temp_user', displayName: '臨時使用者', temporaryPassword: tempPassword },
    adminCookie,
  );
  assert(createRes.status === 201, '建立臨時密碼使用者成功 (201)');
  const tempUserId = (createRes.body.user as Record<string, unknown>)?.id as string;
  assert(!!tempUserId, '取得臨時使用者 ID');

  // 臨時密碼使用者登入
  const tempLogin = await login('test_temp_user', tempPassword);
  assert(tempLogin.status === 200, '臨時密碼使用者可登入');
  assert(tempLogin.body.requirePasswordChange === true, '回傳 requirePasswordChange=true');
  const tempCookie = tempLogin.cookie;

  // 臨時密碼使用者改密碼
  const newPassword = 'NewSecure123!';
  const changePwd = await apiPut(
    '/api/me/password',
    { currentPassword: tempPassword, newPassword },
    tempCookie,
  );
  assert(changePwd.status === 200, '改密碼成功 (200)');

  // 舊 session（tempCookie）應該仍然有效（保留當前 session）
  const meAfterChange = await apiGet('/api/me', tempCookie);
  assert(meAfterChange.status === 200, '改密碼後目前 session 仍有效');

  // 用新密碼登入
  const newLogin = await login('test_temp_user', newPassword);
  assert(newLogin.status === 200, '新密碼可以登入');
  assert(newLogin.body.requirePasswordChange !== true, '不再需要改密碼');

  // 舊密碼不能登入
  const oldLogin = await login('test_temp_user', tempPassword);
  assert(oldLogin.status === 401, '舊密碼無法登入');

  // 測試臨時密碼過期
  // 直接修改 DB 設定過期時間為過去
  await prisma.user.update({
    where: { usernameNormalized: 'test_temp_user' },
    data: {
      temporaryPasswordExpiresAt: new Date(Date.now() - 3600000), // 1 小時前
      mustChangePassword: true,
      passwordHash: await hashPassword('ExpiredTemp1!'),
      passwordVersion: { increment: 1 },
    },
  });

  const expiredLogin = await login('test_temp_user', 'ExpiredTemp1!');
  assert(expiredLogin.status === 401, '過期臨時密碼無法登入');
  assert(
    (expiredLogin.body.error as string)?.includes('過期'),
    '過期訊息提示聯絡管理員',
  );

  // 清理臨時使用者
  await prisma.session.deleteMany({ where: { user: { usernameNormalized: 'test_temp_user' } } });
  await prisma.user.deleteMany({ where: { usernameNormalized: 'test_temp_user' } });
}

// ── ACC-04: 管理員停用/重設 ──────────────────────────────

async function testACC04() {
  group('ACC-04 管理員停用/重設');

  const adminLogin = await login(TEST_ADMIN.username, TEST_ADMIN.password);
  const adminCookie = adminLogin.cookie;
  assert(adminCookie !== null, 'Admin 登入取得 cookie');
  if (!adminCookie) {
    console.error('  ⚠️ Admin 登入失敗，跳過 ACC-04');
    return;
  }

  // 取得成員 B 的 ID
  const usersRes = await apiGet('/api/admin/users', adminCookie);
  assert(usersRes.status === 200, '列出所有使用者成功');
  const users = usersRes.body.users as Array<Record<string, unknown>>;
  const memberB = users.find((u) => u.username === TEST_MEMBER_B.username);
  assert(!!memberB, '找到成員 B');
  const memberBId = memberB!.id as string;

  // 成員 B 先登入取得 session
  const bLogin = await login(TEST_MEMBER_B.username, TEST_MEMBER_B.password);
  assert(bLogin.status === 200, '成員 B 登入成功');
  const bCookie = bLogin.cookie!;

  // B 的 session 有效
  const bMe1 = await apiGet('/api/me', bCookie);
  assert(bMe1.status === 200, '成員 B 的 session 有效');

  // Admin 停用 B
  const disableRes = await apiPatch(`/api/admin/users/${memberBId}`, { status: 'DISABLED' }, adminCookie);
  assert(disableRes.status === 200, 'Admin 停用成員 B 成功');

  // B 的舊 session 應立即失效
  const bMe2 = await apiGet('/api/me', bCookie);
  assert(bMe2.status === 401, '停用後 B 的舊 session 立即失效');

  // B 嘗試登入失敗
  const bLoginAfter = await login(TEST_MEMBER_B.username, TEST_MEMBER_B.password);
  assert(bLoginAfter.status === 401, '停用後 B 無法登入');

  // Admin 重新啟用 B
  await apiPatch(`/api/admin/users/${memberBId}`, { status: 'ACTIVE' }, adminCookie);

  // B 可以再登入
  const bLoginReactivated = await login(TEST_MEMBER_B.username, TEST_MEMBER_B.password);
  assert(bLoginReactivated.status === 200, '重新啟用後 B 可登入');

  // Admin 重設 B 的密碼
  const resetRes = await apiPost(
    `/api/admin/users/${memberBId}/reset-password`,
    { temporaryPassword: 'ResetPass123!' },
    adminCookie,
  );
  assert(resetRes.status === 200, 'Admin 重設 B 的密碼成功');

  // B 的舊 session 應失效
  const bMe3 = await apiGet('/api/me', bLoginReactivated.cookie);
  assert(bMe3.status === 401, '重設密碼後 B 的舊 session 失效');

  // B 用新密碼登入
  const bNewLogin = await login(TEST_MEMBER_B.username, 'ResetPass123!');
  assert(bNewLogin.status === 200, 'B 用重設後的密碼可登入');
  assert(bNewLogin.body.requirePasswordChange === true, '重設後需要改密碼');

  // Admin 不能停用自己
  const adminUser = users.find((u) => u.username === TEST_ADMIN.username);
  const adminId = adminUser!.id as string;
  const selfDisable = await apiPatch(`/api/admin/users/${adminId}`, { status: 'DISABLED' }, adminCookie);
  assert(selfDisable.status === 403 || selfDisable.status === 400, 'Admin 不能停用自己');

  // 還原 B 的密碼
  await prisma.user.update({
    where: { usernameNormalized: TEST_MEMBER_B.username.toLowerCase() },
    data: {
      passwordHash: await hashPassword(TEST_MEMBER_B.password),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      passwordVersion: { increment: 1 },
    },
  });
}

// ── ACC-05: 登出、Session 到期、Cookie 屬性 ──────────────

async function testACC05() {
  group('ACC-05 登出/Session/Cookie');

  // 登入取得 cookie
  const r1 = await login(TEST_ADMIN.username, TEST_ADMIN.password);
  const cookie = r1.cookie!;
  assert(cookie.length > 0, '登入取得 session cookie');

  // Cookie 屬性檢查
  const attrs = extractCookieAttributes(r1.response);
  assert(attrs['httponly'] !== undefined, 'Cookie 有 HttpOnly 屬性');
  assert(attrs['samesite']?.toLowerCase() === 'lax', 'Cookie SameSite=Lax');
  assert(attrs['path'] === '/', 'Cookie Path=/');

  // Session 有效
  const me1 = await apiGet('/api/me', cookie);
  assert(me1.status === 200, '登入後 session 有效');

  // 登出
  const logout = await apiPost('/api/auth/logout', {}, cookie);
  assert(logout.status === 200, '登出成功 (200)');

  // 登出後的 cookie 被清除
  const logoutCookieValue = extractCookie(logout.response);
  assert(logoutCookieValue === '' || logoutCookieValue === null, '登出後 cookie 被清除');

  // 舊 session 不可重用
  const me2 = await apiGet('/api/me', cookie);
  assert(me2.status === 401, '登出後舊 session 不可重用');

  // 未登入登出也回 200（不洩露）
  const logoutNoSession = await apiPost('/api/auth/logout', {});
  assert(logoutNoSession.status === 200, '未登入狀態登出也回 200');

  // 偽造 cookie 無法通過驗證
  const fakeMe = await apiGet('/api/me', 'fake-session-token-12345');
  assert(fakeMe.status === 401, '偽造 cookie 無法通過驗證');

  // Session 到期（修改 DB 使 session 過期）
  const r2 = await login(TEST_MEMBER_C.username, TEST_MEMBER_C.password);
  const cCookie = r2.cookie!;

  // 確認有效
  const me3 = await apiGet('/api/me', cCookie);
  assert(me3.status === 200, 'C 登入後 session 有效');

  // 手動使 session 過期
  await prisma.session.updateMany({
    where: { user: { usernameNormalized: TEST_MEMBER_C.username.toLowerCase() } },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const me4 = await apiGet('/api/me', cCookie);
  assert(me4.status === 401, 'Session 到期後拒絕存取');
}

// ── ACC-06: 未登入直接存取 API ───────────────────────────

async function testACC06() {
  group('ACC-06 未登入存取 API');

  // GET /api/me
  const r1 = await apiGet('/api/me');
  assert(r1.status === 401, 'GET /api/me 未登入回 401');
  assert(!r1.body.user, 'GET /api/me 不洩露使用者資料');

  // PUT /api/me/password
  const r2 = await apiPut('/api/me/password', {
    currentPassword: 'test',
    newPassword: 'newtest123',
  });
  assert(r2.status === 401, 'PUT /api/me/password 未登入回 401');

  // GET /api/admin/users
  const r3 = await apiGet('/api/admin/users');
  assert(r3.status === 401, 'GET /api/admin/users 未登入回 401');
  assert(!r3.body.users, '不洩露使用者列表');

  // POST /api/admin/users
  const r4 = await apiPost('/api/admin/users', {
    username: 'hacker',
    displayName: 'Hacker',
    temporaryPassword: 'hack1234!',
  });
  assert(r4.status === 401, 'POST /api/admin/users 未登入回 401');

  // GET /api/admin/users/<uuid>
  const r5 = await apiGet('/api/admin/users/00000000-0000-0000-0000-000000000000');
  assert(r5.status === 401, 'GET /api/admin/users/:id 未登入回 401');

  // PATCH /api/admin/users/<uuid>
  const r6 = await apiPatch(
    '/api/admin/users/00000000-0000-0000-0000-000000000000',
    { status: 'DISABLED' },
  );
  assert(r6.status === 401, 'PATCH /api/admin/users/:id 未登入回 401');

  // POST /api/admin/users/<uuid>/reset-password
  const r7 = await apiPost(
    '/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password',
    { temporaryPassword: 'hack1234!' },
  );
  assert(r7.status === 401, 'POST reset-password 未登入回 401');

  // POST /api/auth/logout (已測過，未登入也回 200)
  const r8 = await apiPost('/api/auth/logout', {});
  assert(r8.status === 200, 'POST /api/auth/logout 未登入回 200（不洩露）');

  // 一般成員不能存取管理員 API
  const memberLogin = await login(TEST_MEMBER_C.username, TEST_MEMBER_C.password);
  const memberCookie = memberLogin.cookie!;

  const r9 = await apiGet('/api/admin/users', memberCookie);
  assert(r9.status === 403, '一般成員存取 admin API 回 403');

  const r10 = await apiPost(
    '/api/admin/users',
    { username: 'hacker2', displayName: 'Hacker', temporaryPassword: 'hack1234!' },
    memberCookie,
  );
  assert(r10.status === 403, '一般成員建立使用者回 403');
}

// ── 執行所有測試 ──────────────────────────────────────────

async function main() {
  console.log('\n🧪 拾日 — ACC-01~06 認證整合測試');
  console.log(`   目標: ${BASE_URL}`);
  console.log(`   時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);

  try {
    // 先確認 server 可連線
    const healthCheck = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'health', password: 'check' }),
    }).catch(() => null);

    if (!healthCheck) {
      console.error('\n❌ 無法連線到 dev server，請先執行 npm run dev');
      process.exit(1);
    }

    await setupTestData();

    await testACC01();
    await testACC02();
    await testACC03();
    await testACC04();
    await testACC05();
    await testACC06();
    await testACC02_RateLimit(); // 放最後，避免 rate limit 汙染其他測試

  } finally {
    await cleanupTestData();
    await prisma.$disconnect();
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  結果: ${passed} 通過 / ${failed} 失敗 / ${passed + failed} 總計`);
  console.log(`${'═'.repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ 測試執行失敗:', err);
  process.exit(1);
});
