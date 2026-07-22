## Context

`agent-automation-orchestrate` 是可攜的多 agent 自動化編排 skill：共用層負責 runner 選擇、fallback、驗證與消毒摘要，專案層以 `.agent-automation/config.json` 與 companion skills 承載差異。現有四種模式（bootstrap、run、resume、status）皆以工程術語為介面，bootstrap 遵循「盡量從 repo 證據推導、證據不足時只針對技術選擇發問」的原則。實際主要使用者是設計師：他們以情境語言描述需求（例如「Figma 元件 ready for dev 後，自動把元件建進 Storybook」），無法回答技術式提問，也無法自行組裝 task contract。每個專案需要的自動化情境各不相同，companion skill 的組合不能寫死。

## Goals / Non-Goals

**Goals:**

- 設計師不需理解 runner、contract、verification 等概念，即可透過白話訪談為任一專案建立可通過既有驗證的 `.agent-automation/config.json`。
- 常見的設計到工程情境（Figma ready-for-dev 建入 Storybook、截圖轉元件、設計系統萃取、視覺比對稽核）以模板收斂訪談成本。
- 面向設計師的狀態回報使用白話詞彙，不暴露內部術語。
- 既有工程操作者的四種模式行為完全不變。

**Non-Goals:**

- 不實作事件驅動觸發（Figma webhook、輪詢、排程）；ready-for-dev 情境在本變更中仍由人工開口觸發，執行時由 companion skill 透過 Figma MCP 檢查元件狀態。事件觸發層留待後續變更。
- 不修改 `agent-automation-orchestrate/scripts/` 下任何腳本，也不改動 runner 或 contract 的 schema。
- 不新增或修改任何 companion skill 本身；情境模板只引用倉庫中既有的 skills。
- 不擴充 `check-agent-automation-skill.mjs` 對模板資產的自動檢查（後續變更可補）。

## Decisions

### 新增 guide 模式而非改寫 bootstrap

在 SKILL.md 的模式清單新增第五種模式 guide，作為設計師入口；bootstrap 保留原樣服務工程操作者。理由：兩種使用者的提問策略相反——bootstrap 的原則是「最少提問」，guide 的原則是「主動訪談」；混在同一模式會使指示互相矛盾。guide 內部沿用 bootstrap 的產出物與驗證（同構的 config.json、同一支 validate 腳本），只替換互動層。已考慮的替代方案：直接把 bootstrap 改寫成訪談式——會破壞既有工程使用情境並違反既有 spec 的最少提問要求，故不採用。

### 情境模板以 JSON 資產存放並以 README 定義結構

模板放在 agent-automation-orchestrate/assets/scenario-templates/，每個情境一個 JSON 檔，目錄內 README.md 定義必要欄位。模板欄位：`id`（kebab-case）、`title` 與 `summary`（設計師語言）、`interview`（訪談問題陣列，每題含 `question`、`options`、對應的 contract 欄位語意）、`recommendedSkills`（建議的 companion skill 名稱，依優先序）、`contractHints`（instruction 模板、verification 推導提示、requiredArtifacts 推導提示）、`prerequisites`（專案前置條件的白話描述與偵測依據）。關鍵約束：`contractHints` 中的 verification 只能是「推導規則」（例如「若 package scripts 含 build-storybook 則採用之」），不得硬編指令——與既有「不得捏造 verification 指令」規則一致。已考慮的替代方案：模板全部寫成 markdown 敘述——欄位齊全性難以維持、AI 轉譯時易漏項，故採 JSON 加 README 結構定義。

### 訪談規則與白話詞彙表集中於 designer-guide.md

新增 agent-automation-orchestrate/references/designer-guide.md，集中三件事：（一）訪談規則——以使用者的語言提問、每題附具體選項、禁止在問題中出現 runner、contract、verification、argv、preflight 等術語、不得要求設計師提供指令或檔案路徑；（二）轉譯規則——訪談答案對應到 contract 欄位的規則表，以及「repo 證據優先、模板提示次之、仍無法解決時以結果導向選項發問」的決策順序；（三）白話詞彙表——狀態回報時的術語轉譯（例如 runner 稱為「執行的 AI 工具」、verification 稱為「完成檢查」、requiredArtifacts 稱為「應該產出的檔案」、fallback 稱為「換下一個 AI 工具重試」）。理由：這些規則被 guide 與 status 兩種模式共用，集中一份避免 SKILL.md 膨脹，符合既有 resource routing 慣例。

### 共用編排腳本維持不變

guide 模式是純指示層與資產層的新增：產出的 config.json 仍由 validate-project-config.mjs 驗證、任務仍由 run-task.mjs 執行、狀態仍由 status.mjs 讀取。理由：維持「共用編排器不含專案與使用者角色差異」的既有分層；設計師導向只是互動語言的差異，不是執行語意的差異。這也讓本變更完全不觸碰既有測試面。

## Implementation Contract

**可觀察行為：**

- 設計師以情境語言請求建立自動化（未指名技術模式）時，skill 進入 guide 模式：先讀取情境模板目錄並以白話列出可選情境（含「都不符合，描述你自己的情境」選項）；設計師選定後逐步訪談，每題附具體選項；訪談完成後 AI 產出 `.agent-automation/config.json`、執行既有驗證腳本，並以白話回報「建立了什麼自動化、之後怎麼觸發」。全程不啟動付費 agent。
- 訪談問題與回報文字不出現 runner、contract、verification、argv、preflight 等內部術語。
- 專案缺少模板宣告的前置條件（例如專案內找不到 Storybook）時，以白話說明缺什麼與影響，停止建立並等待使用者決定，不擅自鷹架。
- 驗證腳本回報錯誤時由 AI 修正 config 後重新驗證，不把錯誤原文丟給設計師。
- 工程操作者使用 bootstrap、run、resume、status 的行為與現狀完全一致。

**介面與資料形狀：**

- 情境模板 JSON 必要欄位：`id`、`title`、`summary`、`interview[]`（每項含 `question`、`options[]`、`mapsTo`）、`recommendedSkills[]`、`contractHints`（含 `instructionTemplate`、`verificationHints[]`、`requiredArtifactHints[]`）、`prerequisites[]`（每項含 `description`、`evidence`）。README.md 為此結構的權威定義。
- guide 模式產出的 config.json 形狀與 references/project-contract.md 定義完全相同，無新增欄位。

**失敗模式：**

- 無任何模板符合 → 進入自訂情境訪談（同樣的訪談規則），不中止。
- 前置條件缺失 → 白話說明並停住，屬預期行為而非錯誤。
- 驗證持續失敗 → 向使用者以白話回報無法完成與原因摘要，不得宣稱已建立成功。

**驗收準則：**

- SKILL.md 模式清單含 guide，且含 guide 的流程段落與 resource routing 條目。
- assets/scenario-templates/ 下存在 README.md 與四個情境 JSON，欄位齊全且符合 README 定義；四個 JSON 中 `recommendedSkills` 引用的名稱均為倉庫中實際存在的 skill 目錄名。
- references/designer-guide.md 含訪談規則、轉譯規則表、白話詞彙表三個段落。
- 以 `node scripts/validate-project-config.mjs` 驗證一份依 figma-ready-to-storybook 模板手動走完轉譯規則產出的示例 config，回傳 `valid: true`（示例置於臨時目錄驗證後即可丟棄，不入庫）。

**範圍邊界：**

- In scope：SKILL.md 的 guide 模式與 description 更新、scenario-templates 資產、designer-guide.md 參考文件。
- Out of scope：scripts 目錄任何改動、contract schema 變更、事件觸發、companion skills 的新增或修改、`agents/openai.yaml` 以外代理中繼資料的調整（openai.yaml 若需同步 description 屬 in scope 的最小更新）。

## Risks / Trade-offs

- [模板的 verification 推導提示在特定專案落空（repo 無對應 script）] → 轉譯規則明定 fallback 順序：repo 證據 → 模板提示 → 以結果導向選項詢問使用者；最終允許空的 verification 陣列（contract 本就允許顯式空陣列），並在回報中白話說明「這個自動化完成後不會自動檢查，建議請工程師補上檢查方式」。
- [設計師期待「ready for dev 自動觸發」，但本變更僅支援人工觸發] → guide 完成時的白話回報必須明說觸發方式（「之後對我說：執行○○自動化」），避免期待落差；事件觸發列為後續變更。
- [SKILL.md 的 description 同時服務工程與設計師觸發語彙，可能變得冗長] → description 僅補充設計師語彙的觸發描述，訪談細節全部下放 designer-guide.md。
- [模板引用的 companion skill 未安裝於目標專案的 runner] → 轉譯規則要求在寫入 contract 前以 repo 證據確認 skill 可用性，不可用時改用次序較後的建議或以白話詢問。
