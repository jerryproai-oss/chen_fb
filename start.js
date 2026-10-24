// start.js — 安全 headers 包裝器（在 standalone server.js 之前載入）
// 攔截 http.createServer 以注入安全 HTTP headers
const http = require('http');
const originalCreateServer = http.createServer;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
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
  ].join('; '),
};

http.createServer = function (...args) {
  const server = originalCreateServer.apply(this, args);
  const originalEmit = server.emit.bind(server);

  server.emit = function (event, req, res, ...rest) {
    if (event === 'request' && res && typeof res.setHeader === 'function') {
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(key, value);
      }
    }
    return originalEmit(event, req, res, ...rest);
  };

  return server;
};

// 載入 Next.js standalone server
require('./server.js');
