## Context

前置 change 都已實作並 commit（未歸檔）：rebuild-flow-canvas-camera 與 add-flow-canvas-comments（`e040d7d`）、add-flow-canvas-level-of-detail（`a59669f`）、add-flow-journey-focus（`476f381`）、add-flow-auto-layout（`d6020a8`）、add-flow-canvas-editing-tools（`abb6add`）。UI Flow 現有：

- rebuild-flow-canvas-camera：相機與 document 層快捷鍵 dispatcher。`resolveCanvasShortcut` 的 context 含 `targetIsControl` 與 `overlayOpen`：焦點在控制項上時 Space、Enter 與方向鍵交給該控制項，Esc 先關閉縮放選單或對話框。fit 追蹤在第一次不是由 fit 本身造成的相機變更時結束，包含其他畫布功能要求的程式化相機移動。
- add-flow-canvas-level-of-detail（程式中以 `levelOfDetailRef.current` 提供 `setPinnedFrameId`、`interactedFrameIds`、`measurementSuspendedFrameIds`；`pickLoadingFrame` 讓固定畫面排在載入順序第一；live iframe 的 src 由 route card 的 `previewSource` prop 逐實例決定）：分層的 `pinnedFrameId` 固定名額（被其他畫布功能固定的畫面不論螢幕寬度、可見比例或是否被剔除都維持 live）、「已互動」標記、量測暫停 hook（其他畫布功能暫停某畫面的量測時，量測不寫尺寸快取，也不寫持久化的尺寸或截圖紀錄）、每次文件載入後建立並在重新載入或移除前釋放的量測 observer，以及非互動 iframe 一律 `inert`／`tabindex="-1"`／`aria-hidden`／`pointer-events: none`。
- add-flow-journey-focus：簡化檢視以步驟實例渲染畫面，實例鍵 `instanceKey = "<stepIndex>:<nodeId>"`（完整 flow 中等於 node id）；分層、選取、命中判定與固定名額都使用實例鍵，尺寸快取與截圖仍以 route id 為鍵。
- add-flow-canvas-editing-tools：選取（含 Enter 可用的單一選取狀態）、框選，以及 Esc「關閉選單或對話框 > 取消拖曳 > 取消框選 > 清除選取」的順序；`resolveCanvasShortcut` 的 context 已有 `selectionSize`、`selectedRouteCount`、`marqueeActive`、`journeyFocus`，輸入法組字（`isComposing` 或 `keyCode` 229）在第一個檢查就回傳 `null`；小地圖的 pointerdown 會 `stopPropagation`，不會傳到 viewport。
- add-flow-canvas-comments：「Comment capture takes precedence over frame interaction」——`html[data-sbfx-capture-mode="true"]` 時框內 iframe 的 `pointer-events` 為 none（CSS 規則 specificity (0,3,2)），擷取模式中不進入互動，已在互動中的畫面在擷取期間不接收指標、結束後恢復。figma-export addon 在 document capture 階段吞掉擷取時雙擊產生的點擊序列。
- add-flow-auto-layout：Auto Layout 與其提示；world 圖層的 z-index 依序為基本 3、選取 4、拖曳中 6（本 change 加入互動中 5）。

prototype 端現況：

- React 模板 `FeaturePrototype.tsx.template`、Vue 模板與 storybook-template 的 `ExamplePrototype.tsx` 都以 `visibleRoute = previewRoute ?? routeId` 決定畫面，`goTo()` 在有 `prototypeRoute` 時不做事；根元素 `<main data-prototype-root data-route={visibleRoute}>`，`prototypeFlowPreview=true` 或 `isFlowPreview` 時隱藏 chrome。
- `validate_prototype.py` 以字串檢查 `prototypeFlowPreview`、`prototypeRoute`、`data-prototype-root`、`data-prototype-route-preview`（錯誤等級），另有 `warnings.append` 的警告機制；`--strict-style` 會把所有警告升為錯誤（`errors.extend(warnings)`）。
- scaffold 出來的 prototype 只有一個 route（flow 模板的 `__FEATURE_CAMEL__RouteIds` 只有 `__ENTRY_ROUTE_ID__`），flow preview 下 chrome 的 route 導覽被隱藏，React 模板 `RoutePanel` 與 Vue 模板內容區唯一的按鈕（Retry）都沒有處理函式，所以 scaffold 結果在執行期沒有可換頁的控制項；可實際換頁的是 storybook-template example 的「Submit intake」（`goTo("review")`）。
- 外部 prototype 行為不一：cm-linepay growth-fund 在 `prototypeRoute` 或 `prototypeFlowPreview` 存在時所有狀態都不可變；cm-chipK font-size 只把 route 當初始值且 `data-route` 存的是 3 個導覽 id，而 flow 用的是 6 個狀態 id。

Storybook 端：聚焦在巢狀 iframe 時，外層 preview 收不到 keydown 與 wheel；巢狀 iframe 的 channel 事件會送到外層 preview，所以不得呼叫它的 `channel.emit`。

## Goals / Non-Goals

**Goals:**

- 在 UI Flow 中直接操作單一畫面（含簡化檢視中的單一步驟實例），且不破壞畫布的縮放、平移與快捷鍵。
- 支援新契約的 prototype 可以在畫面內換頁；不支援的 prototype 仍可捲動與操作畫面內容。
- 結束互動後畫面回到原本的 route，截圖與尺寸快取不被互動狀態汙染。

**Non-Goals:**

- 修改外部專案的 prototype、同步工具列 theme／args、錄製互動、flow-only node 或 Static Flow 的互動。

## Decisions

### 以 opt-in 參數解除 route 鎖定

新增 query 參數 `prototypeFlowInteractive=true`。模板的邏輯改為：`isInteractivePreview` 為真時，初始 route 仍取 `prototypeRoute`，但畫面改用元件狀態（`visibleRoute = isInteractivePreview ? routeId : previewRoute ?? routeId`），`goTo()` 在互動預覽時照常改變狀態。互動網址同時保留 `prototypeFlowPreview=true`，因此 flow-preview-chrome 的隱藏規則不變。根元素加上 `data-prototype-interactive="true"`，`data-route` 正式成為「目前 route」的契約。替代方案「用 Storybook URL `args=initialRouteId:<id>` 不帶 `prototypeRoute`」被否決：只適用於 story 有 `initialRouteId` arg 的模板式 prototype，而且沒有 `prototypeFlowPreview` 時 chrome 會出現、畫面尺寸改變。替代方案「直接移除 `pointer-events: none`」被否決：模板會鎖住 route，growth-fund 會讓所有狀態不可變，行為不可預期。驗證器只發警告（與其他驗證器警告相同，只有 --strict-style 會升為錯誤），因為互動模式是審閱便利功能，不影響交付。執行期換頁以 storybook-template example 驗證；React 與 Vue scaffold 以 smoke test 的契約斷言驗證（scaffold 沒有可換頁的控制項，repo 也沒有可執行的 Vue Storybook）。

### 互動畫面使用保留的固定名額

進入互動時把畫面的實例鍵設為 `pinnedFrameId`，不占用 6 個 live 名額。add-flow-canvas-level-of-detail 規定被其他畫布功能固定的畫面在固定期間一律維持 live，不論螢幕寬度、可見比例或是否被剔除，所以互動中縮小畫布或把畫面平移出視窗都不會移除它的 iframe。已是 live 的畫面也會以互動網址重新載入（網址不同才能解除鎖定）；進入與離開時的重新載入在 LOD 唯一的 iframe 載入名額空出時優先取得，排在等待中的 live 畫面之前。LOD 在每次文件載入後建立量測 observer、在重新載入或移除前釋放，所以進出互動的重新載入不會留下舊視窗的 observer。互動期間 Inspector 透過 LOD 的量測暫停 hook（把實例鍵加入 `measurementSuspendedFrameIds`）停止該畫面的尺寸寫入（不寫尺寸快取，也不寫 IndexedDB 的尺寸或截圖紀錄）：畫面框維持進入前的尺寸，prototype 在畫面內換到較高的 route 時內容在畫面內捲動，畫面、連線、簡化排版與吸附候選都不會跳動，同一 route 的其他步驟實例（共用以 route id 為鍵的尺寸）也不受影響；畫面重新載入一般預覽網址並完成渲染，或 iframe 被移除後才恢復量測。進入時單選該畫面；畫面太小（W < 300px）或部分在視窗外時以 fit 規則縮放到該畫面（上限 1），否則不移動相機。這個縮放是其他畫布功能要求的程式化相機移動，依 rebuild-flow-canvas-camera 的規則會結束開啟時的 fit 追蹤，之後其他畫面的尺寸變化不會把相機拉回整個 flow。進入互動時一律結束開啟時的 fit 追蹤，即使相機沒有移動（指南 3.5：否則之後的量測或 dock 變化會重新 fit 整個 flow，把互動中的畫面移走）。外框與標示畫在覆蓋層，與其他螢幕座標元素一樣以相機 CSS 變數定位，拖曳時跟著畫面移動（沿用拖曳的 DOM 寫入）；兩者 `pointer-events: none`、帶 `data-sbfx-capture-ignore`，標示的可見文字是中文、無障礙名稱是英文（例如 `aria-label="Interacting with <route title>; press Escape to exit"`）；顏色用 `--pi-sys-color-success`，與選取色（primary）區分，不需新 token。互動中的畫面 z-index 為 5（選取 4 與拖曳中 6 之間），只改 z-index、不重排 DOM，因為 live iframe 換了父節點就會重新載入。Static Flow story（`flowExportStoryId` 等於目前 story）中每個 route iframe 載入的是整份 flow export，不提供互動，判斷方式與 LOD 停用截圖相同。prototype 改變、或互動中實例的 key 不在目前顯示的實例集合中時，重設互動（等同結束、且畫面被降級）。

### 簡化檢視中只讓一個步驟實例互動

add-flow-journey-focus 的簡化檢視以步驟實例渲染畫面，實例鍵為 `"<stepIndex>:<nodeId>"`，例如步驟 intake、review、approval-decision、review 對應 `0:intake`、`1:review`、`2:approval-decision`、`3:review`。雙擊或 Enter 進入互動時，`pinnedFrameId` 存的是被雙擊（或被單選）的實例鍵，所以同一 route 出現兩次時只有該實例互動，另一個實例維持 inert 與原本的分層；flow node 步驟沒有 iframe，不會進入。在功能流程清單切換項目（點選、`[`、`]`，含「全部」）時，Inspector 先結束互動、移除畫面視窗上的監聽，再切換檢視；實例鍵不在新檢視中的畫面視為解除固定時被降級，直接移除 iframe，不重新載入、不用來更新截圖。焦點在互動畫面內時 `[`、`]` 交給 prototype，只有焦點在畫面外（例如以 Tab 移到清單）時才由畫布處理。只點清單而沒有改變選取的項目（例如收合或捲動清單）不會結束互動。替代方案「切換時保留互動，讓固定名額跟著畫面移到新檢視」被否決：新檢視不一定有這個實例，固定名額會指向不存在的畫面，contentWindow 上的監聽也會留在被移除的 iframe 上。

### 擷取模式優先於畫面互動

依 add-flow-canvas-comments 的規則：進入互動前檢查 `document.documentElement.dataset.sbfxCaptureMode`，為 `"true"` 時不進入；互動中的 iframe 由 `.prototype-inspector__flow-frame[data-interacting="true"] .prototype-inspector__flow-frame-preview iframe` 取得 `pointer-events: auto`，這條規則的 specificity 高於基本規則 `.prototype-inspector__flow-frame-preview iframe`（(0,1,1)）、低於擷取規則（(0,3,2)），並寫在擷取規則之前，所以擷取開始時互動中的畫面自動停止接收指標、擷取結束後恢復。任何程式都不以 inline style 設定 pointer-events。雙擊以畫面元素上的原生 `dblclick` 處理，不掛在 document 的 capture 階段，addon 在擷取時吞掉的點擊序列因此不會進入互動。`check_flow_canvas_comments.mjs` 以真實的互動畫面（不是合成 CSS 規則）驗證擷取時按壓錨定到該 route、擷取時雙擊只放一個釘點且不進入互動。

### 在畫面的視窗上攔截 Esc 與縮放手勢

焦點在 iframe 內時外層收不到鍵盤與 wheel，所以 Inspector 在互動畫面自己的 `contentWindow` 上掛三種監聽（同源可直接存取），全部以 `capture: true` 註冊，prototype 內停止事件傳遞的元件（輪播、滑桿、地圖）也擋不住：keydown（Escape 結束互動並 `stopPropagation`；`isComposing` 為真或 `keyCode` 為 229 的 keydown 一律忽略，注音、倉頡使用者按 Esc 取消組字時不會結束互動，輸入的文字也不會因重新載入而遺失；Esc 以外的按鍵不處理，直接交給 prototype）、`passive: false` 的 wheel（ctrl／meta／alt 時 `preventDefault` 並把座標換算成畫布座標後交給相機縮放；一般 wheel 不處理，讓頁面自己捲動）、Safari 的 gesture 事件（同畫布規則）。座標以 iframe 元素的 `getBoundingClientRect()` 與 `rect.width／offsetWidth` 換算：外層 client 座標等於 rect 左上角加上 iframe 內 client 座標乘以該比例，再交給相機原本的指標換算（含 Storybook 工具列縮放）。互動期間在畫面文件的根元素設定 `overscroll-behavior: contain`，捲到邊界時不會把捲動串連到外層，macOS 的水平兩指滑動不會讓 Storybook 返回上一頁；結束互動時明確還原原本的值（沒有輸入的結束不會重新載入，不能靠重新載入清掉）。這些監聽、根元素樣式與 data-route 的 MutationObserver 都記錄在一個清理清單中，結束互動或畫面卸載時全部移除或還原，避免 detached window 洩漏。不透過巢狀 iframe 的 Storybook channel 溝通。

### 離開時重新載入以回到原 route

結束互動時，若 `document.activeElement` 是互動中的 iframe，先把焦點移到畫布 viewport（`focus({ preventScroll: true })`），再恢復 `inert` 等屬性並解除固定：焦點若留在即將變成 inert 且會重新載入的 iframe 內，下一個 Esc 或 Shift+1 不一定送得到外層 document。焦點在別處（例如按了功能流程清單或另一個控制項）時不移動，避免搶走焦點。viewport 由本 change 加上 `tabindex="-1"`（不進入 Tab 順序、掛載時不取得焦點；若 rebuild-flow-canvas-camera 已提供則沿用），並設定 `outline: none`，因為它不在 Tab 順序中，焦點外框只會框住整個畫布。結束時若畫面解除固定後依分層仍是 live，一律把 src 換回不含 `prototypeFlowInteractive` 的一般預覽網址重新載入，這次重新載入在 `pickLoadingFrame` 中與固定畫面同列第一，直到一般預覽網址 render 完成或 iframe 被移除（verify 2026-10-08：原本只在畫面仍被選取時排第二，點空白處或另一個畫面結束時會退回一般順序）；解除固定後會被降級的畫面直接移除 iframe，不重新載入。Supersedes 原本的「有輸入才重新載入」（指南 3.5，2026-10-08）：只捲動過的畫面不會被 pointerdown／keydown 偵測到，卻會停在捲動後的狀態，而且以互動網址載入的畫面本來就必須重新載入一般網址才能清掉「已互動」標記、恢復截圖與量測，所以不再記錄「有輸入」旗標。以互動網址載入過的畫面，根元素帶 `data-prototype-interactive="true"`，序列化雜湊必然與 renderer 的一般截圖不同，所以 LOD 的「已互動」標記在載入互動網址時設定，直到重新載入一般預覽網址或 iframe 被移除才清除；這段期間不用它更新截圖（沿用 add-flow-canvas-level-of-detail 的機會式更新規則），量測暫停也持續同一段期間。

### 只信任 flow 中存在的 data-route

標示中的「目前 route」來自 MutationObserver 觀察到的 `data-route`：觀察畫面文件的整個子樹（`subtree: true`、`attributeFilter: ["data-route"]`，加上 `childList` 以處理 `[data-prototype-root]` 被重新掛載），每次變化時重新讀 `[data-prototype-root]` 的 `data-route`。純函式 `resolveInteractRouteTitle(value, ownRouteId, routes)` 只在值等於 flow 中某個 route id（不含 flow-only node id）且不同於該畫面自己的 route 時回傳該 route 的標題，其他情況回傳 `null`；標題以 ref 直接寫進標示的 textContent，不 commit React。cm-chipK font-size 這類 `data-route` 用的是導覽 id 的 prototype 因此不會誤報。

### 互動中的留言證據

依使用者決定（2026-10-07，指南第 4 節第 6 項選 (a)）：畫面在互動中換頁（例如 intake → review）之後新增的留言仍錨定在 `route:intake`，addon 由該 iframe 的 capture hook 截到的卻是 review 的頁面。接受這個差異並寫進 storybook-integration.md；不採用「擷取前重新載入回原 route」（會與 addon 按下時立即擷取的時機衝突），也不把目前 route 放進錨點（要修改 flow-canvas-comments 規格與 addon）。

### Enter 與 Esc 併入既有快捷鍵規則

`resolveCanvasShortcut` 維持回傳字串命令，新增 `enter-interact` 與 `exit-interact`，context 新增 `interacting`（是否有畫面在互動模式），並沿用 rebuild-flow-canvas-camera 的 `targetIsControl`、`overlayOpen`、`dragActive`，以及 add-flow-canvas-editing-tools 的 `marqueeActive`、`selectionSize`、`selectedRouteCount`；eventLike 另外讀取 `isComposing` 與 `keyCode`。Enter（與 NumpadEnter）只在沒有 Shift、沒有 Mod、不是自動連發（`repeat` 為假）、`selectionSize` 與 `selectedRouteCount` 都為 1（選取剛好是一個 route 畫面或 route 步驟實例）且 `targetIsControl` 為假時回傳 `enter-interact`：焦點在畫布控制項、功能流程清單項目、縮放選單或 Reset 對話框的按鈕上時，Enter 交給該控制項（例如確認 Reset），不進入互動。`isComposing` 為真或 `keyCode` 為 229 的事件不回傳 `enter-interact` 或 `exit-interact`（沿用 `resolveCanvasShortcut` 第一個檢查的輸入法防護；畫面視窗上的 Escape 監聽另外做同樣的檢查）。Esc 每次只執行第一個適用的動作，順序為：關閉選單或對話框 > 取消拖曳 > 取消框選 > 結束互動 > 清除選取；都沒有時不攔截。因此在畫布上按 Esc 結束互動時畫面仍維持選取，再按一次才清除選取；在畫面視窗內按的 Esc 只結束互動。點擊結束互動只限 viewport 內不開始平移的主鍵按下（`classifyPointerDown` 回傳 `"pan"` 的 Space 或中鍵平移不結束）落在空白處或其他畫面，以及改變功能流程清單的選取；按縮放群組、縮放選單、layout 群組、小地圖（它的 pointerdown 不會傳到 viewport），或只點功能流程清單而沒有改變選取項目，都不會結束互動。雙擊以原生 `dblclick` 事件在畫面的命中區處理（命中判定使用實例鍵），與拖曳門檻不衝突（未移動的兩次點擊）；進入互動後該畫面的命中區停用，不蓋住 iframe。

## Implementation Contract

**Behavior**

- 雙擊 route 畫面，或只選一個 route 畫面且焦點不在控制項上時按 Enter → 進入互動；Esc、點 viewport 內的空白處或其他畫面、雙擊別的畫面、改變功能流程清單的選取、離開 UI Flow → 結束；按控制列、縮放選單、小地圖不結束。
- 互動中可在畫面內點擊、輸入、捲動，Esc 以外的按鍵交給 prototype；在畫面上 pinch／Cmd+滾輪縮放畫布；畫面外照常平移縮放；縮小或平移出視窗時畫面仍是 live；畫面框維持進入前的尺寸。
- 支援契約的 prototype 可換頁，標示顯示目前 route；結束後焦點回到畫布 viewport，畫面回到原 route。
- 簡化檢視中只有被雙擊的步驟實例互動；切換功能流程時先結束互動再切換。

**Interface / data shape**

- 新 query 參數：`prototypeFlowInteractive=true`（只在搭配 `prototypeRoute` 時有意義）。
- geometry 新增純函式：`needsInteractFit(visibleRect, camera, canvasSize)`（畫面在螢幕上寬度小於 300px 或不完全在 viewport 內時為真）、`frameClientToHostClient(frameRect, offsetWidth, point)`（外層 client 座標 = rect 左上角 + 畫面內 client 座標 × `rect.width / offsetWidth`）、`resolveInteractRouteTitle(value, ownRouteId, routes)`；geometry 測試以範例表涵蓋。
- 根元素屬性：`data-route="<目前 route id>"`、互動預覽時 `data-prototype-interactive="true"`。
- 互動網址：`getRoutePreviewSource(routeId)` 的結果再加 `prototypeFlowInteractive=true`。
- `resolveCanvasShortcut` 新命令：`enter-interact`、`exit-interact`；新 context 欄位：`interacting`（Enter 的選取條件讀取 add-flow-canvas-editing-tools 的 `selectionSize` 與 `selectedRouteCount`）；eventLike 讀取 `isComposing` 與 `keyCode`。
- 固定名額：`pinnedFrameId` 存互動畫面的實例鍵（完整 flow 為 node id，簡化檢視為 `"<stepIndex>:<nodeId>"`）。
- DOM：互動畫面帶 `data-interacting="true"`（CSS 以此讓 iframe 取得 `pointer-events: auto`），標示元素 class `prototype-inspector__flow-interact-chip`，文字「互動中 · Esc 結束」，換頁時附加目前 route 標題；canvas viewport 帶 `tabindex="-1"`。
- 測試用 props：`PrototypeFlow` 的 `initialTiers`（add-flow-canvas-level-of-detail 已提供）與新增的 `interactingFrameId`（互動中的實例鍵），只供 `test_flow_canvas_ssr.mjs` 使用。SSR 只斷言載入前就成立的項目（`data-interacting`、互動網址、inert 屬性差異、標示、viewport 的 `tabindex`、縮放選單說明）；「載入完成後沒有截圖、骨架或命中區蓋住 iframe」由 `check_flow_frame_interact.mjs` 以 `elementFromPoint` 在 Chrome 中檢查，因為 LOD 的 cover 在 render 完成前本來就會蓋住。
- 可重跑的 Chrome 檢查 `storybook-product-prototype/scripts/check_flow_frame_interact.mjs --url <example prototype> [--unsupported-url <bench-round-up>] [--navigating-url <bench-inventory>]`。
- 驗證器警告文字：`prototype does not support prototypeFlowInteractive; UI Flow interact mode will stay on the pinned route`。

**Failure modes**

- prototype 不支援契約：互動中可操作；鎖定 route 的 prototype 不換頁；驗證器警告。
- 畫面內容拋出錯誤或載入失敗：維持互動外框，Esc 仍可結束（監聽掛在 contentWindow，iframe 重新載入時重新掛上）。
- `contentWindow` 無法存取（理論上同源不會發生）：console.warn 並結束互動（iframe 載入後才知道，所以是先進入再立即結束）。

**Acceptance criteria**

- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過，並新增斷言：React 與 Vue 的 scaffold 結果都包含 `prototypeFlowInteractive` 與 `data-prototype-interactive`；Vue 元件在該模式下畫面 route 取自元件狀態、`goTo` 不受 `prototypeRoute` 限制、`data-route` 綁定目前 route；驗證器對兩者都沒有互動相關警告；對一份移除了該參數的暫存副本發出警告，未加 --strict-style 時結束碼不受影響。
- `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs` 涵蓋 Enter 只在單選 route 且焦點不在控制項上時回傳 `enter-interact`、組字中的按鍵不回傳互動命令、Esc 優先順序。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` 以測試用 props 斷言互動畫面的 `data-interacting`、標示文字、inert 屬性差異與 viewport 的 `tabindex="-1"`，以及縮放選單列出雙擊／Enter 進入互動與 Esc 結束互動。
- 手動（storybook-template example prototype）：雙擊 intake 畫面→點「Submit intake」→標示出現 review 的標題→Esc→畫面回到 intake 且焦點在畫布 viewport；在畫面上 pinch 只縮放畫布；在畫面上兩指捲動時畫布相機不移動；互動中以 DevTools 把畫面內預覽標記加高到 1040px 時畫面框與連線不動、內容可在畫面內捲動；在退回修改的簡化檢視中雙擊第二個 review 實例只有該實例互動，點選「全部」時先結束互動再切換。
- 未支援契約的 prototype（`create_flow_bench_fixture.mjs` 產生的 fixture）：`bench-round-up` 的 `offer`（每次 render 讀 `prototypeRoute`、會鎖定 route，內容 1040px 會在畫面內捲動）可進入互動並捲動內容、畫布相機不移動、點擊不換頁、Esc 正常結束；`bench-inventory`（只在初始值讀 `prototypeRoute`）是「不支援契約但會換頁」的案例，互動中可換頁，標示只在 `data-route` 是 flow 的 route id 時顯示標題。外部 repo 不在必要驗證之內。
- `check_flow_frame_interact.mjs` 在 Chrome 中自動涵蓋：雙擊進入後 `elementFromPoint` 打到 iframe、互動網址、Esc 結束後焦點在 viewport 並可 Shift+1、Space 平移與按 Zoom in 不結束、只有一個互動畫面、從 iframe 派送 Ctrl+wheel 縮放畫布且相機閒置前 0 commit、組字中的 Esc 不結束、目前 route 標示、簡化檢視中只有 `3:review` 互動且切換「全部」時先結束；`check_flow_canvas_comments.mjs` 加入真實互動畫面的擷取案例。

**Scope boundaries**

- In scope：Inspector 互動模式（含簡化檢視中的步驟實例互動）、canvas viewport 的 `tabindex="-1"`、React／Vue 模板與 example prototype 的契約實作、驗證器警告、smoke test 與 SSR 斷言、縮放選單的手勢清單、文件、template 副本同步、build tag。
- Out of scope：外部專案 prototype 的修改、theme／args 同步、互動錄製、Vue 執行期驗證（repo 沒有可執行的 Vue Storybook）、修改其他 capability 的規則（固定豁免、量測暫停 hook、量測 observer 生命週期、按鍵路由與 fit 追蹤由前面的 change 提供）。

## Risks / Trade-offs

- [本 change 依賴前面 change 提供的介面：LOD 的固定豁免、量測暫停 hook 與 observer 生命週期，相機的 `targetIsControl`／`overlayOpen` 與程式化移動結束 fit 追蹤，journey 的實例鍵] → 實作前逐一確認這些規則已在對應 change 的規格與實作中；缺少時以 spectra-ingest 回到該 change 補上，不在本 change 改寫其他 capability。
- [互動中焦點在 iframe 內，畫布快捷鍵（例如 Shift+1、`[`、`]`）暫時不可用] → 這是預期行為；標示提示 Esc 結束，縮放選單的說明也會寫明。
- [互動中換頁後新增的留言錨定在原 route、截圖卻是換頁後的頁面] → 使用者接受（2026-10-07），寫進文件。
- [結束時一律重新載入，沒操作過的畫面也會多一次載入] → 換取不留下捲動狀態與「已互動」標記；載入走 LOD 的單一載入名額，不會同時多開 iframe。
- [互動期間暫停量測，換到較高的 route 時內容只能在畫面內捲動] → 刻意的取捨：畫面、連線與簡化排版不跳動，持久化尺寸不被其他 route 汙染；結束互動並重新載入後恢復正確尺寸。
- [prototype 在互動中修改 body 樣式或全域狀態] → 結束時若曾互動就重新載入，狀態不會殘留到之後的截圖。
- [Storybook 會把巢狀 iframe 的 PREVIEW_KEYDOWN 送到外層 preview] → 外層 preview 不處理這個事件（只有 manager 會），不影響；Escape 在 frame 視窗的 capture 階段就被處理並停止傳遞。

## Migration Plan

新參數為 opt-in。既有 prototype 不需修改即可繼續使用（鎖定 route 的 prototype 互動時不能換頁）；要支援換頁的 prototype 依 ui-flow-contract.md 加入參數處理。回滾 revert 本 change 即可。
