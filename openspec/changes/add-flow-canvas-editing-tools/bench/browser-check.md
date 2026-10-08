# UI Flow 編排工具檢查（task 4.2）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（暫存資料夾，含 storybook-template 的 example prototype），Storybook dev（`storybook dev -p 6170`），Inspector build tag `flow-editing-2026-10-08`，figma-export addon 0.15.0，機器 Mac16,1（Apple M4，16 GB），macOS 27.0.1（Darwin 27.0.0）。

清單來源：tasks.md 2.1–3.4 的驗證項目與 4.2 的通過條件，加上 design.md Acceptance criteria 的手動項目。

## review 後的修正（2026-10-08，task 6.1，下面的指令回歸在修正後重跑）

- Warning：唯讀檢視中按住畫面、在畫面外放開會留下按下；回到完整 flow 後下一次拖曳的放開被吃掉，之後滑鼠滑過就拖動畫面。現在唯讀的按下抓住指標，新的按下與切換 journey 清掉殘留的按下。修正前新案例失敗（拖曳位移 0，hover 時 `translate(243.762px, 61.8812px)`）。
- Warning：空白處按下後在 viewport 外（例如縮放群組上）放開會留下按下，之後沒按鍵的移動畫出框選。現在空白處按下就抓住指標，收到主鍵沒按住的移動時丟棄按下。修正前新案例失敗（框選顯示）。
- Suggestion：開始一次微調時就結束 Auto Layout 提示的復原期間。修正前新案例失敗（方向鍵後 50 ms 提示仍在）。
- Suggestion：選取外框改用與框選、吸附、小地圖相同的可見矩形清單。
- `check_flow_canvas_editing.mjs` 修正後 22/22 通過。

## verify 後的修正（2026-10-08，task 5.1）

- Warning 1：歷史為空時「ArrowRight 後 500ms 內 Mod+Z」沒被畫布處理（`canUndo` 沒算進待提交的微調），Mod+Z 傳給 Storybook、微調照樣存下。現在 `canUndo` 算進待提交的微調、`canRedo` 在有待提交的微調時為假。
- Warning 2：方向鍵微調後 500ms 內拖曳已選取的畫面，畫面不動（按下時讀到微調前的位置，所以程式擋掉拖曳）。現在被拖畫面在真正開始拖曳時才讀取，微調後立刻拖曳會從微調後的位置繼續。
- Warning 3：分區改用成員的畫面框（spec 的 member box）計算形狀與留白；分區名稱仍以最上方成員的可見矩形頂端避開框標籤。重跑分區檢查 6/6 通過。
- Warning 6：新增 `check_flow_canvas_editing.mjs`，以 spec 的數值重跑原本只在一次性腳本跑過的情境。對修正前的 `flow-canvas.js` 執行時方向鍵的 6 個案例失敗（第一個是「(20, 0)，寫入 1 次」，Mod+Z 沒有復原），修正後 19/19 通過；剛開啟按 N 的案例在 viewport-overflow 型 fixture 上有實際量到較大的尺寸（`vh-overflow` 878 → 898）。
- Warning 4（淺色主題的手動檢查）仍列在最後的待回報表。

## 實作過程中的修正（2026-10-08）

- 分區名稱：fixture 的 template 把 `--pi-sys-typescale-caption-sm-line-height` 設為 `normal`，放進 `calc()` 會讓整個 transform 失效，名稱全部疊在 viewport 左上角。改以字級估算框標籤高度（兩倍字級加下方留白，figma-export 的徽章讓框標籤高 24px），並在 design 與 spec 補上「留白比框標籤矮時再往上移，避開該成員的框標籤」。fit（17%）時 6 個分區名稱都不與框標籤重疊。
- 分區留白：growth-fund 中 `purchase-self-select`（us2-purchase）與 `accrue-spend`（us3-accumulation）是作者刻意的重疊（垂直重疊 252px）。兩者留白都是 0，分區只蓋到重疊本身，符合 `min(32, max(0, (g - 8) / 2))`；檢查腳本只把「留白造成的侵入」算失敗。
- 小地圖點擊：fit 時可視框幾乎蓋滿面板，點擊落在可視框內會被當成拖曳的開始（規格行為）。檢查改為先放大，再點可視框外。
- 留言檢查的 workspace 案例新增縮放選單：figma-export 介面出現時縮放選單靠左對齊並設最大高度，1600、800、640px 都完整可見且不碰 dock（640px 時高 319px，不需捲動）。

## 指令回歸（2026-10-08，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot 三個測試檔 | 91 項通過（geometry 77 項：本 change 追加框選、吸附門檻與範例、歷史序列、分區留白與名稱位置、小地圖轉換、相鄰 route／步驟、Esc 優先順序與按鍵路由表） |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（新增：選取外框與 `data-selected`、參考線 token 與隱藏的參考線、小地圖門檻 30／5／7+1 與偏好、分區只畫 4 個 route 的組且為 inline fill、自動排版名稱取代分區名稱、`Sections` 偏好、簡化檢視沒有分區、縮放選單的 Shift+2 與 N 說明、簡化檢視中只有 `3:review` 有外框）。選取、參考線、小地圖、分區與縮放選單說明的斷言先對實作前的 `flow-canvas.js` 執行並失敗 |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過 |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 通過 |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（鏡像比對涵蓋 9 個 runtime 檔） |
| storybook-template 的 `npm run typecheck` | 通過 |
| template 目錄的 `esbuild .storybook/prototype-inspector/preview.js --bundle` | 通過 |
| `check_flow_canvas_editing.mjs`（`--url` growth-fund、`--journey-url` example、`--resize-url` viewport-overflow） | 22/22 通過（task 5.1 新增 19 項、6.1 再加 3 項；各自在修正前的程式上失敗） |
| `check_flow_canvas_comments.mjs`（example prototype） | 35/35 通過（新增：整組拖曳時留言 pin 跟著框、小地圖與縮放選單在 1600、800、640px 不與縮放群組、layout 群組及 dock 重疊） |
| `check_flow_auto_layout.mjs`（growth-fund） | 26/26 通過（新增：Mod+Z 還原 Auto Layout 的位置與功能名稱、Shift+Mod+Z 重做、提示的 Undo 走復原歷史） |
| `check_flow_auto_layout.mjs`（example prototype） | 16/16 通過 |
| `bench_flow_canvas.mjs`（growth-fund 型） | 結果在 `bench/after.json`，數字見下表 |

### bench（growth-fund 型，30 個 route、2 個節點，1600×1000，headless Chrome 154）

兩次量測：A 是 task 4.2 時（16:26），B 是 task 5.1 修正後（17:01）。B 量測時機器負載平均值為 20–43（10 核），截圖與開啟時間全面變慢，包含與本 change 無關的截圖流程，所以兩欄的時間不可直接比較；`bench/after.json` 存的是 B。手勢中的 commit 次數、寫入次數與位移在兩次都相同。

| 項目 | A | B |
| --- | --- | --- |
| 開啟時 layout 寫入 | 0 | 0 |
| pinch：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 平移：手勢中 commit／閒置後 100 ms 內 | 0／1 | 0／1 |
| 單框拖曳：手勢中 commit／放開後 100 ms 內 | 0／1 | 0／1 |
| 單框拖曳每次移動的同步成本中位數／p95（含拖曳中每幀重算分區） | 0.9／1.4 ms | 1.75／2.8 ms |
| 框選：手勢中 commit／放開後 100 ms 內 | 0／1（選到 2 個框） | 0／1 |
| 整組拖曳（3 個框）：手勢中 commit／放開後 100 ms 內／layout 寫入 | 0／1／1，位移相同 | 0／1／1，位移相同 |
| 選取 2 個框且小地圖顯示時 pinch、平移的手勢中 commit | 0、0 | 0、0 |
| UI Flow ready | 466 ms | 843 ms |
| route iframe：fit／100% | 0／3 | 0／3 |
| 第一次開啟所有截圖完成 | 6,155 ms | 9,477 ms |
| 重新開啟可見截圖出現 | 266 ms | 655 ms |
| 截圖進行中拖曳的同步成本 p95 | 1.5 ms | 2.8 ms |
| bench 目標全部達成 | 是 | 是 |

## Chrome 154.0.8037.98（自動，2026-10-08）

以 CDP 驅動系統 Chrome（headless，1600×1000），輸入走 Chrome 的輸入管線（`Input.dispatch*`）。腳本只放在工作階段的暫存資料夾，沒有加入 repo；可重複的部分已併入 SSR 測試、留言檢查、Auto Layout 檢查與 bench。

### growth-fund 型（30 個 route、6 個分區）

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| Shift+點擊 A、B、A 後只剩 B | 通過 | |
| Esc 清除選取、事件不往外傳；沒有選取時 Esc 照常傳出 | 通過 | |
| 縮放選單開著時 Esc 只關選單、保留選取 | 通過 | |
| Cmd+A 選取所有顯示中的畫面 | 通過 | 32／32 |
| 點空白處清除選取 | 通過 | |
| pinch 中外框貼著畫面且沒有 commit | 通過 | 最大偏差 0.01 px |
| 框選碰到兩個框就選取，放開前沒有 commit | 通過 | |
| 框選中按 Esc 還原原本的選取 | 通過 | |
| 整組拖曳三個框位移相同、寫入一次 | 通過 | (713, 356) |
| Shift 鎖定位移較大的軸 | 通過 | (594, 0) |
| 拖曳未選取的框只選取它 | 通過 | |
| 方向鍵連按三次 +60、500 ms 後寫入一次；Shift+ArrowDown +100；間隔 600 ms 以上是兩個動作；沒有選取時不移動 | 通過 | |
| 0.5 縮放時左緣相距 7 world px 吸附並畫參考線；按住 Ctrl 不吸附 | 通過 | |
| fit（16.8%）與 8% 時拖離再拖回原位不被吸附 | 通過 | |
| 方向鍵微調後 Mod+Z 還原 | 通過 | x 20 → 0，寫入一次 |
| 小地圖在 viewport 左下角（清單右側） | 通過 | left 264 |
| 點擊小地圖：相機以該點為中心、縮放不變、結束 fit 追蹤 | 通過 | 中心誤差 < 0.01 world px |
| 拖曳小地圖可視框：平移距離等於拖曳距離 | 通過 | 858.85／858.84 world px |
| 小地圖上的滾輪平移畫布 | 通過 | |
| 分區用 inline `--pi-sys-color-surface-raised` | 通過 | 深色 template：#333333 對畫布 #1e1e1e |
| 留白不碰到其他組的框 | 通過 | 只有作者重疊的一組（見上） |
| fit 時分區名稱不與框標籤重疊 | 通過 | 6 個名稱 |
| 拖曳中分區跟著改變、沒有 commit；Esc 寫回原形狀 | 通過 | |
| 放開後的分區與拖曳中畫的一致（四捨五入內） | 通過 | |
| `Sections` 切換隱藏與顯示並保存 | 通過 | `hidden`／`shown` |
| N 依 route 順序選下一個並 fit（不超過 100%） | 通過 | 99.5% |
| 最後一個按 N 回到第一個，Shift+N 回去 | 通過 | |
| Shift+2 fit 選取（結束 fit 追蹤）；全選時等同 Fit；沒有選取時不動 | 通過 | 45% |
| 剛開啟就按 N：結束 fit 追蹤，之後量到尺寸不重新 fit | 通過 | |

### example prototype（request-changes 簡化檢視）

| 檢查 | 結果 | 觀察值 |
| --- | --- | --- |
| 兩個 review 實例 | 通過 | `1:review`、`3:review` |
| 點第二個 review 只有它被選取並有外框 | 通過 | |
| N 從最後一步循環到 intake | 通過 | `0:intake` |
| ArrowRight 不移動任何框、Mod+Z 不寫入 | 通過 | |
| 切換 journey 後選取為空 | 通過 | |

## 手動檢查（待回報）

| 項目 | Chrome | Safari | Firefox |
| --- | --- | --- | --- |
| 選取、框選、整組拖曳、方向鍵微調 | 自動通過（上表） | 待回報 | 待回報 |
| 吸附與 Ctrl 暫停；template 淺色主題下 1px 參考線看得見（pink-70 `#ffb7b9`，白底對比約 1.65:1） | 自動通過吸附；淺色主題可見度待回報 | 待回報 | 待回報 |
| 復原與重做（含 Reset 後 Mod+Z、Auto Layout 連功能名稱） | 自動通過 | 待回報 | 待回報 |
| 小地圖點擊與拖曳 | 自動通過 | 待回報 | 待回報 |
| 分區在淺色 fallback、深色 fallback、template 淺色與深色主題下看得出來，分區上的連線標籤仍可辨識 | 深色 template 已確認；其他主題待回報 | 待回報 | 待回報 |
| 分區形狀：成員之間的 gutter（103px）大於兩倍留白，所以同組的框各自有底色、中間露出畫布；請確認是否足以看出分組 | 待回報 | 待回報 | 待回報 |
| figma-export 介面出現時縮放選單完整可見 | 自動通過（留言檢查） | 待回報 | 待回報 |
