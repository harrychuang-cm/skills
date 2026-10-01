# 驗證紀錄

驗證日期：2026-10-01。範圍為 figma export addon 0.12.0（canonical 與兩份 Storybook template 副本）、其測試、三份使用文件。環境：macOS、Node v26.8.2、headless Chrome。未修改任何實際產品專案。

## 自動驗證

以下指令於 design-system-to-storybook/assets/figma-export-addon 執行，除另註明外。

| 驗證 | 結果與覆蓋 |
| --- | --- |
| `npm run test:visual-comments` | 通過。store、HTTP、report 三支測試通過；面板瀏覽器測試在 1000×800、640×800、1280×860 三種視窗各 178 項通過；`run-evidence-reload-test.mjs` 回報 7 requests, 0 reloads。 |
| `npm run test:renderer-parity` | 通過。React 與 Vue 各 23 項，新增「saved-pins-and-panel-handoff」：真實 Storybook 上存一則埋點留言後，Story 出現 `Comment 1, Tracking, Open` 釘點、點釘點選取清單項目且 prototype 維持 State B、該釘點是唯一帶已選取標記的釘點、收合面板釘點消失、面板複製的內容以 `# Tracking Instrumentation Request` 開頭並含該留言。 |
| `npm run test:package` | 通過（0.12.0，33 files）。 |
| `npm run test:renderer-neutral` | 通過。 |
| `npm run test:review-controller` | 通過。 |
| `node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs`（repo 根目錄） | 通過。 |
| `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs`（repo 根目錄） | 通過。63 個檔案三份一致，三份 package.json 皆為 0.12.0。 |
| `spectra validate add-visual-comment-overview-and-handoff` | 通過。 |

prompt 單一來源的證據：report 測試中既有的 `expectedPortablePrompt` 與 `expectedTrackingPrompt` 預期字串沒有修改；同一支測試另比對模組函式與報告腳本對同一份資料的輸出逐字相同（單則視覺修正、單則埋點、三則批次），並確認報告腳本內只有一份 Visual UI Fix Request 與一份 Tracking Instrumentation Request 的實作。面板瀏覽器測試比對面板複製的內容與同一模組的輸出逐字相同。

報告頁的版面、篩選、時間與樣式稽核是在 headless Chrome 中以真實頁面驗證（時區設為 Asia/Taipei、淺色與深色兩種配色）：`2026-10-01T05:36:43.790Z` 顯示為 `2026-10-01 13:36`；篩選範例表四列的可見卡片與網址 hash 相符；1280px 寬並排、800px 寬堆疊；捲動 1600px 後工具列仍在視窗內；視窗高度 560px 時工具列不固定。

## 實測

在真實的 Storybook dev server、1280×860 視窗、comments 目錄位於專案內的條件下，以瀏覽器自動化執行：按 `C` 標註一則埋點、再標註一則視覺修正 → 展開面板。量到的結果：

- Story 上出現兩個釘點：`Comment 1, Tracking, Open` 與 `Comment 2, Visual fix, Open`；面板底部出現 `Copy tracking prompts`（只有一個 Story，沒有 `Copy all stories`）。
- 面板的 `Copy tracking prompts` 與同一場會議報告頁的 `Copy tracking prompts` 寫入剪貼簿的文字完全相同（2969 字元）。
- 報告頁在淺色與深色配色下都是截圖與留言並排，時間顯示為本地時間。

走查時擷取了面板含釘點、報告頁淺色與深色的截圖供人工檢視；截圖未納入 repo。

## 實作中與原設計不同之處

- overview 多了一個衍生欄位 `activeTracking`（整場會議的埋點留言數），原設計只列了兩個欄位。已補記於 design.md。
- 面板展開時工作區保留的高度由 `min(46vh, 420px)` 改為 `min(38vh, 340px)`，讓留言清單在一般視窗高度下至少看得到兩則。已補記於 design.md。

## 驗證報告後的修正

`/spectra-verify` 提出的項目已全部處理，並在修正後重跑上表全部指令：

| 項目 | 處理方式 | 對應的測試 |
| --- | --- | --- |
| 已選取的釘點一直帶「標示」標記 | 已選取改用獨立的 `data-selected`；「標示」同一時間只在一個釘點上（游標所在項目優先，其次是有焦點的項目）。規格同步補上已選取標記。 | 面板測試「hovering or focusing a list item highlights only its pin…」：留言 2 已選取時游標移到留言 5 的項目，只有留言 5 的釘點帶標示。 |
| 設定的擷取選擇器找不到元素時釘點仍顯示 | 釘點不再退回 Story 根元素；新增留言的擷取仍維持原本的退回行為。 | 面板測試「a capture selector that matches no element shows no pins…」（`captureSelector: "#does-not-exist"`）。 |
| 再點同一個釘點不會重新捲動 | 每次點擊都直接捲動並聚焦清單項目。 | 面板測試「activating the pin of the selected comment reveals its list item again」。 |
| 規格範例與測試資料的編號不同 | 規格範例改成與測試資料相同：目前 Story 有留言 1、2、3、5，留言 4 在另一個 Story。 | 面板測試「pins follow the kind filter and show kind and status」逐字比對規格表格的三列。 |
| 「只有視覺修正留言的會議不顯示複製動作」只在沒有會議時測過 | 補上會議進行中、全部留言都是 Visual fix 的案例。 | 面板測試「an active meeting with only visual-fix comments renders no copy action」。 |
| 缺截圖證據的留言沒有釘點 | 改為以留言自身儲存的位置顯示釘點；規格與 README 已註明。 | 面板測試的留言 1 沒有截圖預覽，仍出現 `Comment 1, Visual fix, Open` 釘點。 |
| 伺服器端 `activeTracking` 沒有測試 | store 與 HTTP 測試各補一段：無埋點留言為 0／0；一則未完成加一則已完成為 1／2；不論 overview 以哪個 Story 篩選，數字相同。 | `run-visual-comment-store-test.mjs`、`run-visual-comment-http-test.mjs`。 |
| proposal 的影響範圍列了未修改的檔案 | 移除 `src/review-server.ts`，補上 `src/figma-code-exporter.css`。 | 不適用。 |

## 程式碼審查後的修正

`/spectra-review` 沒有提出會擋住歸檔的問題，提出的兩項都已修正並重跑全部指令：

| 項目 | 處理方式 | 對應的測試 |
| --- | --- | --- |
| 按 `C` 開始留言後，點在已存釘點上會選到舊留言，放不下新留言 | 新增留言期間（選點到輸入卡片關閉）已存釘點照常顯示但不接收指標事件。規格補上這條要求與情境。 | 面板測試「a point under a saved pin can receive a new comment」：釘點原本蓋住該點；按 `C` 後同一點命中的是 Story 元素，點下去開啟輸入卡片，選取狀態不變，prototype 的處理函式沒有執行。 |
| 視窗寬度 640px 以下報告工具列超出畫面、頁面可左右捲動 | 640px 以下工具列的外推邊距改為與內容留白相同的 10px。規格補上 390px 寬不得水平捲動。 | 報告瀏覽器測試在 390×860 檢查工具列左右邊緣在視窗內、文件寬度不超過視窗；修正前這個檢查失敗（兩項皆為 false），修正後通過。 |

另外，報告測試清理暫存目錄時曾出現一次 `ENOTEMPTY`（Chrome 結束後仍在寫入設定檔目錄）；兩處清理已加上重試，之後的執行未再出現。

## 驗證界線

- 樣式稽核讀取元素的計算後樣式，不涵蓋偽元素與 hover 狀態。
- 釘點以擷取目標範圍的比例定位；元件在版面中移動後釘點不會跟著移動，這是已知限制，未嘗試驗證「跟隨元件」。
- 沒有 route／state 資訊的 Story 無法判斷畫面狀態是否相符，釘點一律顯示。
- 瀏覽器測試只在 headless Chrome 執行，未在 Safari 或 Firefox 驗證。
- 報告頁以 file:// 開啟驗證篩選與版面；批次複製在測試中以替換過的剪貼簿物件驗證，未驗證各瀏覽器實際的剪貼簿權限行為。
