import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["argon2", "@prisma/adapter-pg"],

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
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // CSP — 限制資源來源（允許 self + inline styles for Next.js）
          {
            key: "Content-Security-Policy",
            value: [
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
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
