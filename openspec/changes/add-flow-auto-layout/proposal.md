## Why

prototype 一複雜，UI Flow 就很難閱讀：畫面的預設位置是依宣告順序排成格狀，連線在畫布上交錯，使用者得一個一個手動拖曳整理。使用者希望有一鍵「自動排版」，把每個功能流程排成獨立的一列、由左到右，讓 10 個功能就是 10 列，一眼看懂；排好的位置要存起來，之後還能微調，Static Flow 匯出到 Figma 時也同樣整齊。

## What Changes

- UI Flow 的版面控制列最前面新增 `Auto Layout` 按鈕（無障礙名稱 `Auto layout UI Flow`）。按下後依「功能」重新排列整張畫布：每個功能一列，列內依流程順序由左到右；同一列中的分支往下展開成子列；列與列之間留空隙，並在每列第一個畫面的左側顯示功能名稱。
- 功能的來源依序為：flow 宣告的 journeys（`add-flow-journey-focus` 新增）→ 畫面的 `flowGroup` → 依連線自動推導的分支流程（沿用 `add-flow-journey-focus` 的推導）→ 都沒有時整張畫布排成一列。不屬於任何功能的畫面排在最後一列 `Other screens`；分配後沒有任何畫面的列直接丟掉。
- 列內順序只看主要連線（flowLine 為 key 或 reference，且 kind 不是 return 或 global），避免返回鍵與全域導覽打亂順序；循環以宣告順序斷開；彼此沒有連線的畫面群由左到右並排，不疊在同一欄。
- 同一個畫面出現在多個功能時，只放在第一個用到它的那一列；完整畫布上只有它畫出的 key 連線會連到後面的列。
- 結果寫入既有的 UI Flow 排版儲存（與拖曳相同），之後可以再拖曳微調；Static Flow 讀同一份位置。已有自訂排版時先確認再套用，套用後 8 秒內提供 `Undo`。功能名稱另存在 Inspector 自己的 localStorage key，`Reset` 時一起清除，`Export`／`Import` 一併帶上；顯示名稱時 fit 會在畫布左側保留名稱的空間。
- 與 UI Flow 留言（`add-flow-canvas-comments`、figma-export addon 0.14／0.15）：錨點不變，套用與 Undo 的 commit 都會派送 `sbfx:anchors-moved`，畫面與連線上的釘點跟著移動；不會重新載入任何 iframe；空白處的留言留在原本的 world 座標，Inspector 無法偵測，確認對話框與文件會說明。
- journey 簡化檢視（`add-flow-journey-focus`）是唯讀檢視，其中 `Auto Layout` 停用、功能名稱隱藏。
- 排版演算法寫成 `flow-canvas-geometry.js` 的純函式，以固定範例表測試；Inspector 維持零相依。

## Capabilities

### New Capabilities

- `flow-auto-layout`: UI Flow 的一鍵自動排版，包括功能來源的選擇、每列由左到右的排列與子列、共用畫面的歸屬、寫入排版儲存與復原、功能名稱的顯示與保存。

### Modified Capabilities

（無）

## Impact

- Affected specs: flow-auto-layout（新）
- Affected code:
  - Modified: storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js, storybook-product-prototype/assets/prototype-inspector/flow-canvas.js, storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css, storybook-product-prototype/assets/prototype-inspector/preview.js
  - Modified: design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
  - Modified: storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs, storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
  - New: storybook-product-prototype/scripts/check_flow_auto_layout.mjs
  - Modified: storybook-product-prototype/scripts/bench_flow_canvas.mjs（新增 `--layout <匯出檔>`，以 Auto Layout 之後的版面量測）
  - Modified: storybook-product-prototype/references/storybook-integration.md, storybook-product-prototype/references/ui-flow-contract.md, storybook-product-prototype/SKILL.md
- 相依與順序：在 `add-flow-journey-focus`（已 commit `476f381`）之後套用，使用其 `normalizeJourneys`、`deriveBranchJourneys`、`isJourneyEdgeTransition`、`computeJourneyLayout` 的列置中規則、唯讀旗標與簡化檢視；`rebuild-flow-canvas-camera`、`add-flow-canvas-level-of-detail` 與留言 change 已實作並 commit（未歸檔），歸檔順序不影響本 change。不修改 `prototypeFlowLayout.ts`（專案內的排版 helper），已安裝的專案不必重裝 helper。
