import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware — 統一路由保護層
 *
 * 1. 未登入使用者存取受保護頁面 → 導向 /login
 * 2. 公開 API 端點允許通過（login、media 等）
 * 3. 受保護 API 端點由各 route handler 的 withAuth/withAdmin 做細部驗證
 *    此 middleware 作為第一道防線，確保 session cookie 存在
 */

/** 不需要認證的路由（完全公開） */
const PUBLIC_PATHS = new Set([
  '/login',
  '/api/auth/login',
]);

/** 路由前綴：不需要認證 */
const PUBLIC_PREFIXES = [
  '/api/media/',        // 媒體檔案（各自有授權邏輯）
  '/api/me/avatar',     // 頭像（有 withAuth）
  '/_next/',            // Next.js 靜態資源
  '/favicon',           // favicon
];

/** Session cookie 名稱（與 lib/auth/session.ts 一致） */
const COOKIE_NAME = 'shiri_session';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 靜態資源和公開檔案直接放行
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg')
  ) {
    return NextResponse.next();
  }

  // 公開路由直接放行
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return NextResponse.next();
    }
  }

  // 檢查 session cookie 是否存在
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (!sessionToken) {
    // API 請求：回傳 401
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: '未登入' },
        { status: 401 },
      );
    }
    // 頁面請求：導向登入頁
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 比對所有路由，排除：
     * - _next/static (靜態檔案)
     * - _next/image (圖片最佳化)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
