import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel 部署不需要 standalone output
  serverExternalPackages: ["argon2", "@prisma/adapter-pg"],

  // 允許大檔案上傳（影片最大 500MB）
  experimental: {
    middlewareClientMaxBodySize: '500mb',
  },

  // Tesseract.js 需要的 webpack 設定（名片 OCR 辨識）
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        canvas: false,
      };
    }
    return config;
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // 防止 MIME 嗅探
          { key: "X-Content-Type-Options", value: "nosniff" },
          // 防止 clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // 控制 Referer 洩漏
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS — 強制 HTTPS（含子網域，1 年）
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // 限制瀏覽器功能存取
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), payment=()",
          },
          // CSP — 限制資源來源（允許 self + inline styles for Next.js）
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.googleusercontent.com https://lh3.googleusercontent.com https://drive.google.com",
              "font-src 'self'",
              "connect-src 'self' https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://api.open-meteo.com https://nominatim.openstreetmap.org https://www.googleapis.com https://accounts.google.com",
              "media-src 'self' blob: https://*.googleusercontent.com",
              "object-src 'none'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
