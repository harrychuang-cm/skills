## 1. 情境模板資產

- [x] 1.1 依 design 決策「情境模板以 JSON 資產存放並以 README 定義結構」建立 agent-automation-orchestrate/assets/scenario-templates/README.md，作為模板必要欄位（`id`、`title`、`summary`、`interview[]` 含 `question`/`options`/`mapsTo`、`recommendedSkills[]`、`contractHints` 含 `instructionTemplate`/`verificationHints`/`requiredArtifactHints`、`prerequisites[]` 含 `description`/`evidence`）的權威定義，並明文規定 verificationHints 只能是推導規則、不得硬編指令。驗證：內容審查——README 欄位定義與 spec 需求「Scenario templates drive the guided interview」所列欄位一一對應。
- [x] 1.2 建立 agent-automation-orchestrate/assets/scenario-templates/figma-ready-to-storybook.json：情境為「Figma 元件標記 ready for dev 後，把元件建進 Storybook」，含設計師語言的 title/summary、訪談問題（來源 Figma 檔案、目標元件範圍、完成後期望看到什麼）、recommendedSkills 依序引用 design-system-to-storybook 與 ui-screenshot-to-storybook-product、prerequisites 宣告專案需已有 Storybook（evidence：package scripts 或 .storybook 目錄）。驗證：欄位齊全符合 README 定義；recommendedSkills 名稱經 ls 對照確認為倉庫實際存在的 skill 目錄。
- [x] 1.3 建立 screenshot-to-component.json（截圖轉可重用元件，引用 ui-screenshot-to-storybook-product）、design-system-extraction.json（設計參考萃取 design system 規格，引用 design-system-extractor）、visual-parity-audit.json（實作與設計稿比對稽核，引用 ui-compare-to-reference 與 ui-pixel-align-report），三檔均位於 agent-automation-orchestrate/assets/scenario-templates/。驗證：同 1.2——欄位齊全、引用的 skill 目錄實際存在。

## 2. 設計師引導參考文件

- [x] 2.1 依 design 決策「訪談規則與白話詞彙表集中於 designer-guide.md」建立 agent-automation-orchestrate/references/designer-guide.md 的訪談規則段落：以使用者語言提問、每題附具體選項、問題與回報中禁止出現 runner、contract、verification、argv、preflight 等術語、不得要求設計師提供指令或檔案路徑、無模板符合時進入相同規則的自訂情境訪談。驗證：內容審查——規則涵蓋 spec 需求「The skill provides a designer-facing guide mode」的全部互動約束。
- [x] 2.2 在 designer-guide.md 加入轉譯規則段落：contract 每個欄位的推導順序為 repo 證據 → 模板提示 → 結果導向選項提問；不得捏造 verification、無法推導時寫入顯式空陣列並以白話說明「無自動完成檢查、建議工程師補上」；寫入 companion skill 名稱前必須以 repo 證據確認可用性；前置條件缺失時白話說明並停住不擅自鷹架。驗證：內容審查——規則覆蓋 spec 需求「Interview answers translate to a valid contract without exposing internals」的三個情境（結果導向提問、前置條件缺失停住、無可推導檢查）。
- [x] 2.3 在 designer-guide.md 加入白話詞彙表段落：至少涵蓋 runner→「執行的 AI 工具」、verification→「完成檢查」、requiredArtifacts→「應該產出的檔案」、fallback→「換下一個 AI 工具重試」、run→「執行一次自動化」、dry-run→「只預覽不執行」。驗證：內容審查——詞彙表可支撐 spec 需求「Designer-facing status reporting uses the plain-language glossary」的回報情境。

## 3. SKILL.md guide 模式

- [x] 3.1 依 design 決策「新增 guide 模式而非改寫 bootstrap」更新 agent-automation-orchestrate/SKILL.md：模式清單由四種擴為五種（新增 guide），並新增 guide 流程段落——讀取情境模板目錄、白話列出情境選單（含自訂情境選項）、依 designer-guide.md 規則訪談、產出 .agent-automation/config.json、執行 validate-project-config.mjs、以白話回報建立結果與觸發方式、全程不啟動付費 agent。驗證：內容審查——段落覆蓋修改後 spec 需求「The skill separates reusable orchestration from project-specific contracts」的 guide 路由情境，且 bootstrap、run、resume、status 四段文字經 git diff 檢視未被更動。
- [x] 3.2 更新 SKILL.md frontmatter description 補充設計師語彙的觸發描述（情境語言請求建立自動化時進入 guide），並在 Resource routing 段落加入 designer-guide.md 與 scenario-templates/ 的讀取時機條目；同步 agents/openai.yaml 的描述做最小更新。驗證：內容審查——description 同時保留既有工程觸發語彙；Resource routing 含兩個新條目；資料夾名與 skill 名稱維持一致以確保安裝器可發現。

## 4. 端到端驗證

- [x] 4.1 依 design 決策「共用編排腳本維持不變」確認 agent-automation-orchestrate/scripts/ 目錄在本變更中零改動（git status 與 git diff 檢視），並執行 node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs 確認既有自檢全數通過。驗證：git diff 對 scripts 目錄為空；自檢命令以零退出結束。
- [x] 4.2 以 figma-ready-to-storybook 模板手動走完 designer-guide.md 的轉譯規則，在暫存目錄產出一份示例 .agent-automation/config.json，執行 node agent-automation-orchestrate/scripts/validate-project-config.mjs --project-root 指向該暫存目錄。驗證：命令回傳 valid: true；驗證完成後刪除暫存示例，不入庫。
