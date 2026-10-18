# NAS Docker 部署與維運設計

版本：2026-10-18。部署目的地為使用者的 NAS，家中與外出皆可使用。以下是部署工作規範，尚無實際網域、NAS 連線資訊或可執行的 compose.yaml。

## 已確定與待補資訊

| 項目 | 已確定 | 待補 |
| --- | --- | --- |
| 程式碼 | GitHub，建議 private repository | 帳號／組織、repository、分支與存取方式 |
| 執行環境 | NAS Docker／Compose | 品牌、型號、OS、CPU amd64/arm64、RAM、Docker 版本 |
| 資料庫 | 自架開源 PostgreSQL | 固定 major 版本、儲存目錄、備份帳號 |
| 網域 | 使用者設定 DNS 並開放外部連接 | 正式 FQDN、IP、DDNS、CGNAT、IPv6、內網解析 |
| 入口 | HTTPS 反向代理 | NAS 現有代理、憑證方式、port 使用情形 |
| 儲存 | NAS 持久化保存媒體與 DB | 主儲存路徑、可用空間、單檔／批次／家庭容量 |
| 備份 | 需要獨立副本與還原演練 | 目的地、容量、頻率、保留期與離線／異地方式 |
| AI | 可設定 provider，未設定也可寫作 | 本機或外部、模型、預算、API 憑證 |

沒有 NAS 資訊時，先做本機 Docker 與測試環境。不得把未指定的 CPU、路徑、DNS 或帳密寫成正式值，也不因此改用雲端部署。

## 服務與網路

建議服務 web、db、media-worker；migration 作一次性工作，proxy 視 NAS 既有能力決定。Web 只透過反向代理對外，DB 不發布 host port，worker 不開對外 port。若代理在宿主機外或另台設備，web 綁定必要的私網介面並限制來源；不能預設所有環境皆可使用 127.0.0.1。

瀏覽器 → family.example.invalid 類型的正式網域替換值 → HTTPS 443 → 代理 → web → PostgreSQL／媒體目錄。TCP 80 僅依憑證驗證／轉址策略開放；不對外開 NAS 管理頁、資料庫、Docker API 或模型服務。DNS 解析正確不等於已能外部連線，需分別驗證。

檢查 A／AAAA 對應、防火牆、路由器轉送、雙重 NAT／CGNAT、ISP 限制；不能用 IPv4 成功推斷 IPv6 安全。內網同域名可能需 split DNS 或 NAT loopback。使用實際手機行動網路測試外出登入、媒體上傳與播放；不以同一 LAN 的測試代替。

TLS origin 與應用 APP_ORIGIN 一致；只信任指定代理送來的 client IP／forwarded proto，防止偽造標頭繞過限速或產生不安全網址。上傳大小、逾時、串流緩衝與 Range 要由代理和應用共同驗證。正式 Cookie 必須在 HTTPS 下使用。

## 持久化與映像

建議 NAS 資料區分 db、media/originals、media/variants、uploads、exports、backups、config。所有路徑由管理者設定，容器內採固定 mount path；權限按 web、worker、備份用途最小化。啟動時驗證掛載及可寫性，缺失即不就緒，不能靜默落到容器可寫層。

Dockerfile 使用多階段 build，正式映像執行正式 server、非 root，固定基底與依賴，能重建同一版本。不得以 npm dev server 作正式服務。ffmpeg 能力清單、程式 commit、schema 版本與映像 tag 記錄在版本資料；轉碼輸出記錄 profileVersion。

.gitignore 及 .dockerignore 排除正式 .env、憑證、金鑰、資料庫、media、uploads、exports、backups、私人日誌、node_modules 與本機暫存。設計參考只含示意資料，可以納入 Git；未來新增真實家人照片前要另行檢查。

Compose 應具備健康檢查、restart policy、必要資源限制、獨立資料 volume／bind mount 與內部網路。不可把 depends_on 當成資料庫已可用；web／worker 需能安全重連，migration 只由一個明確工作執行，不由每個容器啟動時競爭執行。

## 環境設定提案

以下是建議名稱，實作可按選用套件調整並同步 .env.example；本次沒有新增有效環境變數或秘密。

| 名稱 | 用途 | 規則 |
| --- | --- | --- |
| APP_ORIGIN | 正式 HTTPS origin | 單一受信來源，不接受任意 Host 推導 |
| APP_TIMEZONE | 顯示與回憶時區 | Asia/Taipei |
| DATABASE_URL | app DB 連線 | 伺服器秘密，不放前端 |
| MIGRATION_DATABASE_URL | migration 連線 | 較高權限，只在維護工作提供 |
| MEDIA_ROOT／UPLOAD_TMP_ROOT／EXPORT_ROOT | 容器內儲存路徑 | 固定掛載，不接受使用者指定 |
| MAX_UPLOAD_BYTES／UPLOAD_CHUNK_BYTES | 檔案與分段限制 | 實測 NAS、代理與手機後定值 |
| MAX_USER_STORAGE_BYTES／MAX_TMP_BYTES | 配額及暫存上限 | 預留磁碟，不默認無限制 |
| MEDIA_WORKER_CONCURRENCY | 同時處理數 | 初始 1，再測量調整 |
| MEDIA_JOB_TIMEOUT_SECONDS | 處理時間上限 | 大型長片需合理值與取消機制 |
| SESSION_IDLE_SECONDS／SESSION_MAX_SECONDS | 閒置／絕對到期 | 範例預設需對照 auth 設計 |
| TEMP_PASSWORD_TTL_SECONDS | 臨時密碼期限 | 不超過規格核定期限 |
| AUTH_SECRET | 驗證庫需要時使用 | 隨機產生；純 opaque session 方案不為形式新增未使用秘密 |
| TRUSTED_PROXY_CIDRS | 受信代理範圍 | 精確配置，不默認信任全部來源 |
| AI_PROVIDER／AI_MODEL／AI_BASE_URL | 模型供應商設定 | endpoint 由管理員設定，不接受任意前端網址 |
| AI_API_KEY | 外部供應商憑證 | 選用，僅伺服器，不透過公開設定 API 傳回 |
| AI_TIMEOUT_SECONDS／AI_DAILY_LIMIT | 逾時與配額 | provider 未設定時不傳送內容 |
| LOG_LEVEL | 日誌層級 | production 不記私文與認證資料 |

密碼／DB bootstrap 參數按實作套件與 PostgreSQL 映像需要補充，不設定可通用登入的範例密碼。環境變數只是設定來源，正式檔案須限制讀取權限，備份也不得公開。

## 首次部署程序

1. 核對 NAS 與 CPU、儲存、代理、網路、備份位置，不先對外開站。
2. 取得指定 commit/tag，完成 build、type check、lint、測試與映像產生；記錄版本與平台。
3. 建立持久化目錄與秘密設定，驗證權限與空間。
4. 啟動 DB，執行一次性 migration，啟動 web／worker，檢查 readiness。
5. 由 NAS 本機命令建立第一個管理員，沒有預設 admin/password；命令可辨識已初始化並防止匿名重做。
6. 本機驗證登入、建立家人、發文、私文越權拒絕、上傳與播放。
7. 配置網域 HTTPS 代理，核對 Cookie、CSRF、代理限速、外網連線與內網同域名。
8. 完成獨立備份與還原演練、容器重啟資料保存測試，再交付家人使用。

這是待執行清單，不是目前已部署證明。

## 備份與還原

備份單位包含 PostgreSQL 邏輯備份或一致性快照、原始媒體、必要衍生版本、設定與秘密的受控副本、程式／schema／處理 profile 版本及 SHA256 manifest。備份放獨立儲存，RAID 不取代備份。

家庭規模首版採維護窗口：停止內容寫入與上傳 finalize，等待或暫停 worker／清理器，取得一致的 DB 與媒體檢查點，再恢復服務。若要不中斷備份，需另設快照／交易協調與恢復策略，不把兩個不同時間的複製宣稱一致。

還原至隔離目錄或新 volume，驗證 DB 可讀、外鍵與媒體清單一致、checksum 正確、帳號及權限可用、原檔可下載、影片可播；不得為測試覆蓋唯一正式資料。還原後撤銷舊 session 與臨時密碼、清理過期工作租約，避免備份中的認證狀態重新生效。

備份頻率／保留期、可接受資料損失 RPO 與停機時間 RTO 尚未由使用者指定，先列待核定值，不能承諾零資料遺失。

## 更新與回復

更新前記錄現版與備份，審查 schema 相容性，明確執行 migration 後替換 web／worker，完成健康與核心流程驗證。先採 expand-contract 相容設計；破壞性刪欄另做專案，不夾帶一般發布。

回復映像前確認舊版可讀新 schema；否則依事先演練方案修復前進或回復整組資料，不能隨手對正式 DB reset。PostgreSQL major 升級另做資料搬移與驗證，不隨應用容器更新。

GitHub Actions 可後續建立測試與映像，由 NAS 主動拉取；不預設讓 CI 直接連家中 SSH 或使用有廣泛 NAS 權限的 runner。公開／發布／推送時再確認實際目的地與使用者授權。
