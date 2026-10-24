import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Middleware — 統一路由保護層 + 安全 Headers
 *
 * 1. 所有回應加上安全 HTTP headers
 * 2. 未登入使用者存取受保護頁面 → 導向 /login
 * 3. 公開 API 端點允許通過（login、media 等）
 * 4. 受保護 API 端點由各 route handler 的 withAuth/withAdmin 做細部驗證
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

/** 安全 HTTP Headers */
const SECURITY_HEADERS: [string, string][] = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'],
  ['Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')],
];

/** 建立帶安全 headers 的 pass-through response */
function secureNext(): NextResponse {
  const response = NextResponse.next();
  for (const [key, value] of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  response.headers.delete('X-Powered-By');
  return response;
}

/** 為直接回應加上安全 headers */
function secureResponse(response: NextResponse): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  response.headers.delete('X-Powered-By');
  return response;
}

/** JSON API body 上限 1MB（upload / avatar 等 multipart 端點排除） */
const MAX_JSON_BODY_BYTES = 1 * 1024 * 1024;

/** 不受 body size 限制的路徑前綴（multipart / 大檔上傳） */
const BODY_SIZE_EXEMPT_PREFIXES = [
  '/api/upload',
  '/api/me/avatar',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 靜態資源和公開檔案直接放行（加上安全 headers）
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg')
  ) {
    return secureNext();
  }

  // 公開路由直接放行
  if (PUBLIC_PATHS.has(pathname)) {
    return secureNext();
  }
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return secureNext();
    }
  }

  // ── API body size 限制（排除 multipart 上傳端點）────
  if (pathname.startsWith('/api/')) {
    const isExempt = BODY_SIZE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
    if (!isExempt) {
      const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_JSON_BODY_BYTES) {
        return secureResponse(
          NextResponse.json({ error: '請求內容過大' }, { status: 413 }),
        );
      }
    }
  }

  // 檢查 session cookie 是否存在
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (!sessionToken) {
    // API 請求：回傳 401
    if (pathname.startsWith('/api/')) {
      return secureResponse(
        NextResponse.json({ error: '未登入' }, { status: 401 }),
      );
    }
    // 頁面請求：導向登入頁
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return secureResponse(NextResponse.redirect(loginUrl));
  }

  return secureNext();
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
