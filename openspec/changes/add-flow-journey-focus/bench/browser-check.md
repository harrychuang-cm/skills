# UI Flow 功能流程清單與簡化檢視檢查（task 4.2）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（暫存資料夾，含 storybook-template 的 example prototype），Storybook dev（`storybook dev -p 6170`），Inspector build tag `flow-journeys-2026-10-08`，figma-export addon 0.15.0，機器 Mac16,1（Apple M4，16 GB），macOS 27.0.1（Darwin 27.0.0）。

清單來源：tasks.md 3.1–3.3 的手動項目與 4.2 的通過條件（推導條數等於分支出邊數、超過 24 條時才出現截斷提示且數量正確、同一分支點下名稱不重複、每條推導都含其分支點、簡化檢視中連線不交錯且標籤不蓋到畫面），加上 design.md Acceptance criteria 的手動項目。

## verify 與 code review 後的修正（2026-10-08，下面的結果都在修正後重跑）

- verify：fit 到 8 步時（空隙約 40px）標籤的兩側留白加 padding 吃掉全部寬度，只剩空膠囊。簡化檢視的標籤改用 `--pi-sys-spacing-xxs` 的左右 padding，兩側留白改為可用寬度的 12%（介於 `--pi-sys-spacing-xxs` 與 `--pi-sys-spacing-md` 之間）；`getJourneyEdges` 的可用寬度改以兩個框之間的空隙計算（160，不是可見矩形之間的 162）。7 步 journey fit 在 29%（空隙約 46px）時標籤顯示「點…」。
- verify：flow 改動讓選取的 journey 消失（或重新出現）時，相機現在套用與切換相同的規則；原本會把 journey 的相機留在完整畫布上，並在下次閒置時寫進 sessionStorage。
- verify：補上測試：geometry 的「重複步驟各自分層」、SSR 的 linear flow 範例（home／detail／done）、驗證器讀過陣列內註解後回報後面的 journey、留言檢查的 journey 案例（選取寫入 sessionStorage、不在檢視中的錨點不處理、唯讀拖曳、重新掛載後的相機）。
- code review：簡化檢視中不再計算完整畫布的繞線與標籤排版（journey bench 的 label placement 由 6 次變成 0 次）；離開「全部」時若完整畫布正在 fit 追蹤，回來時重新 fit 目前的畫布，而不是套回離開時的相機。

## 指令回歸（2026-10-08，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot 三個測試檔 | 66 項通過 |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（新增：清單項目順序與分組、region 與 button 的無障礙屬性、只有「全部」時沒有清單與 `[ / ]` 說明、sessionStorage 還原與未知值回到「全部」、request-changes 的 4 個實例與唯一的 `route:review` 錨點、3 條連線與「條件 Needs changes」、viewport 帶 `data-sbfx-canvas` 而 world 不帶 `data-sbfx-canvas-world`、Reset／Import 停用與提示、30 條扇出只列 24 條並寫出「另有 6 條未列出」、loop 標記「↩ Review Request」、linear flow 範例沒有清單）。新斷言先對 HEAD 版 `flow-canvas.js` 執行，在第一個清單斷言失敗 |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過 |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 通過 |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（鏡像比對涵蓋 9 個 runtime 檔、flow layout helper 與 fingerprint；journeys 驗證器範例表；陣列內註解之後的 journey 仍被檢查） |
| storybook-template 的 `npm run typecheck` | 通過 |
| template 目錄的 `esbuild .storybook/prototype-inspector/preview.js --bundle` | 通過 |
| `check_flow_canvas_comments.mjs`（example prototype） | 32/32 通過：原本 27 項（「全部」）加上 5 項 journey 案例（fit 追蹤中的完整畫布回來時重新 fit、選取寫入 `prototype-inspector:flow-journey:example-prototype`、`route:handoff` 的 reveal 不處理而 `route:intake` 處理、唯讀拖曳位移 0 與 localStorage 寫入 0、重新掛載後 journey 為 fit 且「全部」恢復 200% 相機）。example 宣告 journeys 後清單出現，canvas viewport 從 x = 240 開始，腳本因此調整兩處：workspace 檢查改為「viewport 從清單右緣到視窗右緣」並檢查 layout 群組在清單右側；每個案例結束時清除 `prototype-inspector:flow-layout:` 下存的版面（前一個案例完成的拖曳會被存下來，清單讓 fit 的縮放變小，同樣的螢幕位移換算成較大的世界位移，review 會疊到 handoff 上，讓後面案例點錯畫面） |
| `bench_flow_canvas.mjs`（growth-fund 型，「全部」與 `--journey derived:purchase-method-decision:purchase-advisor`） | 結果在 `bench/after.json`，數字見下表 |

### bench（growth-fund 型，1600×1000，headless Chrome 154）

| 項目 | 全部 | journey（7 步：6 個 route、1 個節點） |
| --- | --- | --- |
| 開啟時 layout 寫入 | 0 | 0 |
| pinch：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 平移：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 拖曳：手勢中 commit／放開後 100 ms 內／localStorage 寫入／框位移 | 0／1／1／(100, 60) px | 0／0／0／(0, 0) px（唯讀檢視不開始拖曳，所以 bench 的「閒置後恰好 1 次」目標在拖曳一列顯示未達成，這是預期結果） |
| 完整畫布的標籤排版次數 | 8 次（中位數 6.1 ms） | 0 次 |
| UI Flow ready | 267 ms | 218 ms |
| route iframe：fit／100% | 0／2 | 0／2 |
| 第一次開啟所有截圖完成 | 6,385 ms | 1,574 ms（只截 journey 中的 6 個 route） |
| 重新開啟可見截圖出現 | 268 ms | 181 ms |

清單展開佔 240px，viewport 變窄，這些數字以本 change 之後的為準（design.md Risks）。

## Chrome 154.0.8037.98（自動，2026-10-08）

以 CDP 驅動系統 Chrome（headless，1440×900，部分項目 1600×1000），輸入走 Chrome 的輸入管線（`Input.dispatch*`）。腳本只放在工作階段的暫存資料夾，沒有加入 repo；可重複的部分已併入 `test_flow_canvas_ssr.mjs`。

### example prototype（宣告 approve-request、request-changes）

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 清單展開，viewport 從清單右緣開始 | 通過 | `data-journey-list="expanded"`，viewport left 240 |
| fit 的內容在清單右側 | 通過 | 最左邊的框在 x 409 |
| 項目 | 通過 | All、Approve a request、Request changes（各 4 步），沒有「自動分支」 |
| 選 request-changes：出現第二個 review 實例 | 通過 | 實例 `0:intake`、`1:review`、`2:approval-decision`、`3:review` |
| 選取後 fit 並維持 fit 追蹤 | 通過 | Fit canvas `aria-pressed="true"`，縮放 56% |
| 唯讀：Reset、Import 停用並出現提示 | 通過 | 「簡化檢視：位置不會儲存」 |
| world 不宣告 canvas world | 通過 | |
| 連線標籤 | 通過 | 「點擊 Submit intake」「點擊 Request approval」「條件 Needs changes」 |
| 標籤不蓋到畫面 | 通過 | 3 個可見標籤，與框重疊 0 個；56% 時截斷後兩端仍露出連線與箭頭 |
| hover 連線或標籤顯示全文 | 通過 | 兩種情況標籤的 `max-width` 都變成 `none`（hover 連線後全文標籤蓋到指標位置時，由標籤自己的 hover 維持全文） |
| reveal：元素錨點 | 通過 | `route:review` 帶進第一個實例 `1:review` 並 `preventDefault` |
| reveal：連線錨點 | 通過 | `edge:approval-decision->review` 讓 `2:approval-decision` 與 `3:review` 都進入畫面 |
| reveal：畫布錨點與不在檢視中的錨點 | 通過 | `canvas` 與 `route:handoff` 都未處理、沒有 `preventDefault` |
| 簡化檢視中拖曳框 | 通過 | 按住移動 134px：框位移 0，localStorage 的 flow 寫入 0 次 |
| 完整 flow 200% 後選 journey，`]` 回到「全部」 | 通過 | 回來時 transform 與選 journey 前相同（`scale(2)` 與原平移） |
| `[` 回到 request-changes；Cmd+[ 不切換 | 通過 | |
| 重新載入（同一分頁）後仍是 request-changes 且為 fit | 通過 | 等同切到 Components 再回來的重新掛載 |
| 重新掛載後選「全部」恢復 sessionStorage 中的 200% 相機 | 通過 | |
| 收合清單 | 通過 | `data-journey-list="collapsed"`，viewport left 40 |
| figma-export 開啟（`data-sbfx-workspace-open`）時縮放與 layout 群組在清單右側 | 通過 | 兩者 x 264；以 `globals=figmaExport:on` 開啟真正的工作區與留言面板，簡化檢視中縮放群組、layout 群組與提示都在清單右側，dock 浮在畫布上 |

### growth-fund 型 prototype（30 個 route，沒有宣告 journeys）

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 推導條數等於分支出邊數 | 通過 | 17 條，7 個分支點，各組 2、2、2、2、3、4、2 條（不同目的地數 2、2、2、2、2、3、4），沒有截斷提示 |
| 同一分支點下名稱不重複 | 通過 | |
| 每條推導都含其分支點、連線不交錯、標籤不蓋到畫面 | 通過 | 逐條選取 17 條：每條都是一列（不同的框頂最多 2 種：route 與節點），重疊 0 個 |
| 長標題截斷、步數可見 | 通過 | 截圖確認標題以省略號截斷，步數留在右側 |
| 沒有修飾鍵的滾輪捲動清單、不移動相機 | 通過 | 視窗高 600 時清單 scrollHeight 754／clientHeight 561，滾輪後 scrollTop 0 → 193，world transform 不變 |
| Ctrl + 滾輪在清單上縮放畫布 | 通過 | |
| loop 標記 | 通過 | 「Open Payout detail · ↩ Payout detail」最後出現「↩ Payout detail」 |

### 超過 24 條的截斷提示

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 100-route fixture（22 條推導） | 通過 | 列出 22 條，沒有提示 |
| 暫時在暫存 fixture 的 100-route flow 加上 screen-001 的 10 條 reference 分支（共 33 條，驗完還原） | 通過 | 列出 24 條，提示「另有 9 條未列出，建議在 flow 宣告 journeys」 |

## Safari（手動，待使用者回報）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 清單切換、`[`／`]`、收合 | 待回報 | |
| 簡化檢視的點線（`stroke-dasharray` 使用 `calc()`）顯示為圓點 | 待回報 | |
| hover 連線或標籤顯示全文 | 待回報 | |
| 原生 pinch 在清單上縮放畫布、不縮放頁面 | 待回報 | |

## Firefox（手動，待使用者回報；這台機器沒有安裝 Firefox）

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 清單切換、`[`／`]`、收合 | 待回報 | |
| 簡化檢視的點線顯示為圓點 | 待回報 | |
| hover 連線或標籤顯示全文 | 待回報 | |
| 清單滾輪捲動、Ctrl + 滾輪縮放畫布 | 待回報 | |
