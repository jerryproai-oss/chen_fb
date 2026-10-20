# 拾日（Shiri）開發交接狀態

交接更新：2026-10-20。專案：拾日家庭手札。

## 現況

根目錄 `D:\Vibe Coding\Codex\chen_fb`。生產環境：`fb.kiseki.me`（Synology DS920+ NAS Docker）。

### Git 歷史（近期）

| Commit | 說明 |
|--------|------|
| `ef04ea9` | fix: #3 回憶卡片化 + #4 載入失敗提示與重試 |
| `abcb52c` | feat: R08/R10 三行展開收合、影片Range串流、投票編輯載入 |
| `d781a6b` | fix: 修正除夕日期bug + 春節/端午/中秋自動補假 |
| `0f756bf` | refactor: 重整台灣節日資料（修正清明/冬至公式至2035） |
| `73862dc` | feat: 行事曆加入農曆（農民曆）顯示 |
| `6faa845` | feat: 共享保險庫功能 + 家庭成員 API |
| `c63568d` | fix: 全面修正程式審查 P1（R01-R07, R09, R11） |

### 技術棧

- Next.js 15 / React 19 / TypeScript 5
- Prisma 7 + `@prisma/adapter-pg`
- PostgreSQL 16 (Docker `postgres:16-alpine`)
- CSS Modules（無 Tailwind）/ Lucide React
- 無 email/SMTP/OAuth/雲端服務

### 部署

- **SSH**: `jerry@100.98.220.53`（Tailscale）
- **Git remote `nas`**: `jerry@100.98.220.53:/volume1/docker/shiri/repo.git`
- **部署指令**: push → pull → `docker compose build web` → `docker compose up -d web`
- **DB**: `shiri-db` (postgres:16-alpine)，port 25432 **不對外暴露**
- **Volumes**: `db-data`（資料庫）、`media-data`（媒體檔案）
- **DB schema 變更**: 使用直接 SQL（`prisma db push` 在生產不可用）

## 已完成功能

### 核心
- ✅ 認證系統（登入/登出/改密碼/首次改密碼強制）
- ✅ 家庭成員管理（管理員建立/停用/重設密碼）
- ✅ 貼文 CRUD（標題/副標/內文/受眾/日期/地點/背景色/里程碑）
- ✅ 媒體上傳與顯示（圖片/影片/音訊，FB 風格網格，Range 串流）
- ✅ 投票功能（建立/投票/結果/多選/截止時間/編輯載入）
- ✅ 反應系統（7 種 emoji 反應 + 樂觀更新）
- ✅ 留言系統（巢狀回覆/刪除/即時計數）
- ✅ 收藏功能
- ✅ 搜尋（全文/標籤/作者）
- ✅ 標籤系統
- ✅ 限時動態（StoryBar）

### 行事曆
- ✅ 家庭事件 CRUD（單次/循環/跨天/顏色）
- ✅ 月/週/日視圖
- ✅ 農曆（農民曆）顯示（2024-2035 查表法）
- ✅ 台灣國定假日/補假/紀念日/國際節日/民俗節日/節氣
- ✅ 農曆節日自動推算（除夕/春節/端午/中秋等）
- ✅ 春節/端午/中秋週末自動補假（2026 起）
- ✅ 清明/冬至天文近似公式（已驗證 2024-2035）
- ✅ 補假資料涵蓋 2024-2035

### 特別區（Vault）
- ✅ PIN 加密（AES-256-GCM + PBKDF2 客戶端加密）
- ✅ 項目 CRUD（名稱/內容/附件）
- ✅ 5 分鐘自動鎖定
- ✅ 共享保險庫（家庭成員共同維護）
- ✅ 改 PIN API 已阻止（501），待重新加密設計

### 安全修正（c63568d）
- ✅ R01: 新貼文預設改為 PRIVATE
- ✅ R03: 首次改密碼後端強制限制（restrictedAuth）
- ✅ R06: 貼文版本樂觀鎖（expectedVersion + 409 Conflict）
- ✅ R07: 唯一管理員不可自我降權/停用
- ✅ R09: 時區統一 Asia/Taipei
- ✅ R11: Vault session 只存 token+salt（非原始 PIN）

### P2 修正
- ✅ R08: 媒體 Range/206 串流（不再全檔進記憶體）
- ✅ R10: PostCard 三行預覽原地展開/收合（ResizeObserver）
- ✅ #3: 歷年今日改為卡片式呈現
- ✅ #4: 載入失敗區分提示 + 重試按鈕

## 已知限制 / 待完成

### 安全
- R04: Vault 改 PIN 需完整重新加密流程（目前 API 返回 501）
- R05: Vault 相關 table 缺少正式 migration（目前用 db push 建立）
- CSRF: 寫入請求缺 Origin/CSRF 驗證（SameSite=Lax 部分保護）
- R02: compose.yaml 需確認 NAS 實際媒體掛載（已加 media-data volume）

### 功能
- 寫作體驗: 標題仍強制必填、缺少自動儲存/草稿恢復
- 回憶: 仍為獨立區塊，未整合進動態流
- AI 功能: 尚無實際 AI provider 整合

### 基礎設施
- ESLint 未設定（初始化問答未完成）
- 隔離測試環境未建立
- README 需更新實際啟動/測試/部署流程
- .env.example 需補上 Compose 需要的變數

## 主要檔案路徑

| 類別 | 路徑 |
|------|------|
| 行事曆頁面 | `app/(main)/calendar/page.tsx` |
| 行事曆 API | `app/api/calendar/route.ts` |
| 節日資料 | `lib/holidays.ts` |
| 農曆轉換 | `lib/lunar.ts` |
| Vault 頁面 | `app/(main)/vault/page.tsx`, `vault/list/page.tsx` |
| Vault API | `app/api/vault/{status,pin,unlock,items,members}/route.ts` |
| Vault 加密 | `lib/vault/crypto.ts` |
| 認證中介 | `lib/auth/middleware.ts` |
| 貼文卡片 | `components/post/PostCard.tsx` |
| 媒體 API | `app/api/media/[id]/route.ts` |
| 家庭動態 | `app/(main)/family/page.tsx` |
| 編輯頁面 | `app/(main)/write/[id]/page.tsx` |
| Prisma Schema | `prisma/schema.prisma` |
