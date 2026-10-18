# 介面設計參考

此資料夾保存「拾日」目前設計，不含真實家庭內容。以文件規格為正式需求，預覽只用於理解風格與互動，不能代替安全與持久化實作。

## 原始片段

[family-journal.fragment.html](family-journal.fragment.html) 是從 Codex 對話複製的最新介面原始碼，保留其來源狀態，並非 Next.js 專案或正式網站。原始視覺使用宿主提供的 Lucide 圖示與選擇性 Tweak／window.openai 介面；在一般瀏覽器中部分圖示或宿主設計工具可能缺失。接手正式開發時用產品元件與 Lucide React 重建，不保留宿主 API。

可以讀取原始片段或將其放進本機測試頁觀察；帳號表單不驗證任何真實帳密，不應輸入真實密碼。「查看登入後畫面」只是示意入口，不能出現在正式服務。AI 為固定範例、媒體為占位、貼文與留言刷新即消失。

示意固定日期 2026/10/17，正式版須使用當地今日。指定家人示意未完整模擬所有帳號權限，正式版以系統設計與驗收表為準。

## 本次交付截圖

| 圖片 | 內容 |
| --- | --- |
| [登入桌機](screenshots/login-desktop-light.png) | 暖白與綠色的登入版型 |
| [登入手機](screenshots/login-mobile-dark.png) | 深色、單欄、ID＋密碼 |
| [家庭動態桌機](screenshots/feed-desktop-light.png) | 歷年今日整合在家庭動態，顯示原日期與時間 |
| [心情回應手機](screenshots/reactions-mobile-dark.png) | 九種心情、三欄選單與留言 |
| [貼文編輯桌機](screenshots/editor-desktop-light.png) | 主標、次標、內文與格式、隱私設定 |

截圖在 Edge 無頭瀏覽器載入片段產生；不是 NAS 運行畫面，也不是 iOS／Android 實機證明。宿主圖示未載入時可能空白，正式版須用圖示套件補齊；文字與互動布局保留。無需使用原始 Facebook 截圖中的人物或商品影像。
