## Why

`redesign-visual-comment-capture-flow` 讓「留下一則留言」變快，但留完之後的兩件事仍然不順：開發者在 Story 上看不到自己標過哪些位置，以及要把埋點留言交給 AI 時必須離開 Story、切到 Reports 頁才能複製。以 addon 0.10.0 實測截圖確認：儲存留言後 Story 上沒有任何標記；報告頁以原始 ISO 字串顯示時間、截圖與留言上下堆疊（一則留言就佔滿一個螢幕高度）、卡片帶外框。

## What Changes

- Story 上顯示已存留言的釘點：面板展開時，目前 Story 在進行中會議的留言以編號釘點顯示在原位置，可用面板上的開關隱藏；埋點與視覺修正的釘點以形狀區分，已完成的留言以較淡的樣式顯示；留言當時的畫面狀態與目前不同時不顯示釘點。
- 釘點與清單互相對應：點釘點會在面板清單中選取並捲到該留言；游標移到或聚焦清單項目時，對應的釘點會標示出來。點釘點不會觸發底下 prototype 的動作。
- 面板內複製埋點 prompt：面板提供 `Copy tracking prompts`，一次複製目前 Story 未完成的埋點留言；會議內其他 Story 也有未完成的埋點留言時，另提供複製全部的動作。產出的 Markdown 與報告頁的批次複製完全相同。
- prompt 的產生邏輯抽成單一來源，面板與報告頁共用，避免兩份實作漂移。
- 報告頁重新排版：寬螢幕下截圖與留言左右並排；頂部工具列固定，放類別篩選、隱藏已完成的開關與埋點批次複製；時間改為易讀的本地時間；Story 標題改為文字加上 `Open story` 連結。
- 報告頁與會議索引頁套用視覺規則（文字不低於 12px、不用半透明底色與邊框、卡片不加外框、不用漸層與背景模糊），以瀏覽器測試稽核。
- addon 版本升為 0.12.0，重建 dist 並同步兩份 Storybook template 副本。

## Non-Goals (optional)

（範圍排除與否決的做法記錄於 design.md 的 Goals / Non-Goals。）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `visual-export-review-comments`: 新增 Story 上的已存留言釘點與釘點和清單的對應、面板內的埋點 prompt 交付、報告頁的篩選、並排版面、易讀時間與視覺規則。

## Impact

- Affected specs: `visual-export-review-comments`
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-export-addon/src/review.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.css
    - design-system-to-storybook/assets/figma-export-addon/src/figma-code-exporter.css
    - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
    - design-system-to-storybook/assets/figma-export-addon/package.json
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/assets/figma-export-addon/dist/（由 build 重新產生）
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/（與 canonical 同步的副本）
    - design-system-to-storybook/storybook-template/vendor/figma-export/（與 canonical 同步的副本）
    - design-system-to-storybook/references/figma-export-review-setup.md
    - README.md
  - New:
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentPrompt.ts
  - Removed: （無）
- 相容性：meeting.json 格式不變；overview 回應只新增欄位；既有報告在下一次重新產生時套用新版面；`Copy AI prompt` 與批次複製輸出的 Markdown 內容不變。
- 相依：不新增 npm 相依。
- 前置條件：`add-tracking-visual-comments` 與 `redesign-visual-comment-capture-flow` 需先完成並歸檔；本 change 的面板動作、類別篩選與視覺規則建立在它們之上。
