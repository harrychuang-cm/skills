## Why

Story 與 UI Flow 上已存的留言釘點目前只能點選。要調整位置得先在清單按 Edit，打開畫面正中央的彈窗，再在截圖上拖曳；而連線與空白處的留言完全不能移動。審查會議中，使用者需要像在 Figma 裡一樣，直接把釘點拖到正確的位置，並在釘點旁邊就地修改內容。

## What Changes

- 已存釘點可以直接在 Story 或 UI Flow 畫布上拖曳：按住後移動超過 4 個 CSS 像素才開始拖曳，沒超過就維持原本的點擊選取；拖曳中按 Esc 放回原位。釘點聚焦時，方向鍵每次移動 1 像素、Shift + 方向鍵每次 10 像素，停止按鍵 600ms 或失去焦點後儲存。
- 放開時依建立留言的順序重新判定位置：框 → 連線（8 像素內）→ 空白畫布。沒有錨點的留言在沒有錨點的畫面上更新比例位置。有錨點的留言如果放在判定不出錨點的地方，會放回原處並提示。
- 截圖上的點：在同一個框內移動，或沒有錨點的留言移動時，截圖上的點跟著更新。換到別的框、連線或空白處，以及連線或空白處的留言被移動時，保留原截圖與原截圖上的點，並在留言記下 `movedAt`；清單、釘點資訊卡與報告顯示 `Moved since the screenshot`，AI 提示的位置行加上註記。
- 伺服器的留言修改（PATCH）新增 `anchor` 與 `movedAt` 欄位。只送 `anchor` 時，由伺服器決定更新截圖上的點或記下移動時間；`anchor`、`pin`、`movedAt` 一起送出時視為還原，供「復原」使用。沿用既有的錨點驗證。舊版伺服器會以驗證錯誤拒絕新欄位，面板把釘點放回原處並顯示錯誤。
- 儲存成功後顯示約 5 秒的 `Comment moved.` 與 `Undo`；Undo 送出還原請求。
- Edit 不再開在畫面正中央：釘點在畫面上時，編輯面板開在釘點旁邊，位置規則與撰寫留言的輸入框相同（寬 320 像素、距釘點中心 24 像素、靠近右緣時翻到左側、上下保留 12 像素；視窗寬度小於 720 像素時貼齊底部或頂部），並跟著釘點移動。面板內有 `Comment type`、內容、`Cancel` 與 `Save changes`。釘點不在畫面上時，先請宿主顯示位置；宿主處理後開在釘點旁，否則退回現有的置中彈窗。
- 點擊已存釘點（沒有拖曳）會直接開啟該留言的編輯面板，同時照舊選取清單中的留言；編輯面板最上方顯示留言當時的截圖與截圖上的編號點（不能拖曳；已移動的留言加註 `Moved since the screenshot`），下方是類型與內容。開著編輯面板時不顯示同一則留言的滑鼠預覽卡（2026-10-06 使用者要求）。
- addon 版本升為 0.15.0；README 新增「Upgrading from 0.14.x」。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `visual-export-review-comments`: 已存釘點可直接拖曳並重新判定錨點；移動標記與復原；留言修改請求新增 `anchor` 與 `movedAt`；Edit 改為開在釘點旁的編輯面板，置中彈窗只在釘點不在畫面上時使用。

## Impact

- Affected specs: visual-export-review-comments
- Affected code:
  - Modified: design-system-to-storybook/assets/figma-export-addon/src/review.ts, design-system-to-storybook/assets/figma-export-addon/src/review.css, design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts, design-system-to-storybook/assets/figma-export-addon/src/commentAnchors.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts, design-system-to-storybook/assets/figma-export-addon/src/review-server.ts, design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts, design-system-to-storybook/assets/figma-export-addon/src/visualCommentPrompt.ts, design-system-to-storybook/assets/figma-export-addon/package.json, design-system-to-storybook/assets/figma-export-addon/README.md, design-system-to-storybook/assets/figma-export-addon/dist/
  - Modified: design-system-to-storybook/assets/figma-export-addon/test/anchor-fixture-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs, design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
  - Modified: design-system-to-storybook/references/figma-export-review-setup.md, design-system-to-storybook/SKILL.md, design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/, design-system-to-storybook/storybook-template/vendor/figma-export/
  - Modified: storybook-product-prototype/scripts/check_flow_canvas_comments.mjs（只加端對端檢查案例）
- 相依與順序：必須在 `add-anchored-visual-comments` 與 `add-flow-canvas-comments` 之後套用（需要錨點、`ui-flow` 檢視與 UI Flow 的錨點標記）。Prototype Inspector 的執行檔不修改。
