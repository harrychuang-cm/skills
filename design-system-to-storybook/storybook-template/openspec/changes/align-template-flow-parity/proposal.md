## Why

上游 cm-skills 的 change `rebuild-flow-canvas-camera` 把 Prototype Inspector 的 UI Flow 改成相機畫布：連線改錨定在預覽區、框名稱移到畫布外的螢幕座標圖層、背景改為單色，Inspector 也從兩個檔案拆成六個模組。template 自己 Spectra root 的規格還停在舊狀態，一處要求 Static Flow 與 UI Flow 外觀一致（已不可能，兩者使用不同繞線器），另一處的同步規則只涵蓋 `preview.js` 與 `prototype-inspector.css`，新模組、flow layout helper 與 fingerprint 都不在保護範圍內。規格與實際行為不一致，後續修改 template 的人會依錯誤的規格驗收。

## What Changes

- `prototype-ui-flow` 的 Static Flow Export 需求：把「Static flow matches UI Flow visual conventions」情境改為幾何一致。Static Flow 與 UI Flow 共用已存位置與框尺寸（route UI 尺寸加上外框），任兩個框的相對位移在兩者中相同；畫布背景、框外觀、連線繞線與標籤樣式不要求一致。
- `viewport-token-tier` 的「Inspector runtime copies stay in sync with the skill asset」需求：同步範圍從兩個檔案擴大為 `.storybook/prototype-inspector/` 資料夾中的全部六個檔案（`preview.js`、`prototype-inspector.css`、`flow-canvas.js`、`flow-canvas-geometry.js`、`manager.js`、`preset.js`），加上 flow layout helper `src/pages/prototypes/prototypeFlowLayout.ts` 與 `scripts/prototype-review/fingerprint.mjs`。
- 本 change 只對齊規格；template 的程式與文件已由上游 change 更新，實作階段只做驗證。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `prototype-ui-flow`: Static Flow Export 需求的視覺一致情境改為幾何一致（位置與框尺寸）。此規格目前只存在於尚未歸檔的 change `generalize-storybook-template`，必須先歸檔該 change。
- `viewport-token-tier`: Inspector 同步需求的範圍擴大到整個 Inspector 資料夾，加上 flow layout helper 與 fingerprint。

## Impact

- Affected specs: prototype-ui-flow、viewport-token-tier
- Affected code:
  - Modified: openspec/specs/viewport-token-tier/spec.md（歸檔時由 delta 套用）
  - Modified: openspec/specs/prototype-ui-flow/spec.md（generalize-storybook-template 歸檔後產生，再由本 change 的 delta 套用）
  - 驗證對象（不修改）：.storybook/prototype-inspector/preview.js、.storybook/prototype-inspector/prototype-inspector.css、.storybook/prototype-inspector/flow-canvas.js、.storybook/prototype-inspector/flow-canvas-geometry.js、.storybook/prototype-inspector/manager.js、.storybook/prototype-inspector/preset.js、src/pages/prototypes/prototypeFlowLayout.ts、scripts/prototype-review/fingerprint.mjs、src/pages/prototypes/README.md、src/pages/prototypes/example-prototype/docs/FLOW_SPEC.md、src/pages/prototypes/example-prototype/docs/ACCEPTANCE.md、src/pages/prototypes/example-prototype/docs/IMPLEMENTATION_GUIDE.md
- 相依：上游 cm-skills change `rebuild-flow-canvas-camera` 已提供程式、文件與 smoke test 的鏡像檢查；template 的 change `generalize-storybook-template` 需先歸檔。
