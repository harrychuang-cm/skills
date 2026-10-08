## Context

UI Flow 由 `preview.js` 的 `PrototypeFlow` 實作（約 1,100 行連續區塊，加上散在檔案前段的繞線、標籤擺放與尺寸常數）。現況架構：

- `.prototype-inspector__flow-wrap` 是 `overflow: auto` 的捲動容器，內含一個只用來撐開捲動範圍的 `.flow-scaled`，再內一層 `.flow-canvas` 套 `transform: scale()`。顯示座標 = layout 座標 + 依內容邊界算出的位移（`getCanvasMetrics` / `createDisplayRoutePositionMap`），邊界一變整張畫布就位移。
- 每次 pointermove 都 `setDraggedPositions`，觸發 routePositionMap → canvasMetrics → 全部 polyline → 全部 `placeEdgeLabels` 重算，並重新 render 所有卡片（未 memo）。
- 縮放只在 Alt+滾輪觸發，走 React `onWheel`；React 19.2.6 把 root 的 wheel listener 註冊為 passive，`preventDefault()` 無效。
- 平移靠 Space 或 Meta 加拖曳、改寫 scrollLeft/scrollTop。按鍵 listener 掛在 window，比 Storybook preview 的 `window.onkeydown`（開機時就註冊、會把所有非輸入框按鍵以 `PREVIEW_KEYDOWN` 轉送 manager、不看 `defaultPrevented`）更晚執行。
- 控制列與 Reset 對話框是 `position: fixed`；邊框、陰影、連線與標籤都在被縮放的圖層內。
- UI Flow 與其他模式共用部分 helper：`isRecord`、`normalizeRoutes`（Data、Components 也用）、`normalizeComponentRoutes` 與 `normalizeRouteComponents`（Components 也用）、`PrototypeEmpty`（Docs、Data、Components 也用）、`defaultPrototypeModeGlobalName`（decorator、`globalTypes`、`initialGlobals` 也用，`globalTypes` 在模組頂層就讀取它），以及 `createStorybookGlobals` 與 `openPrototypeExternalUrl`（Components 模式的 story 連結也用）。

已知限制：preview.js 與 template 副本必須逐位元組相同；`test_authority_inspector.mjs` 以正規表示式移除 preview.js 的 import、只把 `export const` 改寫後放進 node vm 執行，並渲染 15 個 Data 案例，所以 preview.js 不能使用 `import.meta`、`export function` 或頂層 DOM 存取；安裝器只會複製 `assets/prototype-inspector/` 資料夾。這些限制由 fix-inspector-runtime-drift 的 mirror 與 import surface 檢查守門，本 change 必須在它之後實作。

研究依據（實測）：2026-10-02 對 cm-linepay 等 4 個 repo、11 個實際 prototype（106 個 route）的分析。所有 route 都有 flowPosition，114/115 的 x 落在 20px 格線，gutter 多為 103px；fit 時畫面在螢幕上 57–248px 寬（筆電 1190×800 畫布）。proposal 的拖曳成本（中位數 6.9ms、p95 18ms）量自 cm-linepay 的舊版 4,131 行 Inspector 安裝（實測）；外部 repo 跑舊版或自行修改的 fork，fix-inspector-runtime-drift 不升級它們，所以本 change 的基準與驗收改用可重現的 fixture（見「以 performance mark 量測手勢期間的工作」）。

## Goals / Non-Goals

**Goals:**

- 相機式無限畫布，世界座標直接使用 layout 座標，已存 layout 與 Static Flow 版面完全相容。
- 手勢與快捷鍵比照 Figma，且不再誤觸瀏覽器縮放或 Storybook manager 的快捷鍵；以 Tab 聚焦的控制項保留原生鍵盤操作。
- 平移、縮放、拖曳期間不 commit React render，標籤擺放不在手勢期間執行。
- 名稱、徽章與標籤在任何縮放下都清楚可讀（固定 12px）。
- 為 add-flow-canvas-level-of-detail 等後續 change 提供相機狀態、閒置事件與可測的純函式模組，並在 flow-canvas-navigation 規格中提供擴充點（唯讀檢視、整組拖曳、額外快捷鍵、程式化相機移動、可見矩形、螢幕座標圖層、各檢視自訂的連線標籤可見度），讓後續 change 不需要修改本規格的需求。

**Non-Goals:**

- 依縮放切換截圖或 live iframe、視窗外不渲染、iframe 上限、量測方式改寫（add-flow-canvas-level-of-detail）。
- 選取、框選、微調、吸附、復原、小地圖、分區背景（add-flow-canvas-editing-tools）。
- 雙擊互動（add-flow-frame-interact-mode）。
- Static Flow 匯出 story、flow layout payload 與 storage key、route iframe URL 契約、其他 Inspector 模式。
- fallback grid 間距、⧉ 按鈕深連結到指定 route、Reset 對話框背景色（`outline-inverse` 誤用）等既有瑕疵。
- 在 UI Flow 畫布上使用 figma-export addon 的 visual comments（列為不支援）。
- 修改或升級外部 repo（cm-linepay、cm-chipK 等）；template 自己 Spectra root 的規格調整（由後續 change `align-template-flow-parity` 處理）。

## Decisions

### 拆成純函式模組與 React 模組

新增 `flow-canvas-geometry.js`（不 import 任何模組，可直接被 `node --test` 載入）與 `flow-canvas.js`（React 元件 `PrototypeFlow`，import `react`、`storybook/internal/core-events`、`storybook/preview-api`、flow layout helper 與 geometry 模組）。preview.js 自 flow-canvas.js import `PrototypeFlow`、`getPrototypeViewport`、`getRoutePreviewSource`、`createStorybookGlobals`、`openPrototypeExternalUrl`，並自 flow-canvas-geometry.js 直接 import 共用純函式；依賴方向為 preview.js → flow-canvas.js → flow-canvas-geometry.js 與 preview.js → flow-canvas-geometry.js，沒有循環。

geometry 模組承接從 preview.js 搬出的純邏輯：`normalizeRoutes`、`normalizeFlowNodes`、`normalizeTransitions`、`aggregateTransitions`、`isVisibleFlowEdge`、`addFlowEdgeColorVariants`、`createPolyline` 與各繞線函式、`getFlowArrowPoints`、`placeEdgeLabels` 與其評分函式、`getFlowMetadataNodeSize`、`getRoutePosition`、`getFallbackGridPitch`、「共用 helper 的放置」列出的共用純函式，以及新的相機、縮放、fit、滾輪分類、可見矩形與快捷鍵對照函式。`getPrototypeViewport` 拆成 geometry 的純解析器 `resolvePrototypeViewport(prototype, route, readDimension)` 加上 flow-canvas.js 的 DOM 讀取包裝 `getPrototypeViewport(prototype, route)`，後者以讀取 token 的函式實作 `readDimension(cssVariableName, fallback)`。`normalizeRoutes` 也被 Data 模式使用、`defaultPrototypeModeGlobalName` 會在 preview.js 頂層被 `globalTypes` 讀取，所以 `test_authority_inspector.mjs` 改為先以原生 ESM 載入 geometry 模組，再把它的 export 放進 vm context。

替代方案「全部留在 preview.js」被否決：純邏輯無法單獨測試，preview.js 也受 vm harness 限制無法使用 `import.meta`（add-flow-canvas-level-of-detail 需要）。替代方案「把共用 helper 留在 preview.js、讓 flow-canvas.js 反向 import」被否決：會形成 ES module 循環，頂層初始化順序容易出錯。

### 共用 helper 的放置

UI Flow 與其他模式共用的 helper 不複製。純函式 `isRecord`、`normalizeRoutes`、`normalizeComponentRoutes`、`normalizeRouteComponents`、`normalizeStorybookGlobals`、`getPrototypeFlowExportStoryId` 與常數 `defaultPrototypeModeGlobalName` 搬進 flow-canvas-geometry.js 並 export；讀取 window／document 的 `createStorybookGlobals`、`openPrototypeExternalUrl` 搬進 flow-canvas.js 並 export，供留在 preview.js 的 `getPrototypeStorybookPathUrl`、`openPrototypeStorybookPath`（Components 模式）使用；只被 UI Flow 使用的 `getPrototypeFlowExportStoryUrl`、`openPrototypeFlowExportStory` 一併搬入但不 export。`PrototypeEmpty` 留在 preview.js（Docs、Data、Components 使用，`test_authority_inspector.mjs` 的 Data 渲染經由 `PrototypeDataTable` 會用到），flow-canvas.js 自帶一個不 export 的空狀態元件。

其餘只被 UI Flow 使用的 helper 隨 `PrototypeFlow` 搬入 flow-canvas.js 且不 export，例如 `PrototypeRouteCard`、`PrototypeFlowNode`、`getMeasuredFramePreviewSize`、`openPrototypeComponentsMode`、`sanitizeFilename`、`getPrototypeViewportBadge`、`getPrototypeViewportSignature`，以及 layout 讀寫包裝 `getFlowLayoutStorageKey`、`readStoredFlowLayoutPositions`、`writeStoredFlowLayout`。`UPDATE_GLOBALS`、`addons` 與 flow layout helper 只被這些函式使用，它們的 import 隨之移到 flow-canvas.js，preview.js 不再 import `storybook/internal/core-events`、`storybook/preview-api` 與 flow layout helper（fingerprint 仍由 preview.js 的 review ledger 使用）。`getTransitionText` 隨 `aggregateTransitions` 搬入 geometry 但不 export；preview.js 中沒有任何呼叫者的 `getOutgoingTransitions` 刪除。替代方案「在兩個模組各放一份」被否決：`prototypeMode` 全域名稱與 Storybook globals URL 組法一旦分岔，Components 與 UI Flow 的連結會各自壞掉而且不會被測試發現。

### 世界座標等於 layout 座標

取消 `getCanvasMetrics` 的內容邊界位移；`getFlowBounds` 只回傳世界座標的邊界，供 fit 與小地圖使用。route frame 框維持 `previewWidth + 2` × `previewHeight + 64 + 2`，預覽畫在框內 (1, 65) 的位置，64px 名稱區保留在幾何中但不畫任何東西。這讓 Static Flow 讀到的 positions 意義不變（Static Flow 的 64px header 也在同一框內；template example 的 Static Flow 在 DOM 中會再整體位移 `96 - minX`、`96 - minY`，所以相容性以畫面之間的相對位置判斷）。替代方案「移除 64px 名稱區、框只包預覽」被否決：同一組座標在 Static Flow 會多出 64px 高度，緊密排列的版面（實際 gutter 最小 22px，實測）會重疊。

### 相機寫入走 rAF、停止 120ms 才交回 React

相機狀態 `{x, y, z}` 放在 ref。手勢事件只更新 ref 並排一個 requestAnimationFrame，在 callback 中寫入：世界圖層的 `style.transform = translate(x px, y px) scale(z)`、覆蓋層根節點 `.prototype-inspector__flow-overlay` 的 CSS 變數（`--prototype-flow-camera-x`、`--prototype-flow-camera-y`、`--prototype-flow-camera-zoom`）、縮放百分比的文字節點，以及級距改變時世界圖層的 `--prototype-flow-stroke-zoom`（見「標籤依縮放級距在閒置時擺放」）。每幀變動的相機變數只寫在覆蓋層：世界圖層與覆蓋層並列，CSS 變數只繼承給子孫，所以世界圖層內的連線不讀這組變數；替代方案「改寫在兩者的共同祖先 viewport 上」被否決，因為每幀都會讓整個世界子樹重新計算樣式，並重繪 will-change 圖層內的所有連線。後續 change 加入螢幕座標圖層的元素（例如框選框、選取外框、參考線）放在覆蓋層內讀取同一組變數，或在同一個 rAF callback 中更新，不會落後世界圖層一幀。最後一次相機變更 120ms 後判定閒置，才 `setCameraSnapshot` 交回 React（標籤可見度、標籤擺放、sessionStorage 寫入都依賴閒置快照）。手勢開始時在世界圖層加上 `data-camera-moving`，CSS 只在這個狀態下套 `will-change: transform`，閒置時移除，讓 iframe 與文字以最終縮放重新點陣化而不會模糊。120ms 介於 tldraw（64ms）與 xyflow／d3（150ms）之間。

fit 追蹤：每一次 fit（開啟時、Fit canvas、縮放選單的 Zoom to fit、Shift+1，或其他 UI Flow canvas 能力在改變顯示的畫面後要求的 fit）都以目前顯示的畫面計算並開始追蹤；追蹤中畫布尺寸或顯示畫面的量測尺寸改變就重新 fit。第一個不是由 fit 追蹤產生的相機變更就結束追蹤，包括滾輪、pinch、平移、不是 fit 的縮放快捷鍵或按鈕，以及其他能力要求、但不是 fit 全部顯示畫面的程式化移動（例如縮放到選取範圍、N／Shift+N、小地圖、進入互動模式）；有位移的拖曳也結束追蹤。Fit canvas 的 `aria-pressed` 反映追蹤狀態。相機只在畫布顯示完整 flow 時寫入與讀取 sessionStorage，其他能力顯示的檢視（例如 add-flow-journey-focus 的簡化檢視）不寫入。

### 指數縮放與固定階梯

連續縮放 `z' = clamp(z × exp(-Δ/100), 0.05, 4)`，Δ 為換算成像素的 deltaY（deltaMode 1 乘 16、deltaMode 2 乘畫布高度）並夾在 ±30。Chromium 把觸控板 pinch 編碼為 `deltaY = -100 × ln(scale)`，所以這個公式讓 pinch 精確跟手；滑鼠滾輪一格（約 100）被夾到 ±30，約 26% 一步。錨點不變式：`t' = p - (p - t) × z'/z`。離散縮放用階梯 0.05、0.1、0.25、0.5、1、2、4，「大於目前 1.05 倍的最小一格／小於目前除以 1.05 的最大一格」。Fit 上限 100%，留白 `min(96, 10% × min(W, H))` 像素。範圍下限 5% 讓 30 個 route 的 flow 也能完整 fit（估計：以 growth-fund 的邊界 3929×4990 與筆電 1190×800 畫布代入 fit 公式約需 13%）。替代方案「xyflow 的 2^(-0.002·Δ·10)」被否決：pinch 會比手指快約 1.39 倍。

### 原生 wheel listener 與 Safari 手勢

在 flow 根節點（包含 viewport、控制圖層、對話框圖層，以及後續 change 放在 viewport 旁的側邊面板）上於 effect 中 `addEventListener('wheel', handler, { passive: false })`。`ctrlKey || metaKey || altKey` 的 cancelable wheel 不論落在根節點哪裡都 `preventDefault()` 並以指標為錨點縮放（Alt 保留給既有使用者），所以指標停在縮放群組、layout 群組、縮放選單或對話框上 pinch 也不會放大 Storybook 頁面。其他 wheel 只在 viewport 上 `preventDefault()` 並平移，非 macOS 平台 Shift 把 deltaY 轉成水平；落在可捲動的側邊面板或選單上時維持原生捲動；根節點內其餘位置一律取消。Safari 另外在 flow 根節點監聽 `gesturestart`／`gesturechange`／`gestureend`（`passive: false`），以 `z0 × event.scale` 計算，手勢期間忽略 ctrl wheel 以免重複縮放。中鍵 `pointerdown`（button 1）`preventDefault()` 後進入平移。指標座標以 viewport 的 `getBoundingClientRect()` 換算，並乘上 `rect.width / offsetWidth` 修正 Storybook 工具列縮放（它會對 preview 的 body 套 transform）。window `blur` 與 body 出現 `inert` 時結束平移狀態。替代方案「只在 viewport 上註冊」被否決：控制圖層與對話框是 viewport 的兄弟節點，React 的 root wheel listener 又是 passive，指標在控制列上 pinch 時沒有任何 listener 能取消，瀏覽器會放大整個 Storybook 頁面。

### document 層攔截快捷鍵

鍵盤在 preview document 的 bubble 階段監聽（只在 `PrototypeFlow` 掛載期間）。事件從目標往上傳到 document 時尚未到 window，此時 `stopPropagation()` 就能阻止 Storybook 的 `window.onkeydown` 轉送。目標判斷取 `event.composedPath()[0]`（與 Storybook 的 `focusInInput` 相同的取法）：文字輸入元素（含 select 與 `role="textbox"`）一律不處理；目標是控制項（button、連結、summary、清單或清單項目，或具 button、link、menu、menuitem、menuitemcheckbox、menuitemradio、listbox、option、tab、checkbox、switch role 的元素）或位於對話框內時，Space、Enter 與方向鍵維持原生行為，讓以 Tab 聚焦的按鈕仍能用 Space／Enter 啟動；縮放選單或對話框開啟時只處理 Esc，由它關閉選單或對話框。本 change 的 Esc 優先順序為「關閉選單或對話框 > 取消拖曳」，後續 change 在其後追加自己的項目（例如取消框選、結束互動、清除選取）。快捷鍵對照放在 geometry 模組的 `resolveCanvasShortcut(eventLike, context)`，`context` 帶平台、是否文字輸入、`targetIsControl`、`overlayOpen` 與是否拖曳中，輸出命令或 `null`，可直接單元測試；後續 change 只新增 context 欄位與命令，不改變既有欄位的意義。按鍵比對用 `event.code`（不受鍵盤配置影響），macOS 判斷沿用 Storybook 的 `navigator.platform` 規則。控制列按鈕在 `pointerdown` 時 `preventDefault()`，滑鼠點擊不會搶走焦點，鍵盤使用者仍可 Tab 聚焦。替代方案「在 window capture 階段攔截」被否決：會擋掉 figma-export addon 與其他 document 層 listener。替代方案「只把 body、documentElement 與 viewport 內的目標交給 dispatcher」被否決：以 Tab 聚焦控制項後，Shift+1、=／- 這些不與控制項衝突的快捷鍵也會失效，而真正與控制項衝突的只有 Space、Enter 與方向鍵。

### 拖曳只動被拖的畫面

畫面元件以 `React.memo` 包裝並傳入穩定的 callback。`pointerdown` 記錄起點，移動達 3 像素才進入拖曳；其他 UI Flow canvas 能力宣告目前檢視為唯讀時（例如 add-flow-journey-focus 的簡化檢視）不進入拖曳。被拖的畫面預設只有按下的那一個；後續能力（add-flow-canvas-editing-tools 的整組拖曳）可以提供被拖畫面的集合，拖曳路徑對集合中每個畫面相同處理。拖曳中以 ref 保存位移，在 rAF 中把 `translate()` 寫到被拖的元素，並只重算與它們相連的 edge polyline（直接改寫該 `<polyline>` 與箭頭 `<polygon>` 的 `points` 屬性）。拖曳開始時隱藏相連標籤與設定 `data-dragging` 都在 rAF 中直接寫入 DOM，不經由 React state，所以從超過門檻的第一次移動到放開或 Esc 之間沒有任何 React commit。放開時把四捨五入後的整數座標在一次 commit 中寫回 React state，並呼叫 fix-inspector-runtime-drift 建立的單次寫入路徑；所有標籤在同一次 commit 的 render 中重新擺放，不另外觸發 commit。Esc 還原 transform 與標籤、不寫入，最多一次 commit。

### 名稱與標籤畫在螢幕座標覆蓋層

覆蓋層與世界圖層並列、不套縮放。每個名稱或標籤元素帶自己的世界座標變數（`--prototype-flow-label-wx`、`--prototype-flow-label-wy`，帶 px 單位），位置以 `translate(calc(var(--prototype-flow-label-wx) * var(--prototype-flow-camera-zoom) + var(--prototype-flow-camera-x)), ...)` 由 CSS 計算，所以每幀只需改覆蓋層根節點的三個變數，不必逐一寫入。名稱的 `max-inline-size` 為 `calc(<框寬> * var(--prototype-flow-camera-zoom))`，搭配 ellipsis。文字固定 12px（`--pi-sys-typescale-caption-sm-size`），不再用 11px。名稱列內容：標題、已宣告 viewport 時的徽章、有 components 時的 ⧉ N 按鈕（`pointer-events: auto`，`pointerdown` 停止傳遞以免開始拖曳）；hover 時顯示 route id 與組名（flowGroup，沒有時用 navigationId，兩者皆無時省略），取代原本 in-frame header 的組名 eyebrow。名稱列也是畫面的命中區：在名稱列上按下等同在畫面上按下（⧉ 按鈕例外）。畫面寬度低於 48px 時隱藏名稱（hover 時例外）。替代方案「在世界圖層內反向縮放（scale(1/z)）」被否決：手勢中文字會因 `will-change` 而模糊，且 5% 時需要 20 倍的世界尺寸。

### 連線錨點對齊可見的預覽區

定義可見矩形：route 畫面為預覽矩形（自框頂往下 65px 開始，框的左、右、下各內縮 1px，也就是框內 (1, 65) 起的 `previewWidth` × `previewHeight`），flow-only 節點為整個框；geometry 以 `getFrameVisibleRect(box, frameType)` 提供。框仍是持久化與匯出的幾何；畫面命中測試（加上畫出的名稱列）與連線錨點用可見矩形，後續 change 的框選相交、對齊參考線、小地圖矩形、選取與互動外框、簡化檢視的垂直置中也都用它，所以 64px 名稱區的空白處不會被當成畫面，route 與 flow node 對齊時也不會差 64px 或 32px。繞線函式改用可見矩形計算錨點，箭頭會指到畫面本身而不是空的名稱區上方。名稱區則加入標籤擺放的障礙物清單，避免連線標籤蓋住名稱。Static Flow 本來就有自己的繞線（逐條 transition、sourceAnchor、英文前綴），兩者共用的契約只有 positions，因此不影響 Static Flow。

### 標籤依縮放級距在閒置時擺放

`placeEdgeLabels` 改成接受實際量到的標籤尺寸（依標籤文字快取，每種文字只量一次），以「標籤螢幕尺寸 ÷ 級距代表縮放」換算成世界尺寸。級距為 `round(2 × log2(z))`（每約 1.41 倍一級），代表縮放為 2^(級距/2)。只有相機閒置且級距改變、或 positions／量測尺寸／transitions 改變時才重新擺放，並以 `performance.mark('pi:flow:label-placement', { detail: { durationMs } })` 標記，`durationMs` 為該次擺放的耗時。一條連線的兩端畫面在螢幕上都低於 150px 寬時，只在 hover 其中一端時顯示該連線的標籤，箭頭照畫；其他 UI Flow canvas 能力為自己顯示的檢視定義連線標籤可見度時（例如 add-flow-journey-focus 的簡化檢視），該檢視改用它的規則。連線粗細由世界圖層上的 `--prototype-flow-stroke-zoom` 驅動，值為代表縮放，只在級距改變時於相機 rAF 中寫入（手勢中跨級距也寫入）；連線以 `calc(2px / var(--prototype-flow-stroke-zoom))` 繪製，螢幕上維持 1.68–2.38px（依公式計算）。箭頭以代表縮放把目前的 `flowArrowLength`（14）與 `flowArrowHalfWidth`（5）換算成世界尺寸、在閒置時重算，螢幕上長 11.8–16.6px，代表縮放時恰為 14px（依公式計算）。虛線動畫在 `data-camera-moving`、`data-dragging` 或縮放低於 0.4 時 `animation-play-state: paused`；`prefers-reduced-motion: reduce` 時不播放；keyframe 位移改為 dash＋gap 的整數倍，消除每圈跳 2px。

### 控制列移出相機圖層

flow 根節點（填滿 preview）內依序是：viewport（`position: relative; overflow: clip; touch-action: none; overscroll-behavior: none; user-select: none; isolation: isolate`）包含世界圖層與覆蓋層；控制圖層（`position: absolute`，不再用 `fixed`，並設定高於世界圖層與覆蓋層的明確 z-index）；對話框圖層。縮放群組在右上：Zoom out、百分比按鈕（按下開啟縮放選單；可見文字為百分比，無障礙名稱由視覺隱藏的「Zoom menu」加上百分比組成，例如 `Zoom menu 100%`，帶 `aria-haspopup="menu"` 與 `aria-expanded`）、Zoom in、Fit canvas（fit 追蹤中 `aria-pressed="true"`）。縮放選單提供 Zoom to fit、50%、100%、200% 與快捷鍵、手勢說明。Layout 群組在右下，按鈕與文字不變；其他能力宣告唯讀檢視時，Reset 與 Import 停用。Reset 確認鈕文字改用 `--pi-sys-color-on-primary`。畫布背景改為單色 `--pi-sys-color-background`，移除 radial-gradient 點陣。所有新元素只使用既有 `--pi-*` token，不新增 token。

figma-export addon 會在 Pages/ 的 prototype story 上顯示 UI（Open Static Flow 開啟的分頁帶 `figmaExport:on`）。匯出工作區浮在 UI Flow 畫布上方，不縮小畫布（見「工作區浮在 UI Flow 畫布上方」，取代原本 flow 根節點在工作區展開時套用寬度或高度上限的做法）；addon 的 review 面板固定在右上角（z-index `calc(var(--sbfx-z-index, 20) + 1)`），在 figma-export 介面出現時（`html[data-sbfx-workspace-open="true"]` 或 `html[data-sbfx-comments-open="true"]`）縮放群組改排到 viewport 左上角、layout 群組改排到左下角，避免被覆蓋。UI Flow 畫布上的 visual comments 列為不支援，並寫進 storybook-integration.md。

### 工作區浮在 UI Flow 畫布上方

**Supersedes**: rebuild-flow-canvas-camera / 控制列移出相機圖層（flow 根節點在工作區展開時套用寬度或高度上限的部分）

2026-10-07 使用者回報：Figma export 面板展開時，UI Flow 畫布右側被切掉。畫布可以平移，被工作區蓋住的內容可以移開，縮小畫布只會讓可用範圍變小。因此 flow 根節點不再依工作區設上限，畫布永遠填滿 preview，工作區浮在上方；figma-export addon 也不再縮窄含 `data-sbfx-canvas` 的 `#storybook-root`（add-anchored-visual-comments 任務 5.12）。控制項繼續避開 addon 的介面：

- 側邊模式且工作區展開時，layout 群組的最大寬度為 flow 根節點寬度減去工作區保留寬度（`--sbfx-workspace-reserved-inline-size`，讀不到時用 addon 預設 `min(344px, 100vw)`）與兩倍 `--pi-sys-spacing-container-xl`，放不下時換行，不會伸到工作區下方。
- 底部模式（視窗寬度 720px 以下，工作區橫跨底部）且工作區展開時，layout 群組的下緣改為工作區保留高度（`--sbfx-workspace-reserved-block-size`，讀不到時用 addon 預設 `min(38vh, 340px)`）加上 `--pi-sys-spacing-xs`，位於工作區之上。
- 縮放群組維持在左上；工作區收合時維持原本位置。

### 以 performance mark 量測手勢期間的工作

`PrototypeFlow` 以無依賴陣列的 layout effect（`useIsomorphicLayoutEffect`，React 寫入 DOM 的當下、重繪之前）在每次 commit 後 `performance.mark('pi:flow:commit')`，標籤擺放標記 `pi:flow:label-placement`（`detail.durationMs` 為耗時）。新增的 `bench_flow_canvas.mjs` 不依賴任何套件：以 `--remote-debugging-port` 啟動系統 Chrome、透過 Node 內建 WebSocket 走 CDP（寫法比照 `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs`），對指定的 UI Flow URL 量測並輸出 JSON：

- 執行環境：Chrome 版本、是否 headless、Storybook dev 或 static build、機器型號，以及 `--project-root <path>` 指定專案中 `.storybook/prototype-inspector/preview.js` 的 `prototypeInspectorBuildTag`（build tag 只在 Components 模式顯示，所以從檔案讀取）。
- 就緒時間、document 與 DOM 節點數、JS heap，以及同一 fixture 在 Story 模式與 UI Flow 的 Chromium renderer 行程記憶體（供 add-flow-canvas-level-of-detail 比較）。
- 拖曳每次 pointermove 的同步成本（中位數、p95、最大）；pinch（30 個 ctrl wheel 事件）、平移與拖曳期間，以及閒置後 100ms 內的 `pi:flow:commit`／`pi:flow:label-placement` 數；標籤擺放每次的耗時；一次拖曳的 `localStorage.setItem` 次數；開啟 UI Flow 至就緒期間對 `prototype-inspector:flow-layout:*` 的 `setItem`／`removeItem` 次數（開啟前先寫入一筆含未知 node id 的 layout）；pinch 期間 `--prototype-flow-stroke-zoom` 的寫入次數與跨越的級距數。標記尚不存在時回報 `null`。bench 等 1 秒內沒有 `pi:flow:commit` 才開始手勢，避免把 iframe 載入與尺寸量測算進手勢期間。

量測對象不使用外部 repo：外部 repo 跑舊版 Inspector（cm-linepay 為 4,131 行，實測）或自行修改的 fork（cm-chipK），fix-inspector-runtime-drift 不升級它們，`--force` 安裝又會覆寫 fork。新增不依賴套件的 `create_flow_bench_fixture.mjs`：把 storybook-template 複製到暫存資料夾、node_modules 以 symlink 共用、絕不寫回 repo，並產生 growth-fund 型（30 個 route，COLUMN 480／ROW 980，加上 ROW*2+420 的重疊子列、kind 為 decision／async 的節點與 reference 分支）、round-up 型（內容高度 364 與 1040px）、inventory 型（沒有 route-preview 標記、一個 y = -260 的節點、只在 useState 初始化讀取 prototypeRoute）、font-size 型（22px 垂直 gutter）、一個 `min-height: calc(100vh + 20px)` 的 route，以及 100 個 route 的生成 flow。基準（1.1）與完成後（4.2）都在同一台機器、同一 build 模式下量 growth-fund 型與 100 個 route 的 flow；100 個 route 的 flow 用來觀察標籤擺放隨規模成長（研究估計約 O(E·K·(R+E))）。後續 change 的手動與 bench 驗證也指向這組 fixture。外部 repo 只作選用：只能在拋棄式 git worktree 中以 `install_prototype_inspector.mjs --force --token-prefix <prefix>` 安裝後量測、量完移除，任何結果都不提交。

bench 不列入自動化回歸指令，但是引用它的任務（本 change 的 1.1、3.1、3.3、4.2，以及後續 change 的 bench 驗證）必須執行的驗證工具。

## Implementation Contract

**Behavior**

- 開啟 UI Flow 時畫布 fit 目前顯示的畫面（上限 100%），之後量到尺寸會持續 fit，直到第一個不是 fit 的相機變更（使用者操作或其他能力的程式化移動）；同分頁回到顯示完整 flow 的 UI Flow 時恢復上次的完整 flow 相機。
- 觸控板雙指平移、pinch 縮放、Cmd／Ctrl／Alt+滾輪縮放、一般滾輪上下平移、Shift+滾輪左右平移、Space＋拖曳與中鍵拖曳平移；指標在控制列、縮放選單或對話框上 pinch 也只縮放畫布，Storybook 頁面本身不會被放大。
- 快捷鍵：Shift+1、Shift+0、Mod+0、=／+、-、Mod+=、Mod+-、Space、Esc（關閉選單或對話框 > 取消拖曳）；處理過的按鍵不會觸發 Storybook 快捷鍵；以 Tab 聚焦的控制項保留 Space、Enter 與方向鍵的原生行為；選單或對話框開啟時只處理 Esc。
- 拖曳移動 3px 後開始，期間不 commit React，放開時寫入一次；Esc 取消；其他能力宣告的唯讀檢視中不能拖曳，Reset 與 Import 停用。
- 畫面無框無陰影；名稱、徽章、⧉ 按鈕在框外上方，固定 12px；hover 時顯示 route id 與組名。

**Interface / data shape**

- `flow-canvas-geometry.js` 的完整 export 如下（不 import 任何模組；函式皆為純函式，不讀取 `window` 或 `document`）：
  - 常數：`MIN_ZOOM`（0.05）、`MAX_ZOOM`（4）、`ZOOM_STEPS`、`DRAG_THRESHOLD_PX`（3）、`defaultPrototypeModeGlobalName`。
  - 相機、輸入與幾何：`clampZoom`、`screenToWorld`、`worldToScreen`、`zoomAtPoint`、`normalizeWheelDelta`、`classifyWheel`、`applyWheelZoom`、`stepZoom`、`fitCamera`、`getZoomBucket`、`resolveCanvasShortcut`、`getFlowBounds`、`getFrameVisibleRect`。
  - 從 preview.js 搬入：`isRecord`、`normalizeRoutes`、`normalizeFlowNodes`、`normalizeComponentRoutes`、`normalizeRouteComponents`、`normalizeTransitions`、`aggregateTransitions`、`isVisibleFlowEdge`、`addFlowEdgeColorVariants`、`createPolyline`、`getFlowArrowPoints`、`placeEdgeLabels`、`getFlowMetadataNodeSize`、`getRoutePosition`、`getFallbackGridPitch`、`normalizeStorybookGlobals`、`getPrototypeFlowExportStoryId`、`resolvePrototypeViewport`。
  - 其餘一併搬入的繞線、評分函式與尺寸常數（例如 `createGlobalPolyline`、`getLabelPositionScore`、`getTransitionText`）不 export。
- `flow-canvas.js` 的完整 export：`PrototypeFlow`、`getPrototypeViewport`、`getRoutePreviewSource`、`createStorybookGlobals`、`openPrototypeExternalUrl`。
- `getFrameVisibleRect(box, frameType)`：`box` 為框 `{ x, y, width, height }`，`frameType` 為 `"route"` 或 `"node"`；route 回傳 `{ x: x + 1, y: y + 65, width: width - 2, height: height - 66 }`，node 回傳框本身。
- `resolveCanvasShortcut(eventLike, context)`：`eventLike` 為 `{ type, code, shiftKey, ctrlKey, metaKey, altKey, repeat }`（`type` 為 `"keydown"` 或 `"keyup"`），`context` 為 `{ isMac, isTextEntry, targetIsControl, overlayOpen, dragActive }`；回傳值：`"fit" | "zoom-100" | "zoom-in" | "zoom-out" | "pan-start" | "pan-end" | "close-overlay" | "cancel-drag" | null`。後續 change 只新增 context 欄位與命令。
- sessionStorage：鍵 `prototype-inspector:flow-camera:<prototypeId>`，值 `{"version":1,"x":<number>,"y":<number>,"z":<number>}`；只在畫布顯示完整 flow 時寫入與讀取；格式不符時忽略並 fit。
- performance mark 名稱：`pi:flow:commit`、`pi:flow:label-placement`（`detail.durationMs` 為該次擺放耗時）。
- CSS：新 class `prototype-inspector__flow-viewport`、`__flow-world`、`__flow-overlay`、`__flow-frame`、`__flow-frame-preview`、`__flow-frame-label`、`__flow-zoom-menu`；資料屬性 `data-camera-moving`、`data-pan-mode`、`data-panning`、`data-dragging`、`data-flow-focus`；CSS 變數 `--prototype-flow-camera-x`、`--prototype-flow-camera-y`、`--prototype-flow-camera-zoom`（寫在覆蓋層根節點 `.prototype-inspector__flow-overlay`）、`--prototype-flow-label-wx`、`--prototype-flow-label-wy`（寫在各名稱與標籤元素）、`--prototype-flow-stroke-zoom`（寫在世界圖層 `.prototype-inspector__flow-world`，只在級距改變時寫入）。`--prototype-flow-camera-x`、`--prototype-flow-camera-y`、`--prototype-flow-label-wx`、`--prototype-flow-label-wy` 一律帶 px 單位（例如 `480px`），`--prototype-flow-camera-zoom` 與 `--prototype-flow-stroke-zoom` 為無單位數字；rAF 中以 `style.setProperty` 寫入時必須附上 `px`。所有 `var(--sbt-*)` 仍只出現在檔案頂端的 `--pi-*` token 層。
- 量測工具：`node storybook-product-prototype/scripts/create_flow_bench_fixture.mjs --out <暫存資料夾>` 產生 fixture 並印出各 prototype 的 UI Flow story id；`node storybook-product-prototype/scripts/bench_flow_canvas.mjs --url <UI Flow URL> [--project-root <path>]` 輸出上述 JSON。
- flow layout payload、storage key、Static Flow 讀取方式、route iframe URL 不變。

**Failure modes**

- sessionStorage 不可用或拋例外：每次掛載都 fit，不影響其他功能。
- `ResizeObserver` 不存在：只在 window `resize` 時重新 fit。
- 非 Safari 瀏覽器沒有 gesture 事件：只走 wheel 路徑。
- `performance.mark` 不存在：略過標記。
- Cmd／Ctrl+0、=、- 被瀏覽器先攔截（例如 Firefox、焦點在 manager）：Shift+0 與 =／- 仍可用；這是已知的 best-effort 行為。
- `create_flow_bench_fixture.mjs` 找不到 template 的 node_modules：以非零碼結束並提示先在 template 執行 `npm ci`，不寫入 repo。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs` 通過，涵蓋規格中縮放階梯、連續縮放夾值、fit、滾輪分類、按鍵路由（含 `targetIsControl` 與 `overlayOpen`）、縮放級距與可見矩形的範例。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` 通過：以 vm 渲染 `PrototypeFlow`，斷言 viewport／世界圖層／覆蓋層／控制圖層的結構、控制項無障礙名稱（含 `Zoom menu` 按鈕）、宣告 viewport 時才有徽章、有 components 時才有 ⧉ 按鈕、hover 揭示元素含組名、名稱列的座標變數以 px 結尾、畫面無 in-frame header。
- `node storybook-product-prototype/scripts/test_authority_inspector.mjs`（15 個 Data 案例）與 `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過（含 mirror 與 import surface）。
- `bench_flow_canvas.mjs` 在 fixture 的 growth-fund 型與 100 個 route 的 flow 上量到：pinch 與平移手勢期間 `pi:flow:commit` 與 `pi:flow:label-placement` 皆為 0、閒置後 100ms 內恰好 1 次 commit（不含 iframe 載入與尺寸量測造成的 commit）、拖曳期間 `pi:flow:commit` 為 0、一次拖曳 `localStorage.setItem` 為 1、開啟時對 `prototype-inspector:flow-layout:*` 的 `setItem`／`removeItem` 為 0、pinch 期間 `--prototype-flow-stroke-zoom` 只在跨級距時寫入；拖曳每次 pointermove 的 p95 目標 ≤ 8ms（**估計值**；舊版 Inspector 在 cm-linepay 實測 18ms，目前版本的基準由 1.1 重新量測；若未達成，以 bench 的 trace 找出熱點後在本 change 內修正，不放寬目標前先記錄原因）；100 個 route 的標籤擺放耗時記錄實測值，不設門檻。baseline.json 與 after.json 在同一台機器、同一 build 模式下量測，且 build tag 不同。
- 手動瀏覽器檢查（Chrome、Safari、Firefox）：pinch 不會放大 Storybook 頁面（指標在畫布與縮放群組上各一次）、Shift+1／Shift+0 不觸發 Storybook 快捷鍵、按 1 仍會把焦點移到 Storybook 側欄、以 Tab 聚焦 Zoom in 後按 Space 只放大一格、縮放停止後文字與畫面清晰、平移時控制列不動、開啟 Storybook 工具列縮放 150% 後拖曳仍對準指標、`figmaExport:on` 時縮放群組與 layout 群組完整可見且可點擊。

**Scope boundaries**

- In scope：上述兩個新模組、preview.js 掛載改寫、CSS 中 flow 區段重寫、兩個新測試、bench 與 fixture 腳本、`test_authority_inspector.mjs` 注入 geometry export、文件更新、template 副本同步、build tag、template Spectra root 後續 change 的建立追蹤（4.5）。
- Out of scope：Non-Goals 所列項目；route iframe 仍全部 live、仍使用現有的輪詢量測；外部 repo 的任何修改；template Spectra root 規格內容的實際修改（由 `align-template-flow-parity` 處理）。

## Risks / Trade-offs

- [本 change 仍保留每個 route 一個 live iframe，縮放停止後重新點陣化 30 個 iframe 仍有成本] → 只在閒置時重新點陣化一次；真正的解法在 add-flow-canvas-level-of-detail。
- [移除 Cmd 平移會打斷既有習慣] → 縮放選單與文件列出新手勢；Space、中鍵、觸控板雙指三種替代方式。
- [Cmd／Ctrl+=、-、0 可能被瀏覽器攔截] → Figma 原生的 Shift+0 與 =／- 為主要快捷鍵，Mod 版本為 best-effort。
- [Safari 可能同時送 gesture 事件與 ctrl wheel] → gesture 進行中忽略 ctrl wheel；手動 Safari 測試列入驗收。
- [連線錨點改到預覽區後，與 Static Flow 的箭頭位置不同] → 兩者本來就使用不同繞線器，共用契約只有 positions；template README 與 example 文件改寫為「幾何一致」。
- [template 的未歸檔 change generalize-storybook-template 有「Static flow matches UI Flow visual conventions」情境；template 的 `viewport-token-tier`「Inspector runtime copies stay in sync with the skill asset」仍只列 preview.js 與 prototype-inspector.css] → 兩者屬於 template 自己的 Spectra root（`design-system-to-storybook/storybook-template/openspec/`），由後續 change `align-template-flow-parity` 處理：把前者改為幾何一致（positions、框尺寸），把後者擴大到整個 Inspector 資料夾加上 helper 與 fingerprint。4.5 在使用者同意後以 `design-system-to-storybook/storybook-template:spectra-propose` 建立；本 change 不修改 template 的 openspec。
- [基準數據來自 cm-linepay 較舊的 Inspector 安裝（4,131 行）] → 基準與驗收改用 `create_flow_bench_fixture.mjs` 產生的 fixture：實作前（1.1）以目前版本量一次基準，完成後（4.2）在同一台機器、同一模式下比較；cm-linepay 只在拋棄式 worktree 中選用。
- [flow layout helper 的 import 從 preview.js 移到 flow-canvas.js] → fix-inspector-runtime-drift 的安裝器相容檢查與 import surface 檢查都以資料夾內每個模組的 import 為準；1.4 以 `test_install_prototype_inspector.mjs` 確認 v1 helper 仍會被拒絕。
- [未合併分支 feature/handoff-blocking-gate-20261001 修改 SKILL.md 的 `### 10. Validate`] → 文件修改限縮在指定小節，合併時逐段處理。
- [4.2 實測（2026-10-05）：100 個 route 的 flow 靜止後只有一次 commit，但標籤擺放（110 個標籤）在 render 中耗時約 91ms，加上 passive effect 要等 100 個 iframe 重繪完才觸發，commit 標記落在靜止後約 +237ms，超出「閒置後 100ms 內」的量測窗口] → 不改擺放結果的前提下，把 `resolveLabelCandidate`、`getTotalIntersectionArea` 與 `getLabelPositionScore` 的 map／filter／sort 改為單一迴圈（加總順序與同分取第一個的規則不變，golden 測試與兩個 bench flow 的擺放結果 hash 一致），Node 實測 100 個 route 由 42ms 降到 28ms、瀏覽器內由 91ms 降到約 48ms；commit 標記改在 layout effect 觸發，記錄的是 commit 落地的時間而不是重繪完成的時間。改後探針量到 commit 在靜止後約 +186ms（窗口為 +120～+220ms）。曾試過以網格索引減少比對次數，因每次查詢的額外開銷反而變慢而放棄。add-flow-canvas-level-of-detail 4.1 以同一份 100 個 route fixture 量測（2026-10-07，見該 change 的 `bench/after.json`）：標籤擺放 8 次的中位數約 36ms、最長約 70ms；pinch 後的 commit 落在靜止後 +97～+102ms（三次量測，最後一個事件後 +217、+221.5、+220.7ms），剛好在窗口邊緣；live iframe 上限讓放大到 100% 時只剩 4 個 route iframe，閒置後的重繪不再隨 route 數成長。標籤擺放本身仍隨連線數成長（研究估計約 O(E·K·(R+E))），是 100 個 route 時 commit 落在窗口邊緣的主因，留給之後的效能工作。
- [Storybook dev 模式下 100 個同源 route iframe 同時載入時，Chrome 會以 `ERR_INSUFFICIENT_RESOURCES` 中止部分模組請求（每個 iframe 還會載入 72 份 design-system 文件），那些 iframe 永遠不會完成開機；在記憶體壓力高時特別常見，改版前後的 Inspector 都會發生（同一份 fixture 對照實測）] → 這不是本 change 造成的回歸；`bench_flow_canvas.mjs` 加入 30 秒沒有 iframe 進度即判定卡住的規則，讓無效的嘗試提早結束並重試，有效量測的數值不受影響。真正的解法是 add-flow-canvas-level-of-detail 的 live iframe 上限。
- [figma-export addon 0.13.0 的 `html[data-sbfx-workspace-open="true"][data-sbfx-workspace-orientation="side"] #storybook-root { max-inline-size: calc(100vw - var(--sbfx-workspace-reserved-inline-size)) }` 引用的變數只定義在 `.sbfx-workspace`，`#storybook-root` 讀不到而計算為 none，工作區因此蓋住任何 story 的右側（底部模式的高度上限同樣失效）；4.4 實測時 UI Flow 的 layout 群組被工作區蓋住] → Inspector 端在工作區展開時（`.sbfx-workspace` 沒有 `data-export-collapsed="true"`）把 `.prototype-inspector--flow` 的寬度（側邊）或高度（底部）設上限，數值取同名變數、讀不到時用 addon 的預設值（344px、min(38vh, 340px)）；收合時 html 仍標記工作區開啟，但工作區只剩右下角的小按鈕，所以不設上限（2026-10-06 使用者回報收合後畫布右側被切掉而修正）。只要 figma-export 的介面在畫面上，縮放群組移到左上、layout 群組移到左下，避開右上的留言按鈕與右下的工作區或其收合按鈕。4.4 的 Chrome 檢查確認展開與收合兩種狀態下七個控制項都可見且在最上層。addon 本身的變數作用域錯誤留給 figma-export addon 的後續修正（已由 add-anchored-visual-comments 修正）。2026-10-07 起由「工作區浮在 UI Flow 畫布上方」取代：flow 根節點不再設上限。
- [figma-export addon 用 html-to-image 截圖時，`<svg>` 只複製元素本身，不會把樣式表規則套到子元素；UI Flow 連線的 fill、stroke 寫在 CSS class 上，截圖中變成黑色色塊且看不到線（2026-10-06 使用者回報）] → 連線與箭頭的 fill、stroke、線寬、虛線與各 focus 狀態的透明度改由 `flow-canvas.js` 以 inline style 寫入，數值直接引用 svg 會繼承到的 `--pi-*` token；CSS 只保留虛線動畫，以及邊線標籤用的顏色變數。以 html-to-image 重現確認截圖中的連線恢復，一般畫面逐像素比對沒有差異，growth-fund bench 的拖曳 p95 為 2.2ms、手勢期間 commit 為 0。addon 端通用的 SVG 截圖修正列入 `add-anchored-visual-comments`。
- [pinch 靜止後的那次 commit 會由 React 以相同的值再寫一次 `--prototype-flow-stroke-zoom`] → bench 把寫入拆成手勢期間、閒置後與實際改值的次數；手勢期間的寫入次數等於跨越的級距數，閒置後那次不改變數值。

## Migration Plan

layout payload 與 storage key 不變，既有 layout 直接沿用。新增的 sessionStorage 相機鍵只影響同一分頁。外部專案以 `install_prototype_inspector.mjs --force --token-prefix <prefix>` 升級後即取得新畫布；回滾 revert 本 change 即可。
