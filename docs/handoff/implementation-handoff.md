# 設計開發交接狀態

交接更新：2026-10-18 Phase 1 完成。專案：拾日家庭手札。

## 現況

根目錄 `D:\Vibe Coding\Codex\chen_fb`。Git 已初始化，3 個 commit。

### Git 歷史

| Commit | 說明 |
|--------|------|
| `b391270` | 初始 commit — 設計文件、規格、交接 |
| `4582ab5` | Phase 1 認證系統骨架 — 40 檔案 |
| `7520e59` | AuthError 修復 + 負向測試 72/72 通過 |

### 技術棧

- Next.js 15.5.28 / React 19 / TypeScript 5
- Prisma 7.10.1 + `@prisma/adapter-pg` driver adapter
- PostgreSQL 16 (NAS Docker)
- Vanilla CSS / Lucide React 1.59.0
- 無 email/SMTP/OAuth/雲端服務

## Phase 1 已完成 ✅

### 資料庫

- Prisma Schema: `User`, `Session`, `AuditEvent`
- Migration `20261018070528_init_auth_models` 已套用至 NAS PostgreSQL
- DB 容器 `shiri-db-1` 運行於 NAS `/volume1/docker/shiri/`
- DB 只在 `shiri-net` (internal) 網路，不對外暴露 port

### 認證核心 (6 個模組)

| 檔案 | 功能 |
|------|------|
| `lib/auth/password.ts` | argon2id 雜湊/驗證 |
| `lib/auth/session.ts` | DB session、SHA-256 token hash、sliding expiry |
| `lib/auth/middleware.ts` | `requireAuth()`, `requireAdmin()`, `withAuth()`, `withAdmin()` wrapper |
| `lib/auth/rate-limit.ts` | In-memory sliding window rate limiter |
| `lib/policy/authorization.ts` | 權限檢查 (停用/重設/改密碼) |
| `lib/audit.ts` | 稽核日誌 (12 種 action) |

### API Routes (7 個)

| 路由 | 方法 | 功能 |
|------|------|------|
| `/api/auth/login` | POST | 登入 + rate limit |
| `/api/auth/logout` | POST | 登出 |
| `/api/me` | GET | 目前使用者資訊 |
| `/api/me/password` | PUT | 改密碼 |
| `/api/admin/users` | GET/POST | 使用者列表/建立 |
| `/api/admin/users/[id]` | GET/PATCH | 使用者詳情/更新 |
| `/api/admin/users/[id]/reset-password` | POST | 管理員重設密碼 |

### UI

- 登入頁 (`app/(auth)/login/page.tsx`)
- 改密碼頁 (`app/(auth)/change-password/page.tsx`)
- LoginForm / ChangePasswordForm 元件
- CSS-only Spinner 元件
- PWA manifest (`public/manifest.json`)

### 部署

- `Dockerfile` (3-stage build)
- `compose.yaml` (db + web services)
- `scripts/init-admin.ts` — 互動式 CLI 建立初始管理員

### 測試

- `tests/acc-auth.test.ts` — ACC-01~06 整合測試
- **72 項全部通過** (0 失敗)

| 測試群組 | 項目數 | 內容 |
|----------|--------|------|
| ACC-01 | 9 | ID 正規化登入 |
| ACC-02 | 11 | 不存在/錯密碼/停用/空值/超長 |
| ACC-03 | 12 | 臨時密碼/改密碼/session 保留/過期 |
| ACC-04 | 14 | 管理員停用/重設/session 撤銷 |
| ACC-05 | 12 | 登出/Cookie 屬性/Session 到期 |
| ACC-06 | 12 | 未登入存取/權限隔離 |
| Rate Limit | 2 | 反覆失敗觸發 429 |

## NAS 部署狀態

- SSH: `ssh jerry@192.168.1.126` (ed25519 key)
- 路徑: `/volume1/docker/shiri/`
- DB 容器: `shiri-db-1` (postgres:16-alpine)，healthy
- DB 只在內部網路 `shiri-net`，web 容器透過 `db:5432` 連線
- `.env` 在 NAS 上 (`/volume1/docker/shiri/.env`)
- 網域: `fb.kiseki.me` (GoDaddy DNS 待設定)

## 不能遺漏的歷次決定

1. 私人家庭系統、家中與外出使用、不公開註冊。
2. 程式碼 GitHub，正式執行 NAS Docker，自架開源 PostgreSQL；家庭內容不進 Git。
3. 使用者自行設定網域 DNS 與對外連接；家人直接透過 HTTPS 登入，VPN 不再是必要條件。
4. 純 ID＋密碼、管理員建立／重設；沒有 email、信箱驗證、SMTP、OAuth。
5. 個人入口生活手札；主要導航只有生活手札與家庭動態；歷年今日直接在動態出現。
6. 不重視讚數；九種心情必含收到與沒問題，與留言／文字 emoji 分開。
7. 貼文主標、次標、內文、局部格式與 emoji；主標／次標可留空。
8. 內文緊湊，最多三行預覽後可展開／收合；貼文及留言都有日期與時間。
9. 隱私預設僅自己；家人可見不是公開網路；所有衍生內容繼承授權。
10. AI 輔助由作者決定採用，未有真實供應商不得假裝生成。
11. 所有影音格式是廣泛相容的目標，必須用格式矩陣與原檔／轉碼／拒絕分級處理，不承諾所有檔案都能播放。
12. Web App 為主要形式（非原生 App），PWA 支援。

## 已知技術要點

### Prisma 7 特性
- `PrismaClient` 需要 `@prisma/adapter-pg` driver adapter，不支援直接連線
- `datasource` block 無 `url`，由 `prisma.config.ts` 設定
- 需要套件: `@prisma/adapter-pg`, `pg`

### NAS SSH 注意事項
- PATH 必須手動設定: `export PATH=/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin;`
- SCP 不可用 (Synology 無 SFTP subsystem)，用 pipe 傳檔
- PowerShell 用 `;` 不是 `&&` 串接命令

## 已確認待開發功能 (Phase 2+)

| 功能 | 說明 |
|------|------|
| PWA 離線支援 | Service Worker + 離線草稿 |
| Web Push 通知 | 新留言/心情通知 |
| 相機直拍 | MediaStream API |
| 貼文釘選 | 家庭動態置頂 |
| 日曆檢視 | 月曆瀏覽貼文 |
| 成員頭像 | 自訂大頭貼 |
| 地點標記 | Geolocation API |
| 照片裁切 | 上傳前裁切/旋轉 |
| FB 匯入 | 匯入 Facebook 資料包 |
| PDF 匯出 | 貼文轉 PDF 紀念冊 |
| 儲存空間儀表板 | NAS 用量監控 |
| 2FA 雙因素認證 | TOTP 驗證 |
| 家庭行事曆 | 共享行程 |
| 年度回顧 | 自動產生年度精選 |
| 語音轉文字 | 語音輸入貼文 |
| 貼文範本 | 快速格式範本 |

## 下一步

1. **部署 web 容器到 NAS** — Docker build + push
2. **設定 Synology 反向代理** — HTTPS for fb.kiseki.me
3. **執行 init-admin** — NAS 上建立初始管理員
4. **Phase 2: 貼文系統** — 草稿/發布/隱私/富文字/媒體上傳
