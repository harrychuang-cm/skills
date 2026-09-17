## Why

使用者需要一個能跨 Cursor、Codex、Claude Code 重用的簡報內容審查 skill：每頁標題是一個結論（觀點＋行動）、副標用理由補充、每頁有 1–3 個能佐證結論的證據（哪個產品做了什麼、得到什麼成長或成果、來源在哪）。既有 `executive-presentation` 負責從零起草提案，沒有針對任意簡報稿逐頁審查的流程；而且這套規則會持續迭代，需要一份可獨立更新、版本化的規則來源。

## What Changes

- 新增 `presentation-review` skill，預設以繁體中文輸出逐頁審查報告：總評、逐頁判定、必改清單、改寫建議、待補證據清單。
- 規則集獨立放在 `presentation-review/references/rules.md`，含固定規則 ID、來源標記（使用者規則／衍生規則）、嚴重度與版本紀錄；SKILL.md 只定義流程並每次讀取規則檔，之後迭代規則不需改寫流程。
- 定義證據品質檢查：主體、做法、成果、來源四要素，證據與該頁結論的關聯性，以及「已驗證成效／做法參考／預期待驗證」的強度標示；改寫建議不得捏造證據，缺口以待補標記。
- 提供 Codex UI metadata，在根目錄 README 新增 skill 小節與安裝、呼叫範例；沿用共用安裝器自動探索。

## Non-Goals

- 不產生 PowerPoint、Google Slides 或 PDF 檔案，不審查版面、配色與視覺設計。
- 不取代 `executive-presentation` 的起草與案例查證流程；需要補找證據時沿用目前環境可用且已授權的查詢能力，不新增工具依賴。
- 不修改其他 skills、共用安裝器或既有規格；不執行 Git commit 或 push。

## Capabilities

### New Capabilities

- `presentation-review-skill`: 依版本化規則集逐頁審查簡報標題、副標與證據，輸出結構化報告與不捏造證據的改寫建議，並支援規則持續迭代。

### Modified Capabilities

無。

## Impact

- Affected specs: presentation-review-skill（新增）。
- Affected code:
  - New: `presentation-review/SKILL.md`
  - New: `presentation-review/references/rules.md`
  - New: `presentation-review/references/review-report-template.md`
  - New: `presentation-review/references/examples.md`
  - New: `presentation-review/agents/openai.yaml`
  - Modified: `README.md`（新增 presentation-review 小節與目錄樹）
- 沿用 `scripts/install_agent_skills.mjs` 的 skill 自動探索與三種 agent 安裝目的地；新增 skill 不需修改程式。
