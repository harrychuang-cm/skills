## Why

`agent-automation-orchestrate` 目前的四種模式（bootstrap/run/resume/status）以工程術語為介面，預設操作者能理解 runner、contract、verification、argv 等概念，且 bootstrap 遵循「盡量不問、證據不足時只針對技術選擇發問」的原則。但這個 skill 的主要使用者是設計師：他們無法回答「scaffold-affecting choice」式的技術提問，也無法從零描述 task contract。每個專案的自動化情境又各不相同（不是每個專案都需要 design-system-extractor；有的專案只需要「Figma 元件 ready for dev 後把元件建進 Storybook」），因此需要一層以設計師語言運作的情境式引導，讓不懂技術的設計師也能為不同專案建立可重複執行的自動化工程。

## What Changes

- 在 skill 新增第五種模式 **guide（引導模式）**：當請求來自設計師或以情境語言描述時，skill 改用白話訪談引導使用者，最終仍產出標準的 `.agent-automation/config.json` 並通過既有驗證，技術細節由 AI 在背後代為完成。
- 新增**情境模板目錄**（`agent-automation-orchestrate/assets/scenario-templates/`）：預先定義常見的設計到工程自動化情境（Figma ready-for-dev 元件建入 Storybook、截圖轉元件、設計系統萃取、視覺比對稽核），每個模板包含設計師語言的名稱與說明、訪談問題、對應的 companion skill 建議、預設 verification 與 requiredArtifacts 的推導規則、專案前置條件。
- 新增**設計師引導參考文件**（`agent-automation-orchestrate/references/designer-guide.md`）：定義訪談規則（情境語言提問、禁止技術術語、每次提問附具體選項）、答案到 contract 欄位的轉譯規則、以及面向設計師的白話狀態回報詞彙表（例如 runner → 「執行的 AI 工具」、verification → 「完成檢查」）。
- 更新 `agent-automation-orchestrate/SKILL.md`：加入 guide 模式的流程與資源路由、面向設計師的語言規則，並更新 skill description 使設計師風格的請求（「我想要⋯⋯自動⋯⋯」）能觸發此 skill。
- guide 模式產出的 contract 與既有 bootstrap 產出完全同構：仍以 `scripts/validate-project-config.mjs` 驗證、以 `scripts/run-task.mjs` 執行，共用編排器不變。

## Capabilities

### New Capabilities

- `designer-guided-automation-setup`: 以設計師語言進行的情境式訪談與情境模板層——涵蓋模板目錄結構、訪談規則、答案轉譯為 project contract 的規則、以及白話狀態回報。

### Modified Capabilities

- `agent-automation-orchestration-skill`: 模式清單由四種擴充為五種（新增 guide）；guide 模式必須在不暴露技術詞彙的前提下產出可通過既有驗證的 project contract，且不啟動付費 agent。

## Impact

- Affected specs: `designer-guided-automation-setup`（新增）、`agent-automation-orchestration-skill`（修改）
- Affected code:
  - New: agent-automation-orchestrate/references/designer-guide.md
  - New: agent-automation-orchestrate/assets/scenario-templates/README.md
  - New: agent-automation-orchestrate/assets/scenario-templates/figma-ready-to-storybook.json
  - New: agent-automation-orchestrate/assets/scenario-templates/screenshot-to-component.json
  - New: agent-automation-orchestrate/assets/scenario-templates/design-system-extraction.json
  - New: agent-automation-orchestrate/assets/scenario-templates/visual-parity-audit.json
  - Modified: agent-automation-orchestrate/SKILL.md
  - Modified: agent-automation-orchestrate/agents/openai.yaml
