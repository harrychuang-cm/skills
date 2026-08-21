## Context

design-system-extractor 的萃取報告（design-system/*.md）目前一律以英文產出。三支 audit scripts（audit_sources.mjs、audit_tokens.mjs、audit_components.mjs）以小寫化後的子字串比對（heading.includes、header.includes）解析英文章節標題與表頭；generate_docs_html.mjs 在模組層與內嵌前端 JS 各硬編了一份 DEFAULT_LOCALE = "zh-Hant"，靜態 chrome 標籤以產生時的 DEFAULT_LOCALE 渲染；generate_review_html.mjs 為單語言輸出、無 locale 機制。SESSION_STATE.md 模板目前沒有語言欄位。

## Goals / Non-Goals

**Goals:**

- 第一次萃取時詢問使用者報告語言，預設選項為使用者當下的對話語言，並將決定持久化於 design-system/SESSION_STATE.md。
- 後續 session 與各 post-checkpoint pass 沿用已記錄語言，不重複詢問。
- 報告採「英文正典結構＋選定語言註記與內文」，strict audit 不需修改即可通過。
- 報告語言連動 generate_docs_html.mjs 產出的 HTML docs 預設 UI locale。

**Non-Goals:**

- 不修改三支 audit scripts 的解析邏輯。
- 不為 generate_review_html.mjs 增加多語言支援（維持單語言輸出）。
- 不新增 zh-Hant、en、ja 以外的 HTML UI locale 文案。
- 不回頭翻譯既有萃取產出的套件，也不翻譯 skill 自身的英文指令文件。
- 不引入獨立設定檔（語言只記錄於 SESSION_STATE.md）。

## Decisions

### Report Language 詢問時機與 SESSION_STATE 持久化

在 SKILL.md 的 First Actions 之後、Input Discovery 之前新增「Report Language Resolution」步驟：若 design-system/SESSION_STATE.md 已有 Report Language 紀錄則直接沿用；否則詢問使用者，選項為「對話語言（預設、推薦）」「English」「日本語」「其他（自訂）」。決定以「語言標籤＋人類可讀名稱」格式記錄（例如 zh-Hant (繁體中文)）。選擇理由：SESSION_STATE.md 是 skill 在 First Actions 已強制讀取的檔案，不需新增設定檔；替代方案「每次 session 都詢問」被否決因重複操作過多，「完全自動跟隨對話語言」被否決因缺少明確確認。使用者中途明確要求切換語言時，更新 Report Language 紀錄並在 Key Design Decisions 表記錄切換，之後更新的章節採用新語言；全面重寫僅在使用者要求時進行。

### 雙語標題註記格式與英文不變區

報告語言非英文時，章節標題與表頭維持英文正典文字，並在其後以全形括號附上報告語言註記，例如「## Source Inventory（來源清單）」「| Source ID（來源編號）|」；註記只能附加在英文正典文字之後，不得取代、改寫或前置。以下維持純英文不加翻譯改寫：狀態值（extracted、planned、blocked、out-of-scope 等）、決策關鍵字（merge、keep distinct、reuse existing source、ignore duplicate、make variant、block pending more evidence、re-authorize 等，表格儲存格可在英文關鍵字後附括號註記）、token 名稱、檔名、CSS 註記標記（token-review:、a11y-remap）。敘述性內文（原則說明、證據描述、實作規則、備註）一律使用報告語言。報告語言為英文時完全不加註記。選擇理由：audit scripts 以 includes() 子字串比對，附加式註記不影響解析；替代方案「全面在地化並改寫 scripts」被否決因工程量大且破壞跨 agent 相容性。

### generate_docs_html.mjs 新增 --locale 參數並連動報告語言

generate_docs_html.mjs 新增選用旗標 --locale <zh-Hant|en|ja>：旗標存在且值受支援時，產生時的靜態 chrome 標籤與內嵌前端 JS 的預設 locale 皆採用該值；旗標缺席時維持現行 zh-Hant 預設（向後相容）；旗標值不受支援時印出警告並退回 zh-Hant。報告語言到 UI locale 的對應由 SKILL.md 指示負責：繁體/簡體中文對應 zh-Hant、日文對應 ja、英文對應 en，其他語言一律對應 en。選擇理由：對應邏輯放在 skill 指示層可讓 script 保持簡單的三值驗證；替代方案「script 自動讀取 SESSION_STATE.md 推斷 locale」被否決因 script 需解析自由格式 Markdown、脆弱且隱式。

### SESSION_STATE 模板新增 Report Language 欄位

assets/design-system-template/design-system/SESSION_STATE.md 的 Current Stage 區段新增「Report Language:」欄位行，並於 Generated Documentation 區段新增「HTML docs UI locale:」欄位行，讓每次 checkpoint 都留下語言與 locale 的可稽核紀錄。

### SKILL.md 工作流程與檢查點整合

SKILL.md 需同步更新：First Actions 讀取項目加入 Report Language 紀錄；步驟 8（HTML Documentation）的指令範例加上 --locale 參數與對應規則；步驟 9（Audit And Checkpoint）的 SESSION_STATE 更新清單加入 report language 與 HTML docs UI locale；Post-Checkpoint 各 pass 明確沿用既有語言。references/html-documentation.md 記載 --locale 旗標行為、三值驗證、退回規則與報告語言對應表。

## Implementation Contract

- 行為：使用者在無 Report Language 紀錄的套件上啟動萃取時，agent 於 Input Discovery 前提出一次語言選擇（預設選項＝對話語言）；回答後 design-system/SESSION_STATE.md 出現「Report Language: <tag> (<name>)」紀錄；同一套件的後續 session 不再詢問。
- 行為：報告語言非英文時，產出的 design-system/*.md 章節標題與表頭為「英文正典＋全形括號註記」，狀態值與決策關鍵字保持英文，內文為報告語言；報告語言為英文時輸出與現行完全相同。
- 介面：node <skill-root>/scripts/generate_docs_html.mjs <target-root> [output] --locale <zh-Hant|en|ja>。旗標缺席＝zh-Hant；不受支援的值＝stderr 警告＋退回 zh-Hant，程序不中止。
- 失敗模式：SESSION_STATE.md 存在但 Report Language 行缺漏或無法辨識時，視同第一次萃取重新詢問一次並補記，不得沿用猜測值。
- 驗收：對含雙語註記標題與表頭的範例報告執行 node scripts/audit_sources.mjs <root> --strict、audit_tokens.mjs --strict、audit_components.mjs --strict 全數通過；執行 generate_docs_html.mjs <root> --locale en 後，產出 index.html 的靜態 chrome 標籤為英文且首次載入（無 localStorage）時 UI 為英文；不帶 --locale 執行時輸出與現行 zh-Hant 行為一致。
- 範圍邊界：in scope＝SKILL.md、references/html-documentation.md、assets 模板 SESSION_STATE.md、scripts/generate_docs_html.mjs；out of scope＝三支 audit scripts、generate_review_html.mjs、其他 skill、既有萃取套件的回溯翻譯。

## Risks / Trade-offs

- [雙語註記使表格列變寬、閱讀密度上升] → 註記僅限標題與表頭，儲存格內文直接用報告語言；表頭註記保持簡短。
- [agent 在後續 session 忽略語言紀錄，回退英文輸出] → First Actions 強制讀取 Report Language；checkpoint 清單要求回報語言，偏離時可在審閱時被發現。
- [使用者中途切換語言造成套件內語言混雜] → 切換記錄於 Key Design Decisions；僅新更新章節採用新語言，全面重寫需使用者明確要求。
- [未來 audit scripts 若改為全等比對會破壞註記格式] → references/html-documentation.md 與 spec 記載「附加式註記依賴子字串比對」的前提，修改 audit 比對邏輯時須連動檢查。
