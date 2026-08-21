## 1. SKILL.md 語言解析與輸出規則

- [x] 1.1 依 design「Report Language 詢問時機與 SESSION_STATE 持久化」，在 design-system-extractor/SKILL.md 的 First Actions 之後、Input Discovery 之前新增 Report Language Resolution 步驟，實作 spec「First-run report language selection」：無紀錄或紀錄無法辨識時詢問一次（預設選項＝對話語言，另列 English、日本語、自訂），有紀錄時直接沿用不重問。驗證：內容審閱 SKILL.md，確認步驟位置、四種選項、預設推薦與「紀錄無法辨識視同第一次」規則皆已寫入。
- [x] 1.2 實作 spec「Report language persistence in SESSION_STATE」並完成 design「SKILL.md 工作流程與檢查點整合」：SKILL.md 的 First Actions 讀取清單加入 Report Language 紀錄；步驟 9 checkpoint 更新清單加入 report language 與 HTML docs UI locale；三個 post-checkpoint pass 明確沿用既有語言；語言切換時更新紀錄、記入 Key Design Decisions、僅新更新章節採用新語言。驗證：內容審閱 SKILL.md 對應段落，逐項核對上述五個行為皆有明文規則。
- [x] 1.3 依 design「雙語標題註記格式與英文不變區」，在 SKILL.md 新增輸出語言規則段落，實作 spec「Bilingual annotated structure with English canonical forms」：章節標題與表頭＝英文正典＋全形括號附註（附加、不得取代或前置）；狀態值、決策關鍵字、token 名稱、檔名、token-review: 與 a11y-remap 標記維持英文；敘述內文用報告語言；報告語言為英文時不加任何註記。驗證：內容審閱 SKILL.md 規則段落，含「## Source Inventory（來源清單）」形式的示例與英文不變區清單。

## 2. 模板與參考文件

- [x] 2.1 完成 design「SESSION_STATE 模板新增 Report Language 欄位」：design-system-extractor/assets/design-system-template/design-system/SESSION_STATE.md 的 Current Stage 區段新增「Report Language:」欄位行，Generated Documentation 區段新增「HTML docs UI locale:」欄位行。驗證：內容審閱模板檔案，兩個欄位行存在於指定區段。
- [x] 2.2 更新 design-system-extractor/references/html-documentation.md：記載 --locale 旗標的三值驗證（zh-Hant、en、ja）、缺席預設 zh-Hant、不支援值印 stderr 警告並退回 zh-Hant，以及報告語言對應表（繁/簡中→zh-Hant、日文→ja、英文與其他→en）。驗證：內容審閱該文件，旗標行為與對應表齊備且與 spec 範例一致。

## 3. HTML docs locale 連動

- [x] 3.1 完成 design「generate_docs_html.mjs 新增 --locale 參數並連動報告語言」：實作 --locale 旗標，支援值同時驅動產生時靜態 chrome 標籤與內嵌前端 JS 的預設 locale。驗證：對 starter 模板複本執行 node design-system-extractor/scripts/generate_docs_html.mjs <copy> --locale en，產出 index.html 靜態 chrome 為英文且無 localStorage 首次載入為英文 UI；執行 --locale ko 時 stderr 出現警告、以 zh-Hant 產出且結束碼為 0；不帶旗標時輸出與變更前 zh-Hant 行為一致。
- [x] 3.2 實作 spec「HTML docs default UI locale follows the report language」的 skill 端連動：SKILL.md 步驟 8（HTML Documentation）的指令範例加上 --locale 參數，並寫明由報告語言查對應表決定旗標值。驗證：內容審閱 SKILL.md 步驟 8，指令範例含 --locale 且對應規則明確。

## 4. 端對端驗證

- [x] 4.1 以 starter 模板複本製作含雙語註記標題、表頭與決策關鍵字（例如 keep distinct（保留區分））的範例報告，執行 node design-system-extractor/scripts/audit_sources.mjs <copy> --strict、audit_tokens.mjs <copy> --strict、audit_components.mjs <copy> --strict。驗證：三支 audit 全數輸出 passed，證明附加式註記不破壞既有解析且無需修改 audit scripts。
