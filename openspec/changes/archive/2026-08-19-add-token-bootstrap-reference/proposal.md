## Why

`frontend-product-implementation` skill 目前在 production 目標 repo 沒有 design token 系統時，只會依 `$design-system-governance` 的規則「停下來詢問是否要先建立 token 系統」，但「如何建立」——從 prototype 的 design-system 來源搬運哪些 token、如何適配 production 的樣式技術——完全沒有程序化指引，導致每次都要使用者在關卡上手動重複指示相同決策。

## What Changes

- 新增 `frontend-product-implementation/references/token-bootstrap.md` 參考文件，程序化定義「production 缺 token 系統／缺元件庫」時的 token 建立與移植流程：
  - 盤點 prototype 端 design-system 來源（design-system-extractor 產出、design-system-to-storybook 的 token 檔、Figma Variables 匯出）的優先順序。
  - 以 handoff 文件實際用到的 token 為準，推導「最小必要 token 子集」，不整包搬運。
  - 依 production 樣式技術選擇落地格式：CSS custom properties、Tailwind config、SCSS variables、React Native StyleSheet/theme 物件等。
  - 保留 ref → sys → comp 三層命名結構與 `$design-system-governance` 的 Token Layer Rules 相容。
  - 定義「無任何 token 來源可搬運」時的 fallback 程序（從 UI_SPEC 與 prototype 樣式檔逆向盤點後停下取得核准）。
  - 定義完成驗收條件與應回報的決策紀錄。
- 修改 `frontend-product-implementation/SKILL.md`：在 Reference Loading 清單加入 token-bootstrap 參考的載入時機（governance gate 觸發「無 token 系統」且使用者同意建立時）。
- 修改 `frontend-product-implementation/references/implementation-workflow.md`：在 Design-System Governance Gate 與 Greenfield Mode 的「無 design system」分支，指向 token-bootstrap 流程。
- 同步安裝：以 scripts/install_agent_skills.mjs 重新安裝，讓 ~/.claude/skills/ 的已安裝副本與 repo 一致。

## Non-Goals

- 不修改 `$design-system-governance` skill 本身——「停下來詢問」的關卡行為維持不變，token-bootstrap 只定義使用者同意建立後的執行程序。
- 不建立自動化 token 轉換工具或 script——本次僅提供程序化文件指引，由執行 skill 的 agent 依文件人工推導。
- 不涵蓋元件庫本身的移植流程——元件缺失仍走既有的「先建立共用子元件」核准關卡；本文件只處理 token 層。
- 不修改 storybook-product-prototype 的 PRODUCTION_HANDOFF.md 模板結構。
- 已否決做法：把流程直接塞進 SKILL.md 主文（會膨脹每次載入的內容；skill 既有慣例是按步驟載入 references）。

## Capabilities

### New Capabilities

- `production-token-bootstrap`: 當 production 目標 repo 缺少 design token 系統或元件庫時，從 prototype 的 design-system 來源推導並移植最小必要 token 子集、適配目標樣式技術、並在無來源時執行逆向盤點與核准流程的程序化指引。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 `production-token-bootstrap`
- Affected code:
  - New: `frontend-product-implementation/references/token-bootstrap.md`
  - Modified: `frontend-product-implementation/SKILL.md`, `frontend-product-implementation/references/implementation-workflow.md`
  - Removed: (none)
