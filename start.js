// start.js — 安全 headers 包裝器（在 standalone server.js 之前載入）
// 攔截 http.createServer 以注入安全 HTTP headers
const http = require('http');
const originalCreateServer = http.createServer;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://api.open-meteo.com https://nominatim.openstreetmap.org",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

http.createServer = function (requestListener) {
  // 包裝 requestListener，在每個請求中注入安全 headers
  const wrappedListener = (req, res) => {
    // 在回應發送前設定安全 headers
    const originalWriteHead = res.writeHead;
    res.writeHead = function (statusCode, ...args) {
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (!res.getHeader(key)) {
          res.setHeader(key, value);
        }
      }
      // 移除 X-Powered-By
      res.removeHeader('X-Powered-By');
      return originalWriteHead.call(this, statusCode, ...args);
    };

    if (requestListener) {
      requestListener(req, res);
    }
  };

  return originalCreateServer.call(this, wrappedListener);
};

// 載入 Next.js standalone server
require('./server.js');
