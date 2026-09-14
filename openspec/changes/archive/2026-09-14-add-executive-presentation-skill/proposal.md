## Why

使用者需要將會議記錄、原始資料或簡報主題快速轉成結論先行的高階企業簡報，並在 Cursor、Codex、Claude Code 重用同一套規則。現有倉庫以設計與工程工作流程為主，尚無此簡報內容生成 skill。

## What Changes

- 新增 executive-presentation skill，預設以繁體中文 Markdown 產出四頁簡報內容：核心結論與效益、MECE 支撐理由、數據與風險、行動方案。
- 定義來源、推估、缺資料及負責單位與時程未確認時的標示，避免虛構 ROI 或承諾。
- 提供 Codex UI metadata，在根目錄 README 說明三種 agent 的呼叫與安裝方式；沿用現有共用安裝器。
- 驗證 skill 格式、四頁內容規則及三個 agent 的安裝副本一致性。

## Non-Goals

- 不新增簡報渲染引擎、外部帳號或套件依賴；預設交付可直接貼入簡報工具的內容，明確要求檔案時才使用環境可用能力。
- 不改動其他 skills、共用安裝器或 UI 工程流程，也不執行 Git commit 或 push。

## Capabilities

### New Capabilities

- `executive-presentation-skill`: 可跨 agent 使用、遵循 BLUF、金字塔原理與 MECE 的四頁企業簡報內容生成流程。

### Modified Capabilities

無。

## Impact

- Affected specs: executive-presentation-skill（新增）。
- Affected code:
  - New: `executive-presentation/SKILL.md`
  - New: `executive-presentation/agents/openai.yaml`
  - Modified: `README.md`
- 沿用 `scripts/install_agent_skills.mjs` 的 skill 自動探索與三種 agent 安裝目的地；新增 skill 不需修改程式。
