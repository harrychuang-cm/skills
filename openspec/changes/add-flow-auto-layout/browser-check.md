# UI Flow Auto Layout 檢查（task 3.2）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（暫存資料夾，含 storybook-template 的 example prototype），Storybook dev（`storybook dev -p 6170`），Inspector build tag `flow-auto-layout-2026-10-08`，figma-export addon 0.15.0，機器 Mac16,1（Apple M4，16 GB），macOS 27.0.1（Darwin 27.0.0），Chrome 154.0.8037.98（headless，CDP）。

## verify 與 code review 後的修正（2026-10-08，下面的結果都在修正後重跑）

- verify：fit 為名稱預留的寬度在畫布窄於 480px 時取畫布寬度的一半，寫進 spec 與 design；在 journey 檢視中 Export 也帶上已存的名稱（該檢視會隱藏名稱）；框尺寸改由 geometry 的純函式 `getAutoLayoutFrameSize` 計算並測試兩支分支；`storybook-integration.md` 的 Escape 說明補上 Auto Layout 對話框；spec 的「Feature names follow their lanes」改用 flowGroup 列（example 的 journeys 只剩一列）；檢查腳本註明「列內連線向右」為何是 80%；修正系統版本。
- code review：第一次開啟、route 還沒量完就套用時，之後量到較高的畫面會壓到下方的列。現在同一次開啟中，套用後若沒有其他版面動作，量到的尺寸超過排版當時用的尺寸就重新排列並存檔（保留 Undo 快照）；名稱元素不接收指標，所以拿掉不會顯示的 `title`，長名稱改為最多兩行。

## 指令回歸（2026-10-08，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot 三個測試檔 | 79 項通過。新增的功能來源、列內排列、名稱位置測試先在未實作時失敗（export 不存在）；100 個 route 的圖列排版實測 0.30 ms（估計的 1 ms 量級成立，門檻 50 ms） |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（新增：按鈕名稱與位置在 Reset 之前、初始沒有對話框與提示、journey 檢視中停用、2 個名稱與位置、錨點不在 flow 的名稱略過、未簽章紀錄不在 desktop flow 顯示、簽章相符時顯示、journey 檢視不顯示名稱）。新斷言先對 HEAD 版 `flow-canvas.js` 執行，在按鈕斷言失敗 |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過 |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 通過 |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（鏡像比對涵蓋 9 個 runtime 檔、flow layout helper 與 fingerprint） |
| storybook-template 的 `npm run typecheck` | 通過 |
| template 目錄的 `npx esbuild .storybook/prototype-inspector/preview.js --bundle --format=esm --outdir=<暫存資料夾>` | 通過 |
| `check_flow_auto_layout.mjs`（`pages-prototypes-bench-growth-fund--default`） | 22/22 通過，數字見下表。先對 HEAD 版 `flow-canvas.js` 執行，在找按鈕那一步失敗 |
| `check_flow_auto_layout.mjs`（`pages-prototypes-example-prototype--default`） | 12/12 通過：宣告的兩條 journeys 只剩一列（`request-changes` 的畫面都被 `approve-request` 擁有），不顯示名稱；名稱相關案例略過 |
| `check_flow_auto_layout.mjs`（`pages-prototypes-bench-round-up--default`，route 內容 364–1040px） | 21/21 通過：清空截圖快取後立即套用，`offer` 量到 1040px 後列重新排列、沒有重疊；把重排的 effect 暫時停用時這一項失敗（位置不更新） |
| `check_flow_canvas_comments.mjs`（example prototype） | 32/32 通過 |
| `bench_flow_canvas.mjs`（growth-fund，宣告的版面與 `--layout` 套用 Auto Layout 後的匯出檔） | 結果在 `bench/after.json`，見下表 |

### check_flow_auto_layout.mjs（growth-fund 型，30 個 route、6 個 flowGroup）

| 檢查 | 觀察值 |
| --- | --- |
| 沒有已存版面時直接套用 | 沒有對話框，框兩兩不重疊，Fit canvas 為按下 |
| 與 UI Flow 留言的互動 | 套用後派送 7 次 `sbfx:anchors-moved`，route iframe 載入 0 次，renderer 的 src 不變 |
| 有已存版面時先問 | 對話框出現，Cancel 與 Escape 後位置都與拖曳後相同 |
| Undo | 只拖曳過、沒有名稱的版面：Undo 後位置回到拖曳後、名稱 0 個、名稱鍵被移除；先套用過一次（有 6 個名稱）再拖曳、再套用：Undo 後 6 個名稱回來 |
| 放開拖曳結束 Undo | 提示消失 |
| 提示在拖曳中到期 | 套用後持續拖曳 8.8 秒，放開前 commit 0 次、提示仍在；放開後提示消失 |
| 套用後才量到尺寸 | 清空截圖快取後立即套用，等截圖佇列閒置：growth-fund 沒有長高的框；round-up 的 `offer` 長高後重新排列，兩者都沒有重疊 |
| 名稱 | 6 個，依序對應 6 個列（列以 240 間距分段），都在該列最左邊的框；位置與 `getAutoLayoutLabelPlacement` 的參考值誤差 0.00 px（頁面上的 screen gutter 是 16px：storybook-template 的 `--sbt-sys-spacing-screen-gutter` 是 `--sbt-ref-size-16`）；fit 後每個名稱都完整在畫布內 |
| 每列由左到右 | 列內畫出的 24 條連線全部指向右邊 |
| 重新整理 | 位置與 6 個名稱都在 |
| 拖曳某列第一個框 | 只有該列名稱跟著移動 120px，拖曳中 commit 0 次 |
| Export／Reset／Import | 匯出檔含 6 筆 `lanes`；在 journey 檢視中（名稱隱藏）匯出也含 6 筆；Reset 後名稱 0 個、名稱鍵被移除；以 `DOM.setFileInputFiles` 匯入後 6 個名稱回來 |
| figma-export 開啟 | 1600、800、640px 三種寬度下，按鈕與提示都在 layout 群組內、不被 dock 蓋住（640px 時 dock 在底部，layout 群組在 dock 上方） |

截圖確認：6 列由上往下，名稱在每列左側，連線由左到右；Undo 提示是 layout 群組的第一列。

### bench（growth-fund 型，1600×1000，headless Chrome 154）

| 項目 | 宣告的版面 | 套用 Auto Layout 後 |
| --- | --- | --- |
| 開啟時 layout 寫入 | 0 | 0 |
| pinch：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 平移：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 拖曳：手勢中 commit／放開後 100 ms 內／localStorage 寫入 | 0／1／1 | 0／1／1 |
| 完整畫布的標籤排版 | 8 次（中位數 5.1 ms） | 8 次（中位數 5.6 ms） |
| UI Flow ready | 336 ms | 365 ms |
| 第一次開啟所有截圖完成／重新開啟可見截圖出現 | 6,339 ms／317 ms | 6,302 ms／277 ms |

`--layout` 是本 change 加進 bench 的選項：以 Auto Layout 之後 Export 的檔案當作開啟前的已存版面與名稱。

## Safari（手動，待使用者回報）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 套用 Auto Layout（沒有已存版面時直接套用、有時先問） | 待回報 | |
| Undo 回到套用前 | 待回報 | |
| 套用後拖曳微調，名稱跟著該列第一個框 | 待回報 | |
| 重新整理後位置與名稱仍在 | 待回報 | |

## Firefox（手動，待使用者回報；這台機器沒有安裝 Firefox）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 套用 Auto Layout（沒有已存版面時直接套用、有時先問） | 待回報 | |
| Undo 回到套用前 | 待回報 | |
| 套用後拖曳微調，名稱跟著該列第一個框 | 待回報 | |
| 重新整理後位置與名稱仍在 | 待回報 | 兩列的 layout 群組用 `:has()` 改圓角（Firefox 121 以上） |
