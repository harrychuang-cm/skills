## Context

UI Flow 只有一種檢視：所有 route、flow node 與 key 連線依已存或宣告的位置畫在同一張畫布。分支多的 flow 中，連線與畫面互相交錯，看不出單一功能的路徑。flow 資料（`featurePrototypeFlow.ts.template`）目前有 routes、nodes、transitions、viewport，沒有任何「功能流程」的概念；transition 有選填的 `flowLine`（key、reference、hidden）與 `kind`（primary、return、global、secondary、outcome、condition）。PRD 模板的 `## Core Journeys` 以「### Journey 1: [Name]」描述核心旅程，但不會進到 flow 資料；storybook-template example 的 PRD 只有四句編號清單。驗證器以正規表示式與括號掃描讀取 flow 檔（`extract_array_body`、`split_top_level_objects`、`extract_transition_objects` 等，掃描時不略過註解；只有 `sanitize_meta_source` 會去除註解），錯誤以 `check(..., errors)`、警告以 `warnings.append` 回報；`validate_flow(path, errors)` 不收 warnings，需要警告的檢查（例如 `validate_flow_viewport(files, errors, warnings, handoff_ready)`）在 `main()` 中各自呼叫。

前置 change 已提供：相機與 fit（rebuild-flow-canvas-camera）、依尺寸快取排版與分層渲染（add-flow-canvas-level-of-detail）、geometry 純函式模組 `flow-canvas-geometry.js`、React 模組 `flow-canvas.js` 與 `resolveCanvasShortcut`。本 change 只使用 flow-canvas-navigation 預留的擴充點，不對它加 MODIFIED delta：

- 其他 capability 宣告為唯讀的檢視中不啟動拖曳，Reset Layout 與 Import Layout 停用。
- fit 以畫布目前顯示的畫面為對象；相機只在顯示完整 flow 時寫入與還原 `prototype-inspector:flow-camera:<prototypeId>`；fit 追蹤在第一次不是由 fit 追蹤本身造成的相機變化時結束。
- route 畫面的可見矩形（visible rect）是預覽區：左右各內縮 1、從框頂往下 65 開始；flow-only node 的可見矩形是整個框。命中測試、連線錨點與 journey 置中都用可見矩形。
- 其他 capability 可為自己顯示的檢視定義連線標籤的顯示規則，取代 150px 隱藏規則。
- 螢幕座標圖層的元素一律跟隨相機 CSS 變數，或在 world 圖層 transform 的同一個 rAF 中更新。
- 其他 capability 定義的按鍵只在其處理的情境中攔截，其餘照常傳遞。

flow-canvas-level-of-detail 以畫面實例鍵（instanceKey）識別分層、提升與固定名額，尺寸快取與截圖以 route id 為鍵，被其他功能固定的畫面維持 live。

程式現況（2026-10-08 查證）：上面前兩項擴充點目前只寫在規格中。`latestRef`（命中與拖曳處理讀取的最新狀態）沒有唯讀旗標；`fitToView` 以完整 flow 的範圍計算；`settleCamera` 每次閒置都把相機寫進 `prototype-inspector:flow-camera:<prototypeId>`，卸載時也寫，掛載時以該鍵當相機初值。本 change 加上：`latestRef.isReadOnlyView`；`fitToView` 改用目前顯示的畫面的範圍（`displayedBounds`）；相機的三處寫入與讀取都只在顯示完整 flow 時進行。LOD（commit a59669f）已提供本 change 需要的介面：route card 的 `instanceKey` 與 `isAnchor`、以 instance key 為鍵的 `selectFrameTiers`、`pinnedFrameId`／`promotedFrameIds`、共用載入槽、只供測試的 `initialTiers`。

## Goals / Non-Goals

**Goals:**

- 一次只看一個功能流程，排成一條線，不再有連線重疊。
- 有宣告就用宣告的功能名稱（對應 PRD）；沒有宣告也能自動得到每條分支，一個判斷節點分出 6 條線就得到 6 條單線流程。
- 簡化檢視不影響已存版面與 Static Flow。

**Non-Goals:**

- journeys 匯出到 flow.json、簡化檢視中編輯或儲存位置、每條流程自訂排版、自動改寫既有 prototype。
- 編輯工具與互動模式在簡化檢視中的行為（分別由 add-flow-canvas-editing-tools 與 add-flow-frame-interact-mode 定義）。

## Decisions

### journeys 宣告對應 PRD 的 Core Journeys

flow 模板新增型別 `__FEATURE_PASCAL__Journey = { id: string; title: string; description?: string; steps: __FEATURE_PASCAL__FlowTargetId[] }` 與匯出 `__FEATURE_CAMEL__Journeys: __FEATURE_PASCAL__Journey[] = [] satisfies __FEATURE_PASCAL__Journey[]`，`__FEATURE_CAMEL__Flow` 加上 `journeys`。匯出值保持字面上的 `[]`，用法範例寫在 `__FEATURE_PASCAL__Journey` 型別的 JSDoc 中，陣列括號內不得有註解：驗證器的括號掃描不略過註解，括號內被註解掉的物件會被當成 journey（新 scaffold 只有入口 route，範例步驟會變成 unknown step 錯誤），含撇號的註解則讓 `scan_matching_bracket` 把撇號當成字串開頭，整個陣列解析成空的。步驟可以是 route 或 flow node（例如判斷節點），以呈現條件分岔點；同一步可以重複出現（流程中回到前一頁）。

驗證器新增獨立函式 `validate_flow_journeys(files, errors, warnings)`，在 `main()` 中緊接 `validate_flow_viewport` 加一行呼叫：以 `sanitize_meta_source(text)` 去除註解後，再以 `extract_array_body(…, "Journeys")` 與 `split_top_level_objects` 解析。步驟的合法集合是 `extract_object_array_ids(text, "Routes") + extract_object_array_ids(text, "FlowNodes")`，也就是 Inspector 實際渲染的 `flow.routes[].id` 與 `flow.nodes[].id`。transition 檢查用的 `extract_flow_screen_ids` 不適用：它也接受只存在於 `*RouteIds` 的導覽 id（例如 cm-chipK font-size 的 `font-size`），這種步驟會通過驗證，卻在 Inspector 被略過。journey id 與 route id 一樣須符合 `[a-z0-9][a-z0-9-]*`。

storybook-product-prototype 的 Step 4 改為：PRD 每個 Core Journey（`### Journey N: <Name>`）對應一筆 journey，id 用 kebab-case、title 用旅程名稱。storybook-template example 示範這個對應：PRD 的 `## Core Journeys` 改為 `### Journey 1: Approve a request` 與 `### Journey 2: Request changes`；flow 宣告 `approve-request`「Approve a request」（主要路徑：intake、review、approval-decision、handoff）與 `request-changes`「Request changes」（退回修改：intake、review、approval-decision、review，示範重複步驟）。example 的 `ExamplePrototypeJourney` 型別把 `steps` 定為 `readonly ExamplePrototypeFlowTargetId[]`，兩條以 `as const satisfies readonly ExamplePrototypeJourney[]` 宣告，打錯步驟 id 時 `npm run typecheck` 會失敗；example 缺 `PRODUCTION_HANDOFF.md`，無法用驗證器檢查。替代方案「用 flowGroup 當功能」被否決：flowGroup 是版面分組（11 個實際 prototype 共 48 組，其中 23 組只有一個成員，實測），不代表有順序的路徑。

### 沒有宣告時從分支自動推導

`deriveBranchJourneys(flow, { limit: 24 })` 為 geometry 中的純函式，以 `normalizeJourneys(flow)` 的宣告做省略比對。每條分支出邊推導一條短流程，條數等於分支出邊數，不會組合爆炸：

- 圖：節點依序為 `flow.routes`、`flow.nodes`；合格邊是兩端都是節點、flowLine 為 key 或 reference、kind 不是 return 或 global 的 transition。納入 reference 是因為作者常把次要分支標成 reference（example 的「Needs changes」）；排除 return 與 global 是因為它們代表返回與全域導覽，會讓每條路徑都繞回入口。
- 分支點：合格邊通往至少兩個不同節點。匯合點：至少兩個不同節點有合格邊進來。入口：第一個 route，加上依節點順序的其他沒有合格入邊的節點，各一次。
- 每個分支點（依節點順序）的每個不同目的地（依第一條 transition 的宣告順序）各推導一條 journey；同起訖的平行 transition 合併為一條，標籤去重後以「 / 」串接。
- 前文：從所有入口依序出發、依 transition 宣告順序走合格邊做廣度優先搜尋，每個節點記下第一次抵達它的前一個節點；取分支點之前的最多兩個節點。分支點本身是入口或無法抵達時沒有前文。
- 走訪：分支點之後接目的地，再沿「合格邊只通往一個節點」的畫面往下走。加入分支點、目的地以外的匯合點或沒有合格出邊的節點後停止；下一步已在步驟中時，停止並把它記為 loop target。在匯合點停止，讓兩條分支共用的後段只在下一個分支點的前文出現一次。
- 命名：「標籤 · 目的畫面標題」，目的地就是 loop target 時標題前加「↩ 」；同一分支點下名稱相同時各自加「 (<目的地 id>)」。清單依分支點標題分組，不同分支點之間的同名不會混淆。
- 識別鍵：`derived:<分支點 id>:<目的地 id>`。同一分支點的目的地互不相同，鍵必定唯一；上游改動只會改變前文，鍵不變，重新掛載時仍能還原到同一條。
- 少於兩步的推導（只有「分支點本身是入口、出邊又回到自己」時才會發生）直接丟棄；步驟加上 loop target 後與某條宣告完全相同的推導不列出，所以 example 的兩條推導都被宣告涵蓋。
- 保留前 24 條；`truncatedCount` 為剩餘條數減 24（最小 0），由推導結果直接計算，不列舉路徑。

2026-10-02 以 11 個實際 prototype 的 flow（storybook-template example，以及 cm-linepay、cm-chipK 等外部專案的 flow 檔以 esbuild 打包後在記憶體中執行，不寫回任何檔案）實測：growth-fund 17 條（7 個分支點、最長 7 步、`truncatedCount` 0、同組名稱不重複）、inventory 8 條、purchase 7 條、example 2 條（步驟與名稱同規格範例），3 個沒有分支點的 prototype 為 0 條。

替代方案：

- 「從入口列出不重複經過同一步的每一條完整路徑，保留前 24 條」被否決：growth-fund 產生 240 條 17–28 步的路徑（144 種步驟序列），前 24 條全部來自第一個入口；4 個 prototype 出現只有一步的路徑；要報出未列出的條數就得列舉所有路徑（實測）。
- 「只用 key 連線推導」被否決：example 的「Needs changes」分支被排除、只剩 1 條；growth-fund 仍是 8 條 26–28 步的路徑（實測）。
- 「前文從最近的入口或上一個分支點起算、遇匯合點不停」被否決：growth-fund 最長 17 步、value-account 11 步，會換成多列，不再是一條線（實測）。

### 簡化排版即時計算、不寫入 layout

`computeJourneyLayout(steps, sizeOf)` 為純函式。`sizeOf(nodeId)` 固定回傳 `{ width, height, visibleTop, visibleHeight }`（框尺寸，以及可見矩形相對框頂的上緣與高度；add-flow-auto-layout 共用同一形狀），另可加上 `visibleLeft` 與 `visibleWidth`（預設 0 與框寬；route 為 1 與預覽寬，讓連線接在可見矩形的左右緣）：route 由尺寸快取的預覽尺寸換算成框（寬 + 2、高 + 64 + 2），可見矩形依 flow-canvas-navigation 的定義；flow-only node 的可見矩形是整個框。每列最多 8 步，相鄰框的水平間距 160 world px，每列從 x 0 開始；每一步的可見矩形垂直置中在該列中線上，中線位於列頂往下「該列各步從框頂到可見矩形垂直中心的最大距離」處；第一列列頂為 y 0，之後每列列頂是上一列最低的框底再往下 240。以 377×878 的手機 route 與 220×220 的判斷節點為例，中線在 y 471，判斷節點放在 y 361，連線是一條水平直線；若改以框置中，route 的預覽中心會比判斷節點低 32。

畫面以「步驟實例」渲染，同一 route 出現兩次就有兩個實例。每個實例以 `instanceKey = "<stepIndex>:<nodeId>"` 識別（stepIndex 從 0 起算；完整 flow 中 instanceKey 等於 node id），例如 `request-changes` 為 `0:intake`、`1:review`、`2:approval-decision`、`3:review`。React key、傳給 `selectFrameTiers` 的 frames（帶 `key` 與 route id）、hover、提升與固定名額、選取、畫面導覽與命中測試都以 instanceKey 為鍵；`pinnedId`、`promotedIds`、`pinnedFrameId`、`promotedFrameIds` 沿用原名，內容是 instanceKey。尺寸快取與截圖仍以 route id 為鍵，同一 route 的兩個實例共用尺寸與截圖。進入簡化檢視與切換清單項目時清除選取。

排版結果只存在記憶體。8 步的手機畫面排成一列寬 4,136 world px（估計，以 375×812 預覽計算）；在 1440 寬的分頁、清單展開 240px 時（畫布 viewport 約 1200×900），fit 約 25% 縮放、畫面約 93px 寬（估計）。fit 的範圍是該 journey 的框，有 loop 標記時把標記當成從錨點起 160 world px 長的水平線段，所以範圍延伸到最後一個框之後 320 world px，標記在 fit 後不會被切掉。選取 journey、或在選取 journey 的狀態下重新掛載 UI Flow 時，相機 fit 該 journey 並像首次開啟一樣維持 fit 追蹤；Fit canvas 與 Shift+1 也 fit 該 journey。簡化檢視的相機不寫入 `prototype-inspector:flow-camera:<prototypeId>`，該鍵只保存完整 flow 的相機；回到「全部」時從記憶體恢復完整畫布相機，重新掛載後記憶體沒有時從該鍵讀取，兩者都沒有時 fit 完整 flow。簡化檢視中停用拖曳、Reset 與 Import，避免使用者以為在編輯真正的版面；Export 仍匯出完整版面。

### 簡化檢視只畫相鄰步驟的連線

`getJourneyEdges(layout, transitions, { loopTarget, titleOf })`（`titleOf(nodeId)` 提供 loop 標記的標題；layout 為 `computeJourneyLayout` 的輸出，每個步驟實例的 `{ instanceKey, stepIndex, nodeId, x, y, width, height }`）只產生相鄰步驟之間的邊，錨點取可見矩形：同列為水平直線（前一步右中點到後一步左中點）；換列時從上一列最後一步右中點向右 80、向下到兩列空隙的中線、向左到 x −80、向下到下一列中線，再向右接入第一步左中點。有 transition 的連線（不論 flowLine 與 kind）沿用完整畫布的虛線樣式、動畫規則與標籤文字，顏色一律用 primary（`--pi-sys-color-annotation-flow`；只出現在 reference transition 的邊，在完整 flow 中沒有顏色可以沿用）：任一 transition 的 kind 為 condition 時前綴「條件」，否則「點擊」（同 `getEdgeLabelPrefix`），後接去重後以「 / 」串接的標籤（同 `aggregateTransitions`）。沒有 transition 時（宣告的 journey 可能跳步）畫靜態點線：outline 色、無動畫、無標籤，與一般連線一眼可分。推導的 journey 有 loop target 時，在最後一步的框右側 160 world px、該列中線上放「↩ <loop target 標題>」標記，並以「最後一步到 loop target」的連線樣式與標籤接上；標記不計入每列 8 步。

標籤與 loop 標記畫在螢幕座標圖層，固定 12px，跟隨相機 CSS 變數。簡化檢視不套用 flow-canvas-navigation「畫面窄於 150px 時隱藏標籤」的規則：8 步一列 fit 時畫面只有約 93px（估計），套用就看不到任何標籤。同列標籤置中在兩框之間的空隙，以省略號截斷到該空隙的螢幕寬度，所以不會蓋到畫面；換列連線的標籤放在兩列空隙的水平段上；可用寬度窄於 24px 才隱藏；hover 連線或標籤時顯示全文（CSS）。截斷寬度以 `calc(<空隙世界寬度> * var(--prototype-flow-camera-zoom) * 1px)` 隨相機變化，手勢中不需要 commit；是否隱藏由純函式 `isJourneyLabelHidden(availableWorldWidth, zoom)`（`availableWorldWidth × zoom < 24`）在 render 中以閒置時的相機快照推導。選取中的清單項目列出步驟與相鄰兩步的標籤，作為截斷時的完整說明。不使用完整畫布的繞線與標籤避讓，因為一條線上不會有交錯。

### 清單狀態存在 sessionStorage

清單是 UI Flow 分頁左側的一欄，與畫布 viewport 並排而不覆蓋：展開 240px（`calc(var(--pi-ref-size-80) * 3)`，token 層沒有 240）、收合 40px（`var(--pi-ref-size-40)`，只留展開鈕）。清單是 flow 根節點的第一個子元素；根節點帶 `data-journey-list="expanded|collapsed"`，以 CSS 變數 `--prototype-flow-journey-list-width` 讓 viewport 與控制圖層（縮放群組、layout 群組、提示）都從清單右緣開始，否則 figma-export 工作區開啟時移到左上的縮放群組與左下的 layout 群組會蓋住清單。fit、分層剔除、小地圖與控制列都以這個 viewport 計算；展開或收合等同 viewport 尺寸改變，沿用既有的 resize 處理（fit 追蹤中會重新 fit）。清單在攔截滾輪的 viewport 之外：沒有修飾鍵的滾輪捲動清單、不移動相機；根節點的 wheel listener 對 ctrl／meta／alt 滾輪一律縮放畫布，所以在清單上 pinch 仍縮放畫布、不會縮放頁面。清單帶 `data-sbfx-capture-ignore`，留言截圖不拍清單；清單不得帶 `data-sbfx-comments="unavailable"`：addon 只要目標包含這個屬性就停用整個 story 的留言。只有「全部」一項時不渲染清單。項目依序為「全部」、宣告的 journeys（顯示步數）、「自動分支」區段（依分支點標題分組，至少保留一條推導才顯示；`truncatedCount` 大於 0 時顯示「另有 N 條未列出，建議在 flow 宣告 journeys」）。選取中的項目展開列出步驟與相鄰兩步的連線標籤。收合狀態只存在記憶體，掛載時展開。

無障礙與樣式：清單是 region，名稱 `UI Flow journeys`；每個項目是 button，選取者 `aria-pressed="true"`，長標題以省略號截斷、完整標題作為無障礙名稱；「全部」的無障礙名稱是 `All`（「完整標題作為無障礙名稱」與「無障礙名稱用英文」只對這一項衝突，以英文為準）；收合鈕名稱為 `Collapse journey list` 或 `Expand journey list`，並帶 `aria-expanded`；字級至少 12px，只使用既有 `--pi-*` token。可見文字用繁體中文，無障礙名稱用英文，與其他 UI Flow 控制項（`Zoom in`、`Reset UI Flow layout` 等）一致。

選擇存在 `prototype-inspector:flow-journey:<prototypeId>`：值為 `"all"`、`"declared:<journey id>"` 或推導的識別鍵 `"derived:<分支點 id>:<目的地 id>"`；此值也是清單項目的 React key 與 `data-journey-focus` 的值；flow 變動後找不到就回到「全部」。切換項目時：取消進行中的畫面拖曳（同 Esc）、清除 hover 與 hover 停留、清除 LOD 的固定與提升名額、關閉 Reset 對話框，再依序執行切換前 hook（`beforeJourneySwitchRef`；本 change 只放上述動作，add-flow-canvas-editing-tools 加入清除選取，add-flow-frame-interact-mode 加入結束互動）。`[`／`]`（`BracketLeft`／`BracketRight`）只在沒有修飾鍵時切換上一個與下一個項目並在兩端循環（Cmd+[／Cmd+] 是瀏覽器上一頁、下一頁，一律傳遞）；Storybook 預設沒有綁定這兩個鍵，兩個 code 也不在控制項按鍵清單內，所以焦點在清單按鈕上時仍有效。`resolveCanvasShortcut` 維持回傳字串命令，新增 `previous-journey` 與 `next-journey`，context 新增 `journeyEntryCount`（預設為 0），只在 `journeyEntryCount > 1`（清單有渲染）時回傳這兩個命令，否則按鍵照常傳給 Storybook。縮放選單的手勢與快捷鍵說明加一列「[ / ]　切換功能流程」，只在清單有渲染時顯示。

### 簡化檢視中的留言錨點

addon 以 DOM 屬性找錨點，只取第一個符合者，所以簡化檢視中：

- 同一個 route 或節點，只有檢視順序中的第一個實例帶 `data-sbfx-anchor`、`-label`、`-route`（add-flow-canvas-comments 的規則，該 change 把驗證延到本 change）。
- journey 連線只在第一個有 transition 的位置帶 `edge:<from>-><to>`、`data-sbfx-anchor-kind="path"` 與名稱；點線與連線的 hover 命中區不帶錨點。
- 畫布宣告依 add-flow-canvas-comments 修改後的規則：viewport 保留 `data-sbfx-canvas`（留言截圖仍是「畫布加框內頁面」、釘點仍被 viewport 裁切、工作區開啟時不縮放 Story root），world 圖層不帶 `data-sbfx-canvas-world`。所以簡化檢視中空白處的留言沒有畫布錨點，已存的畫布錨點留言在此檢視中隱藏釘點。
- `sbfx:reveal-anchor`：元素錨點對準它的第一個實例；連線錨點讓該 journey 連線的兩端實例都進入畫面；畫布錨點與不在此檢視中的錨點不處理，也不呼叫 `preventDefault`，事件照常往上傳。

### 簡化檢視中暫停整體版面操作

簡化檢視是 flow-canvas-navigation 所說的唯讀檢視：`handleFramePointerDown` 在 `setPointerCapture` 與 `preventDefault` 之前就返回，所以按下畫面後移動也不會開始拖曳（平移與點擊照常）；Reset 的停用條件改為「沒有自訂版面或在唯讀檢視」，Import 在唯讀檢視停用，開啟它們的函式也檢查唯讀；進入簡化檢視時關閉 Reset 對話框。提示「簡化檢視：位置不會儲存」放在畫布上方置中，避開縮放群組與留言切換鈕；Export 仍匯出完整版面。選取、框選、小地圖與 N／Shift+N 在簡化檢視中的行為由 add-flow-canvas-editing-tools 定義（小地圖位於 viewport 左下角、清單右側）；互動模式在簡化檢視中的行為（以步驟實例進入、切換清單項目前先結束互動）由 add-flow-frame-interact-mode 定義。

## Implementation Contract

**Behavior**

- 左側並排的清單列出「全部」、宣告的功能流程與依分支點分組的自動分支；點選後畫布只顯示該流程，排成一列、超過 8 步換行，連線不交錯。
- 回到「全部」恢復原本的畫布與相機；簡化檢視不會改到已存版面。
- 驗證器檢查 journeys 宣告。

**Interface / data shape**

- flow 模板：`__FEATURE_PASCAL__Journey` 型別（JSDoc 含用法範例）、`__FEATURE_CAMEL__Journeys` 匯出（字面 `[]`）、`__FEATURE_CAMEL__Flow.journeys`。
- geometry export：
  - `normalizeJourneys(flow)`：回傳宣告的 journeys，略過不存在的步驟並 `console.warn`；略過後少於兩步的 journey 省略；id 重複時保留第一筆、略過後面的並 `console.warn`。
  - `deriveBranchJourneys(flow, { limit: 24 })`：回傳 `{ journeys: Array<{ key, branchId, title, steps, loopTarget? }>, truncatedCount }`，`key` 為 `derived:<branchId>:<目的地 id>`。
  - `computeJourneyLayout(steps, sizeOf)`：回傳每個步驟實例的 `{ instanceKey, stepIndex, nodeId, x, y, width, height }`。
  - `computeJourneyLayout` 的 `sizeOf(nodeId)` 回傳 `{ width, height, visibleTop, visibleHeight }`，可選 `visibleLeft`、`visibleWidth`；每個實例另帶 `row` 與可見矩形欄位。
  - `getJourneyEdges(layout, transitions, { loopTarget, titleOf })`：回傳 `{ edges, loopMarker }`；每條 edge 含兩端 instanceKey 與 node id、折線點、標籤文字、可用標籤寬度（世界座標）與是否為點線，`loopMarker` 為 `{ x, y, label }` 或 `null`。
  - `isJourneyLabelHidden(availableWorldWidth, zoom)`：可用寬度在螢幕上窄於 24px 時為 true。
  - `getJourneyBounds(layout, { loopMarker })`：fit 用的世界座標範圍。
  - `resolveCanvasShortcut` 新命令 `previous-journey`、`next-journey`，context 新增 `journeyEntryCount`。
- sessionStorage：`prototype-inspector:flow-journey:<prototypeId>`，值格式如上；相機鍵 `prototype-inspector:flow-camera:<prototypeId>` 只保存完整 flow 的相機。
- DOM：清單 class `prototype-inspector__flow-journeys`（region `UI Flow journeys`，帶 `data-sbfx-capture-ignore`），根節點帶 `data-journey-list="expanded|collapsed"` 與 CSS 變數 `--prototype-flow-journey-list-width`，簡化檢視時帶 `data-journey-focus="<entry key>"`；提示元素 class `prototype-inspector__flow-journey-notice`。
- 內部 hook：`beforeJourneySwitchRef`（切換前依序執行的函式清單）；`latestRef.isReadOnlyView`。
- bench：`bench_flow_canvas.mjs --journey <entry key>` 在開啟 UI Flow 前把選取寫進 sessionStorage，量簡化檢視的手勢與開啟時的 layout 寫入。
- 驗證器：`validate_flow_journeys(files, errors, warnings)`；錯誤訊息 `journey '<id>' references unknown step '<step>'`、`journey id '<id>' must be lowercase kebab-case`、`journey id '<id>' is duplicated`、`journey '<id>' needs at least two steps`；警告訊息 `journey '<id>' has no transition from '<a>' to '<b>'`。

**Failure modes**

- 推導超過 24 條：只列前 24 條，並顯示未列出的確切數量與宣告建議。
- 宣告的步驟 id 不存在（未通過驗證就開啟）：Inspector 略過該步並在 `console.warn` 提示，其餘步驟照常顯示。
- sessionStorage 不可用：每次開啟都從「全部」開始。
- 儲存的項目在 flow 改動後不存在：回到「全部」。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs` 涵蓋規格中的推導範例（example 與宣告省略、六分支、三段串接、平行與回頭邊、孤立畫面、30 條扇出的截斷數）、growth-fund 形狀的合成 fixture、三步排版座標（判斷節點在 (537, 361)）、換列表、request-changes 的 instanceKey、標籤前綴與串接、點線情況，以及 `isJourneyLabelHidden` 的規格範例（取代無法在 SSR 量的「zoom 0.34 時標籤可見」）。
- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過，並涵蓋驗證器範例表的八種宣告、journeys 陣列內註解的兩個解析案例，以及 scaffold 出的 flow 解析出 0 筆 journey。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs`（vm context 中的 `window.sessionStorage` stub 提供選取）斷言清單項目順序、步數與分組、region 與 button 的無障礙屬性、只有「全部」時不渲染清單、簡化檢視只渲染該流程的步驟實例（request-changes 為 4 個實例、鍵互不相同）、只有一個 `route:review` 錨點、viewport 帶 `data-sbfx-canvas` 而沒有 `data-sbfx-canvas-world`、Reset 與 Import 為 disabled 並出現提示、縮放選單列出 `[` 與 `]`。
- 手動：storybook-template example prototype 宣告兩條 journeys 後，清單只顯示「全部」與兩條宣告（各 4 步），沒有「自動分支」區段（兩條推導都被宣告涵蓋）；暫時移除 journeys 後，「自動分支」在「Ready for handoff?」之下列出「Approved · Implementation Handoff」與「Needs changes · ↩ Review Request」，選取後者時最後出現「↩ Review Request」標記；回到「全部」後拖曳位置與相機都與先前相同。

**Scope boundaries**

- In scope：flow 模板與 example 的 journeys（含 example 的 `docs/PRD.md` 與 `docs/FLOW_SPEC.md`）、驗證器檢查、推導與排版純函式、清單與簡化檢視、縮放選單的 `[`／`]` 說明、文件、template 副本同步、build tag。
- Out of scope：Non-Goals 所列項目；編輯工具在簡化檢視中的行為由 add-flow-canvas-editing-tools 定義；互動模式在簡化檢視中的行為由 add-flow-frame-interact-mode 定義。

## Risks / Trade-offs

- [推導名稱在不同分支點之間可能重複] → 清單依分支點標題分組，同組重名時加目的地 id；需要功能層級的命名時改用宣告的 journeys，文件建議由 PRD 的 Core Journeys 產生。
- [納入 reference 連線可能出現作者不想看的次要分支] → 推導放在「自動分支」區段，與宣告的功能流程分開；被宣告涵蓋的分支不列出。
- [前文只取兩步，看不到深處分支的完整來路] → 前文只用來定位分支；要看完整路徑就宣告 journey。growth-fund 最長 7 步（實測）。
- [8 步一列在極長流程中會換很多列] → 列距固定、連線沿空隙轉折，不會交錯；長流程建議拆成多條 journeys。
- [每次切換都會 remount 畫面（簡化檢視的實例鍵與完整 flow 不同）] → 有 LOD 時先顯示快取截圖再依分層載入；剛切換時，載入中的畫面在連線或畫布留言的截圖中可能是空白，列為已知限制。
- [清單展開佔 240px] → viewport 變窄，example 與 growth-fund 的 bench 數字跟著變，回歸時以本 change 之後的數字為準。
- [簡化檢視中空白處留言沒有畫布錨點] → 依使用者決定只拿掉 world 宣告；要留言在特定畫面上就點在畫面或連線上，文件註明。

## Migration Plan

journeys 為選用欄位，既有 flow 不需修改；自動分支照常可用。新 scaffold 的 flow 會帶字面 `[]` 的 journeys，範例在型別 JSDoc。journeys 位於 Flow 檔：已有 `docs/HANDOFF_MANIFEST.json` 的 prototype 新增或修改 journeys 會改變 artifactsDigest，`--verify-manifest` 會回報 drift；journeys 只供審閱、不影響 production，demo 確認後以 `python3 <skill-root>/scripts/validate_prototype.py <folder> --handoff-ready --changelog "review-only: journeys"` 重新發布 manifest。回滾 revert 本 change 即可。
