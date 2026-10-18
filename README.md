# 拾日家庭手札設計開發交接包

版本：2026-10-18。品牌「拾日」為暫名。此專案目前是設計開發文件與介面參考，尚無可部署的正式應用。

交付對象：使用者與在 Antigravity 中接手的 Claude。目標是建立只供家人使用、部署在 NAS Docker 的生活記錄系統，使用純帳號 ID＋密碼。

## 使用方式

1. 在 Antigravity 開啟本資料夾，或先將 ZIP 完整解壓縮至新的工作資料夾。
2. 閱讀 [CLAUDE.md](CLAUDE.md) 與 [AGENTS.md](AGENTS.md)。不同工具是否自動載入文件並未驗證，請明確要求 Claude 先讀這兩份文件。
3. 將 [Claude 開工指令](docs/handoff/claude-start-prompt.md) 的完整指令貼入對話。
4. 若只能提供一份文件，使用 [完整設計開發書](DESIGN_DEVELOPMENT.md)。這是各專題文件的彙整快照；開發後以專題文件及最新交接紀錄維護。
5. 開發時先盤點檔案與 Git 狀態，再提出第一階段計畫；不把預覽程式直接當作正式登入或授權系統。

## 文件索引

| 文件 | 用途 |
| --- | --- |
| [產品與驗收規格](docs/specs/family-journal-product-spec.md) | 全部需求、歷次調整、產品界線及媒體規則 |
| [畫面與互動規範](docs/design/interface-design.md) | 導航、版型、排版、心情回應、登入與各狀態 |
| [系統與資料設計](docs/architecture/system-design.md) | 技術選擇、資料表、權限、API、併發及 AI |
| [NAS 部署與維運](docs/deployment/nas-docker.md) | GitHub、Docker、DNS、備份、更新及環境設定 |
| [驗收與測試計畫](docs/testing/acceptance-plan.md) | 可驗收條件、測試資料及實作階段 |
| [實作交接](docs/handoff/implementation-handoff.md) | 已有、未做、待確認及建議開始順序 |
| [Claude 開工指令](docs/handoff/claude-start-prompt.md) | 可直接貼入 Antigravity 的完整指令 |
| [預覽參考說明](design-reference/README.md) | 介面原始片段與截圖限制 |

## 交付邊界

本次不新增 npm 套件、資料表、migration 或正式環境變數，不建立 GitHub repository、不推送、不連入 NAS、不開通 DNS，也不執行正式部署。文件中的 API、欄位、服務與設定皆為待實作設計，不能當成已存在的功能。

ZIP 與 SHA256 校驗檔位於 `deliverables/`；開發參考的圖片皆為示意內容。沒有家庭真實照片、密碼、Token 或正式 `.env`。
