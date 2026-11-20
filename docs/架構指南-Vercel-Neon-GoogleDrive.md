# 架構複製指南：GitHub + Vercel + Neon + Google Drive

**來源**：SeeBox 看板系統 kanban-III（`https://kanban.kiseki.me`），2026-11 的實際運作狀態
**用途**：給 Antigravity 在新專案上複製同一套做法
**撰寫日期**：2026-11-20

這份文件寫的是「實際在跑、而且踩過坑之後長成現在這樣」的做法，不是教科書式的最佳實務。
每一段只要有「當初以為可以、後來發現不行」的地方都寫出來了，請連同警告一起讀。

---

## 0. 先讀這段：這套架構適合什麼、不適合什麼

| 面向 | 這套架構的表現 |
|---|---|
| 成本 | **幾乎是零**。Vercel Hobby 免費、Neon 免費方案、Google Drive 用現有的 15GB |
| 部署 | push 到 main 就自動上線，不用管伺服器 |
| 資料庫 | 標準 PostgreSQL，要換雲端供應商隨時可以 |
| 圖片、PDF、Office 文件 | **可以**，看板系統跑了幾個月沒問題 |
| 音檔、影片 | **不建議，見下面的警告** |

### ⚠️ 影片與音檔的硬限制（最重要的一段）

這套做法是「檔案存 Google Drive，但每次讀取都經過自己的 API 路由代理」。
這個代理路由有三個**無法靠調整參數解決**的限制：

1. **不支援 HTTP Range request。** 代理路由是把整個檔案從 Drive 抓下來、整包回傳。
   瀏覽器的影片播放器靠 Range request 做「拖曳進度條」與「邊下載邊播」，拿不到就只能
   整支下載完才開始播，而且**完全不能跳著看**。
2. **Vercel Hobby 的 function timeout 只有 10 秒。** 一支 50MB 的影片，從 Drive 下載
   再吐給瀏覽器，10 秒內做不完就直接中斷。
3. **整個檔案會進伺服器記憶體**（`Buffer.from(...)`）。大檔案容易把 function 撐爆。

所以：

- **圖片（壓縮後 100~300KB）、PDF、Word、Excel** → 這套做法完全沒問題，看板就是這樣用的
- **短音檔（幾 MB 的語音留言）** → 勉強可以，但要實測
- **影片** → **請不要走這條路**。影片請改用專門的物件儲存：
  - Vercel Blob（跟 Vercel 整合最省事，有免費額度）
  - Cloudflare R2（沒有流量費，最便宜）
  - 或乾脆上傳到 YouTube／Vimeo 設為「不公開」，資料庫只存連結

  這三種都原生支援 Range request 與 CDN，瀏覽器直接連到儲存端，不經過你的 function。

**可以混用**：文件與圖片走 Google Drive，影片走 Blob/R2。資料庫欄位只是存一個字串 URL，
兩種來源可以並存，不需要選邊站。

### 其他要先知道的限制

- **Google Drive 的 15GB 是整個 Google 帳號共用的**，Gmail 附件、Google 相簿都算在裡面。
  不是「程式可以用 15GB」。看板系統用了幾個月目前 279MB，但那是因為圖片一律壓縮到 150KB 左右。
- **Google Drive 不是為了當 CDN 設計的。** 它有 API 呼叫頻率限制，大量併發讀取會被限流。
  看板的做法是在代理路由裡加記憶體快取（小檔 10 分鐘）來降低呼叫次數。
- **Neon 免費方案會 scale to zero。** 閒置一段時間後資料庫端點會休眠，當天第一個使用者
  要等幾秒才連得上，之後都正常。要消除就是升級付費方案（約 $19/月）。

---

## 1. 整體架構

```
    開發機
      │ git push origin main
      ▼
    GitHub repo ──────► Vercel（偵測到 push 自動 build & deploy）
                          │
                          ├── Next.js App Router（Server Actions + API Routes）
                          │
                          ├──► Neon PostgreSQL（結構化資料：使用者、卡片、報表…）
                          │        ※ 必須跟 Vercel function 同一個區域
                          │
                          └──► Google Drive API（檔案本體）
                                   ▲
                                   │ 資料庫裡只存 `/api/drive/file/<fileId>`
                                   │ 這個字串，不存檔案內容
```

**核心原則：資料庫只存「指向檔案的字串」，檔案本體永遠不進資料庫。**
這條原則讓資料庫維持很小（備份快、查詢快），也讓檔案儲存端日後可以抽換。

---

## 2. GitHub → Vercel 自動部署

### 設定步驟

1. GitHub 建 repo（private 即可，Vercel 讀得到）
2. Vercel → Add New Project → Import Git Repository → 選那個 repo
3. Framework Preset 會自動偵測 Next.js，**不需要改 build command**
4. 之後每次 `git push origin main` → Vercel 自動 build 並部署到 production
   push 到其他分支 → 產生 preview 部署（獨立網址）

### 分支策略

看板系統**直接 commit 到 main**，不開功能分支。小團隊、單人開發時這樣最快，
代價是沒有「合併前先看 preview」這道關卡。新專案如果有兩個人以上同時改，
建議改成 PR 流程（Vercel 會自動在 PR 上留 preview 連結）。

### ⚠️ 不要在 repo 裡跑 `vercel link`

部署是走 GitHub 整合的。在本機跑 `vercel link` 或 `vercel deploy` 會**建出第二個 Vercel 專案**，
然後同一份程式有兩個網址、兩套環境變數，環境變數還不同步。
Vercel CLI 只用來**讀**狀態：

```bash
vercel ls --scope <你的 scope> --project <專案名>
```

### ⚠️ Function Region 一定要跟資料庫同區

這是整個效能調校裡**影響最大的單一項目**。

Vercel 預設的 function region 是 `iad1`（美國華盛頓）。如果 Neon 開在新加坡，
那麼**每一次資料庫查詢都要橫跨太平洋一次，約 200ms**。一個頁面做七八次查詢，
就是一秒半的純等待——而且 CPU 完全是閒的，就只是在等。

設定位置：**Vercel → Settings → Functions → Function Region**
看板選 `sin1`（新加坡），因為 Neon 開在 AWS `ap-southeast-1`。

> 為什麼不選離台灣更近的 `hkg1` 或 `hnd1`？
> 因為「跟資料庫同區」比「跟使用者同區」重要得多：
> 對資料庫是七八趟來回，對使用者只有一趟。

**這個設定不在 repo 裡**（刻意不寫進 `vercel.json`，避免同一件事有兩個來源）。
副作用是改了不會留下 git 紀錄，所以**日後發現網站突然變慢，第一個要查的就是這裡**。
改完必須 Redeploy 才生效。

### `vercel.json`（只放排程）

```json
{
  "crons": [
    { "path": "/api/cron/generate-cards", "schedule": "0 16 * * *" }
  ]
}
```

Cron 的時間是 **UTC**。上面的 `0 16 * * *` 是台灣時間隔天凌晨 0 點。
Cron 路由自己要驗 `CRON_SECRET`，否則任何人都能觸發。

### ⚠️ Hobby plan 的 log 只留 30 分鐘

`vercel logs <url>` 讀得到「正在發生」的 log，但 `--since 1h` 以上會被拒絕。
意思是**事後追查 log 這條路不存在**。要看某個行為的 log，必須在它發生的當下就接著讀。

---

## 3. Neon PostgreSQL

### 建立

1. [neon.tech](https://neon.tech) 建 project
2. **區域選跟 Vercel function region 配對的**（例：Vercel `sin1` ↔ Neon AWS `ap-southeast-1`）
3. 複製 connection string

### 環境變數

Vercel → Settings → Environment Variables。看板拆成單項存（方便個別覆寫）：

```
PG_HOST      ep-xxxx.ap-southeast-1.aws.neon.tech
PG_PORT      5432
PG_USER      neondb_owner
PG_PASSWORD  ********
PG_DATABASE  neondb
PG_SSL       true
```

也可以只存一個 `DATABASE_URL`，程式裡兩種都支援。

**絕對不要把連線字串寫進 repo**，包括註解、文件、`.env.example` 的範例值。

### Schema 管理

看板的做法是**手寫 SQL 檔放在 `supabase/migrations/`，到 Neon 的 SQL Editor 貼上去執行**。
沒有自動 migration runner。

優點是簡單、看得見每一條 DDL；缺點是**本機與線上可能不同步而且沒人會發現**。

新專案如果想要更安全，可以改用 Prisma 或 Drizzle 管 schema。但要注意：
**選了 ORM 就全部走 ORM**，不要一半 ORM 一半手寫 SQL，那會變成兩個真相來源。

> 看板踩過的實例：有張表的欄位叫 `items`（JSONB，存物件），在查詢層被一個
> 「只看欄位名稱、不看是哪張表」的正規化邏輯改寫成 `[]`，使用者看到的現象是
> 「離開畫面資料就不見了」，但資料其實好好地在資料庫裡。
> **新表不要用 `items` 這種通用名稱當 JSONB 欄位名。**

### ⚠️ 兩個驅動程式，型別解析器要各設一次

Neon 可以用兩種方式連：

- **`@neondatabase/serverless` 的 HTTP driver** — 無 TCP／SSL 握手成本，serverless 環境首選，Vercel 上實際走這條
- **`pg` 的 Pool** — 本機開發、或需要交易時用

它們**各有一份獨立的型別解析器註冊表**。只在 `pg` 設定 type parser，在 Vercel 上完全不會生效。
看板這個 bug 修過兩次。

而且 Neon HTTP driver 的 `neon(connStr, opts)` **不接受 `types` 選項**（設了不報錯、也不生效），
唯一有效的管道是 `.query()` 的第三個參數：

```ts
import { neon } from '@neondatabase/serverless'

// date / timestamp 一律留字串，不要讓驅動轉成 JS Date 物件
const DATE_PARSERS = new Map<number, (s: string) => string>([
  [1082, (s) => s],                                                   // date
  [1114, (s) => s.replace(' ', 'T')],                                 // timestamp
  [1184, (s) => s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')], // timestamptz
])

export const NEON_QUERY_OPTS = {
  types: {
    getTypeParser(oid: number, format?: string) {
      return DATE_PARSERS.get(oid) ?? defaultGetTypeParser(oid, format)
    },
  },
}

const sql = neon(connStr, { fullResults: true })
const result = await sql.query('SELECT * FROM cards WHERE id = $1', [id], NEON_QUERY_OPTS)
```

**為什麼堅持把日期留成字串？** 因為在 UTC+8：
`2007-06-25` 這個 **date** 欄位轉成 JS Date 會變 `2007-06-24T16:00:00Z`，
顯示出來**整整差一天**。生日、到職日、離職日全部錯一天，而且沒有任何錯誤訊息。
另外 `<input type="date">` 拿到 Date 物件會顯示空白，直接印在 JSX 裡會丟 React error #31。

新專案如果用 Prisma／Drizzle 就不會碰到這題（它們有自己的型別處理）。
但**只要是手寫查詢層，這段一定要做**。

---

## 4. Google Drive 當檔案儲存

這是整套架構裡最需要說明的部分。

### 4-1. 設計：三層

```
瀏覽器                 Next.js API 路由              Google Drive
  │
  │ 1. 圖片先在瀏覽器壓縮
  │    （canvas，壓到 1280px / quality 0.7）
  │
  ├─ POST /api/drive/upload ──► 驗身分 → 上傳到 Drive
  │   FormData(file, folderPath)      │
  │                                   └──► 回傳 fileId
  │ 2. 資料庫只存 `/api/drive/file/<fileId>`
  │
  └─ <img src="/api/drive/file/xxx"> ──► 代理路由 → 從 Drive 抓 → 回傳 bytes
                                          （小檔有記憶體快取）
```

**關鍵：Drive 的 fileId 不直接曝光給瀏覽器去連 Google。**
一律經過自己的 `/api/drive/file/<id>` 代理。這樣做的理由：

- 檔案權限由自己的系統控制，不必去管 Drive 的分享設定
- 可以加快取、加權限檢查、日後要換儲存端只改這一支路由
- 代價就是第 0 節講的那些限制（沒有 Range、吃 function 時間）

### 4-2. Google 端設定（最容易卡住的地方）

有兩條路，**強烈建議走 OAuth2**：

| | OAuth2 + Refresh Token | Service Account |
|---|---|---|
| 用誰的空間 | 真人帳號的 15GB | **Service Account 自己沒有儲存空間** |
| 一般 Gmail 帳號 | ✅ 可用 | ❌ 不能用（上傳會失敗） |
| Google Workspace | ✅ 可用 | ✅ 可用（要搭配共用雲端硬碟） |

看板的程式兩條都支援，**實際跑的是 OAuth2**，Service Account 只是 fallback。

#### 取得 Refresh Token 的步驟

1. Google Cloud Console → 建專案 → 啟用 **Google Drive API**
2. 「OAuth 同意畫面」→ 建立
3. 「憑證」→ 建立 OAuth 用戶端 ID → 取得 **Client ID** 與 **Client Secret**
4. 到 [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
   → 右上齒輪勾「Use your own OAuth credentials」→ 填入上面兩個值
   → 左側選 scope `https://www.googleapis.com/auth/drive.file`
   → 授權 → 交換取得 **Refresh Token**
5. 三個值都填進 Vercel 環境變數

> **⚠️ 同意畫面若停在「測試中」（Testing），拿到的 refresh token 7 天後就會失效。**
> 症狀是「上線一週後檔案功能突然全掛」。要長期使用必須把應用程式**發布為正式版**
> （Publishing status → In production）。自用的內部工具不需要通過 Google 審查，
> 但要按下那顆發布按鈕。

#### scope 的選擇

`drive.file` 表示「只能看見這支程式自己建立的檔案」——這是最小權限，建議用它。
副作用是**讀不到帳號總配額**（`drive.about.get` 會回 403），所以「還剩多少空間」
這種畫面拿不到數字。想顯示配額就要額外加 `drive.metadata.readonly`。

程式裡要把「拿不到配額」跟「用量是 0」分開處理，不要把拿不到當成 0 顯示。

### 4-3. 資料夾結構

在 Drive 根目錄建一個專案專屬資料夾（例如 `SeeBox-Kanban`），底下用路徑分類：

```
SeeBox-Kanban/
├── _uploads/
│   ├── cards/           卡片附件
│   ├── daily-log/       每日日誌照片
│   └── file-pool/<部門id>/
└── <部門名稱>/           部門文件
```

程式用 `resolveFolderPath('_uploads/cards')` 逐層查找或建立。
資料夾 id 查到之後快取在記憶體裡，不用每次都查。

**上傳時檔名要加 timestamp**（`report_1763600000000.pdf`），
因為 Drive **允許同一個資料夾裡有同名檔案**，不加會變成一堆同名檔分不出哪個是哪個。

### 4-4. 媒體檔 vs 一般文件：處理方式不同

這是使用者問題的核心，分開講。

#### 圖片（媒體）→ **上傳前一定要在瀏覽器壓縮**

不壓縮的話，手機拍的照片一張 3~5MB，15 個人每天 15 張，一年就把 15GB 塞爆。

```ts
// 瀏覽器端，用 canvas 重繪
const MAX = 1280
const QUALITY = 0.7   // 日誌照片用這個，約 150KB
// const QUALITY = 0.8, MAX = 1920  // 一般附件用這個，約 200KB

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file   // 壓了會失去動畫

  const img = await createImageBitmap(file)
  let { width, height } = img
  if (width > MAX || height > MAX) {
    const r = Math.min(MAX / width, MAX / height)
    width = Math.round(width * r); height = Math.round(height * r)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob>(res =>
    canvas.toBlob(b => res(b!), 'image/jpeg', QUALITY))
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}
```

**誠實的一句話**：壓縮大約只能換到 3 倍的空間。真正決定長期容量的是**保留政策**
（例如「12 個月後刪除照片，但保留文字」）。看板的日誌模組就是這樣設計的，
而且在刪除前要能匯出 PDF 存檔，因為那些照片可能被當成教育訓練教材。

#### 一般文件（Word / PDF / Excel）→ **原樣上傳，不要動它**

壓縮沒有意義（本來就是壓縮格式），而且任何重新編碼都可能讓檔案打不開。
直接上傳，大小上限由路由控制（看板設 20MB）。

#### 貼上（Ctrl+V）也要支援

桌機使用者的習慣是截圖後直接貼上。兩個地方都要掛：
textarea 的 `onPaste`，以及 document 層級的 paste（記住最後聚焦的輸入框）。

### 4-5. 程式骨架

#### 認證（server-only）

```ts
// src/lib/google/drive.ts
import { google, drive_v3 } from 'googleapis'
import { Readable } from 'stream'

let _drive: drive_v3.Drive | null = null

function getDriveClient(): drive_v3.Drive {
  if (_drive) return _drive

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN

  if (clientId && clientSecret && refreshToken) {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
    oauth2.setCredentials({ refresh_token: refreshToken })
    _drive = google.drive({ version: 'v3', auth: oauth2 })
    return _drive
  }
  throw new Error('Google Drive credentials not configured')
}

export async function uploadFileToDrive(
  buffer: Buffer, fileName: string, mimeType: string, folderPath: string,
) {
  const drive = getDriveClient()
  const folderId = await resolveFolderPath(folderPath)   // 逐層 getOrCreate

  const ext = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
  const base = fileName.replace(/\.[^.]+$/, '')
  const uniqueName = `${base}_${Date.now()}${ext}`       // 避免同名

  const res = await drive.files.create({
    requestBody: { name: uniqueName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, name, mimeType, size',
  })
  return { fileId: res.data.id!, name: res.data.name!, size: +(res.data.size || 0) }
}

/** 資料庫裡存的就是這個字串，不是 Drive 的網址 */
export const driveFileUrl = (fileId: string) => `/api/drive/file/${fileId}`
```

#### 上傳路由

```ts
// src/app/api/drive/upload/route.ts
export const dynamic = 'force-dynamic'
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  // ⚠️ 身分驗證不能漏。middleware 的 matcher 通常把 /api 整個排除掉，
  //    所以 API 路由必須自己檢查，否則任何人都能往公司的 Drive 丟檔案。
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const folderPath = formData.get('folderPath') as string
  if (!file || !folderPath) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const r = await uploadFileToDrive(buffer, file.name, file.type, folderPath)
  return NextResponse.json({ fileId: r.fileId, url: driveFileUrl(r.fileId), size: r.size })
}
```

#### 讀取（代理）路由

```ts
// src/app/api/drive/file/[id]/route.ts
export const dynamic = 'force-dynamic'

// 小檔放記憶體快取，降低 Drive API 呼叫次數
const cache = new Map<string, { buffer: Buffer; mimeType: string; at: number }>()
const TTL = 10 * 60 * 1000, MAX_CACHEABLE = 512 * 1024, MAX_ENTRIES = 50

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL) {
    return new NextResponse(hit.buffer, {
      headers: { 'Content-Type': hit.mimeType, 'Cache-Control': 'public, max-age=3600' },
    })
  }
  const file = await downloadFileFromDrive(id)
  if (file.size < MAX_CACHEABLE) { /* 淘汰最舊的，然後 cache.set(...) */ }
  return new NextResponse(file.buffer, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Length': String(file.buffer.length),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
```

> 這個快取是**每個 serverless 執行個體各自一份**，不是共用的。
> Vercel 會同時跑多個執行個體，所以命中率不會太高——它的作用是擋掉同一個使用者
> 連續開同一張圖的重複請求，不要期待它像 CDN 一樣。

### 4-6. ⚠️ 孤兒檔：一定要先想好

**刪除資料庫紀錄時，Drive 上的實體檔案不會跟著消失。**

看板在這裡踩過：卡片被永久刪除時 `card_attachments` 隨 CASCADE 消失，
但 Drive 檔案留著，而且紀錄一沒了就**查不到 file id**，等於永遠清不掉。

新專案請一開始就做兩件事：

1. **刪除流程裡主動刪 Drive 檔**（在刪資料庫紀錄之前先取出 file id）
2. **做一支對帳路由**：列出資料夾裡所有檔案，跟資料庫比對，差集就是孤兒。
   這支**只列出、不刪除**——一次砍掉幾百個雲端檔案的操作不應該掛在一個 GET 上。

對帳只對「資料庫裡明確記得這些檔案在哪個欄位」的資料夾有意義。
散在各處的（富文字編輯器內文插圖、頭像…）套同一套邏輯會把正常檔案誤判成孤兒。

---

## 5. 環境變數清單

全部設在 **Vercel → Settings → Environment Variables**，**不進 repo**。

```
# Neon
PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DATABASE / PG_SSL
（或單一 DATABASE_URL）

# 自簽 session token
JWT_SECRET

# Vercel Cron 驗證
CRON_SECRET

# Google Drive（三個一組）
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_OAUTH_REFRESH_TOKEN

# 備援：Workspace 才有意義
GOOGLE_SERVICE_ACCOUNT_KEY

# 若有 AI 功能
GOOGLE_GENERATIVE_AI_API_KEY
```

### ⚠️ Production 與 Preview 是分開的

看板的 `GOOGLE_OAUTH_*` 只設在 Production。結果是 **Preview 部署上傳檔案一律失敗**，
而且錯誤訊息很含糊（「credentials not configured」）。
要在 preview 測檔案功能，記得把變數也加到 Preview 環境。

---

## 6. 新專案的建置順序（建議）

1. `npx create-next-app@latest`（App Router、TypeScript、Tailwind）
2. 推上 GitHub → Vercel import → 確認空專案部署得起來
3. Neon 建 DB，**區域對齊**，Vercel 的 Function Region 一起設好
4. 環境變數設定 → 寫一支 `/api/health` 查 `SELECT 1` 確認連得到資料庫
5. 身分驗證（自簽 JWT 存 cookie，或用 NextAuth／Clerk）
6. **再來才做檔案上傳**——Google 那邊的設定最花時間，不要擺在第一個
7. 先把圖片上傳＋顯示跑通，再做文件、再考慮影片要不要改走別的儲存

### 幾個值得照抄的習慣

- **API 路由自己驗身分。** middleware 通常排除 `/api`，不要假設它保護到了
- **`next.config.ts` 的 `serverActions.bodySizeLimit`** 預設 1MB，要傳檔案得調大（看板設 10mb）
- **日期格式化集中在一個檔案**（固定 `Asia/Taipei` / `zh-TW`），尤其是會 SSR 的地方——
  不然伺服器端（UTC）跟瀏覽器端（UTC+8）會算出不同的日期，造成 hydration 不一致
- **不要用 `toISOString()` 產生「日期字串」。** 它是 UTC，在台灣的凌晨 00:00~08:00
  會算出前一天，而且只有早上才會錯——這種 bug 非常難查

---

## 7. 一句話總結

這套架構的本質是**「用免費額度拼出一個完整的雲端應用」**：
Vercel 出運算、Neon 出資料庫、Google Drive 出儲存空間，三邊都是免費方案。

代價是每一邊都有它的限制，而且**限制會在你不注意的地方互相放大**
（10 秒 timeout × Drive 下載速度 × 沒有 Range request = 影片播不動）。

把圖片與文件放進去，它很好用。
把影片放進去，它會讓你花一個禮拜找一個無解的問題。
