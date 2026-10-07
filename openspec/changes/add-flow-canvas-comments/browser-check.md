# UI Flow 留言跨瀏覽器檢查（task 4.1）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（2026-10-06，含 figma-export addon 0.14.0，template `preview.ts` 以 `configureFigmaExportReview` 設定，`addons` 順序為 docs、figma-export、inspector），Storybook dev（`storybook dev -p 6160`），Inspector build tag `flow-comments-2026-10-06`，macOS 26.5.1（Apple M4）。

## Chrome 154.0.8037.98（自動，2026-10-06）

指令：`node storybook-product-prototype/scripts/check_flow_canvas_comments.mjs --url "http://localhost:6160/iframe.html?id=pages-prototypes-example-prototype--default&viewMode=story"`。以 CDP 驅動系統 Chrome（headless），直接開 preview 的 `iframe.html`，手勢與點擊是在頁面內派送的 DOM 事件（WheelEvent、PointerEvent、MouseEvent）。留言經由 fixture 的 review server 真正儲存。結果：20 項全部通過。

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 平移 30 個 wheel 事件：每個畫格都發出 `sbfx:anchors-moved`，監聽者讀到的框位置就是該畫格畫出的位置 | 通過 | 30 個移動畫格、31 個事件；手勢期間 `pi:flow:commit` 0 |
| 拖曳 20 次移動：每個畫格都發出事件，位置一致 | 通過 | 20 個移動畫格、22 個事件；拖曳期間 commit 0 |
| 顯示位置：元素錨點 | 通過 | 相機框住目標框（中心誤差 ≤ 1px、完整在畫面內、縮放 ≤ 1），Fit canvas `aria-pressed="false"`，事件 defaultPrevented |
| 顯示位置：view 為 `story` 的請求 | 通過 | 相機不動，事件沒有被 preventDefault |
| 顯示位置：連線錨點 | 通過 | `edge:intake->review` 兩端的框都在畫面內 |
| 顯示位置：畫布錨點 | 通過 | world 點在 viewport 中央（誤差 < 0.001px），縮放不變 |
| 已被其他監聽處理的 Esc 不取消拖曳 | 通過 | 框位移 (120.2, 60.1)，預期 (120, 60)；對照組：沒被處理的 Esc 讓框回到原位 |
| 擷取模式時框內 iframe 不接收指標事件 | 通過 | 加上讓 iframe 接收指標的樣式後：一般為 `auto`、擷取模式為 `none`、結束後回到 `auto` |
| UI Flow 的匯出區塊 | 通過 | 顯示「Open Static Flow to export this flow.」與連結（`path=/story/pages-prototypes-example-prototype--static-flow`），匯出按鈕隱藏 |
| 對框留言 | 通過 | `element` 錨點 `route:review`（版面像素 187.5, 406），檢視 `ui-flow` |
| 對連線留言 | 通過 | `path` 錨點 `edge:intake->review`，t ≈ 0.5 |
| 對空白處留言 | 通過 | `canvas` 錨點，附最近的兩個框 |
| 擷取模式中雙擊框 | 通過 | 只有 1 個待放置釘點、1 個輸入框，頁面收到 0 次 dblclick |
| 拖曳框時釘點跟隨 | 通過 | 框移動 134px，69 個畫格取樣中釘點相對框的偏移最大差 0.006px |
| Story 模式清單不含 UI Flow 留言 | 通過 | 清單為空，檢視切換顯示「ui-flow · 3」 |
| Story 模式留言不帶 view（即 story） | 通過 | |
| UI Flow 清單含自己的 3 則留言、不含 Story 留言 | 通過 | |

bench（`bench_flow_canvas.mjs`，growth-fund，`globals=figmaExport:on;prototypeMode:flow`）：見下方「效能」。

## 效能

`bench_flow_canvas.mjs`，growth-fund（30 個 route、32 條 key 連線），`globals=figmaExport:on;prototypeMode:flow`，build tag `flow-comments-2026-10-06`，2026-10-06：

| 手勢 | 手勢期間 `pi:flow:commit` | 靜止／放開後 100ms 內 | 長畫格 |
| --- | --- | --- | --- |
| pinch 30 個 ctrl+wheel | 0 | 1 | 0 |
| 平移 30 個 wheel | 0 | 1 | 0 |
| 拖曳 20 次移動 | 0 | 1（放開後） | 0 |

拖曳每次移動的同步成本 p95 1.8ms（門檻 8ms）。

## Safari（手動，待使用者回報）

以 `globals=figmaExport:on` 開啟 example prototype 的 UI Flow，展開留言面板。

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 在框上留一則言，釘點出現在點擊位置 | 待回報 | |
| 在連線上留一則言 | 待回報 | 點在線上 8px 以內 |
| 在兩個框之間的空白處留一則言 | 待回報 | |
| 平移與縮放後，三個釘點都還在原位 | 待回報 | |
| 拖曳有留言的框，釘點跟著框移動 | 待回報 | |
| 輸入框開啟時按 Esc 只關閉輸入框 | 待回報 | 拖曳框時按 Esc 不會取消拖曳以外的動作 |
| 截圖中看得到 UI Flow 的框與連線 | 待回報 | 在清單中把滑鼠移到釘點上看截圖 |

## Firefox（手動，待使用者回報）

本機沒有安裝 Firefox，需由使用者在有 Firefox 的機器上檢查，項目同 Safari。

| 檢查 | 結果 | 備註 |
| --- | --- | --- |
| 在框上留一則言，釘點出現在點擊位置 | 待回報 | |
| 在連線上留一則言 | 待回報 | |
| 在兩個框之間的空白處留一則言 | 待回報 | |
| 平移與縮放後，三個釘點都還在原位 | 待回報 | |
| 拖曳有留言的框，釘點跟著框移動 | 待回報 | |
| 輸入框開啟時按 Esc 只關閉輸入框 | 待回報 | |
| 截圖中看得到 UI Flow 的框與連線 | 待回報 | |
