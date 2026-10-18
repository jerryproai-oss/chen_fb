# Claude 接手入口

先讀 AGENTS.md，並遵循使用者最新指示。此資料夾是「拾日」家庭手札的設計開發交接，不是已完成的應用。

## 必讀順序

1. README.md
2. docs/handoff/implementation-handoff.md
3. docs/specs/family-journal-product-spec.md
4. docs/design/interface-design.md
5. docs/architecture/system-design.md
6. docs/deployment/nas-docker.md
7. docs/testing/acceptance-plan.md
8. design-reference/README.md 與預覽原始片段

DESIGN_DEVELOPMENT.md 是上述設計內容的單檔快照，可用於單次匯入。後續修改以專題文件為主，避免分別修改兩份而互相矛盾。

## 不可遺漏的限制

- NAS Docker 自架 PostgreSQL；GitHub 放程式碼，不放家庭資料或秘密。
- 純 ID＋密碼；不引入 email、SMTP、公開註冊、OAuth 或固定預設帳密。
- 家中與外出共用網域 HTTPS；VPN 不是家人使用的必要條件。
- 主要入口只有生活手札、家庭動態；不用「我的日記」，歷年今日不另開項目。
- 預設僅自己；回憶及任何媒體讀取都不能繞過授權。
- 內文緊湊、三行收放；九種心情包含收到、沒問題；貼文及留言顯示日期與時間。
- AI 必須明確採用、不自動發布；未設定真實模型不可用固定範例假裝完成。
- 預覽不是正式編輯器、登入機制或持久化；正式版不得保留「查看登入後畫面」繞過入口。

開始工作請依 docs/handoff/claude-start-prompt.md。不要只再產生另一份計畫或靜態畫面；當使用者下達開發指令後，分階段完成可驗證的端到端功能。
