# UI Flow 互動模式檢查（task 3.2）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（暫存資料夾，含 storybook-template 的 example prototype 與 bench prototypes），Storybook dev（`storybook dev -p 6170`），Inspector build tag `flow-interact-2026-10-08`，figma-export addon 0.15.0，機器 Mac16,1（Apple M4，16 GB），macOS 27.0.1（Darwin 27.0.0）。

清單來源：tasks.md 1.1–2.4 的驗證項目、design.md Acceptance criteria，以及 ingest 時依指南 3.5 補上的項目。

## review 後的修正（2026-10-08，task 5.1）

- 從互動畫面轉送的 zoom wheel 在 Safari pinch 進行中改為忽略，與畫布本身的規則相同。新案例以合成的 gesturestart／gestureend 驗證：修正前 pinch 期間縮放從 4 變成 2.96，修正後不變，pinch 結束後才再縮放。`check_flow_frame_interact.mjs` 27/27 通過。

## verify 後的修正（2026-10-08，task 4.1，下面的結果在修正後重跑）

- 離開互動後的一般網址重新載入，原本只在畫面仍被選取時優先；點空白處或另一個畫面結束時會退回一般順序。現在它與固定畫面同列第一，直到重新載入完成或 iframe 被移除（SSR 以 `pickLoadingFrame` 斷言）。
- 互動畫面的 window 無法存取時，現在會結束互動，不會停在按 Esc 也沒反應的狀態。
- 補上可重跑的檢查：進入時畫面被 fit（373px 寬、完整在畫面內）、Ctrl+wheel 以指標下的 world 點為中心（偏移 0.4 world px）、組字中的 Esc 後輸入框保留文字、內容加高時畫面框、117 條連線與 IndexedDB 中 intake 的尺寸紀錄（`300x650x375x812`）都不變、prototype 預覽契約、焦點在畫布時按 `]` 先結束互動、清單項目上的 Enter 只選取項目，以及換頁後留言仍錨定 `route:intake` 而 capture hook 擷取時畫面顯示 review。
- 沒有殘留 detached Window 的自動化嘗試：以 `Memory.getDOMCounters` 計數時，連不經 Inspector 的一般 iframe 重新載入也每次多保留一個文件（4 次重新載入 5 → 9），互動模式進出與只換 src 的對照組增加幅度相同（每輪 +2），所以這個計數無法偵測互動模式的殘留，維持手動檢查。

## 實作過程中的發現（2026-10-08）

- SSR 的單一載入名額：`initialTiers` 讓兩個畫面為 live 時，SSR 只會掛一個 iframe（LOD 一次只載入一個畫面，固定畫面排第一），所以「另一個 live iframe 帶 inert／aria-hidden／tabindex」改以同一個 render helper 的非互動 render（intake 為 live）對照，互動 render 只斷言互動中的 iframe 沒有這三個屬性。
- 互動網址走載入名額：畫面的 src 改變（進入或離開互動）時把它當作尚未 render，交回 LOD 的單一載入名額；固定畫面排第一，所以進入時立刻輪到它，離開時被選取的畫面（promoted）排在其他等待中的畫面之前。
- 焦點在互動畫面內時 Space 屬於 prototype，畫布收不到，所以「Space 平移不結束互動」只在焦點回到畫布時成立；中鍵平移在任何時候都不結束。檢查腳本兩者都測。
- 標示的文字顏色：原本寫的 `--pi-sys-color-on-success` 不存在，改用既有 token（底色 surface-raised、文字與外框 success；淺色 fallback 約 4.9:1、深色約 8:1）。
- 留言檢查：addon 放下釘點後 500ms 內會吞掉點擊序列，所以在互動畫面上留言後，等 700ms 才繼續拖曳；雙擊要避開框中心已有的釘點。
- 量測期間的機器負載：bench 開始時負載平均值為 822（10 核），截圖與開啟時間不可與前一個 change 比較；手勢中的 commit 次數不受影響。

## 指令回歸（2026-10-08，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot 三個測試檔 | 93 項通過（geometry 79 項：本 change 追加 Enter 與 Esc 路由 24 列，以及 `needsInteractFit`、`frameClientToHostClient`、`resolveInteractRouteTitle` 的範例表；新測試列先對實作前的 geometry 執行並失敗） |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（新增：互動畫面的 `data-interacting` 與互動網址、互動中的 iframe 沒有 inert／aria-hidden／tabindex、錨點仍在 preview、標示與外框帶 capture-ignore 與英文名稱、viewport 的 `tabindex="-1"`、CSS 的互動規則在擷取規則之前、Static Flow story 沒有互動、縮放選單的互動說明；先對實作前的程式確認失敗） |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過 |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 通過 |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（新增：React 與 Vue scaffold 含 `prototypeFlowInteractive` 與 `data-prototype-interactive`、驗證器沒有互動警告、Vue 元件的四條行為斷言、移除參數的副本出現警告且結束碼不變；先在加入驗證器警告前確認「沒有警告」一項失敗；鏡像比對涵蓋 9 個 runtime 檔） |
| storybook-template 的 `npm run typecheck` | 通過 |
| template 目錄的 `esbuild .storybook/prototype-inspector/preview.js --bundle` | 通過 |
| `check_flow_frame_interact.mjs`（example，加上 round-up、inventory、viewport-overflow） | 27/27 通過（task 5.1 後） |
| `check_flow_canvas_comments.mjs`（example prototype） | 38/38 通過（新增：真實互動畫面在擷取模式下的 pointer-events、在互動畫面上留言錨定到該 route、擷取時雙擊不進入互動、換頁後留言仍錨定原 route 而截圖來自換頁後的頁面） |
| `check_flow_canvas_editing.mjs` | 22/22 通過 |
| `check_flow_auto_layout.mjs`（growth-fund／example） | 26/26、16/16 通過 |
| `bench_flow_canvas.mjs`（growth-fund 型） | 結果在 `bench/after.json`，數字見下表 |

### bench（growth-fund 型，30 個 route、2 個節點，1600×1000，headless Chrome 154）

| 項目 | 結果 |
| --- | --- |
| 開啟時 layout 寫入 | 0 |
| pinch、平移：手勢中 commit | 0、0 |
| 單框拖曳：手勢中 commit／放開後 100 ms 內 | 0／1（同步成本中位數 1.25 ms、p95 2.2 ms） |
| 框選、整組拖曳（3 個框）：手勢中 commit | 0、0（整組拖曳寫入 1 次、位移相同） |
| 選取 2 個框且小地圖顯示時 pinch、平移的手勢中 commit | 0、0 |
| route iframe：fit／100% | 0／3 |
| bench 目標全部達成 | 是 |
| UI Flow ready／冷截圖／重新開啟可見截圖（負載平均值 822 時量測，僅供參考） | 433 ms／7,350 ms／474 ms |

## Chrome 154.0.8037.98（自動，2026-10-08）

`check_flow_frame_interact.mjs` 以 CDP 驅動系統 Chrome（headless，1600×1000），輸入走 Chrome 的輸入管線（`Input.dispatch*`）。

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| prototype 契約（task 1.1，暫存腳本）：互動預覽中 Submit intake 換到 review、無 chrome、`data-route="review"`；沒有參數時維持 intake；只有 `prototypeFlowInteractive` 沒有 `prototypeRoute` 時不是互動預覽 | 通過 | |
| 從開啟時的 fit 雙擊：fit 追蹤結束，之後畫面量到新尺寸與畫布縮小都不重新 fit | 通過 | `vh-overflow` 878 → 898；修正前（拿掉進入時結束 fit 追蹤）相機被重新 fit |
| 雙擊進入：互動網址、`elementFromPoint` 打到 iframe、單選該畫面 | 通過 | |
| 標示「互動中 · Esc 結束」與英文名稱 | 通過 | `Interacting with Project Intake; press Escape to exit` |
| 畫面內點擊 Submit intake：換到 review、標示附上 review 標題、焦點在 iframe、`overscroll-behavior: contain` | 通過 | `互動中 · Esc 結束 · Review Request` |
| `data-route` 改成 flow-only node id 或未知值時標示只剩基本文字 | 通過 | |
| 畫面內按 Esc：結束、焦點在 viewport、畫面仍被選取並以一般網址重新載入回 intake；接著 Shift+1 可 fit | 通過 | |
| 縮小到 5% 並平移出視窗：iframe 未被移除也未重新載入 | 通過 | |
| 中鍵平移、焦點在畫布時的 Space 平移、按 Zoom in 都不結束 | 通過 | |
| 雙擊另一個畫面：前一個結束、後一個進入；按另一個畫面結束 | 通過 | |
| 焦點在畫布時：Enter 進入、Esc 先結束互動且保留選取、再按一次清除選取 | 通過 | |
| Reset 確認鈕有焦點時 Enter 只確認 Reset | 通過 | |
| 畫面上 Ctrl+wheel（畫面內有 `stopPropagation` 的監聽）縮放畫布、prototype 頁面不縮放、相機閒置前 0 commit | 通過 | 縮放 0.995 → 4 |
| 組字中的 Esc 不結束 | 通過 | 以合成事件設 `isComposing` |
| 畫面內內容加高到 1040px 時畫面框不變 | 通過 | 878／812px 不變 |
| 結束時畫面文件的 `overscroll-behavior` 立即還原 | 通過 | |
| request-changes 簡化檢視：只有 `3:review` 互動；點「全部」時先結束 | 通過 | |
| 不支援契約、會鎖定 route（round-up `offer`）：一般滾輪捲動畫面內容（534px）、相機不動，Continue 不換頁，Esc 結束 | 通過 | |
| 不支援契約但會換頁（inventory `portfolio`）：Continue 換到 quote-detail，標示附上 Quote detail | 通過 | |

## 手動檢查（待回報）

這台機器要先安裝 Firefox；Safari 的 Tab 相關步驟要先在設定中開啟「Press Tab to highlight each item」。Vue runtime 沒有實際驗證（repo 沒有可執行的 Vue Storybook），Vue 的契約以 smoke test 的靜態斷言與程式碼審閱驗證。

| 項目 | Chrome | Safari | Firefox |
| --- | --- | --- | --- |
| 雙擊進入、畫面內換頁與標示、Esc 回到 intake、Shift+1 | 自動通過 | 待回報 | 待回報 |
| 觸控板 pinch 只縮放畫布；兩指捲動只捲畫面內容 | 自動（以 Ctrl+wheel 與 wheel 模擬）通過 | 待回報 | 待回報 |
| 互動畫面上水平兩指滑動不會讓 Storybook 返回上一頁 | 待回報 | 待回報 | 待回報 |
| 注音組字中按 Esc 取消組字，互動不結束、輸入框保留文字 | 合成事件通過，真實輸入法待回報 | 待回報 | 待回報 |
| 結束後 DevTools Memory 以 detached 篩選看不到殘留的 Window | 待回報 | 待回報 | 待回報 |
| 簡化檢視中只有被雙擊的實例互動、切換 journey 先結束 | 自動通過 | 待回報 | 待回報 |
