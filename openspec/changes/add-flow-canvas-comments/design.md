## Context

`add-anchored-visual-comments` 讓 figma-export addon（0.14.0）提供一組宿主宣告的介面：

- DOM 屬性：`data-sbfx-view`、`data-sbfx-export`（含 `-label`、`-href`）、`data-sbfx-comments`、`data-sbfx-anchor`（含 `-label`、`-route`、`-kind`）、`data-sbfx-canvas`、`data-sbfx-canvas-world`。
- DOM 事件：宿主發出 `sbfx:anchors-moved`；addon 發出可取消的 `sbfx:reveal-anchor`。
- 自動外層 decorator：addon 排在 Inspector 之前時，在 Inspector 的每一種模式都會執行。

Prototype Inspector 的 UI Flow（`flow-canvas.js:PrototypeFlow`）現況（讀程式確認）：

- 根節點 `.prototype-inspector--flow` 裡有 viewport（`__flow-viewport`）、world 圖層（`__flow-world`，position absolute、left 與 top 為 0、transform-origin 0 0、只有平移與等比縮放）、螢幕座標覆蓋層、控制層與對話框層。
- route 框的可見區域是 `__flow-frame-preview`（框上方 64px 是名稱區，不屬於可見區域）；流程節點是 `article.__flow-node[data-frame-id]`；key 連線是 `svg.__flow-lines` 裡 `g[data-edge-key]` 下的 `polyline.__flow-line`，`pointer-events: none`。
- 相機寫入集中在 `writeCameraToDom`，拖曳寫入在 `writeDragToDom` 與 `restoreDragDom`，viewport 尺寸由 `ResizeObserver` 觀察。這些地方都沒有對外發出事件。
- 鍵盤：`document` bubble 階段的 dispatcher，沒有檢查 `defaultPrevented`；addon 處理的 Esc 只呼叫 `preventDefault`（addon 0.14.0 起也會 `stopPropagation`）。
- Inspector 安裝程式 `insertAddonEntry` 把 preset 插在 `addons` 清單最前面。Storybook 預設反轉檔案順序，排在前面的 addon 位在內層，所以 Inspector 會被 figma-export addon 包在外層之外，addon 在 UI Flow 不會執行。template 的 `main.ts` 是 docs、figma-export、inspector 的順序，沒有這個問題。

park 中的 change 會在這個畫布上加入：LOD 的框截圖與空框、journey 檢視（重新排版、同一個 route 可能出現兩次、唯讀）、editing 的選取與框選、interact 模式（雙擊讓框內 iframe 接收指標事件）。

## Goals / Non-Goals

**Goals:**

- UI Flow 上可以對框、節點、連線、空白處留言，留言標記為 `ui-flow` 檢視，與 Story 留言分開。
- 平移、縮放、拖曳時，addon 的釘點在同一個畫格跟著移動，而且手勢期間仍然沒有 React commit。
- 留言「顯示位置」時，畫布移動相機帶使用者到該位置。
- 安裝程式產生的 `addons` 順序讓 addon 包在 Inspector 外層。
- Inspector 維持零相依：不 import addon，只寫 DOM 屬性、發出與監聽 DOM 事件。

**Non-Goals:**

- addon 端的錨點判定、釘點繪製、資料格式（屬於 `add-anchored-visual-comments`）。
- 在 UI Flow 上匯出 Figma payload：只宣告不提供匯出並指向 Static Flow。
- 把釘點畫進 Inspector 的螢幕座標覆蓋層：釘點由 addon 繪製。
- 修改 park 中 change 的檔案：互動規則寫在本 change 的規格裡，由它們在套用時遵守。

## Decisions

### 宣告放在各模式自己的根節點

UI Flow 根節點帶 `data-sbfx-view="ui-flow"` 與「不提供匯出」宣告。有 Static Flow story 時，`data-sbfx-export-href` 使用與 Open Static Flow 按鈕相同的網址（`getPrototypeFlowExportStoryUrl`）。Docs、Components、Data 的根節點宣告不提供匯出與留言。Story 模式只回傳 `Story()`，不加任何屬性。

替代方案「寫在 `#storybook-root`」被否決：那個元素不屬於 Inspector，Story 模式也會讀到。

### 錨點放在框的可見區域，同一個框只標第一個實例

route 錨點放在 `__flow-frame-preview`，與相機規格「點擊與連線錨點使用可見區域」一致。點在名稱區不會被當成框上的留言，元素錨點的版面像素也直接對應 route 頁面的像素。連線錨點放在畫線的 `polyline` 上，由 addon 用幾何方式判定，不需要改變它 `pointer-events: none` 的設定。

journey 檢視中同一個 route 可能出現兩次，只在該檢視順序中的第一個實例加錨點，避免 addon 解析到不可預期的實例。

LOD 會換掉框內容，但錨點元素必須一直存在；這條寫進規格，LOD change 必須遵守。

### 只有完整流程檢視宣告 world 座標，畫布宣告在每個檢視都保留

world 座標等於版面座標，這只在完整流程成立。journey 檢視的位置是計算出來的，所以 journey 檢視中 world 圖層不帶 `data-sbfx-canvas-world`：空白處的留言沒有畫布錨點，已存的畫布錨點釘點在該檢視中隱藏，留言仍在清單中。viewport 仍帶 `data-sbfx-canvas`。

Supersedes（2026-10-08，使用者決定，套用 add-flow-journey-focus 前修改）：原本的決定是「journey 檢視兩個屬性都不帶」。不宣告畫布時 addon 會把 Story root 當成一般 story 處理：工作區開啟時每次在「全部」與 journey 之間切換都會縮放 Story root，釘點不再被 viewport 裁切、可能畫到 journey 清單上，連線留言的截圖也退回成整個 root。保留 `data-sbfx-canvas` 後，root 不縮放、釘點照樣被裁切、連線截圖維持「畫布加框內頁面」；只拿掉 world，就不會把空白處的點記成畫面上沒有的版面座標。

### 在寫入 transform 的同一個 rAF 發出通知

`writeCameraToDom`、`writeDragToDom`、`restoreDragDom` 寫完後，立刻從根節點發出 `sbfx:anchors-moved`。另外在每次 commit 後的 layout effect 中，以及 viewport 的 ResizeObserver 回呼中，也各發出一次。事件只是 DOM 派送，不觸發 React，所以手勢期間的 commit 數維持 0。

替代方案「讓 addon 用 MutationObserver 觀察 style」被否決：時機落在畫格之後，會慢一格；「在覆蓋層寫 CSS 變數讓 addon 讀」則會讓 addon 綁死在 Inspector 的變數名稱上，也被否決。

### 顯示位置使用既有的相機 fit 運算

元素錨點以 `getFrameVisibleRect` 取得框的可見區域，再用 `fitCamera` 以畫布的 fit 內距計算相機，縮放上限為 1。連線錨點則對兩端框可見區域的聯集做 fit。畫布錨點維持目前縮放，只把該點移到 viewport 中央。

這些都屬於相機規格中的「程式化相機移動」，會結束 fit 追蹤。只處理 `detail.view` 為 `ui-flow` 的請求，其餘不呼叫 `preventDefault`，addon 會顯示「此檢視無法顯示位置」。

### 鍵盤 dispatcher 略過已被處理的按鍵

dispatcher 開頭檢查 `event.defaultPrevented`，為 true 時直接返回。這樣不必知道 addon 的任何狀態，任何先處理了按鍵的監聽都能優先。

替代方案「檢查 `html[data-sbfx-capture-mode]` 或輸入框是否開啟」被否決：這會讓 Inspector 依賴 addon 的內部狀態。

### 擷取模式優先於框的互動

CSS 在 `html[data-sbfx-capture-mode="true"]` 時讓所有框內 iframe 的 `pointer-events` 為 none（含 interact 模式的框）；進入互動模式的程式路徑在擷取模式中不執行。現在框內 iframe 本來就不接收指標事件，這條規則主要約束之後的 interact change。

### 安裝程式把 preset 插在 figma-export addon 之後

`insertAddonEntry` 找到 `@harrychuang/storybook-addon-figma-export` 時插在它後面，找不到時維持插在最前面。已安裝但順序相反時，把 preset 移到 addon 後面並印出說明。

替代方案「一律插到清單最後」被否決：會同時改變 Inspector 與其他 addon（例如 addon-docs）的相對順序，影響範圍超出需要。

### build tag

兩份 `preview.js` 的 `prototypeInspectorBuildTag` 改為 `flow-comments-<套用當日 YYYY-MM-DD>`。

## Implementation Contract

**Behavior**

- 打開 Figma export、進入 UI Flow：可以在框、節點、連線、空白處留言；留言標為 `ui-flow`；Story 模式的留言清單看不到這些留言（反之亦然）。
- 平移、縮放、拖曳時，釘點在同一個畫格跟著框、連線或畫布點移動。
- 清單中被隱藏的釘點按「Show location」時，相機移到該位置並選取留言。
- UI Flow 的 Figma export 區塊顯示「Open Static Flow to export this flow.」與連結；Docs、Components、Data 模式不顯示留言與匯出動作。

**屬性（Inspector 寫入）**

| 元素 | 屬性 |
| --- | --- |
| UI Flow 根節點 `.prototype-inspector--flow` | `data-sbfx-view="ui-flow"`、`data-sbfx-export="unavailable"`、`data-sbfx-export-label`、有 Static Flow 時加 `data-sbfx-export-href` |
| Docs／Components／Data 根節點 | `data-sbfx-export="unavailable"`、`data-sbfx-comments="unavailable"` |
| `__flow-frame-preview`（每個 route 的第一個實例） | `data-sbfx-anchor="route:<routeId>"`、`data-sbfx-anchor-label="<route title>"`、`data-sbfx-anchor-route="<routeId>"` |
| `__flow-node`（第一個實例） | `data-sbfx-anchor="node:<nodeId>"`、`data-sbfx-anchor-label="<node title>"` |
| key 連線的 `polyline.__flow-line` | `data-sbfx-anchor="edge:<from>-><to>"`、`data-sbfx-anchor-kind="path"`、`data-sbfx-anchor-label="<from title> → <to title>"` |
| `__flow-viewport`（只在完整流程） | `data-sbfx-canvas` |
| `__flow-world`（只在完整流程） | `data-sbfx-canvas-world` |

**事件**

- 發出：`root.dispatchEvent(new CustomEvent("sbfx:anchors-moved", { bubbles: true }))`，時機為 `writeCameraToDom`、`writeDragToDom`、`restoreDragDom` 寫入之後（同一個 rAF）、每次 commit 後的 layout effect、viewport ResizeObserver 回呼。
- 監聽：`document` 上的 `sbfx:reveal-anchor`。依 `detail.view` 與 `detail.anchor` 處理；處理時呼叫 `preventDefault()`。

**失敗處理**

- 找不到錨點對應的框或連線：不處理該請求，由 addon 顯示訊息。
- 沒有 Static Flow story：匯出提示不附連結。
- addon 未安裝或順序錯誤：這些屬性與事件沒有接收者，畫布行為與現在相同。

**驗收**

- `test_flow_canvas_ssr.mjs`：根節點宣告（有與沒有 Static Flow 兩種）、route／node／edge 錨點屬性與名稱、完整流程的畫布宣告。
- `test_authority_inspector.mjs`：Docs、Components、Data 根節點帶不提供匯出與留言的宣告；Story 模式沒有這些屬性。
- `test_install_prototype_inspector.mjs`：安裝順序範例表的四列與重排說明行。
- 新增 `scripts/check_flow_canvas_comments.mjs`（不依賴套件，以系統 Chrome 經 CDP 執行，寫法比照 `bench_flow_canvas.mjs`），在 `create_flow_bench_fixture.mjs` 產生的 fixture（含 addon 0.14.0）中驗證：
  - 對框、連線、空白處留言後的錨點類型與檢視。
  - 平移與拖曳期間，每個畫格的釘點與框的相對位置不變。
  - Story 與 UI Flow 的留言分開。
  - 顯示位置會移動相機。
  - 輸入框開啟時按 Esc 不會取消拖曳。
  - 擷取模式中雙擊框只放一個釘點。
  - 手勢期間 `pi:flow:commit` 為 0。
- `bench_flow_canvas.mjs` 在 growth-fund 型 flow 上重跑：手勢期間 commit 為 0、靜止後恰好 1 次，拖曳每次移動的 p95 不超過 8ms。
- 回歸：geometry、SSR、authority、installer、smoke（含 mirror parity）、template esbuild bundle 全數以零碼結束。

**範圍**

- 範圍內：上述 Inspector 檔案、兩份副本、安裝程式與測試、新的檢查腳本、文件、build tag。
- 範圍外：addon 的任何檔案；park 中 change 的檔案；外部專案的升級。

## Risks / Trade-offs

- [每個畫格派送一次 CustomEvent] → 派送成本很低，量測以 bench 的拖曳 p95 與手勢期間 commit 數確認沒有退步。
- [LOD 的框截圖與空框] → 錨點放在一直存在的可見區域元素上；截圖由 addon 擷取錨點元素（截圖或空框），內容可能較少，但留言位置正確。
- [journey 檢視重新排版] → 保留畫布宣告、不宣告 world 座標，畫布錨點的留言在該檢視中隱藏、空白處留言沒有畫布錨點；框與連線錨點只標第一個實例。
- [editing 的選取、框選與 Esc 順序] → addon 擷取模式在 capture 階段攔截主要按鍵，畫布收不到；Esc 由 addon 停止傳遞，且畫布略過 `defaultPrevented` 的按鍵。
- [interact 模式讓 iframe 接收指標事件] → 擷取模式優先規則寫進本 change 的規格，interact change 套用時必須遵守。
- [使用者沒有打開 Figma export，或專案沒有改用 `configureFigmaExportReview`] → 沒有留言面板，畫布行為與現在相同；文件說明必要條件。

## Migration Plan

1. 套用順序：`rebuild-flow-canvas-camera` 歸檔並 commit → `add-flow-canvas-level-of-detail` → `add-anchored-visual-comments` → 本 change。
2. 已安裝 Inspector 的專案重新執行 `install_prototype_inspector.mjs --force` 後，會取得新的 Inspector，並自動修正 `addons` 順序。
3. 回復方式：還原 Inspector 檔案即可；DOM 屬性與事件沒有其他依賴者時不產生任何效果。

## Open Questions

（無）
