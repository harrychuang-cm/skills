## Summary

把 Prototype Inspector 的 UI Flow 從「原生捲動容器 + 整張 CSS 縮放」改成以相機（camera）為核心的無限畫布：整個世界圖層只用一個 `translate() scale()` 控制，手勢在 React 之外直接更新畫面，操作方式比照 Figma（觸控板雙指平移、pinch 縮放、Cmd／Ctrl+滾輪縮放、Space 或滑鼠中鍵拖曳平移、Shift+1／Shift+0 等快捷鍵），畫面名稱移到框外並維持固定字級，拖曳不再讓整張畫布重繪。這是後續 add-flow-canvas-level-of-detail、add-flow-journey-focus、add-flow-canvas-editing-tools、add-flow-frame-interact-mode 共用的基礎；flow-canvas-navigation 規格同時提供它們需要的擴充點，讓後續 change 不必修改本規格。

## Motivation

使用者回饋 UI Flow 的操作「不像設計工具」，而且畫面一多就卡。2026-10-02 在 cm-linepay 的 growth-fund prototype（30 個 route、32 條顯示的連線）實測：

- **實測**（headless Chromium、Apple Silicon、Vite 已暖機；量自 cm-linepay 的舊版 4,131 行 Inspector 安裝，目前版本的基準由 tasks 1.1 以可重現的 fixture 重新量測）：拖曳時每次 pointermove 的同步成本中位數 6.9ms、p95 18ms、最慢 34ms，p95 已超過一幀 16.7ms 的預算。研究以同一份 flow 在 Node 中重跑 `placeEdgeLabels`，單次約 2.2ms、約 46.5 萬次矩形相交測試，約占拖曳每幀成本的三分之一。其餘來自每次移動都重新 render 全部 30 張卡片，以及每次移動都寫一次 localStorage（後者已由 fix-inspector-runtime-drift 改為放開時寫入）。
- **縮放手勢不符合任何設計工具慣例。** 只有 Alt+滾輪會縮放，而且是透過 React 的 `onWheel`。React 19 把 wheel 註冊為 passive listener，`preventDefault()` 無效，所以縮放的同時容器也會捲動；觸控板 pinch 完全沒有處理，會讓整個 Storybook 介面被瀏覽器放大。縮放是每步固定加減 0.1：15%→25% 一步跳 67%，130%→140% 只差 7%。範圍是 15%–140%，30 個 route 的 flow 在筆電上 fit 需要約 13%（估計，依 fit 公式代入 growth-fund 的內容邊界），已經低於下限。
- **畫布不是無限的。** 畫布大小依內容邊界計算，把卡片拖過最左或最上緣時整張畫布會位移、被拖曳的卡片會偏離指標。點一下卡片（沒有移動）也會讓畫布離開 Fit 模式。
- **Cmd 被當成平移修飾鍵**，與 Figma 的 Cmd+滾輪縮放、Cmd+Z、Cmd+0 等全部衝突。
- **Storybook 會攔截按鍵。** preview 會把每個按鍵轉送給 manager（`PREVIEW_KEYDOWN`），而且不看 `defaultPrevented`；Inspector 現有的 window 層 listener 執行得比 Storybook 晚，無法阻止轉送。要新增快捷鍵，必須在 document 層 `stopPropagation`。
- 每張卡片有 64px 高的 header，邊框、陰影與 2px 連線都跟著縮放：5% 時看不見，400% 時變得很粗。

## Proposed Solution

- **拆出兩個新模組，preview.js 只負責掛載。** `flow-canvas-geometry.js` 是不 import 任何東西的純函式模組：相機換算、縮放公式、fit、滾輪正規化、可見矩形、快捷鍵對照，以及從 preview.js 搬出來的 route／edge 正規化、連線繞線與標籤擺放。`flow-canvas.js` 是 React 元件 `PrototypeFlow`。UI Flow 與其他模式共用的 helper 不複製：純函式（例如 `isRecord`、`normalizeRoutes`）放進 geometry、讀取 DOM 的 Storybook 連結 helper 放進 flow-canvas.js，兩者都 export 給 preview.js 使用；`PrototypeEmpty` 留在 preview.js。兩個模組都放在 `assets/prototype-inspector/`，安裝器會整個資料夾複製，fix-inspector-runtime-drift 的 mirror 與 import surface 檢查會自動涵蓋。
- **相機模型。** 世界座標等於現有 layout 座標（已存的 positions 原樣使用，允許負值、不再以內容邊界位移）。一個世界圖層套用 `translate(x, y) scale(z)`，手勢期間在 requestAnimationFrame 中直接寫入 style，停止 120ms 後才把相機狀態交回 React。開啟時 fit 目前顯示的畫面，直到第一個不是 fit 的相機變更為止（包括使用者操作與其他功能的程式化移動，例如縮放到選取範圍），量到新尺寸或視窗縮放時都會重新 fit。同一個分頁工作階段內，回到 UI Flow 會恢復上次完整 flow 的相機位置；這只存在 sessionStorage，不寫進 layout payload，其他功能顯示的檢視（例如簡化檢視）不寫入。
- **縮放。** 範圍 5%–400%。連續縮放用指數公式，以指標位置為錨點；按鈕與 +/- 依固定階梯（5%、10%、25%、50%、100%、200%、400%）跳到下一格。Fit 上限 100%。
- **手勢比照 Figma。** 改用掛在 UI Flow 根節點的原生非 passive wheel listener：Cmd／Ctrl+滾輪與 pinch 縮放（Alt+滾輪保留為相容別名），指標停在控制列、選單或對話框上時也一樣只縮放畫布；一般滾輪在畫布上上下平移，Shift+滾輪左右平移，觸控板雙指自由平移；Safari 的 gesture 事件另外處理並去除重複。Space+拖曳與中鍵拖曳平移。**BREAKING**：Cmd 不再是平移修飾鍵，Cmd+拖曳不再平移。
- **快捷鍵。** 在 document 層攔截：Shift+1 fit、Shift+0 與 Cmd／Ctrl+0 回到 100%、+/- 與 Cmd／Ctrl+=/- 縮放一格、Esc 先關閉開啟中的選單或對話框，否則在拖曳中取消拖曳。處理過的按鍵會 `stopPropagation`，Storybook 不會再收到；沒處理的照常往上傳；輸入框中不觸發；以 Tab 聚焦的按鈕、選單項目與清單項目保留 Space、Enter 與方向鍵的原生行為；選單或對話框開啟時只處理 Esc。不綁定 Storybook 已使用的 1／2／3、M、C 與所有 Alt 組合。後續功能新增的按鍵沿用同一套規則。
- **拖曳。** 移動超過 3px 才開始拖曳；拖曳中只用 transform 移動被拖的畫面（後續的整組拖曳也走同一條路徑）並重算相連的連線，期間不 commit React；放開時一次寫回整數座標；Esc 取消並還原。畫面元件做 memo，拖曳與 hover 不再重繪其他畫面。其他功能宣告的唯讀檢視中不能拖曳，Reset 與 Import 也停用。
- **畫面名稱移到框外。** 名稱、已宣告 viewport 的徽章與 ⧉ components 按鈕畫在不縮放的覆蓋層，固定 12px，依畫面在螢幕上的寬度截斷，畫面太小時隱藏；route id 與組名（flowGroup，沒有時用 navigationId）在 hover 時顯示。畫面本身改成無邊框、無陰影的平面樣式。畫面在世界座標中的框仍保留原本 64px 的名稱區高度，所以已存位置與 Static Flow 的版面維持一致；命中測試與連線錨點改用扣除名稱區的可見矩形，名稱區的空白處不再被當成畫面。
- **連線標籤移出手勢熱路徑。** 標籤擺放只在相機停止且縮放跨過一個級距、或 layout 變更後執行，手勢期間不跑；標籤改為固定 12px 並以實際量到的寬度計算；一條連線兩端的畫面在螢幕上都小於 150px 寬時，只在 hover 其中一端時顯示它的標籤。連線粗細依縮放級距維持在約 2px，箭頭依級距維持約 14px。虛線流動動畫在手勢與縮放低於 40% 時暫停，系統設定減少動態時關閉。
- **控制列。** 放在相機圖層外，不再使用 `position: fixed`，並避開 figma-export addon 的 review 面板。縮放百分比改為選單按鈕（Fit、50%、100%、200%，並列出手勢與快捷鍵），無障礙名稱為「Zoom menu」加目前百分比。Reset、Import、Export、Open Static Flow 與其無障礙名稱不變。修正 Reset 確認鈕對比不足的問題。畫布背景改為單色，移除漸層點陣。
- **驗證。** 純函式用 `node --test` 測試；React 結構用沿用 vm 寫法的 SSR 測試；新增不依賴套件的 fixture 產生腳本（在暫存資料夾複製 storybook-template，產生 30 個 route 的 growth-fund 型、100 個 route 等測試用 prototype，不寫回 repo）與 CDP 量測腳本，以 performance mark 計算手勢期間的 React commit 與標籤擺放次數，並檢查開啟 UI Flow 不會改動已存 layout。

## Non-Goals

- 不做依縮放切換截圖或 live iframe、視窗外不渲染、iframe 數量上限、量測方式改寫：屬於 add-flow-canvas-level-of-detail。本 change 中每個 route 仍是 live iframe。
- 不做選取、框選、方向鍵微調、對齊吸附、復原、小地圖、flowGroup 分區背景：屬於 add-flow-canvas-editing-tools。空白處拖曳在本 change 不做任何事，保留給框選。
- 不做雙擊進入互動：屬於 add-flow-frame-interact-mode。
- 不修改 Static Flow 匯出 story、它的 CSS 與 DOM（Figma importer 讀取它）、flow layout payload 與 storage key、route iframe 的 URL 契約。
- 不修改 Components、Story、Docs、Data 模式的行為。
- 不新增任何 npm 依賴。
- 不支援在 UI Flow 畫布上使用 figma-export addon 的 visual comments。
- 不修改或升級外部 repo；外部 repo 只能在拋棄式 git worktree 中選用量測。
- 不修改 template 自己 Spectra root 的規格；相關調整列為後續 change `align-template-flow-parity`。

## Alternatives Considered

- **改用 React Flow（@xyflow/react，MIT）**：能直接取得平移、縮放、小地圖與選取，但每個安裝 Inspector 的專案都要多一個依賴，現有的繞線與標籤避讓也要改寫成它的 custom edge。與 Inspector「只依賴 react 與 storybook」的原則衝突，因此否決。
- **改用 tldraw**：互動最接近 Figma，但正式使用需要授權金鑰，因此否決。
- **全部改用 canvas／WebGL 繪製**：畫面內容是真的 React 網頁，瀏覽器沒有穩定的 API 能把 HTML 畫進 canvas（Chrome 的 HTML-in-Canvas 仍在 origin trial）。全 canvas 會讓畫面變成截圖，放大會糊、不能互動，而效能瓶頸其實是 iframe 數量，不在繪圖方式，因此否決。
- **保留原生捲動，只修 wheel**：無法做到無限畫布，以指標為錨點的縮放仍要和 scrollLeft／scrollTop 對抗，因此否決。

## Impact

- Affected specs: flow-canvas-navigation（新）、inspector-viewport-resolution
- 相依：必須在 fix-inspector-runtime-drift 之後實作（依賴其 mirror／import surface 檢查、安裝器的 helper 相容檢查與「只在明確操作時寫入」的持久化語意）。
- Affected code:
  - Modified:
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/scripts/test_authority_inspector.mjs
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/references/ui-flow-contract.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/FLOW_SPEC.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/ACCEPTANCE.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/IMPLEMENTATION_GUIDE.md
  - New:
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/scripts/bench_flow_canvas.mjs
    - storybook-product-prototype/scripts/create_flow_bench_fixture.mjs
  - Removed: (none)
