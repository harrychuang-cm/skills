## Why

storybook-product-prototype 的 UI Flow 全鏈路（React/Vue Flow Export 模板、prototype shell CSS、Prototype Inspector）硬編碼 375×812 手機尺寸，而 flow 契約沒有任何欄位能宣告產品是桌面 web——桌面產品的原型會被壓成手機窄框審閱，且 docs/flow.json 的下游消費者（實作 skills、codegen）無法分辨流程的目標 form factor。2026-08-28 的全面審計同時證實：文件宣稱的 `--sbt-sys-size-viewport-compact-*` 覆寫因 preview.js 讀取 `document.documentElement` 而 token 鏈定義在 `.prototype-inspector` scope，實際到不了 iframe 尺寸。

## What Changes

- Flow 契約新增一級欄位：`Flow.viewport { formFactor: "phone" | "tablet" | "desktop", width, height }` 作為單一真相來源、`Route.viewport { width, height }` 逐路由覆寫（支援混合流程）、`meta.surface.target`（web/app/hybrid/package）序列化 Step 1 的平台決策。
- scaffold_prototype.py 新增單一 `--viewport {phone|tablet|desktop|<W>x<H>}` flag（預設 phone；preset 值釘死等於 storybook-template 的 --sbt viewport token tier：phone 375×812、tablet 768×1024、desktop 1280×800）、選配 `--form-factor` 標註自訂 WxH、`--target-surface {web,app,hybrid,package}`（預設 web），並以 argparse regex 驗證 WxH 防止產生語法錯誤的 TS。
- React 與 Vue 的 Flow Export 模板改為執行期讀取 `Flow.viewport`（不再烘死常數），逐路由解析 `route.viewport` 優先；frame 寬度 ≥900px 時 fallback 排版改為 flowGroup 一組一列；route 卡片顯示 formFactor 徽章。
- 互動 prototype 模板在 shell 根元素以 inline CSS 變數注入契約尺寸，讓 `data-prototype-route-preview` 量測回報真實寬度；CSS 模板的 fallback 與 720px 寬版上限改由 scaffold token 決定（phone 維持 720px，tablet/desktop 改為流動 100%）。
- prototypeFlowLayout payload 升版 v2，加入 viewport signature：舊版（手機時代）已儲存的拖拉位置在解析出的 viewport 不符時被乾淨忽略（console.info 告知），而不是把手機座標套在桌面 frame 上疊成一團；v1 payload 在 phone 375×812 下維持原行為。
- Prototype Inspector（skill asset 版）：新增解析鏈 `route.viewport → flow.viewport → form-factor tier CSS token → 375/812 常數`；修正 `getDefaultPreviewDimension` 先讀 `.prototype-inspector` 根元素再讀 `documentElement` 的 scope bug（保留既有 `:root` 覆寫行為）；新增 medium/wide token 橋接與 `--prototype-inspector-active-viewport-*`；auto-grid fallback 間距由解析出的卡片尺寸推導；flow 卡片顯示 formFactor 徽章。
- export_flow.py 在 docs/flow.json 附加選配的頂層 `viewport` 與逐路由 `viewport`（未宣告則省略；`flowSchemaVersion` 維持 1；佈局欄位照舊剝除）。
- validate_prototype.py 新增：已宣告 viewport 的型別/範圍檢查（error）、未宣告時僅在 `--handoff-ready` 提示（warning）、half-converted 檢查（flow 宣告 viewport 但 Flow Export 未讀取）、web-only 產品配 phone viewport 的確認提示，並讓 app 目標判定優先讀取型別化的 `meta.surface.target`（保留 PRODUCTION_HANDOFF 散文剖析為 legacy fallback）。
- test_scaffold_validate.py 矩陣擴充為 {react, vue} × {無 flag, --viewport desktop, --viewport tablet, --viewport 1440x900}，並斷言：無 flag scaffold 維持 phone 預設基準（宣告 phone 375x812、渲染行為與變更前相同；回歸守門）、skill asset 與 storybook-template 兩份 inspector 副本 byte-identical。
- 文件同步：SKILL.md Step 1 訪談加入 viewport 問題與 `--force` 重刷需重複 flag 的警告、ui-flow-contract.md 記錄完整契約與解析順序、visual-quality.md 新增 Desktop Minimum Bar、production-handoff.md 加入 Primary viewport 宣告、storybook-integration.md 與 prototype-standard.md 補齊 token 與檢查清單、native-product-implementation 的 handoff-ingestion 文件記錄容忍新欄位。

同一 commit 需搭配 design-system-to-storybook/storybook-template 子樹的伴生 change（由該子樹自己的 Spectra root 管理）：補完 --sbt viewport medium/wide token（含 height）、更新治理文案、同步 byte-identical 的 inspector 副本。

## Capabilities

### New Capabilities

- `flow-viewport-declaration`: flow 契約的 viewport/form-factor 宣告——Flow.viewport、Route.viewport、meta.surface.target、scaffold CLI flags、模板執行期讀取、layout payload v2 signature、validator 檢查與文件契約。
- `inspector-viewport-resolution`: Prototype Inspector 的 viewport 解析鏈、token bridge scope bug 修正、medium/wide token 橋接、active-viewport 變數與 formFactor 徽章。

### Modified Capabilities

- `flow-codegen`: Flow JSON export 需求的欄位清單加入選配的頂層 viewport 與逐路由 viewport（附加欄位，flowSchemaVersion 維持 1，佈局欄位仍剝除）。
- `flow-navigation-semantics`: app 目標的 presentation 覆蓋率檢查改為優先讀取型別化的 meta surface 宣告，PRODUCTION_HANDOFF 散文剖析降為 legacy fallback。
- `storybook-prototype-vue-support`: scaffold/validate 冒煙測試需求的矩陣擴充 viewport 變體，並新增無 flag scaffold 內容不變與 inspector 副本 byte-diff 的斷言。

## Impact

- Affected specs: flow-viewport-declaration（新）、inspector-viewport-resolution（新）、flow-codegen、flow-navigation-semantics、storybook-prototype-vue-support
- Affected code:
  - New: （無——全部為既有檔案的修改）
  - Modified:
    - storybook-product-prototype/assets/prototype-template/featurePrototypeFlow.ts.template
    - storybook-product-prototype/assets/prototype-template/featurePrototypeMeta.ts.template
    - storybook-product-prototype/assets/prototype-template/FeaturePrototypeFlowExport.tsx.template
    - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
    - storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
    - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototypeFlowExport.vue.template
    - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
    - storybook-product-prototype/assets/prototype-flow-layout/prototypeFlowLayout.ts
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/scripts/scaffold_prototype.py
    - storybook-product-prototype/scripts/validate_prototype.py
    - storybook-product-prototype/scripts/export_flow.py
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/ui-flow-contract.md
    - storybook-product-prototype/references/visual-quality.md
    - storybook-product-prototype/references/production-handoff.md
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/references/prototype-standard.md
    - native-product-implementation/references/handoff-ingestion.md
  - Removed: （無）
- 相依變更：design-system-to-storybook/storybook-template 子樹有伴生 change（該子樹自有 Spectra root），涵蓋 tokens-ref.css / tokens-sys.css 的 medium/wide height token、copy.ts 治理文案、.storybook/prototype-inspector 副本同步；兩個 change 必須一起實作，root 側測試以 byte-diff 斷言副本一致。
