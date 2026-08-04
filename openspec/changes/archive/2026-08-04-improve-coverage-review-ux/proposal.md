## Why

Component Coverage Analyzer 的審核流程有三個實際痛點：(1) AI 分析可能judge錯誤，但 extend（需擴充）區塊的覆核決策沒有「改用現有元件」選項，reusable 區塊也不能標記「不實作」，審核者無法完整推翻 AI 的判斷；(2) 「改用現有元件」的選擇器是列出整個元件目錄的原生 select，目錄一大就找不到目標元件；(3) 標記「不實作」的區塊在實作交接時已被排除，但組裝預覽只是調暗（opacity 0.52），審核者無法直觀看出「這塊不會做」。

## What Changes

- **決策集合擴充**：`extend` 區塊補上 `use-existing`（改用現有元件）；`reusable` 區塊補上 `skip`（不實作）。決策集合有五份鏡像必須同步：contract 型別檔（coverageTypes.ts）、dev API（vite-plugin.mjs）、報告檢查腳本（check-component-coverage-reports.mjs）、analyze 與 implement 兩份 SKILL.md（implement 需新增 extend+use-existing 工作項目列，以及 reusable+skip 排除列）。
- **不實作區塊收合**：組裝預覽中 `skip` 決策的區塊由「調暗」改為「收合為排除狀態」——不再渲染元件預覽，只顯示一列可點擊的排除標示（保留重新覆核入口）。報告 JSON 與 composition 結構不變（每個區塊仍必須被 composition 引用一次），純渲染層行為。
- **可搜尋元件選擇器**：「改用現有元件」的原生 select 改為可搜尋選擇器——搜尋涵蓋名稱、id、分類、keywords；該區塊的分析器候選（matches）優先顯示為快速選項；其餘結果依 category 分組。僅能從清單選取（維持目錄成員資格保證），保留即時試用預覽（draft-override）流程。
- **審核面板漸進揭露**：未選決策前只顯示決策按鈕；選了決策才出現備註欄與儲存動作，降低初始視覺複雜度。extend 區塊的 section 提示文案同步更新。
- **檢查腳本與版本同步**：preview-contract 檢查腳本的字面字串清單隨新 UI 更新並新增選擇器／收合狀態的守護字串；TEMPLATE_MANIFEST 版本 0.7.1 → 0.8.0；兩份 skill 的 SHA-256 重算；installer SKILL.md 追加 0.7.x → 0.8.0 遷移註記。

## Capabilities

### New Capabilities

- `component-coverage-review`: Component Coverage 報告的開發者覆核契約——各區塊分類允許的決策集合、use-existing 的 overrideComponentId 約束、skip 的下游排除語意（預覽收合＋實作排除）、可搜尋元件選擇器行為、確認閘門規則。

### Modified Capabilities

（無——本 skill 先前沒有對應 spec，全部需求收進新 capability）

## Impact

- Affected specs: `component-coverage-review`（新建）
- Affected code:
  - Modified:
    - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
    - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
    - component-coverage-install/template/src/storybook/component-coverage/compositionPreviewModel.ts
    - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
    - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
    - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
    - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
    - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
    - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
    - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
    - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
    - component-coverage-install/template/TEMPLATE_MANIFEST.json
    - component-coverage-install/SKILL.md
  - New: （無新增檔案——選擇器實作於 ReportView.tsx 內，避免更動 template 檔案清單契約）
  - Removed: （無）
