# UI Flow 分層與截圖跨瀏覽器檢查（task 4.3）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（另含留言檢查用的 example prototype），Storybook dev（`storybook dev -p 6160`），Inspector build tag `flow-lod-2026-10-07`，figma-export addon 0.15.0，機器 Mac16,1（Apple M4，16 GB），macOS 26（Darwin 25.5.0）。

清單來源：tasks.md 4.3（截圖出現、升為 live 不閃白、Tab 不進入 route 文件、封鎖 IndexedDB 時仍可使用），加上 design.md Acceptance criteria 的手動項目（修改 route 元件後截圖顯示更新中並換成修改後的內容、從 StaticFlow story 開啟時沒有 renderer iframe）。

## 指令回歸（2026-10-07，verify 與 code review 修正後重跑，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot 三個測試檔 | 47 項通過 |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（含：載入中的 live 畫面在 iframe 後面保留骨架、從 flow export story 開啟時不等快照預載、layout payload 只存四捨五入的位置） |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過 |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 通過 |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（鏡像比對涵蓋 9 個 runtime 檔，含 `flow-canvas-hmr.js`） |
| `node storybook-product-prototype/scripts/test_flow_snapshot_fidelity.mjs` | 通過（有系統 Chrome，固定測試頁像素差異中位數 0.399%、最大 0.784%；什麼都沒畫的頁面回傳 `blank` 且不編碼；web font 頁只嵌入已載入字型的第一個來源，不含 woff 備用格式與沒用到的 unicode-range 分片） |
| `test_flow_snapshot_fidelity.mjs --url`（growth-fund 型、inventory 型、example） | 通過：真實 route 差異最大 0.32%；renderer 在兩個 route 之間來回切換 6 次，每張截圖都屬於目標 route；編碼中途平移時結果被丟棄、不算失敗、平移後補截 |
| template 目錄的 `esbuild .storybook/prototype-inspector/preview.js --bundle` | 通過 |
| `check_flow_canvas_comments.mjs`（example prototype） | 27/27 通過，含「renderer 已載入時放連線留言，截圖不呼叫 renderer 的擷取 hook」 |
| `check_flow_snapshots.mjs --edit-file …/BenchRouteScreen.tsx`（growth-fund 型） | 通過：第一次開啟 30 個 route 各截一次、由中心往外；重新整理時顯示畫布的那次 commit 就有 30 張快取截圖與快取高度；每個 route 重驗一次、0 次編碼；新分頁在掛載後 16ms 顯示快取截圖（不等 fit 的 120ms 閒置）；修改元件後 30 張標為更新中，第一張新截圖在 renderer 的 `storyHotUpdated` 之後 258ms，30 張全部換新；在 Story 模式時修改、再切回 UI Flow，30 張先標為更新中，再全部換成修改後的截圖 |
| `bench_flow_canvas.mjs`（growth-fund 型、100 個 route） | 結果在 `bench/after.json`（verify 與 code review 修正後重跑），數值與估計目標的比較見 design.md 的實測段落 |

## Chrome 154.0.8037.98（自動，2026-10-07，verify 與 code review 修正後重跑）

以 CDP 驅動系統 Chrome（headless），輸入走 Chrome 的輸入管線（`Input.dispatch*`），不是在頁面內合成事件。標示「經由 manager」的項目開啟真正的 Storybook manager：`http://localhost:6160/?path=/story/pages-prototypes-bench-growth-fund--default&globals=prototypeMode:flow&panel=false`（`panel=false` 隱藏 addon 面板，讓畫布有足夠空間；面板開著時 30 個框都小於 40px，只顯示扁平佔位）。其餘項目直接開啟 `iframe.html`。

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 截圖出現（經由 manager，空白設定檔第一次開啟） | 通過 | 7.0 秒內 30 個 snapshot 層級的框都顯示已載入的截圖 |
| 升為 live 不閃白（經由 manager） | 通過 | 點畫布取得焦點後以鍵盤 Shift+0 放大到 100%，2 個框升為 live；逐幀抽樣 98 個動畫幀，載入中的框都保留截圖或骨架，沒有任何框在 iframe 頁面渲染完成前露出 iframe |
| Tab 不進入 route 文件（經由 manager） | 通過 | 從畫布連按 Tab 20 次，焦點依序落在框標籤的 Components 按鈕，從未進入 route 文件；2 個 live iframe 與 renderer 都帶 `inert`、`tabindex="-1"`、`aria-hidden="true"` |
| 封鎖 IndexedDB 時仍可使用 | 通過 | 以 init script 讓 `indexedDB.open` 永不回應、或丟出 `SecurityError`：兩種情況畫布都照常顯示，30 張截圖都產生（只存在本次頁面） |
| 重新整理後截圖立即出現，高度正確 | 通過 | 第二次導覽在顯示畫布的那次 commit 就有 30 張快取截圖，高度與第一次量到的相同，期間沒有任何截圖；之後每個 route 重驗一次、0 次編碼、0 張換圖。新分頁（沒有存過的相機位置）也在讀完快取後立即顯示（bench：255ms 內所有可見畫面顯示截圖） |
| 修改 route 元件後顯示更新中，再換成修改後的內容 | 通過 | 修改 bench route 元件的標題：30 個框標為更新中（框標籤顯示 ↻），第一張新截圖出現在 renderer 自己的 `storyHotUpdated` 之後 258ms，renderer 頁面帶有修改後的文字，30 張全部換新，被取代的 30 個 object URL 都已回收。攔下 renderer 的訊號時，2.2 秒後以 `hmr-no-signal` 重設並截到新內容；放大到 100% 時 4 個 live 畫面在自己的 `storyHotUpdated` 之後 163–269ms 更新自己 route 的截圖 |
| 從 StaticFlow story 開啟時沒有 renderer iframe | 通過 | `pages-prototypes-example-prototype--static-flow`：0 個 iframe，沒有建立 IndexedDB 資料庫 |
| 截圖不觸發原生的圖片拖曳 | 通過 | 30 張截圖都是 `draggable="false"`、`pointer-events: none`、`-webkit-user-drag: none`；按住快照層級的框拖曳：0 次 `dragstart`、0 次 `pointercancel`，框移動 72px |
| 回到 UI Flow 不重複重驗 | 通過 | 同一頁面切到 Story 模式再切回 UI Flow：快取截圖立即出現，沒有 renderer 載入、沒有新截圖、沒有編碼 |
| 量測到之前沿用快取尺寸（round-up 型，內容高度 364 與 1040px） | 通過 | 第一次開啟後快取尺寸為 364／1040／682／691／725／752／364px；第二次開啟放大到 100%，3 個框升為 live，逐幀抽樣期間沒有任何框的高度改變 |
| live 畫面重新載入後重建 observer | 通過 | live 的 `setup-method` 原地重新載入後，把新文件撐高到 1200px，框的預覽高度由 682px 變成 1200px |
| 原地 remount 後保留 route 的 prototype | 通過 | 暫時在 fixture 加一個只在模組載入時讀一次 `prototypeRoute` 的 prototype（9 個 route，驗完即移除）：第一次原地切換後 `data-route` 仍是上一個 route，renderer 以 `wrong-route` 重設 src，之後每次切換都重設（7 次 `scheduled`）；9 張截圖都產生、各不相同，沒有任何截圖失敗 |

上表中 manager 檢查、封鎖 IndexedDB、live 畫面更新、無訊號重設、模式切換、尺寸與 observer 的腳本只放在工作階段的暫存資料夾，沒有加入 repo。可重複的部分已併入 `test_flow_snapshot_fidelity.mjs`（renderer 切換、編碼中途中止、空白頁）、`check_flow_canvas_comments.mjs`（連線留言截圖不含 renderer）與 `check_flow_snapshots.mjs`（截圖順序、快取顯示、重驗、新分頁、程式碼更新）。

「已互動的畫面不更新截圖」與「暫停量測時不改寫快取與紀錄」只有內部介面，這個 change 沒有會設定它們的功能，留給 add-flow-frame-interact-mode 實作互動模式時測試。

## Safari（手動，待使用者回報）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 縮小（Shift+1）時截圖出現；第一次開啟由中心往外補上，平移時暫停 | 待回報 | |
| 重新整理後截圖立即出現 | 待回報 | |
| 放大到 100%（Shift+0）時升為 live 不閃白 | 待回報 | |
| 連按 Tab 焦點不進入 route 畫面 | 待回報 | Safari 需在「設定 → 進階」開啟「按 Tab 鍵以反白顯示網頁上的每個項目」 |
| 修改 route 元件後先顯示 ↻，再換成修改後的截圖 | 待回報 | |
| 封鎖網站資料時仍可使用 | 待回報 | 「設定 → 隱私權」勾選「阻擋所有 Cookie」會一併封鎖 IndexedDB |

## Firefox（手動，待使用者回報；這台機器沒有安裝 Firefox）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 縮小（Shift+1）時截圖出現；第一次開啟由中心往外補上，平移時暫停 | 待回報 | |
| 重新整理後截圖立即出現 | 待回報 | |
| 放大到 100%（Shift+0）時升為 live 不閃白 | 待回報 | |
| 連按 Tab 焦點不進入 route 畫面 | 待回報 | |
| 修改 route 元件後先顯示 ↻，再換成修改後的截圖 | 待回報 | |
| 封鎖網站資料時仍可使用 | 待回報 | 「設定 → 隱私權與安全性 → Cookie 與網站資料 → 管理例外」把 `http://localhost:6006`（或使用的連接埠）設為封鎖 |
