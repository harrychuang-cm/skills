## Context

rebuild-flow-canvas-camera 完成後，UI Flow 已是相機式畫布：相機狀態在 ref 中、閒置 120ms 後交回 React，geometry 模組提供純函式，`flow-canvas.js` 掛載畫面，`bench_flow_canvas.mjs` 與 `create_flow_bench_fixture.mjs`（rebuild-flow-canvas-camera 1.1）提供量測工具與可重現的 fixture。但每個 route 仍是一個 eager 載入的完整 Storybook iframe，尺寸仍以每 250ms、最多 80 次的輪詢量測。

研究結論（2026-10-02，詳見 proposal 的實測數據）：

- 每個 route iframe 是完整的 preview runtime，約 18MB（dev，實測，量自 cm-linepay 的舊版 Inspector 安裝）；記憶體與 iframe 數量成正比，與 prototype 內容關係不大。
- fit 時實際 prototype 的畫面在筆電上只有 57–248px 寬。在 W ≥ 300px 時，最壞情況有 7 個（筆電）到 11 個（桌機）畫面至少 40% 可見；W ≥ 377px 時為 4 到 7 個。
- 研究以 454 行的自製點陣化原型驗證：每張 375×812 畫面中位數 26ms（clone 6–14ms、decode 2–6ms、WebP 編碼 12–17ms），與合成器截圖相比中位數 0.01% 像素不同、最多 4.38%（皆為實測）。必須注意四個陷阱：以 blob: URL 載入含 foreignObject 的 SVG 會汙染 canvas（必須用 data: URL）；`display: none` 的 iframe 沒有排版，截出來是錯的；瀏覽器預設樣式會在部分標籤設定繼承屬性（例如 button 的 text-align），只跟父元素比較會出錯；portal 與 fixed 覆蓋層只有截 body 才會包含。
- 隱藏 iframe 以 `history.replaceState` 加 FORCE_REMOUNT 原地切換 route：研究以 `[data-prototype-root]` 的 `data-route` 判斷就緒時每次 6–40ms（實測）；等待 Storybook 的 completed phase 時每次至少約 100ms（估計：`waitForAnimations` 固定先等 100ms）。11 個實際 prototype 中 10 個在每次 render 都重新讀取 `prototypeRoute`，另一個（inventory）只在 useState 初始化時讀，需要 remount。
- Storybook 10.4.1 的 `onForceRemount` 對既有的 StoryRender 呼叫 `remount()`（先 `teardown()` 再 `render({ forceRemount: true })`）：`renderId` 只在建構時設定、`currentRender` 不會換、也不會顯示 `sb-show-preparing-story`，teardown 期間 phase 仍停在上一個 route 的 `finished`。所以不能以輪詢 `__STORYBOOK_PREVIEW__.currentRender.phase` 判斷切換完成。`completing` phase 的 `waitForAnimations` 先等 100ms，再等有限動畫最多 5 秒。
- 每個 iframe.html 文件各自套用 Vite HMR：@storybook/builder-vite 10.4.1 讓每個文件在自己的 `vite:afterUpdate` 之後由自己的 channel 發出 `storyHotUpdated`，channel 的 postMessage transport 會把它送到父視窗（也就是 Inspector 所在的外層 preview）；@vitejs/plugin-react 6.0.2 的 React Refresh 另有 16ms debounce，Fast Refresh 也不會發出 STORY_RENDERED。外層收到 `vite:afterUpdate` 時，renderer 可能還在舊程式碼上。
- `computeFingerprint` 只雜湊 meta 的 components 與 compositions，而且演算法凍結，不能用來判斷截圖是否過期。
- preview.js 受 vm harness 限制不能使用 `import.meta`；`flow-canvas.js` 也會被 SSR 測試以 vm 執行，所以 HMR 監聽要放在獨立模組。
- 已實作的留言契約（add-flow-canvas-comments、add-anchored-visual-comments，2026-10-07 檢查點 commit `e040d7d`）：route 錨點 `route:<id>` 與名稱、route 屬性放在 `.prototype-inspector__flow-frame-preview` 上；viewport 宣告 `data-sbfx-canvas`、world 圖層宣告 `data-sbfx-canvas-world`；`sbfx:anchors-moved` 在 `writeCameraToDom`、`writeDragToDom`、`restoreDragDom`、每次 commit 後的 layout effect 與 viewport ResizeObserver 派送；`sbfx:reveal-anchor` 由相機處理；擷取模式時 `html[data-sbfx-capture-mode="true"] ... iframe` 讓畫面 iframe 不接收指標（specificity 最高的 iframe 規則）。figma-export addon 在每個 route iframe 內註冊截圖 hook：畫面留言由錨點元素內的 iframe 自己截圖，沒有 hook 時以 html-to-image 截錨點元素；連線與畫布留言把 `[data-sbfx-canvas]` 內有 hook 的 iframe（依面積最多 12 個）畫入，不看 opacity 與 capture-ignore。
- camera 4.6：Figma export 工作區浮在畫布上方，canvas viewport 永遠是完整的 preview 大小。
- `flow-canvas.js` 會被兩個 vm harness 執行：`test_flow_canvas_ssr.mjs` 與 `test_authority_inspector.mjs`。兩者都以 regex 去掉 import 行並注入 import 的值，所以新模組的 export 要注入兩邊，且 import 的函式不能在模組頂層執行。
- 用語：本文件的 renderer 指截圖用的隱藏 iframe（規格中的 snapshot renderer，proposal 中的截圖產生器）；記憶體量測的對象另稱 Chromium renderer 行程。

## Goals / Non-Goals

**Goals:**

- fit 狀態下除了截圖用的 renderer 之外不開任何 route iframe；任何時刻最多 8 個 route iframe。
- 截圖在任何專案中都能在可接受時間內產生（不受 custom property 數量影響），失敗時不影響畫布。
- 再次開啟時立即顯示快取截圖與快取尺寸；程式碼改動後截圖會自動更新，且不會截到舊程式碼。
- 分層切換時版面完全不動。

**Non-Goals:**

- prototype 模板與 route URL 契約的任何變更。
- build 時期預先截圖。
- Components 模式的變體截圖、theme 跟隨工具列。
- 從 StaticFlow story 開啟 UI Flow 時的截圖：此時不產生、不儲存截圖。
- 互動模式（add-flow-frame-interact-mode）；本 change 只提供「固定一個 live 名額」、「暫停量測」與「標記已互動」的介面。
- instance key 的格式：由 add-flow-journey-focus 定義（`"<stepIndex>:<nodeId>"`），本 change 只以它為鍵。

## Decisions

### 依縮放與螢幕寬度分層，閒置時才重算

分層由 geometry 的純函式 `selectFrameTiers` 決定，輸入畫面框（每個畫面帶 instance key `key` 與 `routeId`）、相機、畫布尺寸、hover 中的畫面（`{ key, dwellMs }`）、被固定的畫面 `pinnedId`、被其他功能提升的畫面 `promotedIds`（例如 add-flow-canvas-editing-tools 的選取）與上一輪分層，輸出以 instance key 為鍵的 `culled`／`placeholder`／`snapshot`／`live`。instance key 在完整畫布中等於 node id；在同一 route 會出現多次的檢視（add-flow-journey-focus 的簡化檢視）中是該 change 定義的步驟實例鍵。分層、hover、提升與固定都以 instance key 為鍵，尺寸快取與截圖仍以 route id 為鍵，同一 route 的多個 instance 共用尺寸與截圖。

門檻常數 `LOD_THRESHOLDS = { placeholderMaxWidth: 40, liveMinZoom: 0.8, liveKeepZoom: 0.64, hoverLiveMinZoom: 0.4, liveMinVisibleFraction: 0.4, hoverDwellMs: 200 }`。live 門檻依縮放（內容比例）判斷：route 內容以 1:1 CSS 像素渲染，可讀性只取決於縮放，與畫面寬度無關。縮放 0.8 時 14–16px 的內文在螢幕上約 11–13px，截圖與 live 的差異開始看得出來；377px 寬的手機畫面此時 W ≈ 302px，與原本的 300px 寬度門檻相同，所以手機畫面的分層結果不變。桌機 1282px 寬的畫面在縮放 0.3 時 W 約 385px，但內文只有約 4px，仍顯示截圖，不浪費 live 名額。0.64 的保留門檻避免在 0.8 附近來回切換。扁平佔位仍以螢幕寬度 W < 40px 判斷。可見範圍為視窗向四周各擴張半個視窗（寬、高各自計算）；`getVisibleWorldRect` 回傳這個擴張後的視窗在世界座標中的範圍，與相機規格中畫面的 visible rect（預覽矩形）是不同的東西。被固定的畫面不受縮放門檻、寬度門檻與視窗外剔除影響，固定期間一律 live。

只在相機閒置、hover 變化（含停留滿 200ms 的時刻）、固定或提升狀態改變、尺寸改變、畫布尺寸改變，或畫面位置與顯示中的畫面集合改變時（拖曳放開、微調、復原、重做、Reset、Import、切換簡化檢視）重算，手勢中維持原分層（tldraw 也以相機閒置作為重新計算的時機）。

分層在 render 中由 `cameraSnapshot`、positions、尺寸快取、hover、固定與提升狀態推導（`useMemo`），不以 effect 寫回 state，所以落在那一次 commit。第一次相機 settle 之前沒有 live 畫面（還原的相機加上已量到的畫布尺寸例外）。所有非同步來源（iframe render 完成、ResizeObserver 尺寸、截圖結果、IndexedDB 預載、HMR 的 stale 標記、hover 停留計時、畫布尺寸）在相機移動中（`cameraIdleTimerRef.current` 存在）或拖曳中（`dragRef.current?.started`）一律先暫存，在 `settleCamera`（與 `setCameraSnapshot` 同一批）或放開、取消拖曳的同一批更新中套用。例外是開啟時的 IndexedDB 預載：讀完之前畫布維持隱藏，讀完就在顯示畫布的那次 commit 套用，即使開啟時的 fit 正在跑相機閒置計時也不等（實作時發現新分頁沒有存過的相機位置時，fit 會讓畫布多隱藏約 120ms；畫布隱藏時沒有可見的手勢，暫存沒有意義），畫布顯示之後才讀到的紀錄仍照上述規則暫存；hover 停留計時器在相機移動或拖曳中不啟動，相機移動時也不因內容滑過靜止的指標而改變 hover。相機閒置時的分層結果與相機快照在同一次 commit 套用，不另外多一次 commit，讓 rebuild-flow-canvas-camera「閒置後恰好一次 commit」的量測在本 change 之後仍成立。這些門檻是依 11 個實際 prototype 推得的**估計值**，由 bench 的 live 文件數與手動目視檢查確認，必要時只需調整常數。

### 6 個 live 加 1 個固定名額的預算

`LIVE_FRAME_LIMIT = 6`，另外保留 1 個名額給「被其他功能固定」的畫面（add-flow-frame-interact-mode 的互動畫面，以 instance key 指定，所以同一 route 的其他 instance 不會一起被固定），加上 renderer，總數不超過 8。6 個依據是筆電上手機畫面 W ≥ 300px（約等於縮放 0.8）的最壞情況 7 個可見畫面，以約 18MB／個計，最壞約 108MB（估計），相較現況 30 個約 540MB（實測，舊版 Inspector）。分配順序：固定 > 被提升（縮放 ≥ 0.4）> hover > 螢幕可見面積大者（框面積 × z² × f，以整數平方像素比較，避免浮點誤差讓同樣可見的畫面分出高下）> 已經是 live 者 > 距視窗中心近者 > instance key。同時只讓一個 iframe 載入，載入中也計入預算；「載入中」指該畫面的 story render 還沒完成。共用的載入槽依序給：固定畫面的重新載入 > live 候選 > renderer 的啟動或重設。實作上兩個方向都擋：有 live 畫面正在載入或等著載入時，renderer 的佇列整個暫停（不開始切換、也不重設 src），全部 live 畫面 render 完成後再繼續；renderer 正在載入自己的文件時，live 畫面不取得載入槽，renderer 載入完成（或逾時）後才輪到。槽不搶占，所以剛好碰上 renderer 重設時，live 畫面最多等它載完一次（2026-10-07 在 growth-fund 型 fixture 的 dev 模式實測：renderer 從重設 src 到第一張截圖完成約 250–270ms，原地切換加截圖約 160–180ms）。live 畫面的 iframe 放在固定的 DOM 位置，只用 z-index 調整層級（移動或重新掛載 iframe 會讓它重新載入）；降級時移除 iframe 元素並清掉所有 contentWindow／contentDocument 參考、ResizeObserver 與 timer（`display: none` 不會釋放記憶體，殘留參考會造成 detached window 洩漏）。替代方案「依畫布面積調整上限」被否決：桌機最壞 11 個時改用截圖顯示其餘畫面，效果仍可接受，固定上限較好預測。

### 尺寸快取讓分層切換不改版面

每個 route 的量測尺寸存在記憶體（並隨截圖紀錄寫入 IndexedDB），鍵為 story id、prototype id、route id、viewport signature，初值為解析出的 viewport；同一 route 的多個 instance 共用一筆。這個快取是每個瀏覽器各自、不具權威性的渲染快取：不寫入 flow layout payload，Static Flow 也不讀取，因此本 change 以 delta 修改 flow-viewport-declaration 的 Layout payload viewport signature，把「只持久化 positions」限定在 payload 的幾何。所有分層都用這個尺寸排版、繞線與擺放標籤。live 畫面與 renderer 都會更新快取。

live 畫面在每次 iframe 文件載入後（含互動模式進出與 HMR 整頁重新載入）以 iframe 自己視窗的 `ResizeObserver` 觀察 `#storybook-root`（iframe.html 中靜態存在），並在每次回呼中重新查詢、綁定預覽標記（沒有標記時用 `#storybook-root` 的第一個子元素），因為 Storybook 在 load 事件之後才非同步渲染 story；iframe 重新載入、移除或 `pagehide` 時先釋放（子視窗的 observer 會讓已分離的 window 無法回收）。render 完成的訊號是該 frame 送出的 `storyRenderPhaseChanged` 中 `newPhase` 為 `completed` 的 channel 訊息，以 `MessageEvent.source` 比對 frame 的 contentWindow。尺寸與截圖紀錄的 viewport signature 用 `getPrototypeFlowLayoutViewportSignature(getPrototypeViewport(prototype, route))`，它對每個解析出的 viewport 都回傳 `<formFactor>:<w>x<h>`（舊版 prototype 為 `phone:375x812`），不用可能為 null 的 `getPrototypeViewportSignature`。每幀最多更新一次，兩軸變化都小於 2px 時忽略。若新高度比上次多出的量等於 iframe 自身在兩次量測之間長高的量（誤差 2px 內），視為 `100vh` 造成的回授而忽略；超過 8 倍 viewport 高度也忽略。這個判斷是 geometry 的純函式 `acceptMeasuredSize(previous, next, iframeGrowth, viewportHeight)`：回傳要套用的尺寸，或在量測被忽略時回傳 `null`；高度回授時保留舊高度但仍套用寬度的變化。其他 canvas 功能可以用 instance key 暫停某個畫面的量測（`measurementSuspendedFrameIds`，add-flow-frame-interact-mode 的互動畫面會用到）：暫停期間的量測不寫入尺寸快取、IndexedDB 或截圖紀錄，畫面維持原本的框；暫停的時機與恢復條件由使用它的 change 定義。同一 route 的各 instance 共用同一份快取尺寸與截圖紀錄，所以只要該 route 有任一 instance 被暫停，該 route 的量測（含 renderer 的量測）與截圖結果都不寫入；截圖結果整個丟棄、不算重驗，暫停結束後佇列會再截一次。移除 80 次輪詢。

### 在 Inspector 視窗中對 iframe 文件截圖

新模組 `flow-snapshot.js`（只 import `./flow-canvas-geometry.js` 的 `hashMarkup`；模組頂層不讀取 `window` 或 `document`，可以直接被 Node 載入測試）匯出 `captureFrameSnapshot(iframe, options)`，在 Inspector 的視窗中讀取同源 iframe 的文件：以 iframe 視窗的 `getComputedStyle` 讀樣式、以 `nodeType` 判斷節點類型（跨 realm 的 `instanceof` 會失敗）。瀏覽器預設樣式取自一個沙盒 iframe：在 Inspector 文件的 body 末端建立，寫入 `<!doctype html>` 使它成為標準模式（about:blank 是 quirks mode，表格等預設不同），放在畫面外但不用 `display: none`，帶 `inert`、`aria-hidden`、`tabindex="-1"`，每種標籤快取一次。繼承屬性是否由瀏覽器在該標籤設定，以一個繼承屬性值都很特殊的探測父元素（例如 line-height 37px、font-size 21px、text-align right）判斷：該標籤放在探測父元素下時，值不跟著父元素的屬性就是瀏覽器設定的（例如 button 的 font 簡寫會重設 line-height，連結會設定 color），只跟父元素比較會漏掉這類屬性。只比較標準屬性清單（從預設樣式的 `CSSStyleDeclaration` 取出不以 `--` 開頭的名稱），絕不列舉 custom property。字型只收集頁面實際載入的字型：使用中 family 的 @font-face（同源樣式表）中，family、weight、style 與 unicode-range 對得上 `document.fonts` 裡 `status` 為 loaded 的項目才收；每條規則的 `src` 只取第一個 `url()`（瀏覽器實際採用的那個，woff 備用格式不收），轉成 data URL 後快取整個工作階段。自架的 CJK 字型常有上百個 unicode-range 分片，全收會讓每張截圖多出數 MB 的 base64（code review 指出）。雜湊在嵌入字型之前計算，用的是把字型資料換成字型網址的 markup：雜湊等於 `previousMarkupHash` 時連字型都不嵌入，重驗不必付字型的成本。截取 body 再以量測尺寸裁切，先畫上 html／body 的背景色。傳入 `previousMarkupHash` 且序列化結果的雜湊相同時，回傳 `{ ok: true, unchanged: true, markupHash }`，不做 decode、繪製與編碼。clone 在每個讓出點檢查 `signal`，被中止時回傳 `{ ok: false, reason: "aborted" }`。測試需要的純函式也從這個模組匯出：`getSnapshotScale`、`getStandardPropertyNames`、`getFrameNotReadyReason`；`serializeFrameDocument` 回傳序列化結果（markup、尺寸、背景色），供保真度腳本檢查。替代方案「在 route iframe 內註冊截圖函式，由父層呼叫」被否決：iframe 內的 Inspector 版本雖相同，但多一個全域 API 面，而研究已驗證父層截圖的保真度與 iframe 內相同。替代方案「使用 html-to-image」見 proposal。

### 單一隱藏 renderer 原地切換 route

renderer 是 flow 根節點內、排在 viewport 之前的兄弟圖層（`.prototype-inspector__flow-renderer-layer`，帶 `data-sbfx-capture-ignore` 與 `aria-hidden`）中的一個 iframe，被不透明的 viewport 蓋住：它不在 `[data-sbfx-canvas]` 之內，因為 addon 會把畫布內所有有截圖 hook 的 iframe 畫進連線與畫布留言的截圖，不看 opacity 與 capture-ignore。iframe 本身 `opacity: 0; pointer-events: none`，加上 `inert`、`aria-hidden="true"`、`tabindex="-1"`，寬高設為目前要截的 route 的快取預覽尺寸（初值為解析 viewport），絕不用 `display: none`。截圖前以與 live 畫面相同的量測函式與 `acceptMeasuredSize`（以該 route 的快取尺寸為前值、以 renderer 本次為該 route 調整後長高的量為 `iframeGrowth`）量測，結果不同時調整尺寸再量，最多兩次；量到的尺寸隨截圖紀錄寫入尺寸快取，所以從未 live 過的畫面第一次升為 live 時框也不會變，`vh` 單位與 fixed 元素在截圖與 live 畫面中也以同一個高度計算。第一次需要截圖時才建立，src 為 `getRoutePreviewSource(routeId)`。切換時以 `history.replaceState` 改寫它自己網址的 `prototypeRoute`，再對它的視窗 `postMessage` 一個 Storybook channel 訊息 `JSON.stringify({ key: "storybook-channel", event: { type: "forceRemount", args: [{ storyId }], from: "prototype-inspector" } })`。不呼叫它的 `channel.emit`，因為 emit 也會把事件送到外層 preview，造成外層 story remount。

就緒條件：送出前先以 `renderer.contentWindow.__STORYBOOK_ADDONS_CHANNEL__.on("storyRenderPhaseChanged", …)`（或只接受 `event.source === renderer.contentWindow` 的 window `message` 監聽）訂閱，送出後依序看到 `newPhase` 為 `loading` 與 `completed` 才算切換完成；`[data-prototype-root]` 的 `data-route` 是 flow 的 route id 時，還必須等於目標 route（有些 prototype 在 `data-route` 放 navigation id，此時不比對）。任何 src 變更（初次載入、每 25 次切換、逾時或失敗後重設）之後，先等 iframe 的 load 事件與新的 contentDocument，才讀取 `__STORYBOOK_PREVIEW__` 或掛監聽，避免讀到舊文件已完成的 render，或把監聽掛在即將被換掉的視窗上。接著確認沒有 `sb-show-preparing-story`／`sb-show-errordisplay`、`document.fonts.ready` 已完成、圖片已 decode（等字型與等圖片各最多 1 秒，逾時就照現況截圖），再等兩個 animation frame（每個最多 120ms，因為隱藏或 headless 時 rAF 可能停止）。renderer 在設定 src 或送出 FORCE_REMOUNT 之前，先把 iframe 設成該 route 的快取尺寸，route 不會以上一個 route 的尺寸（或第一次載入時 iframe 的預設 300×150）render。收到 `completed` 就可以截圖，但下一個 FORCE_REMOUNT 要等前一次 render 進入 `finished` 才送：Storybook 10.4.1 的 `teardown()` 在 render 仍 pending（包含 `completed` 之後的 `afterEach`）時等 3 個 tick 就 `location.reload()`。切換後 2 秒內沒進入 `completing`、或 6 秒內沒到 `completed`（Storybook 對有限動畫最多等 5 秒），以及每 25 次切換、截圖失敗時，都重新載入 src；非預期的 load 事件也視為一次重設（原因 `teardown-reload`）。前一次 render 在 2 秒內沒進入 `finished` 時不送 FORCE_REMOUNT，改為重設 src；送出後只認新 render 的 phase（從它的 `loading` 開始），上一次 render 遲到的 `completed` 不算數。每次重設標記 `pi:flow:renderer-reset`，`detail.reason` 為 `initial`、`scheduled`、`timeout-finished`、`timeout-completing`、`timeout-completed`、`wrong-route`、`capture-failed`、`hmr-no-signal` 或 `teardown-reload`；原地切換完成後 `data-route` 仍是另一個 flow route（prototype 在 remount 後保留了 route）時以 `wrong-route` 重設 src，並從此改為每次切換都重設；重新載入後仍不是目標 route 才算截圖失敗；每次切換都重設的模式（見 Risks）也記為 `scheduled`。

排程用 `requestIdleCallback`（timeout 500ms，不支援時用 setTimeout），一次一張；相機移動、拖曳中或 `document.visibilityState` 為 hidden 時暫停。clone 過程每 32ms 讓出一次主執行緒；相機開始移動或拖曳開始時，進行中的截圖在下一次讓出時經 AbortSignal 中止並重新排入佇列；中止不算截圖失敗，不重新載入 src；編碼階段不檢查 signal，所以中止之後才回來的結果（不論成功或失敗）一律丟棄。fit（含 fit 追蹤中的重新 fit）只暫停佇列、不中止進行中的截圖：renderer 寫入量測尺寸會讓追蹤中的 fit 重新計算，若 fit 也中止截圖，renderer 會一直中止自己。目前 story id 等於 prototype 的 flow export story id 時（StaticFlow story：每個 route iframe 都會載入完整的 flow export），不建立 renderer、不寫入截圖紀錄，非 live 畫面維持骨架。flow export story id 由 `getPrototypeFlowExportStoryId(prototype)`（依序讀 `figmaExport.flowStoryId`、`figmaExport.storyId`、`flow.figmaExport.storyId`、`flow.figmaExportStoryId`；已在 geometry 模組）求得，`PrototypeFlow` 已在本地計算這個值（Open Static Flow 也用它），與目前 story id（`window.location.search` 的 `id`）比較即可，不新增 prop。

### 先顯示快取、每個工作階段重驗一次

`flow-snapshot-cache.js`（不 import 任何模組）提供記憶體 LRU 與 IndexedDB adapter（可注入記憶體 adapter 以利測試）。鍵為 `<formatVersion>|<storyId>|<prototypeId>|<routeId>|<viewportSignature>|default`，值為 `{ blob, width, height, previewWidth, previewHeight, markupHash, capturedAt, lastUsedAt }`。上限 300 筆、60MB，超過時移除最久未使用的紀錄；`onversionchange` 時關閉連線，`onblocked` 與任何例外都改為只用記憶體。開啟時立即顯示快取截圖與快取尺寸，然後每個 route 在這個頁面工作階段中恰好重驗一次（可見畫面優先）：在 renderer 中重新渲染、序列化，計算 53-bit 雜湊（cyrb53，純 JS，不依賴需要安全環境的 `crypto.subtle`），並把快取紀錄的 `markupHash` 當作 `previousMarkupHash` 傳入；雜湊相同就跳過 decode、繪製與編碼（**估計**約省六成時間，依研究中 decode 與編碼占 26ms 中位數的比例），只更新使用時間；不同才換圖。只有以一般預覽網址載入、已完成渲染、而且載入後沒被其他功能標記為已互動的 live 畫面，才會順便計算雜湊並更新截圖；以其他網址（例如加上 `prototypeFlowInteractive=true`）載入的畫面，在重新載入一般預覽網址之前都不拿來更新截圖，「已互動」標記也在重新載入一般預覽網址時清除。記憶體只保留目前 prototype 的壓縮 blob 的 object URL，img 卸載時瀏覽器自然釋放解碼後的點陣；淘汰、切換 prototype 與卸載時 `URL.revokeObjectURL`，但留言擷取進行中（`html[data-sbfx-capture-mode="true"]`）延到下一次閒置；同一 route 的多個 instance 共用同一個 URL。開啟時依目前 prototype 的 key 前綴一次讀出紀錄（最多等約 150ms，逾時就先以宣告尺寸渲染），之後 culled → snapshot 不需要再非同步讀取；重驗結果沒變時不設任何 state。

### HMR 監聽放在獨立模組

新增 `flow-canvas-hmr.js`，只做一件事：模組載入時（隨 preview 一起）在 `import.meta.hot` 存在時監聽 `vite:afterUpdate` 並累計次數，匯出 `getCodeUpdateCount()` 與 `subscribeToCodeUpdates(callback)`（回傳取消訂閱函式）；`storybook build` 時 `import.meta.hot` 為 `undefined`，次數一直是 0、訂閱為 no-op。次數放在模組層級，所以 UI Flow 沒有掛載時（例如切到 Story 模式）套用的更新也會算到；本頁面工作階段的重驗紀錄存的是截圖當時的次數，回到 UI Flow 時，重驗次數落後的截圖會標為更新中並重新截圖（code review 指出原本只在 UI Flow 掛載時訂閱，離開期間的修改會被漏掉）。不監聽 `vite:beforeFullReload`：整頁重新載入後，新的頁面工作階段本來就會重驗一次。`flow-canvas.js` 收到通知後把目前 prototype 的所有截圖標為 stale（畫面加上「更新中」標示），額外排一次不計入每工作階段一次的重驗，並優先重驗可見畫面。重驗要等 renderer 自己的 `storyHotUpdated`（以 `MessageEvent.source` 比對 `renderer.contentWindow`）加上至少 100ms 的靜止期（期間又收到通知就重新計時）才開始；renderer 尚未載入時等它載入後再截；2 秒內沒有收到該訊號就重設 renderer src。「更新中」標示只在該訊號之後開始的截圖完成時清除。live 畫面同樣等自己的 `storyHotUpdated` 加上靜止期才重新計算雜湊。SSR 測試以 stub 取代這個模組，preview.js 與 flow-canvas.js 都不出現 `import.meta`。

## Implementation Contract

**Behavior**

- fit 開啟 30 個 route 的 prototype 時，畫面顯示截圖、骨架或佔位，除 renderer 外沒有 route iframe；放大到 100% 時最多 6 個畫面變成 live（另有 1 個固定名額）。
- 截圖在閒置時逐張補上；平移或拖曳開始時中止進行中的截圖並暫停；再次開啟時立即顯示快取截圖與快取尺寸。
- 分層切換時畫面位置、尺寸與連線都不變；升為 live 時不閃白。
- 同一 route 的多個 instance 各自分層，共用尺寸與截圖。
- Tab 不會把焦點移進任何 route 文件。
- 從 StaticFlow story 開啟 UI Flow 時不建立 renderer、不寫入截圖紀錄。

**Interface / data shape**

- geometry export：`LOD_THRESHOLDS`（`{ placeholderMaxWidth, liveMinZoom, liveKeepZoom, hoverLiveMinZoom, liveMinVisibleFraction, hoverDwellMs }`）、`LIVE_FRAME_LIMIT`、`getVisibleWorldRect(camera, canvasSize, expandRatio)`、`selectFrameTiers({ frames, camera, canvasSize, hovered, pinnedId, promotedIds, previousTiers })`（`frames` 的每一項為 `{ key, routeId, x, y, width, height }`，`key` 是 instance key；`hovered` 為 `{ key, dwellMs }` 或 `null`；`pinnedId`、`promotedIds`、`previousTiers` 與回傳的 `Map<string, "culled" | "placeholder" | "snapshot" | "live">` 都以 instance key 為鍵）、`hashMarkup(string)`（回傳 14 位十六進位字串）、`acceptMeasuredSize(previous, next, iframeGrowth, viewportHeight)`。
- `flow-snapshot.js` export：`SNAPSHOT_FORMAT_VERSION`、`SNAPSHOT_LIMITS`、`getSnapshotScale(width, height, devicePixelRatio)`、`getStandardPropertyNames(declaration)`、`getFrameNotReadyReason(frameDocument)`、`serializeFrameDocument(iframe, options)`、`captureFrameSnapshot(iframe, { previewWidth, previewHeight, devicePixelRatio, signal, previousMarkupHash })`，回傳 `{ ok: true, blob, width, height, markupHash }`、雜湊等於 `previousMarkupHash` 時的 `{ ok: true, unchanged: true, markupHash }`，或 `{ ok: false, reason: "timeout" | "blank" | "not-ready" | "unsupported" | "error" | "aborted" }`。
- `flow-snapshot-cache.js` export：`SNAPSHOT_DATABASE_NAME`、`SNAPSHOT_STORE_NAME`、`SNAPSHOT_CACHE_LIMITS`、`getSnapshotKey(parts)`、`createSnapshotCache({ adapter, formatVersion, maxRecords, maxBytes })`（`get`、`getAllWithPrefix`、`put`、`touch`、`markStale`、`isStale`）、`createIndexedDbAdapter(databaseName)`、`createMemoryAdapter()`。
- `flow-canvas-hmr.js` export：`getCodeUpdateCount()`、`subscribeToCodeUpdates(callback)`。
- `PrototypeFlow` props：新增只供測試使用的 `initialTiers`（鍵為 instance key、值為分層名稱，在 flow-canvas.js 註明用途）；preview.js 仍只傳 `prototype`。
- 給後續 change 的內部介面：`pinnedFrameId`（instance key 或 `null`）、`promotedFrameIds`（instance key 的 Set）、`measurementSuspendedFrameIds`（instance key 的 Set）、每個畫面的「已互動」標記（重新載入一般預覽網址時清除）。
- DOM：畫面元素帶 `data-tier="culled|placeholder|snapshot|live"`，截圖過期時帶 `data-snapshot-stale="true"`；renderer 帶 `data-prototype-inspector-renderer="true"`。
- performance mark：每次重算分層 `pi:flow:tiers`，每次截圖完成 `pi:flow:snapshot`，每次 renderer 重設 `pi:flow:renderer-reset`（`detail.reason` 見上）。
- 給 bench 的狀態：flow 根節點帶 `data-snapshot-queue="busy|idle"`；live 畫面的 iframe 還在載入（story render 未完成）時畫面元素帶 `data-live-loading="true"`。

**Failure modes**

- 截圖失敗（逾時、空白、未就緒、不支援、例外）：畫面維持骨架，失敗原因寫入 `console.debug`，不重試同一個 route 直到下次重驗或 HMR。被中止（`aborted`）不算失敗，直接重新排入佇列。renderer 切換或重設 src 後 story 仍沒有 `completed`（例如 loader 或 beforeEach 丟出例外時，Storybook 10.4.1 會從 `loading` 直接跳到 `finished`）也算失敗，但保留一次重試（第一次可能是 dev server 冷啟動），第二次才記為失敗（原因 `not-rendered`）。
- IndexedDB 不可用：只用記憶體快取，重新整理後重新截圖。
- FORCE_REMOUNT 訊息無效或收不到 `storyRenderPhaseChanged`（Storybook 內部行為改變）：2 秒內沒進入 completing、或 6 秒內沒到 completed 時改以重設 src 切換，功能維持但較慢。
- HMR 後 2 秒內收不到 renderer 的 `storyHotUpdated`：重設 renderer src 後再截圖。
- 跨源圖片或 canvas 汙染：該資源以佔位取代，其餘照常截圖。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs` 涵蓋規格中的三個分層範例表（手機、桌機、被固定的畫面）、同一 route 兩個 instance 各自分層、預算分配順序、`acceptMeasuredSize` 與 `hashMarkup` 的穩定性。
- `node --test storybook-product-prototype/scripts/test_flow_snapshot_cache.test.mjs` 以記憶體 adapter 涵蓋鍵格式、LRU 依筆數與位元組的淘汰、版本變更、adapter 例外時退回記憶體。
- `node --test storybook-product-prototype/scripts/test_flow_snapshot.test.mjs` 涵蓋縮放與上限、標準屬性清單過濾掉 `--` 開頭名稱、失敗原因的判斷。
- `node storybook-product-prototype/scripts/test_flow_snapshot_fidelity.mjs [--url <storybook URL>]`（需要系統 Chrome；找不到時印出 `SKIPPED: no Chrome` 並以 0 結束，並在 `openspec/changes/add-flow-canvas-level-of-detail/bench/browser-check.md` 記錄未執行；有 Chrome 時必須通過）：與 `Page.captureScreenshot` 比對，像素差異中位數 ≤ 1%、最大 ≤ 5%（**估計門檻**，研究原型實測中位數 0.01%、最大 4.38%）；涵蓋純 DOM 頁、portal、web font、只由樣式表上色的 SVG、button 的 text-align、data URL 迴歸、9,577 個 custom property、renderer 不得為 `display: none`、相同 `previousMarkupHash` 回傳 unchanged 且不呼叫 `toBlob`；`--url` 模式另涵蓋 renderer 在兩個 DOM 不同的 route 之間切換時，每張截圖都屬於目標 route。
- `bench_flow_canvas.mjs` 在 `create_flow_bench_fixture.mjs`（rebuild-flow-canvas-camera 1.1）產生的 growth-fund 型 30 個 route fixture 上：fit 時 route iframe 數 ≤ 1（只有截圖產生器 iframe）、放大到 100% 後 ≤ 8；開啟 UI Flow 至就緒期間對 `prototype-inspector:flow-layout:*` 的 `setItem`／`removeItem` 為 0；相機閒置後 100ms 內恰好 1 次 `pi:flow:commit`（不含 iframe 載入與尺寸量測造成的 commit）；Chromium renderer 行程記憶體（與 Story 模式在同一份 fixture、同一 build 模式下量測）：fit 狀態目標為 Story 模式 + 100MB 以內，放大到 100% 時記錄實測值，依本 design 估計約 +126MB（6 個 live 加截圖產生器 iframe，各約 18MB）。以上記憶體數字皆為**估計值**；+540MB 是舊版 Inspector 在 cm-linepay dev 的實測，比較基準改用 rebuild-flow-canvas-camera 的 `bench/after.json`。IndexedDB 已有快取時，所有可見畫面在開啟後 1 秒內顯示截圖（**估計值**）；dev 模式冷啟動時 30 張截圖在背景 10 秒內完成（**估計值**，研究在靜態 build 量到約 2 秒）；首次開啟截圖進行中時拖曳，pointermove 同步成本 p95 目標沿用 rebuild-flow-canvas-camera 的 ≤ 8ms（**估計值**），未達成時記錄實測值與原因。
- 實測（4.1，2026-10-07，verify 與 code review 修正後重跑；`bench/after.json`，Chrome 154 headless、Storybook dev、Mac16,1 Apple M4 16GB；記憶體另列多次量測，其餘為單次量測）：
  - growth-fund 型 30 個 route（`growth-fund`）：所有估計目標都達成。fit 時 route iframe 0、renderer 1；100% 時 route iframe 4 加 renderer 1；開啟至就緒對 flow layout 的寫入 0；pinch、平移、拖曳各在閒置或放開後 100ms 內恰好 1 次 commit（落在最後一個 wheel 事件後 +146ms、+141ms，放開拖曳後 +17ms）；就緒 273ms。冷啟動 30 張截圖 6.26 秒完成；第二次導覽 255ms 內所有可見畫面顯示快取截圖，之後的重驗 5.2 秒、0 張換圖；截圖進行中拖曳的 pointermove 同步成本 p95 2.1ms。
  - renderer 行程記憶體比 Story 模式多：fit +50.8MB、100% +100.3MB（`after.json`，Story 基準 206MB）。同一 build 先前五次量測的 fit 為 +104.9、+109.2、+76.0、+45.2、+41.3MB，100% 為 +180.2、+170.1、+123.9、+92.6、+120.5MB。Story 基準在 147–209MB 之間跳動，fit 的絕對值六次都在 247–285MB，DOM 節點、JS heap 與文件數每次相同，所以差異來自 Story 基準的 RSS。「fit +100MB 以內」在 Story 基準約 206MB 的四次都達成，基準偏低（147、166MB）的兩次未達成。
  - 100 個 route（`hundred-routes`）：fit 時 route iframe 0、renderer 1，100% 時 4 加 1；記憶體 fit +40.4MB、100% +133MB（Story 基準 209MB）；標籤擺放 8 次，中位數 35.9ms、最長 69.6ms；平移與拖曳各 1 次 commit（最後一個事件後 +156ms、放開後 +75ms），pinch 的 commit 落在最後一個事件後 +220.7ms，比「閒置後 100ms」的窗口晚 0.7ms（這項目標只針對 30 個 route；三次量測為 +217、+221.5、+220.7ms），主要是標籤擺放的耗時；冷啟動 100 張截圖 20.7 秒（10 秒的估計只針對 30 個 route），快取顯示 378ms，重驗 16.2 秒、0 張換圖，截圖進行中拖曳 p95 2.4ms。
- `node storybook-product-prototype/scripts/check_flow_snapshots.mjs --url <bench prototype 的 UI Flow URL> [--edit-file <fixture>/src/pages/prototypes/bench-shared/BenchRouteScreen.tsx]`（需要系統 Chrome 與執行中的 Storybook；找不到 Chrome 時印出 `SKIPPED: no Chrome`）：第一次開啟每個 route 截一次且由中心往外、重新整理時顯示畫布的那次 commit 就有快取截圖與快取高度、每個 route 重驗一次且不編碼、新分頁不等開啟時 fit 的閒置；加上 `--edit-file` 時另檢查修改 route 元件後截圖標為更新中、renderer 自己的 `storyHotUpdated` 加 100ms 之前不換圖、全部換成新截圖（verify 後補上的可重複測試）。
- 手動：Tab 不進入 route 文件；升為 live 不閃白；修改 route 元件後截圖顯示更新中並換成修改後的內容；以無痕視窗封鎖 IndexedDB 時仍能運作；從 StaticFlow story 開啟 UI Flow 時沒有 renderer iframe。外部 repo（cm-linepay、cm-chipK）只作選用，只能在拋棄式 git worktree 中以 `install_prototype_inspector.mjs --force --token-prefix <prefix>` 安裝後檢查，不得提交。

**Scope boundaries**

- In scope：分層、預算、instance key 分層、尺寸快取與量測、量測暫停介面、截圖、renderer、快取與失效、inert、flow-viewport-declaration 中 payload 幾何敘述的修改、bench 擴充、文件。
- Out of scope：Non-Goals 所列項目；互動模式與選取只預留固定名額、提升清單、量測暫停與「已互動」標記的介面；instance key 的格式與簡化檢視本身。

## Risks / Trade-offs

- [FORCE_REMOUNT 原地切換、`storyRenderPhaseChanged` 的事件順序與 `__STORYBOOK_ADDONS_CHANNEL__` 是 Storybook 10.x 的內部行為] → 2 秒內沒進入 completing 或 6 秒內沒到 completed 時退回重設 src；bench 與 fidelity 腳本會偵測退回次數；文件註明依賴的 Storybook 版本（目前為 10.4.1）。
- [renderer 原地 remount 可能殘留 route 間的狀態（模組層級變數、body 樣式、timer）] → 每 25 次切換與每次失敗都重新載入；若某 route 的 renderer 截圖雜湊與乾淨的 live 截圖不同，該 prototype 改為每次切換都重設 src：live 畫面更新截圖時，若該 route 目前的紀錄是 renderer 在同一個程式碼版本（同一次 HMR 之後）截的、而 live 截到的雜湊不同，就在本頁面工作階段剩下的時間讓 renderer 每次切換都重新載入（`console.debug` 記一次）。時間相關的內容（時鐘、亂數）也會觸發這個模式，代價只是截圖變慢。
- [route iframe 與 renderer 載入目前 story，story 的 args 與 play function 會在每次載入與 remount 時執行] → 截圖反映 play 之後的狀態；文件建議從沒有 play function 的 story 開啟 UI Flow；互動模式在這類 story 上可能被 play function 帶離 route。
- [截圖與 live 畫面仍有差異（scrollbar、CJK 換行、被祖先裁切的內容）] → 截圖只在縮放低於 live 門檻時使用，不作為像素審查依據；截圖時隱藏 scrollbar、以量測尺寸裁切。
- [同一個 localhost:6006 會被不同專案共用，相同 prototype id 的截圖可能互相覆蓋] → 每個工作階段重驗一次，雜湊不同就換圖；列為已知限制。
- [截圖在主執行緒上執行，重型畫面可達約 0.8 秒] → 只在閒置時、一次一張、手勢或拖曳開始時中止進行中的截圖、clone 每 32ms 讓出。
- [Safari 與 Firefox 的 foreignObject 行為未實測] → 失敗時顯示骨架；跨瀏覽器手動檢查列入驗收。
- [已解碼的截圖約 1.2MB／張（375×812×4，估計）] → 記憶體只保留目前 prototype 每個 route 一個 object URL（壓縮的 blob），img 卸載時瀏覽器會釋放解碼後的點陣；object URL 在被新截圖取代、切換 prototype 與卸載時 revoke。

- [React 18 宿主會丟掉 `inert={true}`] → 另外在 ref 中設定 `iframe.inert = true`。
- [renderer 與 live 畫面的 channel 事件會被轉送進外層 preview 的 channel，帶相同的 story id] → 與現在的 route iframe 相同；addon 的 highlight 與 instrumenter 監聽會收到，目前沒有可見影響，列為已知行為。
- [被浮動的 Figma export 工作區蓋住的畫面仍算可見] → 第一版接受；之後可依 `--sbfx-workspace-reserved-inline-size` 扣除被蓋住的範圍。
- [縮小的畫面以快取截圖呈現，留言截圖跟著改變] → 畫面留言對截圖層的畫面以 DOM 截到快取 img；連線與畫布留言只畫 live 畫面的頁面，其餘是快取 img 或骨架；載入中的畫面可能拍成空白。寫進文件的已知限制。

## Migration Plan

純新增的快取與行為，沒有資料遷移。IndexedDB 資料庫在第一次截圖時建立；刪除或清除網站資料後會自動重新截圖。flow layout payload 的格式與內容不變。回滾 revert 本 change 即可，殘留的 IndexedDB 資料不影響舊版。
