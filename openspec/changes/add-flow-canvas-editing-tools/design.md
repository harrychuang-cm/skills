## Context

前置 change（rebuild-flow-canvas-camera、add-flow-canvas-level-of-detail、add-flow-canvas-comments、add-flow-journey-focus、add-flow-auto-layout）都已實作並 commit（未歸檔；flow-canvas-navigation 還不在 `openspec/specs`，擴充點以 rebuild-flow-canvas-camera 的 change 規格為準）。UI Flow 目前具備：

- 相機與閒置事件，document 層的快捷鍵 dispatcher：`resolveCanvasShortcut(eventLike, context)` 是純函式，回傳字串命令或 `null`；context 的欄位缺少時視為 falsy，所以新增欄位不影響既有測試列。macOS 上 Ctrl、其他平台上 Meta（`otherMod`）一律回傳 `null`；焦點在控制項時 Space、Enter 與方向鍵回傳 `null`。
- 單一畫面拖曳：`handleFramePointerDown` 在 `drag.frames` 記下被拖畫面（含它的框標籤與 auto-layout 功能名稱），`writeDragToDom`／`restoreDragDom` 只寫 DOM，放開時 `commitLayoutPositions` 寫入一次；唯讀檢視（`latestRef.isReadOnlyView`）不開始拖曳。
- 命中：畫面的 article 本身不接收指標，預覽區與畫面名稱列接收（`pointer-events: auto`），所以命中測試沿用 DOM 事件目標，不需要另一套座標命中。
- 覆蓋層以相機 CSS 變數定位文字；geometry 純函式模組；分層的 `pinnedFrameId`／`promotedFrameIds`；簡化檢視的步驟實例（instance key `<stepIndex>:<nodeId>`）、功能流程清單與切換前 hook `beforeJourneySwitchRef`；Auto Layout 的套用、功能名稱（`prototype-inspector:flow-lanes:<prototypeId>`）、8 秒復原提示與量測後重排。
- 留言：框、節點與 key 連線帶錨點；figma-export 的留言截圖會略過帶 `data-sbfx-capture-ignore` 的子樹，SVG 子元素的樣式要寫 inline 才保得住。
- figma-export 介面：只開留言時縮放群組移到左上；工作區開啟時縮放群組在左上、layout 群組在左下。

空白處的主鍵拖曳目前不做任何事，就是預留給框選。

本 change 不對前置 change 的規格加 MODIFIED delta，而是使用它們預留的擴充點：整組拖曳、唯讀檢視、按鍵只在其情境中攔截與控制項的按鍵規則、Esc 的路由、程式化相機移動結束 fit 追蹤、覆蓋層跟隨相機、畫面的可見矩形（route 為預覽矩形：框頂往下 65、左右與下緣各內縮 1；flow-only node 為整個框）；LOD 的提升介面；journey 的步驟實例與清單；fix-inspector-runtime-drift 的「其他已提交 layout 動作（例如方向鍵微調、復原或重做）各寫入一次」。

研究依據（11 個實際 prototype，2026-10-02 實測）：114/115 個 x 座標在 20px 格線上；route 畫面之間的水平 gutter 最小為 103px（pitch 480，最常見），也有 183、323、383px；垂直 gutter 多為 102–202px，最小的是 cm-chipK font-size 的 22px；3 個 prototype 共 7 組畫面重疊；48 個 flowGroup 中 23 個只有一個成員；growth-fund、purchase、inventory、music 的分組外接矩形會吞進其他組的畫面。Figma 的慣例：Shift+點擊加選、框選採觸碰規則、方向鍵 1／Shift 10、紅色參考線吸附中線與外緣、按住 Control 暫停吸附；Figma 沒有小地圖。

## Goals / Non-Goals

**Goals:**

- 選取、框選、整組拖曳、方向鍵微調、對齊參考線、復原與重做，操作方式與 Figma 一致或在文件中說明差異。
- 小地圖與分區背景幫助掌握大型 flow 的全局。
- 所有編輯只改 positions（Auto Layout 的復原另含功能名稱），持久化仍是每個 layout 動作寫入一次。
- 只使用前置 change 預留的擴充點，不修改它們的規格。

**Non-Goals:**

- 互動模式、等距參考線、格線吸附、刪除或新增畫面、跨重新整理的復原歷史。自動排版由 add-flow-auto-layout 提供。

## Decisions

### 選取狀態只存在記憶體，外框畫在覆蓋層

選取是 instance key 的 `Set`（完整 flow 中為 node id，簡化檢視中為步驟實例的 `instanceKey`），存在 React state 並同步到 ref，只在使用者操作結束時改變：按下畫面時只記下按下的畫面與 Shift，放開時（沒有超過拖曳門檻）才單選或切換並 commit；拖曳超過門檻時，選取與位置在放開的同一批更新中 commit。命中沿用 DOM：預覽區與畫面名稱列的 pointerdown 帶有 `data-frame-id`，按在名稱列上時以該名稱列的畫面為目標；畫面 article 與框上方的空白名稱區不接收指標，因此不需要 `hitTestFrames` 一類的座標命中函式。

外框為每個顯示中的畫面預先渲染在覆蓋層中一個帶 `data-sbfx-capture-ignore` 的容器（隱藏，選取時顯示），以帶 px 的 world 變數（可見矩形的左上角與尺寸）加相機變數定位，以螢幕座標固定 2px；pinch 與平移時外框每一幀都貼著畫面，不需要 React commit；框選與拖曳時只切換或移動這些 DOM 元素。被選取的畫面帶 `data-selected="true"` 並以 z-index 提到上層，不重排 DOM（重排會讓 live iframe 重新載入）；被選取的 route 畫面以 instance key 放進 `promotedFrameIds`。換 prototype 時清除。SSR 測試以只供測試的 `initialSelection` prop 渲染選取狀態（`preview.js` 仍只傳 `prototype`）。

### 框選採觸碰規則且不填色

框選矩形與畫面的可見矩形相交就選取（Figma 的「touching」、React Flow 的 partial），在低縮放時比「完全包含」好用；用可見矩形而不是框，框選到 route 畫面上方名稱區的空白處時才不會選到畫面。矩形只畫 1px 外框、不填色。空白處按下時就在 viewport 上 `setPointerCapture`（與平移相同；避免指標滑過畫面時 hover 造成 commit，也讓放在控制列或畫布外的放開一定回到 viewport，review 2026-10-08），收到主鍵沒按住的移動時丟棄這次按下並取消框選；框選只在空白處開始（畫面的 pointerdown 會冒泡到 viewport，要檢查事件目標）；macOS 上 Ctrl+按下是右鍵選單，不開始框選。框選中以 rAF 改寫矩形與預先渲染的外框，放開時才寫入 React state，一次 commit。

### 整組拖曳與微調沿用單一寫入路徑

本 change 為 rebuild-flow-canvas-camera 的畫面拖曳定義整組拖曳：按下的畫面已被選取時 `drag.frames` 包含所有被選取的畫面（各帶它的框標籤與 auto-layout 功能名稱），否則先單選它再拖曳。按下時若有待提交的微調先提交；被拖的畫面（`drag.frames`）在超過拖曳門檻、真正開始拖曳時才讀取，這時微調的 render 已經完成，所以微調後立刻拖曳會從微調後的位置繼續（verify 2026-10-08：原本按下時就讀取，讀到微調前的位置，因此改為不開始拖曳，違反整組拖曳的規格）。拖曳中沿用相機 change 的做法：從超過拖曳門檻的第一次移動到放開為止，只在 rAF 中改寫被拖畫面的 transform、相連連線、選取外框、參考線與受影響的分區，不 commit React render；放開時一次寫回整數座標與選取、寫入一次；拖曳中按 Esc 時所有被拖畫面回到原位、不寫入。Shift 鎖定位移較大的軸。

方向鍵微調以 20／100 world px 為單位（對齊實際 prototype 的 20px 格線；Figma 的 1／10 px 對以 375px 寬畫面為單位的版面意義不大，這是刻意的差異，會寫進文件）。微調是一個只寫 DOM 的 session，重用拖曳的 DOM helper：keydown（含按住時的自動連發）累加位移，最後一次放開方向鍵 500ms 後提交（一次 commit、寫入一次）；在其他 layout 動作、復原、重做、選取改變、視窗失焦或 UI Flow 卸載之前先提交。開始一次微調時就結束 Auto Layout 提示的復原期間，不等提交（review 2026-10-08：否則在提交前點提示的 Undo，復原的是微調而不是 Auto Layout）。提交計時器到期時若相機正在移動或正在拖曳，每 250ms 重新排程，不在手勢中 commit。微調進行中若有其他 commit，一個 layout effect 在 commit 後重新套用 session 的 DOM 寫入。

整組拖曳放開、微調提交、復原與重做都是「UI Flow 畫布能力定義的已提交 layout 動作」，依 fix-inspector-runtime-drift 的通用條款各寫入一次，因此本 change 不需要對 inspector-viewport-resolution 加 delta。

### 參考線只比對可見畫面的邊與中線

`computeSnap(draggedRect, candidateRects, thresholdWorld)` 為純函式，輸入都是可見矩形：被拖選取的可見矩形外接框，在 x 軸以左、中、右三條線分別與每個候選的左、中、右三條線比對（共九組），y 軸以上、中、下同理，兩軸各自取最近且距離在門檻內的一組（距離相同時依「被拖的線：左／上 > 中 > 右／下，候選依輸入順序」取第一組），回傳修正量與要畫的參考線。比對全部九組才能讓相鄰畫面的邊貼齊（例如右緣對左緣）；用可見矩形是因為 route 畫面框上方有 64px 不畫任何東西的名稱區。候選只取未被選取、與 viewport 相交的畫面，數量受限、計算量小。

門檻 `getSnapThreshold(zoom) = min(20, max(2, 6 / zoom))`：6 個螢幕像素換算成 world px，夾在 2–20 之間；20 小於實際最小的 gutter（22px），也等於作者使用的 20px 格線。按住 Ctrl 暫停，只在 pointermove 時讀取修飾鍵。兩條參考線元素預先渲染並隱藏，放在帶 `data-sbfx-capture-ignore` 的圖層。

### 參考線顏色走 Token Gate

決定（2026-10-07，使用者核准）：新增 `--pi-sys-color-annotation-touch-target: var(--sbt-sys-color-annotation-touch-target, #db2777)`，深色 fallback `#f472b6`，橋接 template 已存在的 sbt token。它與選取色（primary）和四種連線色都不同。template 中 `--sbt-sys-color-annotation-touch-target` 解析為 pink-70 `#ffb7b9`（`tokens/tokens-ref.css`），白底對比約 1.65:1，1px 參考線在 template 淺色主題下可能太淡，列入手動檢查；看不清楚時由專案在 sbt token 層調整，Inspector 不另加覆寫。token 加在兩份 `prototype-inspector.css` 的 token 層與 `prefers-color-scheme: dark` 區塊。

### 復原歷史記錄完整的已存位置

`createLayoutHistory(limit = 100)` 為純函式 reducer，放在 ref（不放 React state）。每個 entry 存動作前後**完整的已存位置 map**（`{ before, after }`），因為 Reset 寫入 `{}`、Import 整份取代、空 map 會讓 helper 移除排版鍵，只記改變的 node 無法還原這些動作。Auto Layout 的 entry 另存功能名稱的前後值（`lanesBefore`、`lanesAfter`）。`commitLayoutPositions(positions, { record = true, lanes })` 在 record 時推入 entry；復原套用 `before`（與 `lanesBefore`）、重做套用 `after`（與 `lanesAfter`），每次都是一個已提交的 layout 動作，寫入一次，本身不新增 entry；新動作截掉可重做的尾端；待提交的微調在復原或重做之前先提交成一筆 entry。超過 100 筆丟掉最舊的。相機、選取、分區與小地圖顯示狀態都不進入歷史。歷史在 UI Flow 卸載、換 prototype 或 storedLayoutSource 改變時清除；切換 journey 不清除。

依使用者決定（2026-10-08），Auto Layout 併入歷史：Mod+Z／Shift+Mod+Z 可復原、重做 Auto Layout（連名稱）；提示上的 `Undo` 是 history undo 的捷徑（只在最新可復原的 entry 正是那次 Auto Layout 時顯示）；微調、復原與重做也結束提示的復原期間。Auto Layout 量測後重排時，更新最新那筆 Auto Layout entry 的 `after`（重排只在之後沒有其他 layout 動作時發生），重做才不會回到重排前會重疊的位置。

### 小地圖用 SVG 畫在 viewport 左下角

小地圖是 176 × 120px（`var(--pi-ref-size-176)` × `calc(var(--pi-ref-size-60) * 2)`）的 SVG 面板，是 viewport 的 DOM 子元素（排在 overlay 之後），所以在上面滾輪照常平移畫布。位置：viewport 左下角（功能流程清單顯示時就在清單右側，兩者不重疊）；依使用者決定（2026-10-07），`html[data-sbfx-workspace-open="true"]` 時移到左上、縮放群組下方，避開工作區開啟時移到左下的 layout 群組。帶 `data-sbfx-capture-ignore`；主鍵 pointerdown 呼叫 `stopPropagation`（不開始框選或平移）。用 SVG 讓 `--pi-*` token 與深淺色主題直接套用。

內容範圍為內容邊界與 viewport 的聯集，縮放到面板比例（`getMinimapTransform`、`minimapPointToWorld`）；畫面以可見矩形表示，只在 positions 或尺寸改變時重畫；viewport 框在相機的 rAF 寫入中同步更新 viewBox 與矩形，每幀最多一次、不 commit React；拖曳 viewport 框時凍結 viewBox。點擊 viewport 框外以同樣縮放對準該點、拖曳 viewport 框保留抓取位移，屬於程式化相機移動，結束 fit 追蹤。縮放選單加 `Minimap` 核取項，偏好存 `prototype-inspector:flow-minimap`（`"shown"`／`"hidden"`）；沒有偏好時 route 畫面與 flow-only node 合計 8 個以上預設顯示。

### 分區用成員外框的聯集

分區形狀是成員畫面框各自向外留白後的聯集（以多個矩形組成的 SVG path），而不是整組的外接矩形。留白 `min(32, max(0, (g - 8) / 2))`，g 為該成員與最近外組畫面的距離。成員從 `routes` 陣列讀 `flowGroup`（routePositionMap 的 route 項沒有 flowGroup）；只有兩個以上 route 成員的組才畫，flow node 只能加入既有分區。SVG 是 world 圖層第一個子元素（z-index 0），`pointer-events: none`，填色用 inline style `fill: var(--pi-sys-color-surface-raised)`（留言截圖會丟掉樣式表對 SVG 子元素的規則）、不加邊框：它與畫布背景在淺色 fallback、深色 fallback 與 template 深淺色主題中都不同色，但對比只有約 1.05–1.2:1，列入手動檢查。組名固定 12px，畫在分區上方（`translateY(-100%)`）；留白在目前縮放下比該成員的框標籤矮時再往上移，避開框標籤（框標籤高度以兩倍字級加下方留白估計，因為 template 可能把 caption 行高設為 `normal`，`calc()` 不接受）；同一個 flowGroup 已顯示 auto-layout 的功能名稱（lane 鍵 `group:<flowGroup>`）時不再顯示分區名稱。拖曳中在 rAF 重算被拖畫面所屬分區。縮放選單加 `Sections` 切換，偏好存 `prototype-inspector:flow-sections`，預設顯示；簡化檢視中不畫分區。

### 快捷鍵只在有東西可處理時攔截

`resolveCanvasShortcut` 維持回傳字串命令（camera design 的 Interface 是字串聯集，既有測試以 `assert.equal` 比對）。context 新增 `selectionSize`、`selectedRouteCount`、`canUndo`、`canRedo`、`marqueeActive`、`journeyFocus`，皆預設 falsy；沿用 `dragActive`、`targetIsControl`、`overlayOpen`。新增命令 `select-all`、`clear-selection`、`cancel-marquee`、`nudge`（位移由 `nudgeOffset(code, shiftKey)` 計算）、`undo`、`redo`、`zoom-to-selection`、`next-frame`、`previous-frame`。規則：

- 方向鍵只在 `selectionSize > 0`、`journeyFocus` 為假、`targetIsControl` 為假（既有規則）且沒有修飾鍵（Shift 除外）時回傳 `nudge`；Mod+Shift+方向鍵（Storybook 的 collapseAll／expandAll）與 Cmd+方向鍵一律傳遞。
- 畫布傳入的 `canUndo` 為「歷史可復原或有待提交的微調」（復原會先提交微調，再把它復原），`canRedo` 為「歷史可重做且沒有待提交的微調」（提交微調會丟掉可重做的 entry）。Mod+Z 只在 `canUndo` 時回傳 `undo`；Shift+Mod+Z 只在 `canRedo` 時回傳 `redo`；非 macOS 的 Ctrl+Y（Mod+Y）只在 `canRedo` 時回傳 `redo`，macOS 的 Ctrl+Y 由既有的 otherMod 規則回傳 `null`。`journeyFocus`、`dragActive` 或 `marqueeActive` 為真時三者回傳 `null`。
- Mod+A 回傳 `select-all`；N／Shift+N 回傳 `next-frame`／`previous-frame`；拖曳或框選中兩者回傳 `null`。Shift+2 只在 `selectionSize > 0` 時回傳 `zoom-to-selection`。
- 輸入法組字中（`isComposing` 或 `keyCode` 229）一律回傳 `null`。
- `overlayOpen` 為真時，本 change 的命令一律回傳 `null`，Esc 依相機 change 的規則關閉選單或對話框。
- Esc 的優先順序：close-overlay > cancel-drag > cancel-marquee > clear-selection；都不適用時回傳 `null`（add-flow-frame-interact-mode 會在 cancel-marquee 與 clear-selection 之間加入結束互動）。

`selectedRouteCount` 供 add-flow-frame-interact-mode 判斷 Enter 時是否只選取一個 route。本 change 不對 flow-canvas-navigation 的「Canvas keyboard shortcuts」加 delta；geometry 測試只新增本 change 的按鍵路由列，不修改相機 change 既有的列。

### 簡化檢視中只保留選取與導覽

add-flow-journey-focus 的簡化檢視是唯讀檢視。其中整組拖曳、微調、吸附、復原與分區背景停用，對應按鍵不攔截（`journeyFocus` 為真）；選取、框選、Mod+A、小地圖與 Shift+2 作用在步驟實例上，選取存放 `instanceKey`。N／Shift+N 改用 `getAdjacentStepIndex(stepCount, currentIndex, direction)` 依步驟索引移動並在兩端循環（`currentIndex` 為被選取步驟實例中最小的索引；沒有選取時 N 取第一步、Shift+N 取最後一步）；完整 flow 用 `getAdjacentRouteId`。切換 journey（`beforeJourneySwitchRef` 加入清除選取）時清除選取，但不動復原歷史。唯讀檢視中按下畫面時也抓住指標，放開一定回到同一個畫面；新的按下與切換 journey 都清掉殘留的按下（review 2026-10-08：原本在畫面外放開會留下按下，回到完整 flow 後下一次拖曳的放開被吃掉，之後滑鼠滑過就拖動畫面）。

### 縮放選單與導覽

Shift+2：選取了所有顯示中的畫面時等同 fit 全部（維持 fit 追蹤）；否則 `setCamera(fitCamera(選取的可見矩形範圍, viewport, 上限 1), { immediate: true })`，結束 fit 追蹤。N／Shift+N 換選並以同樣方式 fit 到該畫面（上限 1）。縮放選單的說明列加入 Shift+2 與 N／Shift+N，選單項加入 `Minimap` 與 `Sections` 核取項；縮放群組在左上時（figma-export 介面出現時），縮放選單改為靠左對齊並設最大高度可捲動。

## Implementation Contract

**Behavior**

- 點擊、Shift+點擊、框選、Cmd／Ctrl+A、Esc 管理選取；選取外框固定 2px、圍住可見矩形、手勢中每一幀都貼著畫面。
- 拖曳被選取的畫面時整組移動並吸附對齊（門檻 6 個螢幕像素，夾在 2–20 world px），按住 Ctrl 暫停吸附；方向鍵 20、Shift+方向鍵 100，連按或按住只算一個動作。
- Cmd／Ctrl+Z 復原、Cmd／Ctrl+Shift+Z 或 Windows／Linux 的 Ctrl+Y 重做，每次寫入一次；Auto Layout 也在歷史中，提示的 Undo 是它的捷徑。
- 小地圖在畫布 viewport 左下角（清單顯示時在清單右側；figma-export 工作區開啟時在左上、縮放群組下方），可點擊或拖曳導覽；分區背景依 flowGroup 繪製；Shift+2、N、Shift+N 導覽。
- Esc 依「關閉選單或對話框 > 取消拖曳 > 取消框選 > 清除選取」只做第一個適用的動作，都不適用時傳給 Storybook。
- 簡化檢視中只保留選取、框選、小地圖與導覽，選取以步驟實例為單位，N／Shift+N 依步驟索引循環；切換 journey 時清除選取。

**Interface / data shape**

- geometry 新增 export：`getMarqueeSelection(frames, rect)`、`getSnapThreshold(zoom)`、`computeSnap(draggedRect, candidateRects, threshold)`、`nudgeOffset(code, shiftKey)`、`createLayoutHistory(limit)`、`computeSectionShapes(frames)`（frames 帶 `group`、`type`、畫面框與可選的 `labelY`，回傳 `[{ group, rects, path, label, memberTop }]`；`memberTop` 是最上方成員框標籤所在的 y，即其可見矩形頂端）、`getMinimapTransform(contentBounds, viewportRect, panelSize)`、`minimapPointToWorld(point, transform)`、`getAdjacentRouteId(routeIds, currentId, direction)`、`getAdjacentStepIndex(stepCount, currentIndex, direction)`；使用可見矩形的函式以 instance key 識別畫面。`resolveCanvasShortcut` 增加上述 context 欄位與字串命令。
- `commitLayoutPositions(positions, { record, lanes })`；歷史 entry `{ before, after, lanesBefore?, lanesAfter? }`（完整的已存位置 map）。
- 只供測試的 prop：`initialSelection`（instance key 陣列）。
- localStorage：`prototype-inspector:flow-minimap` 與 `prototype-inspector:flow-sections`，值為 `"shown"` 或 `"hidden"`；讀寫包在 try/catch。
- CSS：`prototype-inspector__flow-selection`（外框容器與外框）、`__flow-marquee`、`__flow-guide`、`__flow-minimap`、`__flow-sections`、`__flow-section-label`；畫面帶 `data-selected="true"`；外框、框選、參考線與小地圖帶 `data-sbfx-capture-ignore`；分區 inline fill `--pi-sys-color-surface-raised`；新 token `--pi-sys-color-annotation-touch-target`，`var(--sbt-*)` 仍只出現在 token 層。
- `bench_flow_canvas.mjs` 新增兩個情境：整組拖曳（Shift+點擊選取 3 個畫面後拖曳其中一個，計數窗口 [pointerdown, pointerup + 1000ms]），以及選取兩個畫面且小地圖顯示時的 pinch 與平移。
- layout payload、storage key 與 Static Flow 不變。

**Failure modes**

- localStorage 不可用：小地圖與分區使用預設值，不保存偏好。
- 歷史超過 100 筆：丟棄最舊的，不提示。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs`（只追加測試列）涵蓋規格中的框選相交案例與框選結果表、吸附門檻表、兩列吸附範例與左邊對齊案例、歷史序列表（含 Reset 與第 101 筆丟掉最舊的）、分區留白表、相鄰 route 循環、重複步驟的 N／Shift+N 範例表、Esc 優先順序表與按鍵路由表（含沒有選取時方向鍵與 Esc 不攔截、簡化檢視中方向鍵與 Mod+Z 回傳 `null`、macOS 的 Ctrl+Y、Cmd+ArrowRight 與 Mod+Shift+ArrowUp 回傳 `null`）。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` 斷言縮放選單含 Minimap 與 Sections 切換及 Shift+2、N 說明、單一成員的組不產生分區且 4 個 route 的組產生一個帶 inline fill 的 path、`initialSelection` 時被選取畫面帶 `data-selected` 與外框位置變數、小地圖預設顯示門檻（30、5、7 加 1）、小地圖在 viewport 內並帶 capture-ignore、參考線 token 的兩個 fallback 與隱藏的參考線元素、簡化檢視中選取 `3:review` 時只有它有外框。
- `bench_flow_canvas.mjs`（growth-fund 型 fixture）：整組拖曳（3 個畫面）放開時 layout 寫入 1 次、拖曳期間 `pi:flow:commit` 為 0、三個畫面位移相同；選取兩個畫面且小地圖顯示時，pinch 與平移期間 `pi:flow:commit` 為 0。
- `check_flow_canvas_editing.mjs`（verify 後新增，growth-fund 型、example prototype 與 viewport-overflow 型 fixture）以 spec 的數值重跑：Shift+點擊切換、Esc 清除與傳遞、框選中 Esc 還原、方向鍵範例表（含歷史為空時微調後立刻 Mod+Z、按住自動連發、間隔 600ms 為兩個動作、沒有選取時傳遞）、微調後立刻拖曳、0.5 縮放的吸附與 Ctrl 暫停、小地圖點 world (2400, 3000)、剛開啟按 N 後畫面量到較大尺寸時不重新 fit、N 依 route 順序循環、簡化檢視中 N 的範例表第 4 與第 6 列、方向鍵與 Mod+Z 傳遞、切換 journey 清除選取。
- `check_flow_canvas_comments.mjs`：整組拖曳時每個被拖畫面的釘點都跟著移動；1600、800、640px 下小地圖不與縮放群組、layout 群組及 dock 重疊。`check_flow_auto_layout.mjs` 照常通過，並涵蓋提示 Undo 與 Mod+Z 的一致。
- 手動（同一組 fixture）：分區留白不延伸到其他組；font-size 型 fixture 於 fit 與 0.2 縮放下放回原位不被吸附；小地圖點擊與拖曳正確；Reset 後 Mod+Z 還原；分區在各主題下看得出來；template 淺色主題下 1px 參考線看得見。

**Scope boundaries**

- In scope：上述能力與它們在簡化檢視中的行為、geometry 純函式與測試、bench 的兩個新情境、comments 與 auto-layout 檢查的新案例、CSS、文件（含 template `src/pages/prototypes/README.md` 的 flowGroup 說明）、template 副本同步、build tag。
- Out of scope：Non-Goals 所列項目；雙擊與 Enter 不在本 change 定義；不對 flow-canvas-navigation、flow-canvas-level-of-detail、flow-journey-focus、flow-auto-layout 或 inspector-viewport-resolution 加 MODIFIED delta。

## Risks / Trade-offs

- [方向鍵 20／100 與 Figma 的 1／10 不同] → 依實際 prototype 的格線決定，文件明確說明；常數集中在 `nudgeOffset`。
- [框選觸碰規則在低縮放時容易選到太多] → Shift+框選與 Shift+點擊可修正；完全包含模式列為後續選項。
- [Ctrl 在 macOS 上的 Ctrl+點擊是右鍵] → 只在拖曳中讀取 Ctrl；macOS 上 Ctrl+按下不開始框選。
- [參考線 token 在 template 淺色主題對比低（約 1.65:1）] → 手動檢查；需要時由專案在 sbt token 層調整。
- [分區填色對比低（約 1.05–1.2:1）] → 手動檢查各主題下看得出來；分區上的連線標籤仍有連線色邊框與文字。
- [每筆歷史存完整 map] → 100 筆 × 數十個節點的座標，記憶體量很小（估計每筆幾 KB）。
- [選取外框、框選、參考線、分區標籤與小地圖 viewport 框若從 React 的相機狀態定位，pinch 時會停在舊位置] → 全部依相機覆蓋層規則以 CSS 變數或同一個 rAF 更新；bench 量 pinch 與平移期間 commit 為 0。
- [小地圖擋住檢查腳本的取點] → bench 與 comments check 以 `elementFromPoint` 取點時避開小地圖的範圍。

## Migration Plan

純新增功能，不改資料格式。新的 localStorage 偏好鍵不存在時使用預設值。回滾 revert 本 change 即可。
