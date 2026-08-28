## Why

frontend-product-implementation 與 native-product-implementation 目前透過 design-system-governance 的 Composition Gate 要求「先用既有元件組裝」，但這只是原則性規則：handoff 元件對應到 production 既有元件的結果只出現在最終回報文字中，沒有任何一個在寫 UI 程式碼之前就必須完成、且可被機器稽核的產物。實作 pass 可以先寫完程式碼再回填對應清單，重建已存在元件的浪費（或未經核准的新元件）只能靠人工回顧發現。

## What Changes

- 在兩個實作 skill 中新增強制的前置產物「Component Reuse Map」：寫任何 UI 程式碼之前，範圍內每個 handoff 元件都必須先對照 production repo 解析為 reused / composed / extended / created / deferred 之一，未能解析的元件即觸發 governance 的 Composition Gate 提問。
- 解析時優先消費 handoff 既有的機器來源：PRODUCTION_HANDOFF.md 的 Per-screen composition echo 與 meta.components 的 targets 欄位（platform-component-mapping 能力）作為候選名單種子，對 targets 指名的 production 元件做存在性驗證而非重新搜尋。
- IMPLEMENTATION_MAP.md 由四段合約擴充為五段：新增 Component Map 段，逐列記錄 handoff 元件 → production 元件的解析結果與證據路徑。
- frontend-product-implementation/scripts/validate_implementation.py 新增對 Component Map 段的稽核：段落存在、每列為終態值、reused/composed/extended 列的證據路徑存在於 production root 之下、created 列附核准記錄；handoff 無元件清單時允許以 source: none 宣告並跳過逐列檢查。
- native-product-implementation 透過 Inherited Shared Contracts 清單繼承同一合約，並在其 implementation-workflow 的 Design-System Governance Gate 中落實原生端的解析步驟。

## Capabilities

### New Capabilities

- `component-reuse-map`: 兩個實作 skill 在 UI 實作前必須完成的元件重用解析門檻——列來源、解析詞彙、與 governance Composition Gate 的銜接、以及完成時序。

### Modified Capabilities

- `implementation-validation`: IMPLEMENTATION_MAP.md 合約由四段擴充為五段（新增 Component Map），validate_implementation.py 新增對應稽核檢查。

## Impact

- Affected specs: `component-reuse-map`（新增）、`implementation-validation`（修改）
- Affected code:
  - Modified: frontend-product-implementation/SKILL.md, frontend-product-implementation/references/implementation-workflow.md, frontend-product-implementation/references/verification-reporting.md, frontend-product-implementation/scripts/validate_implementation.py, native-product-implementation/SKILL.md, native-product-implementation/references/implementation-workflow.md, native-product-implementation/references/verification-reporting.md
  - New: （無）
  - Removed: （無）
