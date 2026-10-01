## Why

Visual Comments 的標註流程是為「多人開會審查」設計的，用在開發者獨自連續標註（例如埋點）時阻力很大。以 addon 0.10.0 在真實 Storybook dev server、1280×860 視窗下實測與截圖，確認四個問題：

- 留言輸入框在右側面板最下方：截圖縮圖、操作提示、顯示名稱排在前面，留言文字框與 Save 都落在面板可視範圍之外，必須在面板內捲動才看得到。
- 每次 Start meeting 與 Save comment 都讓預覽整頁重新載入（3 次請求 3 次重新載入），prototype 回到初始狀態，開發者必須重新操作到要標註的畫面。把留言資料夾排除在 Vite 監看之外後，同樣 3 次請求 0 次重新載入。
- 留第一則留言前必須先輸入會議名稱並按 Start meeting；顯示名稱留空時作者記為 Anonymous。
- addon 的 review 樣式檔（留言面板與 export review 共用）有 15 處小於 12px 的字級與 24 處半透明色；依選擇器名稱歸類，留言相關的各佔 11 處與 8 處。留言卡片帶 1px 外框，卡片內的類別標籤與刪除鈕又各有外框。這與專案對介面的既有要求（文字不低於 12px、不用半透明底色、卡片不加外框）不符。

## What Changes

- 留言寫入不再重新載入預覽：addon 的 Vite plugin 自行把留言資料夾、review 狀態檔與 payload 資料夾排除在 dev server 的檔案監看之外，專案設定不需修改。
- 不必先開會議就能留言：沒有進行中的會議時，第一則留言儲存時自動建立一份以日期命名的紀錄；具名會議保留為次要操作，供多人審查使用。
- 留言輸入改為貼著釘點的浮動卡片：點選位置後，卡片出現在釘點旁，內容依序是類別切換、文字框（自動取得焦點）、Cancel 與 Save。不再顯示截圖縮圖；釘點直接在 Story 上拖曳或用方向鍵微調。窄視窗改為停靠在邊緣的面板。
- 留言輸入與面板展開狀態脫鉤：面板收合時也能留言，收合面板不會關閉或隱藏輸入中的卡片。
- 鍵盤快捷鍵：`C` 進入留言模式、`Cmd/Ctrl+Enter` 儲存、`Escape` 取消；可由設定關閉。
- 顯示名稱移出留言輸入，改在面板底部設定一次。
- 面板重排：圖示改為留言圖示；展開後依序是標題與紀錄名稱、主要動作 Add comment、類別篩選（All／Visual fix／Tracking 與數量）、目前 Story 的全部留言清單、底部的身分與會議操作。清單由「最新三則」改為全部留言、面板內捲動。
- 留言相關介面套用視覺規則：文字不低於 12px、背景與邊框不使用半透明色、卡片不加外框、不使用漸層與背景模糊；以瀏覽器測試自動稽核。
- addon 版本升為 0.11.0，重建 dist 並同步兩份 Storybook template 副本。

## Non-Goals (optional)

（範圍排除、否決的做法與已定案的後續項目記錄於 design.md 的 Goals / Non-Goals。）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `visual-export-review-comments`: 留言擷取不再要求進行中的會議；留言輸入由面板內改為釘點旁的浮動卡片並與面板展開狀態脫鉤；待存釘點改在 Story 上調整；面板清單由最新三則改為全部留言並加上類別篩選；新增證據寫入不重新載入、直接留言的自動紀錄、鍵盤快捷鍵、面板內的留言身分、留言介面視覺規則。

## Impact

- Affected specs: `visual-export-review-comments`
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.css
    - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
    - design-system-to-storybook/assets/figma-export-addon/src/options.ts
    - design-system-to-storybook/assets/figma-export-addon/package.json
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/assets/figma-export-addon/dist/（由 build 重新產生）
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/（與 canonical 同步的副本）
    - design-system-to-storybook/storybook-template/vendor/figma-export/（與 canonical 同步的副本）
    - design-system-to-storybook/references/figma-export-review-setup.md
    - design-system-to-storybook/SKILL.md
    - README.md
  - New:
    - design-system-to-storybook/assets/figma-export-addon/test/run-evidence-reload-test.mjs
  - Removed: （無）
- 相容性：留言 API、meeting.json 格式與報告頁不變；既有會議資料不需遷移。新增的設定 `visualComments.shortcuts` 為選填，預設開啟。面板與留言輸入的 DOM 結構改變，依賴舊結構的專案自訂樣式需自行調整。
- 相依：不新增 npm 相依；留言圖示使用已安裝的 @storybook/icons。
- 前置條件：`add-tracking-visual-comments` 需先歸檔，本 change 的留言類別切換、類別篩選建立在它加入的留言類別之上。
