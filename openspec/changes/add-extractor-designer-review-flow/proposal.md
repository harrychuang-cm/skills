## Why

design-system-extractor 的審查頁（docs/design-system/review.html）只能看、不能決定。2026-11-13 對本機套件的實測：7 個套件中有 6 個「Needs review」為 0，原因是 AI 在設計師打開頁面前就自行寫完 merge / keep distinct 決定（80sJP-Grok 的 16 筆決定、5 筆合併都沒有經過人確認），而且合併掉的值會從頁面消失、相近值成對列出會爆量（320 個 ref token 的套件產生 343 對）。同時「有沒有決定」的判斷在 audit 與審查頁各有一份且已不同步，以最小案例重現出四種會誤判成已決定的情況；報告語言的預設也不符合團隊實際需求。

## What Changes

- 審查頁改為可操作的靜態頁：每件審查事項一張卡，顯示 AI 建議與白話理由；設計師同意或調整（打勾保留、未打勾併入最接近的值）；可一次同意全部 AI 建議；產出可直接貼給 AI 的提示詞（整批或單筆）；選擇存在瀏覽器；不需要伺服器或外部資源。
- 相近值改為分組決定（相連的相近值成為一件），不再逐對列出；超過 12 個值的密集階梯以精簡卡片呈現並可展開；每個值顯示實際用途（哪些 sys 角色、哪些元件）；先前已合併的值仍顯示並可拆回。
- **BREAKING** AI 的建議在設計師確認前一律視為待確認：Near Token Decisions 新增 Suggested action 欄，Decision 與 Confirmed by 由確認後填入；採用新欄位的套件，待確認項目會讓 strict token audit 失敗，且確認前不得合併 token。未採用新欄位的既有套件維持相容。
- 修正並統一「是否已決定」的判斷，audit_tokens.mjs 與 generate_review_html.mjs 共用同一份邏輯：token 名稱精確比對、表格列只讀決定欄、a11y-remap 兩邊一致、「待確認」等未決字樣不算決定。**BREAKING** 先前因誤判而通過的相近 token 配對會改為待審。
- 截圖在頁面內放大預覽（符合視窗 / 100% / 200%），不另開分頁。相似元件卡片兩邊各一張截圖，自動對準並框出正在比較的部位（A、B）；Component Similarity Review 的 Visual reference 可記錄兩邊的截圖與區域，並建議存完整截圖加區域而非預先裁切的圖。
- 新增「套用審查決定」流程：AI 收到審查頁產出的提示詞後，逐筆套用（合併、拆回、記錄決定與確認者）、重跑 strict audits、重新產生文件並回報無法套用的項目。
- **BREAKING** 報告語言：第一次使用時詢問，選項為 English（預設）、繁體中文、日本語、其他；預設由「對話語言」改為 English。兩支 HTML 產生腳本未指定 --locale 時改讀套件記錄的報告語言，無紀錄時為 en（原為固定 zh-Hant）。審查頁支援 zh-Hant / en / ja。
- generate_review_html.mjs --json 保留 counts 與 needsReview；counts.needsReview 的意義改為「等待設計師的審查事項數」（以卡片為單位），並新增 items 供 AI 依分組撰寫建議。

## Capabilities

### New Capabilities

- `extractor-review-records`: 審查決定的記錄格式與判定規則——AI 建議與已確認決定的區分、待確認語意、精確比對與單一判定來源、相似元件兩邊截圖與區域的記錄、既有套件相容。
- `extractor-review-page`: 設計師操作的審查頁——分組與密集階梯呈現、用途顯示、決定操作與保存、提示詞導出、頁內截圖檢視與標示、機器可讀輸出、靜態自足與介面規則。

### Modified Capabilities

- `extractor-report-language`: 第一次詢問的選項與預設改為 English、無法詢問時的行為、HTML 產生腳本未指定 locale 時改依套件記錄的語言、審查頁納入 locale 連動。
- `pipeline-board`: 待決定數量改為等待設計師的審查事項數並與審查頁一致；移除「HTML 輸出與變更前逐位元組相同」的情境。

## Impact

- Affected specs: `extractor-review-records`（新增）、`extractor-review-page`（新增）、`extractor-report-language`（修改）、`pipeline-board`（修改）
- Affected code:
  - New:
    - design-system-extractor/scripts/review_core.mjs
    - design-system-extractor/assets/review-page/review.template.html
    - design-system-extractor/scripts/test_review_core.test.mjs
    - design-system-extractor/scripts/test_review_page.test.mjs
    - design-system-extractor/scripts/fixtures/review/（測試用的夾具套件）
  - Modified:
    - design-system-extractor/scripts/generate_review_html.mjs
    - design-system-extractor/scripts/audit_tokens.mjs
    - design-system-extractor/scripts/audit_components.mjs
    - design-system-extractor/scripts/generate_docs_html.mjs
    - design-system-extractor/SKILL.md
    - design-system-extractor/README.md
    - design-system-extractor/references/token-architecture.md
    - design-system-extractor/references/html-documentation.md
    - design-system-extractor/references/collaboration-review.md
    - design-system-extractor/references/agent-integration.md
    - design-system-extractor/assets/design-system-template/design-system/TOKEN_ARCHITECTURE.md
    - design-system-extractor/assets/design-system-template/design-system/COMPONENT_INVENTORY.md
    - design-system-extractor/assets/design-system-template/design-system/SESSION_STATE.md
    - design-system-extractor/docs/extract-flow.html
  - Removed: (none)
- 下游相容：pipeline-board 只讀 counts.needsReview（整數），欄位保留、程式不需修改；design-system-to-storybook 讀取的 Markdown 與 tokens/*.css 內容不減少。
- 檔案重疊：暫存中的 change add-production-extraction-and-mount 也規劃修改 SKILL.md、audit_tokens.mjs 與 TOKEN_ARCHITECTURE.md、COMPONENT_INVENTORY.md、SESSION_STATE.md 模板，後套用的一方需在既有修改上合併。
