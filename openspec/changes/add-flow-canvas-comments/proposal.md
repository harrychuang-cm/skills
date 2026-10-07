## Why

團隊要在 Prototype Inspector 的 UI Flow 畫布上寫 figma-export 的留言：釘點要綁在畫面框、連線或畫布座標上，平移、縮放、拖曳框時不能跑掉，而且要和 Story 上的留言分開。

addon 端的通用機制由 `add-anchored-visual-comments` 提供，包括外層 decorator、宿主宣告用的 DOM 屬性與事件、錨點與檢視欄位。Inspector 端還沒有提供任何標記，相機移動時也不會通知外部。另外，Inspector 安裝程式目前把自己的 preset 插在 `addons` 清單最前面，會把 addon 包在裡面，使 addon 在 UI Flow 裡不會執行。

## What Changes

- UI Flow 根節點宣告留言檢視 `data-sbfx-view="ui-flow"`，並宣告「此畫面不提供 Figma 匯出」，提示改用 Static Flow（有 Static Flow story 時附上連結）。Docs、Components、Data 模式則宣告不提供匯出與留言。Story 模式不加任何標記，維持原本的匯出與留言。
- route 框的可見區域、流程節點、key 連線加上錨點屬性：id 分別為 `route:<routeId>`、`node:<nodeId>`、`edge:<from>-><to>`，名稱分別取框標題、節點標題、「起點 → 終點」。在完整流程檢視中，viewport 與 world 圖層宣告為畫布，讓空白處的留言記錄畫布座標。
- 相機或拖曳寫入 transform 的同一個畫格，以及每次 React commit 與 viewport 尺寸改變後，發出 `sbfx:anchors-moved`，不增加手勢期間的 React commit。
- 處理 addon 的 `sbfx:reveal-anchor`：移動相機讓指定的框、連線或畫布點出現在畫面上。
- 畫布的快捷鍵處理略過已被其他監聽（例如留言輸入框）處理過的按鍵（`defaultPrevented`）。
- 留言擷取模式啟用時，畫布上的框不接收指標事件，也不進入互動模式，讓點擊落在框上建立留言。這條規則也約束之後的互動模式 change。
- Inspector 安裝程式把 preset 排在 figma-export addon 之後；既有專案若順序相反就調整並回報。
- 文件更新：`storybook-integration.md` 改寫「UI Flow 不支援 visual comments」的段落；`SKILL.md` 的手動檢查清單加入 UI Flow 留言。更新兩份 `preview.js` 的 build tag。

## Capabilities

### New Capabilities

- `flow-canvas-comments`: UI Flow 畫布與 figma-export 留言的整合，包括各模式的宣告、框／節點／連線錨點與畫布宣告、錨點移動通知、顯示位置請求的處理、已處理按鍵的略過、擷取模式優先於框的互動。

### Modified Capabilities

- `inspector-runtime-distribution`: 新增「安裝程式把 Inspector preset 排在 figma-export addon 之後」的需求。

## Impact

- Affected specs: flow-canvas-comments（新）、inspector-runtime-distribution
- Affected code:
  - Modified: storybook-product-prototype/assets/prototype-inspector/flow-canvas.js, storybook-product-prototype/assets/prototype-inspector/preview.js, storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js, design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
  - Modified: storybook-product-prototype/scripts/install_prototype_inspector.mjs, storybook-product-prototype/scripts/test_install_prototype_inspector.mjs, storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs, storybook-product-prototype/scripts/test_authority_inspector.mjs
  - Modified: storybook-product-prototype/references/storybook-integration.md, storybook-product-prototype/SKILL.md
  - New: storybook-product-prototype/scripts/check_flow_canvas_comments.mjs
- 相依與順序：必須在 `add-anchored-visual-comments` 之後套用（需要 addon 0.14.0 已同步到 template）。依使用者規劃，排在 `add-flow-canvas-level-of-detail` 之後；與 `add-flow-journey-focus`、`add-flow-canvas-editing-tools`、`add-flow-frame-interact-mode` 的互動規則寫在本 change 的規格中，先套用的 change 必須遵守。也需要 `rebuild-flow-canvas-camera` 已歸檔並 commit。
