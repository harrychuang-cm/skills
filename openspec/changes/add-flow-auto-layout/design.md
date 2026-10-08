## Context

UI Flow（`flow-canvas.js:PrototypeFlow`）的畫面位置來源：已存的排版（localStorage，格式由專案的 `prototypeFlowLayout.ts` 定義，schema version 2，鍵為 `prototype-inspector:flow-layout:<prototypeId>`，帶 viewport signature）優先，否則用 flow 宣告的 `flowPosition`，再否則依宣告順序排成格狀（`getRoutePosition` 與 `getFallbackGridPitch`）。拖曳後以 `commitLayoutPositions` 一次寫入；版面控制列有 `Reset Layout`（確認對話框後清除）、`Import Layout`、`Export Layout`。Static Flow 讀同一份位置，框尺寸依宣告的 viewport。

前置 change 都已實作並 commit（未歸檔）：

- rebuild-flow-canvas-camera：相機、fit 與 fit 追蹤、`resolveCanvasShortcut`、`overlayOpen`／`close-overlay`、畫布手勢零 commit 規則（pinch、平移、拖曳期間 0 次 commit，閒置或放開後恰好 1 次）。
- add-flow-canvas-level-of-detail：以 instance key 分層、截圖與尺寸快取。
- add-flow-journey-focus（`476f381`）：flow 宣告的 `journeys`（`normalizeJourneys(flow)`）、依分支推導的短流程（`deriveBranchJourneys(flow, { limit: 24 })`）、合格連線判斷 `isJourneyEdgeTransition`、單一流程的唯讀簡化檢視（`latestRef.isReadOnlyView`，其中 `Reset`、`Import`、拖曳停用）、清單寬度變數與切換前 hook。畫布的 journey 清單已經算好 `declaredJourneys` 與 `derivedJourneys` 兩個 memo。
- add-flow-canvas-comments 與 figma-export addon 0.14／0.15：框、節點與 key 連線帶留言錨點，完整畫布的 world 圖層宣告 canvas world；每次 commit 後畫布派送 `sbfx:anchors-moved`。

框的尺寸：route 框為預覽尺寸寬 + 2、高 + 64 + 2（`nodeFrameSize`、`nodeHeaderHeight`），可見矩形自框頂往下 65、左右各內縮 1；flow-only node 的可見矩形是整個框（`getFlowMetadataNodeSize`）。

### 與 UI Flow 留言的互動

- 錨點不變：框、節點、連線的錨點 id 不因排版改變。
- 套用與 Undo 都是一次 commit，commit 後的 layout effect 會派送 `sbfx:anchors-moved`，所以框與連線上的釘點跟著畫面移動。
- 空白處的留言存的是 world 座標，排版不會搬動它們；Inspector 無法知道哪些空白留言原本靠近哪個畫面，所以確認對話框之外，文件說明這個限制。
- 不會重新載入任何 iframe（框只換位置，React key 不變）。

## Goals / Non-Goals

**Goals:**

- 一鍵把整張 UI Flow 排成「每個功能一列、由左到右」，列與列之間有空隙與功能名稱。
- 結果存進既有排版，之後可拖曳微調；Static Flow 跟著改變。
- 誤按可以復原；已有手動排版時先確認。
- 演算法是可測的純函式，Inspector 不加任何套件。

**Non-Goals:**

- 修改 `prototypeFlowLayout.ts` 或排版的 schema version。
- 在 Static Flow 中畫出功能名稱（Static Flow 只跟著位置改變；名稱可另案加入）。
- 交叉最少化、自動調整連線路徑或標籤位置（連線仍由現有的繞線計算）。
- 在 journey 簡化檢視中排版（該檢視本來就是唯讀的單一流程排列）。
- 讓同一畫面在完整畫布上出現多次。
- 搬動空白處的留言。

## Decisions

### 功能來源依序選擇

`resolveAutoLayoutLanes(flow, { declared, derived })` 為 geometry 純函式。`declared` 與 `derived` 由畫布傳入 journey 清單已算好的 memo（避免 `normalizeJourneys` 重複 warn），回傳 `{ source: 'journeys' | 'flowGroup' | 'derived' | 'single', lanes: Array<{ key, title, order: 'sequence' | 'graph', members: string[] }>, showTitles }`。畫面依 `flow.routes` 再 `flow.nodes` 的宣告順序（與 journey 推導相同）。

1. `declared` 不為空：每條 journey 一列，鍵 `declared:<id>`，`order: 'sequence'`，members 依 steps 第一次出現的順序。
2. 否則，至少一個 route 或 flow node 有 `flowGroup`：每個 `flowGroup` 一列，鍵 `group:<flowGroup>`，依該組最早宣告的成員排序列，`order: 'graph'`。
3. 否則，`derived.journeys` 不為空：每條推導流程一列，鍵為推導流程的鍵（`derived:<分支點>:<目的地>`），`order: 'sequence'`。
4. 否則：所有畫面一列，鍵 `single`，`order: 'graph'`。

接著依「第一列擁有」分配：每個畫面只留在第一個列出它的列；不屬於任何列的畫面放進最後一列（鍵 `other`、標題 `Other screens`、`order: 'graph'`）。分配後沒有畫面的列丟掉，最後才判斷 `showTitles`（剩超過一列）。所以 storybook-template example 的 `request-changes` 列（畫面都被 `approve-request` 擁有）會被丟掉，只剩一列、不顯示名稱。

使用者已決定把 `flowGroup` 放在第 2 順位。`flowGroup` 不代表順序，所以 flowGroup 列一律以連線決定列內順序（`'graph'`）。單一畫面的 flowGroup 會變成只有一個畫面的列（見 Risks）。

### 列內排列：順序列與圖列

合格連線沿用 `isJourneyEdgeTransition`：兩端都是畫面、flowLine 為 key 或 reference、kind 不是 return 或 global。

`computeAutoLayout(lanes, transitions, sizeOf)` 回傳 `{ positions: Record<nodeId, {x, y}>, labels: Array<{ key, title, anchor }> }`：

- `'sequence'` 列：members 排成一列，每個框在前一個框右緣往右 160 world px。
- `'graph'` 列：只看兩端都屬於本列的合格連線。
  1. 先依「忽略方向的連線」把畫面分成連通的群組，群組依其第一個宣告的畫面排序，由左到右擺放，每群從上一群最右邊的框右緣往右 160 開始。沒有這一步時，彼此沒有連線的畫面全部是欄位 0，會疊成一欄極高的子列。
  2. 群組內做深度優先走訪：先依宣告順序從沒有入邊的畫面出發，走完後再從尚未走訪的畫面依宣告順序繼續（沒有起點的循環也能處理）；指向目前走訪路徑上畫面的連線視為回頭邊並忽略，得到無環圖。
  3. 以 Kahn 排序計算「從入口起最長路徑的長度」作為欄位；同一欄的畫面依宣告順序往下排成子列。
  4. 欄寬取該欄最寬的框，欄與欄之間 160；較窄的框在欄內水平置中。

每一列與每一個子列都套用同一條中線規則（抽成 geometry 的 `placeCenteredRow(items, top)`，`computeJourneyLayout` 也改用它）：可見矩形的垂直中心對齊在同一條中線上，中線位於該列頂端往下「該列各框從框頂到可見矩形垂直中心的最大距離」處。第一列列頂為 y 0；子列在上一個子列最低的框底往下 120；下一列列頂在上一列最低的框底往下 240；所有列從 x 0 開始。座標取整數。160、120、240 是設計值，不是量測值。

`sizeOf(nodeId)` 與 journey 共用形狀 `{ width, height, visibleTop, visibleHeight, visibleLeft?, visibleWidth? }`，由 geometry 的純函式 `getAutoLayoutFrameSize(box, viewport)` 計算。route 框的尺寸取「量測到的預覽尺寸」與「解析出的 viewport」較大者：Static Flow 依宣告的 viewport 定框尺寸，若取較小的量測值，Static Flow 的框會互相重疊。

### 共用畫面只放一次

完整畫布每個畫面只有一個位置，所以出現在多個功能中的畫面只放在第一列；後面的列略過它。完整畫布只畫 key 連線（`isVisibleFlowEdge`），所以只有 key 連線會從共用畫面連到後面的列。需要完整看一條流程時，使用 journey 簡化檢視。

### 寫入既有排版，功能名稱另存

`positions` 是框的左上角（與 `flowPosition` 相同的意義），`labels[].anchor` 是該列第一個（子）列的第一個畫面。套用時：

- 以 `commitLayoutPositions(positions)` 寫入（與拖曳相同的路徑），所以 Static Flow、Export 與相機的 fit 都用同一份位置。
- 功能名稱寫入 Inspector 自己的 localStorage 鍵 `prototype-inspector:flow-lanes:<prototypeId>`（prototype id 與排版鍵相同的正規化：空白或缺少時為 `prototype`），值為 `{ version: 1, viewport: <signature>, labels: [{ key, title, anchor }] }`。`showTitles` 為 false 時寫入空的 labels 並移除鍵。
- 讀取：在 `flow-canvas.js` 讀（SSR 測試的 localStorage stub 只存在 vm 這一側，排版 helper 是原生 import 的），以 `typeof window` 與 try/catch 防護；開啟時只讀不寫、不刪。簽章為 null 的紀錄視為 `phone:375x812`；flow 本身沒有簽章時接受任何紀錄；簽章不符時不顯示。名稱在既有的 storedLayoutSource effect（prototype、viewport 或畫面集合改變時重讀排版）中一起重讀。
- `Reset` 清除這個鍵；`Export` 在匯出的 JSON 中加上 `lanes`（已存且錨點畫面在 flow 中的名稱，格式同 labels；在 journey 簡化檢視中匯出也包含，因為該檢視的 Export 仍匯出完整版面）；`Import` 讀到 `lanes` 時以目前的簽章寫回、丟掉錨點不在 flow 中的名稱，沒有時移除鍵。

替代方案「把名稱寫進排版 payload」被否決：要改 `prototypeFlowLayout.ts`，Inspector 會 import 新名稱，已安裝的專案在安裝程式檢查時會被要求 `--force` 重裝 helper。

### 名稱跟著錨點畫面

功能名稱畫在螢幕座標的覆蓋層（與框標題同一層），以 CSS 定位：world 變數設為錨點畫面可見矩形的左上角，`transform` 依相機變數換算，再往左位移 `var(--pi-sys-spacing-screen-gutter)`（Inspector 預設 24px；專案的 `--sbt-sys-spacing-screen-gutter` 會改變它，storybook-template 是 16px）並以自身寬度靠右對齊；字級與框標題相同（12px），寬度上限 `calc(var(--pi-ref-size-80) * 3 - var(--pi-sys-spacing-screen-gutter))`（預設 216px），超過時換到第二行，兩行仍放不下才以省略號截斷；名稱不接收指標，所以不用 `title`（不會顯示）。`getAutoLayoutLabelPlacement(anchorBox, camera)` 只當測試與 CDP 檢查的參考值，DOM 不呼叫它。

- 名稱元素帶 `data-lane-anchor="<錨點畫面 id>"`，不用 `data-frame-id`：拖曳時以 querySelector 找第一個 `data-frame-id` 的元素，重複使用會抓錯元素。拖曳時在 `writeDragToDom` 移動掛在被拖畫面上的名稱，`restoreDragDom` 放回（與框標題相同的做法）；放開後由 commit 重新定位。
- 名稱設 `pointer-events: none`、不帶留言錨點；journey 簡化檢視中隱藏。
- fit 預留名稱空間：顯示名稱時，`fitToView` 把畫布寬度扣掉 240 螢幕像素（畫布窄於 480 時改為畫布寬度的一半，避免框沒有空間）再 fit，並把相機往右移同樣的距離，讓名稱（最寬 216 + 24）在 fit 後完整可見。沒有名稱時 fit 不變。替代方案「把名稱的世界寬度加進範圍」被否決：名稱是固定螢幕寬度，世界寬度依縮放而變，會形成循環。

### 確認、套用與復原

- 按鈕在 layout 群組第一個，可見文字 `Auto Layout`（與 `Reset Layout` 等同為 Title Case），`aria-label="Auto layout UI Flow"`；journey 簡化檢視中依唯讀旗標停用。
- 已有已存排版（`hasCustomLayout`）時先開確認對話框（與 `Reset` 同一個對話框樣式）：標題 `Auto layout this UI Flow?`，說明 `Frames are rearranged by feature, left to right. You can undo right after.`，按鈕 `Auto Layout` 與 `Cancel`；對話框納入 `overlayOpen`，Escape 以 `close-overlay` 關閉。沒有已存排版時直接套用。
- 套用的同一批更新：`setFitTracking(true)` 與 `setIsFitTracking(true)`、`commitLayoutPositions`、寫入名稱、清除 hover、關閉對話框、顯示提示。fit 由既有的 fit layout effect 在 commit 後依新的範圍執行；直接呼叫 `fitToView` 會 fit 到舊的範圍。
- 提示 `Auto layout applied.` 與 `Undo`（`role="status"`）放在 layout 群組內當第一列，沿用 layout 群組避開 figma-export dock 的規則。8000ms 後消失（設計值）；計時器到期時若正在拖曳或相機正在移動，每 250ms 重新排程，不在手勢中 commit。
- 重排：同一次開啟中，自動排版之後若沒有任何版面動作（拖曳放開、`Reset`、`Import`、`Undo`、再次套用、storedLayoutSource 改變、切換 journey），量到的框尺寸超過排版當時用的尺寸（第一次開啟時 route 還沒量完就按下）時，以新尺寸重新計算並寫入，可復原快照不變。這讓「畫面不重疊」在量測完成後仍成立；代價是這次寫入不是使用者直接觸發的版面動作，而且可能在相機閒置的那次 commit 之後多一次 commit。
- `Undo` 寫回套用前的快照：正規化後的 positions（空物件時 helper 會移除排版鍵）與名稱紀錄（原本沒有時移除）。被忽略的其他 viewport 排版、已刪除畫面的位置不在快照中，不會寫回。
- 可復原狀態在以下情況結束：放開拖曳、`Reset`、`Import`、再次 `Auto Layout`、storedLayoutSource 改變、選了某個 journey（加入 `beforeJourneySwitchRef`）、unmount。

## Implementation Contract

**Behavior**

- 版面控制列最前面出現 `Auto Layout`（`aria-label="Auto layout UI Flow"`）。按下後，每個功能一列、由左到右，列首左側顯示功能名稱；畫面不重疊。
- 結果在重新整理後仍在；可再拖曳；`Undo` 回到套用前。
- 已有自訂排版時先確認；journey 簡化檢視中停用。

**Interface / data shape（geometry export）**

- `resolveAutoLayoutLanes(flow, { declared, derived })` → `{ source, lanes, showTitles }`；lane 鍵為 `declared:<id>`、`group:<flowGroup>`、推導流程的鍵、`other`、`single`。
- `computeAutoLayout(lanes, transitions, sizeOf)` → `{ positions, labels }`。
- `placeCenteredRow(items, top)` → `{ placed, bottom }`：items 帶 `x`、`width`、`height`、`visibleTop`、`visibleHeight`，回傳加上 `y` 的項目與該列最低的框底；`computeJourneyLayout` 與 `computeAutoLayout` 共用。
- `getAutoLayoutFrameSize(box, viewport)` → `{ width, height, visibleTop, visibleHeight }`（route 取量測預覽與 viewport 較大者）。
- `getAutoLayoutLabelPlacement(anchorBox, camera, frameType = "route", gutter = 24)` → `{ right, top }`（螢幕座標，只供測試與 CDP 檢查；CDP 檢查傳入頁面上 `--pi-sys-spacing-screen-gutter` 的實際值）。
- localStorage：`prototype-inspector:flow-lanes:<prototypeId>` → `{ version: 1, viewport, labels }`；Export JSON 新增 `lanes`。
- DOM：按鈕 class `prototype-inspector__flow-auto-layout-button`；名稱 class `prototype-inspector__flow-lane-label`（帶 `data-lane-key` 與 `data-lane-anchor`）；提示 class `prototype-inspector__flow-auto-layout-notice`；對話框沿用 Reset 對話框的 class。
- 測試入口（只供測試）：SSR 以 vm context 的 `window.localStorage` stub 提供名稱紀錄。
- bench：`bench_flow_canvas.mjs --layout <UI Flow layout export>` 以匯出檔的 positions（與 `lanes`）當作開啟前的已存版面，量測套用 Auto Layout 之後的畫布。

**Failure modes**

- localStorage 不可用：位置照常套用在本次畫面上（與拖曳相同的退路），名稱只存在記憶體。
- 讀到的名稱鍵 viewport 不符或格式不對：不顯示名稱，不影響位置。
- 空的 flow 直接渲染空狀態，沒有控制列，所以不需要停用條件。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs`：功能來源四種情況的範例表與 lane 鍵、journeys 與 flowGroup 同時存在時只用 journeys、`Other screens`、example 丟掉空列且 `showTitles` 為 false；順序列座標（handoff 在 (1454, 0)）、分支子列、回頭線不改變順序、純循環欄位 0、1、2、孤立畫面由左到右、共用畫面歸屬；growth-fund 形狀與 100 個 route 的合成 flow 任兩框不重疊；100 個 route 的計算時間低於 50ms（估計值：30 個節點的圖做一次深度優先與欄位計算應在 1ms 量級，由這個測試量測確認）；名稱位置的兩組相機範例；`computeJourneyLayout` 既有測試照常通過。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs`：按鈕名稱與位置（在 Reset 之前）、初始沒有對話框、簡化檢視中停用、名稱元素的數量與文字、簽章不符時不渲染、未知錨點略過。
- `node storybook-product-prototype/scripts/check_flow_auto_layout.mjs --url <iframe URL>`（系統 Chrome、CDP、比照 `check_flow_canvas_comments.mjs`），以 `create_flow_bench_fixture.mjs` 的 fixture 的 `pages-prototypes-bench-growth-fund--default` 與 `pages-prototypes-example-prototype--default` 執行（名稱相關案例只在 growth-fund 跑）：套用後畫面不重疊、每列由左到右、名稱數量與功能數相同且 fit 後完整可見、確認對話框只在已有排版時出現、Undo 回到套用前、計時器在拖曳中到期時放開前 0 次 commit、重新整理後位置與名稱都在、拖曳只移動該列的名稱且拖曳中 0 次 commit、Reset 後名稱消失、Export／Import 帶 `lanes`、figma-export 開啟時 1600、800、640px 三種寬度下按鈕與提示不被 dock 蓋住。
- 回歸：geometry、SSR、authority、installer、smoke（含 mirror parity）、template esbuild bundle、`check_flow_canvas_comments.mjs` 與 bench 全數以零碼結束；Safari 與 Firefox 由使用者手動檢查。

**Scope boundaries**

- In scope：上述 geometry 函式、按鈕、確認對話框、復原、名稱的顯示與保存、fit 預留名稱空間、Export／Import 的 `lanes`、測試、文件、template 副本、build tag。
- Out of scope：Non-Goals 所列項目；`prototypeFlowLayout.ts`；Static Flow 的名稱。

## Risks / Trade-offs

- [`flowGroup` 列很多只有一個畫面] → 依 journey-focus 的實測，48 組中有 23 組只有一個畫面，會排出很多單畫面的列；文件建議宣告 journeys 以得到更好的結果。
- [共用畫面造成跨列的長連線] → 共用畫面放在第一列；需要完整看單一流程時用 journey 簡化檢視。
- [自動排版覆蓋手動排版] → 已有排版時先確認，套用後 8 秒內可 `Undo`。
- [推導流程的前文重複] → 推導流程的前文步驟只會在第一次出現的列中放置，後面的列略過，列可能比流程本身短，也可能整列被丟掉。
- [名稱在 x < 0 的位置] → 名稱畫在第一個框的左側；fit 在顯示名稱時預留 240 螢幕像素，CDP 檢查在 growth-fund 上斷言名稱完整可見。手動平移或縮放後名稱仍可能在畫面外。
- [空白處的留言不跟著畫面移動] → 文件說明；留言仍在清單中，可用 Show location 找到。

## Migration Plan

1. 本 change 不改排版 schema 與 helper；已安裝的專案以 `install_prototype_inspector.mjs --force` 取得新的 Inspector 後即可使用。
2. 回復方式：還原 Inspector 檔案。已寫入的位置是一般的排版，舊版 Inspector 照常讀取；名稱鍵沒有讀者，不影響。
