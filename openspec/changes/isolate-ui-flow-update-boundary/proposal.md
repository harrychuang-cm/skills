## Why

客製過 Prototype Inspector 的專案無法用安裝器更新 UI Flow：`install_prototype_inspector.mjs --force` 會覆蓋整個 `.storybook/prototype-inspector/`，例如 cm-chipK 的 Components 審查與 Data 自有程式（約 8,000 行）會一起被洗掉。手動合併也容易出錯，原因有三：UI Flow 的樣式混在共用的 `prototype-inspector.css` 裡；Components 也會用到的 `getMeasuredFramePreviewSize` 沒有匯出；UI Flow 也沒有自己的版本號。使用者已決定（2026-10-12），之後各專案以「只更新 UI Flow」為主，保留專案自己的客製工具。

## What Changes

- UI Flow 專屬的樣式規則拆到新檔 `storybook-product-prototype/assets/prototype-inspector/flow-canvas.css`。拆分以規則為單位，涵蓋所有選擇器指向 `.prototype-inspector--flow` 或 `prototype-inspector__flow-*` 的規則，以及包含這些規則的 at-rule。
  - 由 `flow-canvas.js` 先 import `./prototype-inspector.css`、再 import `./flow-canvas.css`，維持原本的串接順序。專案自己的 `preview.js` 不必修改。
  - `prototype-inspector.css` 保留 `--pi-*` token 層，以及 Docs、Components、Data 等非 UI Flow 規則。
  - `flow-canvas.css` 只引用 `--pi-*` token，加上自己的 `--prototype-flow-*` 變數，以及 figma-export addon 帶預設值的 `--sbfx-*` 變數。
- `flow-canvas.js` 新增三個匯出：
  - `getMeasuredFramePreviewSize` 與 `routePreviewMeasurementSelector`，供 Components 審查等其他模式使用。
  - `flowCanvasVersion`，格式為 `flow-canvas-YYYY-MM-DD`。UI Flow 根元素帶 `data-flow-canvas-version`，與專案自己擁有的 `prototypeInspectorBuildTag` 分開。
- `install_prototype_inspector.mjs` 新增 `--ui-flow-only` 模式，可搭配 `--dry-run` 與 `--strip-flow-css`。
  - **只寫入**：UI Flow 模組組合（`flow-canvas.js`、`flow-canvas-geometry.js`、`flow-canvas-hmr.js`、`flow-snapshot.js`、`flow-snapshot-cache.js`、`flow-canvas.css`）。flow layout helper 缺少必要匯出時才換成新版。
  - **寫入前檢查**：
    - 專案的 `preview.js` 必須已經從 `./flow-canvas.js` 匯入 `PrototypeFlow`，否則停下，並說明需要一次性抽離內建的舊版 UI Flow。
    - 專案從 `./flow-canvas.js`、`./flow-canvas-geometry.js` 匯入的名稱，在新版裡都必須還存在。
  - **只列出、不自動改**：`flow-canvas.css` 需要但專案 token 層缺少的 `--pi-*` token，以及專案 `prototype-inspector.css` 裡殘留的舊 UI Flow 規則。殘留規則只有在明確加上 `--strip-flow-css` 時才會移除。
  - **不會修改**：`preview.js`、`manager.js`、`preset.js`、`.storybook/main.*`。
- 同步 template 鏡像，更新 SSR、authority、smoke、install 測試。`references/storybook-integration.md` 與 `SKILL.md` 加入「客製專案只更新 UI Flow」的步驟，並更新 build tag。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `inspector-runtime-distribution`: 新增 UI Flow 模組組合（獨立樣式表、共用匯出、版本號）與安裝器的「只更新 UI Flow」模式。

## Impact

- Affected specs: inspector-runtime-distribution
- Affected code:
  - New:
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.css
    - storybook-product-prototype/scripts/flow_css_rules.mjs
    - storybook-product-prototype/scripts/test_flow_css_rules.test.mjs
  - Modified:
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - storybook-product-prototype/scripts/install_prototype_inspector.mjs
    - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/SKILL.md
  - Removed: (none)
