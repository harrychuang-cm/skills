# 驗證紀錄

驗證日期：2026-10-01。範圍為 figma export addon 0.11.0（canonical 與兩份 Storybook template 副本）、其測試、四份使用文件。環境：macOS、Node v26.8.2、headless Chrome。未修改任何實際產品專案。

## 自動驗證

以下指令於 design-system-to-storybook/assets/figma-export-addon 執行，除另註明外。

| 驗證 | 結果與覆蓋 |
| --- | --- |
| `npm run test:visual-comments` | 通過。store、HTTP、report 三支測試通過；面板瀏覽器測試在 1000×800、640×800、1280×860 三種視窗各 156 項通過；`run-evidence-reload-test.mjs` 回報 7 requests, 0 reloads。 |
| `npm run test:renderer-parity` | 通過。React 與 Vue 各 22 項，含未開會議以 `C` 進入、浮動卡片在面板外、`Control+Enter` 儲存、自動建立的會議標題、留言介面樣式稽核、類別延續的真實重新載入案例。 |
| `npm run test:package` | 通過（0.11.0，33 files）。含已發佈型別宣告包含 `shortcuts?: boolean` 的斷言。 |
| `npm run test:renderer-neutral` | 通過。 |
| `npm run test:review-controller` | 通過。 |
| `node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs`（repo 根目錄） | 通過。 |
| `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs`（repo 根目錄） | 通過。62 個檔案三份一致，三份 package.json 皆為 0.11.0。 |
| `spectra validate redesign-visual-comment-capture-flow` | 通過。 |

## 實測

**存檔不重新載入。** `run-evidence-reload-test.mjs` 啟動真實的 Storybook dev server，comments 目錄位於測試專案根目錄內，專案設定不含任何 `server.watch` 設定。Start meeting、Save comment、Edit、Complete、Save review status、Delete、End meeting 共 7 次請求後，頁面上預先寫入的標記都仍存在，dev server 的輸出沒有 `page reload`。實作排除機制之前，同一支測試在 Start meeting 之後就失敗（頁面已重新載入）。

**新流程走查。** 在真實的 Storybook dev server、1280×860 視窗、comments 目錄位於專案內的條件下，以瀏覽器自動化依序執行：按 `C` → 點選 Story 上的按鈕 → 選 Tracking → 輸入留言 → `Control+Enter`。量到的結果：

- 按 `C` 後進入點選模式，面板維持收合。
- 浮動卡片位於釘點右側（釘點中心 x=65.9，卡片 left=89.9，寬 320），不在面板內，文字框已取得焦點，卡片內所有按鈕與文字框都在視窗內。
- 儲存前後 prototype 的狀態文字都是 `State B`，沒有回到初始狀態。
- 自動建立的會議標題為 `Notes 2026-10-01`；面板清單出現該留言，篩選標籤為 `All 2 | Visual fix 1 | Tracking 1`（第二則為走查中另存的 Visual fix 留言）。
- 640×800 以下的視窗另行確認：卡片停靠底部（left=12、right=588、bottom=788）。

走查時擷取了卡片、面板清單、編輯對話框、刪除確認與窄視窗停靠的截圖供人工檢視；截圖未納入 repo。

## 驗證界線

- 樣式稽核讀取元素的計算後樣式，不涵蓋偽元素。快捷鍵提示（`::after`）與狀態圓點（`::before`）以閱讀 CSS 確認為 12px 且不透明。
- 卡片位置以實體方向的 left／top 計算，未針對右到左排版驗證。
- 瀏覽器測試與走查只在 headless Chrome 執行，未在 Safari 或 Firefox 驗證。
- 「另一個瀏覽器先開了會議」的情況以模擬的 409 回應驗證用戶端行為，未以兩個真實瀏覽器同時操作。
- 既有專案以自訂 CSS 覆寫舊面板結構的情況未驗證；README 已列出結構變更。
