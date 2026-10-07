## Why

團隊希望在 Prototype Inspector 的 UI Flow 畫布上也能用 figma-export addon 寫留言，而且 UI Flow 上的留言要和 Story 上的留言分開。現在的 addon 做不到，原因有三個：

- 留言 decorator 寫在專案的 `.storybook/preview.ts`。Storybook 會把它放在 Inspector 的 decorator 裡面，所以 UI Flow 模式根本不會執行 addon。
- 釘點只記錄「在擷取區域裡的比例位置」。在可以平移、縮放、拖曳框的畫布上，畫面一動釘點就會跑掉。
- 留言沒有「檢視」的區分，同一個 story 的 Story 留言和 UI Flow 留言會混在同一份清單與報告裡。

本 change 讓 addon 提供一套不依賴特定宿主的機制。宿主（例如 Inspector）只要在 DOM 上加標記、發出事件，就能讓留言綁定在畫面元素、連線或畫布座標上。Inspector 端的接入由後續 change `add-flow-canvas-comments` 處理。

## What Changes

- 新增外層的自動 decorator：addon 的 `./preview` 入口輸出 `decorators`，專案改為在 `preview.ts` 呼叫 `configureFigmaExportReview(...)` 登記設定。因為 addon 在 `addons` 清單中排在 Inspector 前面，這個 decorator 會包在 Inspector 外層，所以在每一種 Inspector 模式都會執行。既有的 `createFigmaExportReviewDecorator` 用法維持相容；兩種寫法同時存在時，只會掛載一次。
- 宿主可以用 DOM 屬性宣告：
  - 目前的留言檢視（`data-sbfx-view`）。
  - 此畫面不提供 Figma 匯出（`data-sbfx-export="unavailable"`，可附替代連結）。
  - 此畫面不提供留言（`data-sbfx-comments="unavailable"`）。
- 宿主可以宣告留言錨點：
  - 元素錨點（`data-sbfx-anchor`）：釘點記錄錨點 id 和元素內的位置。
  - 連線錨點（SVG 線段加 `data-sbfx-anchor-kind="path"`）：釘點記錄沿線的位置。
  - 畫布錨點（`data-sbfx-canvas` 與 `data-sbfx-canvas-world`）：釘點記錄畫布座標，以及附近的錨點。
- 已存釘點依錨點即時定位：宿主發出 `sbfx:anchors-moved` 時，addon 在同一個畫格更新釘點；錨點不在畫面上時隱藏釘點，清單提供「顯示位置」，並發出 `sbfx:reveal-anchor` 請宿主移動畫面。
- 留言記錄檢視類型（沒有標記的舊留言視為 `story`）。面板清單、計數、釘點只顯示目前檢視的留言，並提供切換；報告可依檢視篩選；AI 提示文字也帶出錨點描述。
- 綁在元素上的留言，截圖改為擷取該元素裡的同源 Storybook 預覽頁面；綁在連線或畫布上的留言，擷取畫布容器，並把畫面中可見的框頁面（最多 12 個）畫進截圖。
- 擷取模式只有主要按鍵會放置釘點，同一次點擊序列的第二下與雙擊也會被攔下；addon 處理的 Esc 不再傳到宿主。
- 截圖時保留 SVG 子元素由樣式表設定的繪製樣式（fill、stroke 等）。目前用 CSS class 設定的線條與圖示，在截圖中會變成黑色色塊或消失。
- 修正工作區沒有替 Story 畫布保留空間的錯誤：保留寬度與高度的 CSS 變數目前只定義在 `.sbfx-workspace` 上，`#storybook-root` 讀不到。
- 接線工具與 template 改用 `configureFigmaExportReview`，並把 addon 排在 prototype inspector preset 之前。
- addon 版本升為 0.14.0，重新 build dist，並同步兩份 template 鏡像。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `visual-export-review-comments`: 新增留言檢視、宿主宣告的錨點（元素、連線、畫布）、依錨點即時定位與顯示位置請求、錨點截圖、截圖保留 SVG 樣式、錨點資料的驗證與相容、擷取模式的按鍵與點擊處理、宿主宣告不提供留言等需求。
- `figma-export-workflow`: 新增自動登記的外層 decorator 與 `configureFigmaExportReview`、宿主宣告不提供匯出、工作區對可伸縮的 Story 根節點保留空間、接線時 addon 排在 inspector preset 之前等需求。

## Impact

- Affected specs: visual-export-review-comments、figma-export-workflow
- Affected code:
  - Modified: design-system-to-storybook/assets/figma-export-addon/src/preview.ts, design-system-to-storybook/assets/figma-export-addon/src/review.ts, design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts, design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentPrompt.ts, design-system-to-storybook/assets/figma-export-addon/src/overlay.ts, design-system-to-storybook/assets/figma-export-addon/src/figma-code-exporter.css, design-system-to-storybook/assets/figma-export-addon/src/review.css, design-system-to-storybook/assets/figma-export-addon/package.json, design-system-to-storybook/assets/figma-export-addon/README.md, design-system-to-storybook/assets/figma-export-addon/dist/
  - Modified: design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/run-package-contract-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html, design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs, design-system-to-storybook/assets/figma-export-addon/test/.gitignore
  - New: design-system-to-storybook/assets/figma-export-addon/src/commentAnchors.ts, design-system-to-storybook/assets/figma-export-addon/src/reviewRegistry.ts, design-system-to-storybook/assets/figma-export-addon/test/anchor-fixture-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/run-anchor-fixture.mjs, design-system-to-storybook/assets/figma-export-addon/test/anchor-fixture-frame-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/anchor-fixture-frame.html, design-system-to-storybook/assets/figma-export-addon/test/review-decorator-fixture-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/run-review-decorator-fixture.mjs
  - Modified: design-system-to-storybook/scripts/lib/figma_export_wiring.mjs, design-system-to-storybook/scripts/test_install_figma_export_addon.mjs, design-system-to-storybook/references/figma-export-review-setup.md, design-system-to-storybook/SKILL.md
  - Modified: design-system-to-storybook/storybook-template/.storybook/preview.ts, design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/, design-system-to-storybook/storybook-template/vendor/figma-export/
- 相依與順序：本 change 不修改 Prototype Inspector；Inspector 端的標記與事件由 `add-flow-canvas-comments` 實作，它必須在本 change 之後套用。
