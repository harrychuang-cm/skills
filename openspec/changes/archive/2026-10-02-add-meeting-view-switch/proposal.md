## Why

開發者在 Storybook 打開留言面板時，看不到這個 Story 以前留過的留言：面板、Story 上的釘點、編輯與刪除、面板的埋點 prompt 複製，全部只讀「進行中那場會議」。會議一結束，留言就只剩報告頁看得到。實例：cm-chipK ds-lab 的庫存股 prototype（`prototypes-inventory-prototype--default`）在已結束的 `Design review 7/29` 有兩則未完成的埋點留言（下單埋點、設定埋點），面板卻顯示 `No comments on this story yet.`。使用者希望在面板的會議清單上，每一場會議都有一個 View 開關，打開就能在 Story 上看到那份報告的留言與釘點。

## What Changes

- 面板的會議清單改名為 `Meetings`，列出進行中的會議、最近的會議，以及任何含有目前 Story 留言的會議。含有目前 Story 留言的會議旁出現 View 開關，標示這場會議在這個 Story 上有幾則留言。
- View 開關一次只能打開一場：打開一場會自動關掉另一場；打開面板時全部預設關閉，包含進行中的會議。
- 打開某場會議的 View 後，面板清單、類別篩選、Story 上的釘點、編輯與刪除、`Copy tracking prompts` 與 `Copy all stories`，都以那一場會議為範圍。編號就是那份報告上的編號，複製出的 prompt 與報告頁逐字相同。
- 沒有打開任何會議時，清單顯示提示：這個 Story 有留言就請使用者打開某場會議的 View，沒有留言則維持 `No comments on this story yet.`。
- 儲存新留言後，自動打開收到這則留言的會議，讓新釘點立即出現。
- 游標移到或聚焦 Story 上的釘點時，旁邊出現資訊卡：留言內容、類別、狀態、作者、時間與當時的截圖，讓人判斷元件改版後釘點是否已偏移。
- 留言 overview API 在指定 `storyId` 時跨會議回傳該 Story 的留言（每則附上所屬會議 ID），並提供面板會議清單所需的會議資訊；截圖網址改依留言所屬會議產生。未指定 `storyId` 時回應不變。meeting.json 格式不變，不需遷移。
- 修正規格與程式的落差：現行規格禁止面板列出已結束的會議與各自的報告連結，但 0.12.1 的面板已經有 `Recent meetings` 清單與 `Open report`。本 change 更新該需求，以面板的會議清單為準。
- addon 版本由 0.12.1 升為 0.13.0，重建 dist 並同步兩份 Storybook template 副本。

## Non-Goals (optional)

（範圍排除與否決的做法記錄於 design.md 的 Goals / Non-Goals。）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `visual-export-review-comments`: 面板新增會議 View 開關，面板清單、類別篩選、Story 釘點、編輯刪除與埋點 prompt 複製改以「目前檢視的會議」為範圍；新增釘點資訊卡與 overview 的跨會議回應；更新面板可列出會議與報告連結的規定。

## Impact

- Affected specs: `visual-export-review-comments`
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
    - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.css
    - design-system-to-storybook/assets/figma-export-addon/package.json
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/assets/figma-export-addon/dist/（由 build 重新產生）
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
    - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/（與 canonical 同步的副本）
    - design-system-to-storybook/storybook-template/vendor/figma-export/（與 canonical 同步的副本）
    - design-system-to-storybook/references/figma-export-review-setup.md
    - design-system-to-storybook/SKILL.md
    - README.md
  - New: （無）
  - Removed: （無）
- 行為變更：過去展開面板就會顯示進行中會議的留言與釘點，改為預設不顯示，要打開該會議的 View（或儲存一則新留言）才出現。
- 相容性：meeting.json 與報告頁不變；overview 只新增欄位，未指定 `storyId` 的回應不變。
- 相依：不新增任何 npm 相依。
