## Context

figma export addon（canonical 來源 design-system-to-storybook/assets/figma-export-addon，目前 0.12.1）的 Visual Comments 把每場會議存成 design-system/figma-export-review/sessions/<session-id>/meeting.json；每則留言透過 capture 記錄所屬的 Story ID。

面板的資料全部來自 `GET <commentsApiPath>?storyId=<id>`（store 的 `getOverview`）。現況：

- `getOverview` 只讀 state.json 指向的進行中會議，從中挑出目前 Story 的留言；沒有進行中會議時 `comments` 為空陣列。已結束的會議只出現在 `recentSessions`（標題與總數，最多 20 場）。
- review-server 把每則留言的截圖網址組成 `<basePath>/reports/sessions/<進行中會議 ID>/assets/<檔名>`。
- 面板的清單、類別篩選數量、Story 上的釘點都從 `overview.comments` 產生；編輯與刪除的請求路徑寫死為進行中會議的 ID；`Copy tracking prompts`／`Copy all stories` 只在有進行中會議時出現，讀取進行中會議的 meeting.json。
- 面板的 `Recent meetings` 區塊列出最多 5 場已結束的會議（標題、總留言數、`Open report`），不含進行中的會議。
- 編號是會議編號（meeting.comments 陣列中的位置），報告頁與面板一致。
- store 的 `updateCommentDetails`、`resolveComment`、`deleteComment` 不檢查會議是否已結束；已結束會議的留言可被修改與刪除（報告頁已在使用）。
- 規格與程式不一致：主規格「Discoverable active and historical meetings」規定面板不得列出已結束會議、各自的報告連結與歷史標題，但 0.12.1 的面板已經有 `Recent meetings` 清單與 `Open report`。
- 測試中有多處以不帶 `storyId` 的 `getOverview()` 驗證進行中會議的行為（store 測試、HTTP 測試的 closed／after-delete overview）。

實例：cm-chipK/ds-lab/project 的 `Design review 7/29` 於 2026-10-02 結束，內含 `prototypes-inventory-prototype--default` 的兩則未完成埋點留言；之後又有 `Design review 10/2`（2 則）。目前沒有進行中會議，面板顯示 `No comments on this story yet.`。

使用者決定（2026-10-02）：每場會議在面板清單上有一個 View 開關；一次只能打開一場；打開面板時全部預設關閉。

## Goals / Non-Goals

**Goals:**

- 在面板上挑一場會議，就能把那份報告在目前 Story 上的留言與釘點疊到 Story 上，不需要開報告頁。
- 疊上來的編號、留言、複製出的 prompt 都與那份報告一致。
- 已結束會議的留言可以直接在面板上編輯、刪除，並把未完成的埋點留言交給 AI。
- 元件改版後，看釘點的人能從當時的截圖判斷釘點是否還對得上。
- 報告頁、meeting.json、未指定 `storyId` 的 overview 行為不變。

**Non-Goals:**

- 不支援同時檢視多場會議，也不引入跨會議的編號。
- 不在面板加入 Complete／Reopen；完成狀態仍在報告頁切換。
- 不加入已完成留言的隱藏開關；已完成的留言維持現行的淡色呈現。
- 不記住 View 開關的狀態（不寫入瀏覽器儲存空間）。
- 不自動修正或偵測元件改版後偏移的釘點。
- 不改報告頁、會議索引頁、新增留言時寫入哪一場會議的規則。
- 不加入 overview 的快取或分頁；不改 5 秒輪詢。
- 不變更 meeting.json 格式，不做資料遷移。

## Decisions

### overview 在指定 storyId 時跨會議回傳該 Story 的留言與面板會議清單

**Supersedes**: redesign-visual-comment-capture-flow / 面板清單顯示目前 Story 的全部留言並提供類別篩選

`getOverview(storyId)` 讀取所有會議，回傳每一場中屬於該 Story 的留言，每則新增衍生欄位 `sessionId`；`ordinal` 仍是會議編號。回應新增 `meetings`：面板會議清單的資料，包含進行中的會議、`recentSessions` 中最新的 5 場、以及任何含有該 Story 留言的會議（去重），依 `startedAt` 由新到舊。每場提供 `id`、`title`、`startedAt`、`closedAt`、`active`、`commentCount`（整場）、`storyCommentCount`（該 Story）、`tracking: { open, total }`（整場、不分 Story）、`projectRelativeSessionPath`。review-server 為每則留言依其 `sessionId` 組截圖網址，並為每場會議加上 `reportUrl`。

未指定 `storyId` 時回應與 0.12.1 相同（只含進行中會議的留言），只多出每則留言的 `sessionId`，沒有 `meetings`。理由：既有測試與任何不帶 `storyId` 的呼叫者依賴這個行為，而面板永遠帶 `storyId`。

每次 overview 每份 meeting.json 只讀一次，`listMeetings` 與留言彙整共用同一批讀取結果（現況是讀全部會議後再對進行中會議讀第二次）。

替代方案：面板打開 View 時才呼叫 `GET /sessions/<id>` 取那場會議。否決，因為清單上要先知道每場在這個 Story 有幾則留言，才能決定哪些會議顯示開關；而且 overview 已經在輪詢，分開取只是多一次請求與一份同步邏輯。

### 面板的 View 開關一次只檢視一場會議，預設全部關閉

面板維護一個只存在記憶體的「目前檢視的會議」，面板掛載時與切換 Story 時為無。`Meetings` 區塊每一列是一場會議：標題（進行中的會議加上 `Active` 標記）、整場留言數、View 開關、`Open report`。只有 `storyCommentCount` 大於 0 的會議顯示 View 開關，開關為 `role="switch"` 的按鈕，可見文字為 `View <storyCommentCount>`，以 `aria-checked` 表示狀態。打開一場會關掉原本打開的那場；關掉目前那場則回到無。檢視中的會議失去這個 Story 的最後一則留言時，回到無。

理由：一次一場讓面板與報告一一對應——編號就是報告編號，不會出現兩個 1 號，複製出的 prompt 與報告頁逐字相同，不必引入新的編號體系。預設關閉是使用者的選擇，讓打開面板時 Story 不會被釘點蓋住。

替代方案：可同時開多場、改用跨會議的 Story 編號。否決（使用者選擇一次一場），因為面板編號會與報告不同。

替代方案：預設打開進行中或最近一場有留言的會議。否決（使用者選擇預設關閉）。

### 面板的清單、篩選、釘點、編輯、刪除、複製都以檢視中的會議為範圍

清單列出檢視中會議在目前 Story 的留言；類別篩選的數量、Story 上的釘點、`Captured in another state` 都只看這些留言。編輯（`PATCH`）、刪除（`DELETE`）送往留言的 `sessionId`，已結束的會議也可以。`Copy tracking prompts` 收集檢視中會議在目前 Story 的未完成埋點留言；`Copy all stories` 在檢視中會議的其他 Story 也有未完成埋點留言時出現，收集整場的；兩者都用會議編號，讀取 `GET /sessions/<檢視中的會議>`，專案相對路徑與截圖基準取自該會議的 `meetings` 項目。輸出與那份報告的批次複製逐字相同。複製區塊在檢視中會議有任何埋點留言時出現，不再要求有進行中會議。

沒有檢視中的會議時：類別篩選仍顯示（數量皆為 0），Story 上沒有已存釘點，清單位置顯示提示——這個 Story 在任何會議有留言時為 `Turn on View for a meeting below to see its comments and pins.`，沒有則維持 `No comments on this story yet.`；複製區塊不顯示。

檢視中的會議存在時，清單上方顯示一行說明 `Viewing <會議標題>`，讓捲動到清單時也知道目前看的是哪一場。

**Supersedes**: add-visual-comment-overview-and-handoff / 面板的複製以目前 Story 為預設範圍

### 儲存新留言後自動檢視收到它的會議

新增留言的寫入規則不變（進行中會議；沒有時自動建立 `Notes YYYY-MM-DD`）。儲存成功後，面板把檢視中的會議設為收到這則留言的會議，新釘點因此立即出現。面板只採用最新發出的 overview 請求結果；只有在沒有更新的請求還在路上時，才會因「檢視中的會議在這個 Story 已無留言」而清除檢視，避免儲存後的重新讀取被輪詢取代時，舊資料把剛打開的檢視清掉。新留言預覽釘點的號碼維持「進行中會議的留言數加 1」，與儲存後在該會議中的編號一致。

理由：預設關閉時，若儲存後不自動切換，使用者剛留的釘點會「消失」，看起來像存檔失敗。

### 釘點資訊卡在游標移入或聚焦時出現

游標移到 Story 上的已存釘點或鍵盤聚焦它時，釘點旁出現資訊卡；移開或失焦即消失，同時最多一張。內容依序：`Comment <會議編號> · <類別> · <Open|Completed>`、留言內容（最多 3 行，超出以省略號截斷）、`<作者> · <時間>`、當時的截圖縮圖（寬度上限 240px；沒有截圖或載入失敗時顯示 `Screenshot unavailable`）。資訊卡帶 `data-sbfx-capture-ignore`、`pointer-events: none`。寬度為 264px 與「視窗寬減 24px」中較小者。放在釘點 inline-end 側 12px；距視窗 inline-end 邊不足 12px 時改放 inline-start 側；垂直方向平移到距視窗上下邊至少 12px。兩側都放不下時（例如手機寬度 375px 的預覽，釘點位於中段），改放在釘點下方 12px，下方不足時改放上方，水平置中於釘點並夾在視窗內 12px，避免蓋住要比對的釘點。定位寫成 `visualComment.ts` 中的純函式 `getSavedPinCardPlacement`，與輸入卡片的 `getCommentComposerPlacement` 並列，並以純函式測試涵蓋 375px 寬的情況。新增留言進行中（釘點為被動狀態）時不出現。遵守既有的留言介面視覺規則（文字至少 12px、無半透明底色與邊框、卡片無外框、無漸層與背景模糊）。

理由：舊會議的留言疊回目前的元件時，版面可能已變；並排看當時的截圖是最直接的判斷方式。

替代方案：在清單項目放截圖縮圖。否決，0.11.0 才為了讓清單精簡而移除縮圖；資訊卡只在需要時出現。

### 以面板會議清單為準更新規格

主規格「Discoverable active and historical meetings」中「面板不得列出已結束會議與各自的報告連結」與 0.12.1 的實作不符，且本 change 需要這份清單。更新為：面板保留唯一的 `Reports` 連結到會議索引，並在 `Meetings` 區塊列出會議與各自的 `Open report`。報告索引頁的規則不變。

## Implementation Contract

**行為（使用者可觀察到的結果）**

- 以 Context 的實例：展開庫存股 prototype 的面板，Story 上沒有釘點，清單位置顯示 `Turn on View for a meeting below to see its comments and pins.`；`Meetings` 區塊中 `Design review 10/2` 與 `Design review 7/29` 各有 `View 2` 開關（以實際含有該 Story 留言的數量為準）。打開 `Design review 7/29` 的 View：清單出現下單埋點、設定埋點，編號與該報告相同，Story 上出現兩個方角釘點，`Copy tracking prompts` 可用。再打開 `Design review 10/2`：7/29 的開關自動關閉，清單與釘點換成 10/2 的。
- 游標移到釘點出現資訊卡。
- 在面板編輯或刪除已結束會議的留言，請求送往該會議，成功後清單更新。
- 儲存一則新留言後，收到它的會議的 View 自動打開，新釘點出現。

**介面與資料形狀**

- `GET <commentsApiPath>?storyId=<id>` 回應：
  - `comments[]`：既有欄位加上 `sessionId: string`；`ordinal` 為會議編號；`preview.imageUrl` 指向 `<basePath>/reports/sessions/<sessionId>/assets/<檔名>`。
  - `meetings[]`：`{ id, title, startedAt, closedAt, active: boolean, commentCount, storyCommentCount, tracking: { open, total }, projectRelativeSessionPath: string | null, reportUrl: string }`，依 `startedAt` 由新到舊。
  - 其他頂層欄位語意不變。
- `GET <commentsApiPath>`（無 `storyId`）：與 0.12.1 相同，`comments[]` 多出 `sessionId`，沒有 `meetings`。
- store 的 `VisualCommentOverviewComment` 新增 `sessionId`；reviewController 的 `VisualCommentOverview` 新增 `comments[].sessionId` 與選填的 `meetings`。
- 面板 DOM：會議區塊 `aria-label="Meetings"`、每列 `data-meeting-id`、View 開關 `button[role="switch"][data-meeting-view]`（`aria-checked`）、檢視說明 `data-viewed-meeting`、提示 `data-comments-hint`、釘點資訊卡 `data-saved-pin-card`。
- 新增可覆寫的標籤（`FigmaReviewLabels`）：`meetingsHeading`（`Meetings`）、`viewMeeting`（`View`）、`viewingMeeting`（`Viewing`）、`activeMeeting`（`Active`）、`viewMeetingHint`（`Turn on View for a meeting below to see its comments and pins.`）、`screenshotUnavailable`（`Screenshot unavailable`）。

**失敗模式**

- 某場 meeting.json 無法解析：overview 略過該會議，其餘照常回傳。
- 留言的 capture 遺失：無法判定所屬 Story，不納入任何 Story 的回應（與現行一致）。
- 截圖遺失或載入失敗：清單與釘點照常；資訊卡顯示 `Screenshot unavailable`；編輯對話框沿用既有的無截圖處理。
- 複製時會議讀取失敗或剪貼簿寫入失敗：顯示 `Unable to copy AI prompt. Check browser clipboard permission.`，不送出變更請求。
- 編輯或刪除失敗：沿用既有的錯誤顯示與草稿保留。

**驗收方式**

- 於 design-system-to-storybook/assets/figma-export-addon 執行 `npm run test:visual-comments`、`npm run test:renderer-parity`、`npm run test:package`、`npm run test:renderer-neutral`、`npm run test:review-controller` 全部通過。
- `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` 回報三份一致；`node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs` 通過。
- 報告頁測試（test/run-visual-comment-report-test.mjs）的既有斷言不修改即通過，作為「報告頁與 prompt 輸出不變」的證據。
- 以 cm-chipK/ds-lab/project 的 `20260729-77db03bf` 會議資料複製到暫存目錄（不修改該專案）重現 Context 的實例。

**範圍界線**

- 範圍內：store 的 overview、review-server 的 overview 回應、reviewController 型別、面板（會議清單與 View 開關、清單、篩選、釘點、資訊卡、編輯、刪除、複製、儲存後切換檢視）、對應測試、README、setup reference、SKILL.md、repo README、版本與副本同步。
- 範圍外：Goals / Non-Goals 中的所有 Non-Goals；report 與 index 的產生；安裝器與設定產生器；figma import plugin。

## Risks / Trade-offs

- [過去展開面板就看得到進行中會議的留言，現在要多按一次 View] → 使用者明確選擇預設關閉；儲存新留言後自動檢視該會議，所以「留言—看到釘點」的連續操作不受影響；README 說明此變更。
- [會議數量增加後，每 5 秒的 overview 讀取變慢] → 每次 overview 每份 meeting.json 只讀一次。成本隨會議數線性增加，屬未量測的推估；確認方式：以 100 場合成會議手動量測一次 `getOverview(storyId)` 的耗時並記錄於任務回報。本 change 不加入快取；量測顯示需要時另開 change。
- [舊會議的釘點疊在已改版的元件上會偏移] → 不自動修正；資訊卡提供當時截圖；可在編輯對話框拖曳修正或刪除。
- [會議清單只顯示最新 5 場加上含有該 Story 留言的會議，更舊且無該 Story 留言的會議不在清單上] → 這些會議與目前 Story 無關，仍可從 `Reports` 進入會議索引。
- [檢視已結束會議時新增留言，新留言寫入另一場會議，檢視隨之切換] → 這是新增留言寫入規則（進行中或自動建立的會議）的結果；切換後 `Viewing <會議標題>` 與開關狀態明確顯示目前看的是哪一場。

## Migration Plan

1. 發佈 addon 0.13.0（canonical 與兩份副本）。既有專案重新執行 install_figma_export_addon.mjs 即升級；不需修改專案設定。
2. 既有 meeting.json 不需遷移；升級後即可在面板檢視歷史會議。
3. 回退：重新安裝 0.12.1 的 tarball。design-system/figma-export-review/ 不可刪除；回退後面板回到只顯示進行中會議的行為，資料不受影響。

## Open Questions

（無）
