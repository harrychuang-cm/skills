## Why

UI Flow 的畫面只能看、不能操作：route iframe 一律 `pointer-events: none`，而且 prototype 在 `prototypeRoute` 預覽模式下會鎖住 route，點擊不會換頁（模板 FLOW_SPEC 明文規定「preview clicks 不得改變選定的 route」）。審閱者想試捲長頁、展開元件或走一段流程時，只能切回 Story 模式重新找到那個 route。研究也發現，現有 prototype 在預覽網址下的行為不一致：模板與 example 會鎖住 route，cm-linepay growth-fund 在預覽模式下所有狀態都不能變，cm-chipK font-size 只把 route 當初始值、點擊仍會換頁。單純移除 `pointer-events: none` 做不出可靠的互動，必須新增一個 prototype 端的 opt-in 契約。

## What Changes

- **進入互動**：雙擊 route 畫面，或在只選取一個 route 畫面時按 Enter（不含 Shift、Cmd／Ctrl 與自動連發；焦點在按鈕、選單或對話框等控制項上時 Enter 交給該控制項，不進入互動）。進入時一律結束開啟時的 fit 追蹤，即使相機沒有移動。Static Flow story 與留言擷取模式中不進入互動（擷取模式優先，依 add-flow-canvas-comments 的規則，互動中的畫面在擷取期間不接收指標）。該畫面使用分層保留的固定名額成為 live iframe（固定期間不論螢幕寬度、可見比例或是否在視窗外都不會被降級），網址加上 `prototypeFlowInteractive=true` 重新載入；畫面在螢幕上太小（小於 300px 寬）或部分在視窗外時，相機會縮放到這個畫面（上限 100%）。畫面加上互動外框與「互動中 · Esc 結束」標示（不接收指標、不出現在留言截圖、拖曳時跟著畫面、帶英文無障礙名稱）。一次只能有一個互動畫面；flow-only node 沒有 iframe，不會進入。
- **簡化檢視中的互動**：在 add-flow-journey-focus 的簡化檢視中，以步驟實例（`<stepIndex>:<nodeId>`）為單位進入互動，同一 route 的其他實例維持 inert；在功能流程清單切換項目（點選、`[`、`]`，含「全部」）時先結束互動再切換。
- **互動中的輸入**：滑鼠與鍵盤直接作用在畫面內（可捲動、點擊、輸入），Esc 以外的按鍵都交給 prototype。在畫面上用 Cmd／Ctrl／Alt+滾輪或 pinch 時仍縮放畫布，畫面外仍可平移與縮放；在畫面內按 Esc 會結束互動（輸入法組字中的 Esc 除外）。Inspector 只在這個畫面的視窗上掛監聽，結束時全部移除。互動期間畫面框維持進入前的尺寸（暫停尺寸量測寫入），較高的內容在畫面內捲動，捲到邊界時不會帶動 Storybook 返回上一頁。
- **結束互動**：按 Esc、在畫布空白處或其他畫面上按下（Space 或中鍵平移除外）、雙擊另一個畫面、改變功能流程清單的選取、prototype 改變、互動中的實例不再顯示，或離開 UI Flow 模式；按控制列、縮放選單、小地圖或 viewport 內的其他控制項不會結束。結束時若焦點在互動中的畫面內，焦點回到畫布 viewport。解除固定後仍是 live 的畫面一律以一般預覽網址重新載入，回到它原本的 route，也不會停在互動時捲動或操作後的狀態；以互動網址載入過的畫面在重新載入一般預覽網址前不會用來更新截圖。
- **目前 route 標示**：prototype 在互動中換頁時，標示會顯示目前 route 的標題（只採用 flow 中存在的 route id，避免 cm-chipK 這類 `data-route` 值與 flow id 不同的 prototype 誤報）。
- **prototype 端契約**：React 與 Vue 模板、storybook-template 的 example prototype 支援 `prototypeFlowInteractive=true`。搭配 `prototypeRoute` 時從該 route 開始、允許在預覽中換頁；同時有 `prototypeFlowPreview=true` 時仍隱藏 prototype 自身的 chrome；在 `[data-prototype-root]` 上以 `data-route` 標出目前 route、以 `data-prototype-interactive="true"` 宣告支援。沒有這個參數時，`prototypeRoute` 預覽維持鎖定。
- **驗證器**：prototype 元件沒有參考 `prototypeFlowInteractive` 時發出警告（預設不是錯誤；--strict-style 下與其他警告一樣升為錯誤）；尚未支援的 prototype 進入互動時仍可捲動與操作畫面內容，但鎖定 route 的 prototype 無法換頁。
- **互動中的留言證據**：依使用者決定（2026-10-07），畫面在互動中換頁後新增的留言仍錨定在畫面原本的 route（例如 `route:intake`），截圖卻是換頁後的頁面；接受這個差異並寫進文件，不在擷取前重新載入，也不修改留言錨點的規則。
- 文件同步更新 ui-flow-contract.md、storybook-integration.md、SKILL.md 的檢查清單、模板的 FLOW_SPEC.md 與 example 文件；縮放選單的手勢與快捷鍵清單加入雙擊或 Enter 進入互動、Esc 結束互動。
- 新增可重跑的 Chrome 檢查 `check_flow_frame_interact.mjs`（進入、結束、焦點、輸入路由、目前 route 標示、簡化檢視），`check_flow_canvas_comments.mjs` 加入「真實互動中的畫面在擷取模式下仍由擷取接收按壓」的案例。

## Non-Goals

- 不修改已存在於外部專案的 prototype（cm-linepay、cm-chipK 等）；它們可依新契約自行加入支援。
- 不在互動畫面中同步 Storybook 工具列的 theme 或 args。
- 不錄製或重播互動步驟，也不把互動中的 route 狀態寫入任何持久化資料。
- 不讓 flow-only node 或 Static Flow 支援互動。

## Capabilities

### New Capabilities

- `flow-frame-interaction`: UI Flow 中單一畫面的互動模式——進入與結束、互動中的輸入路由、目前 route 標示、簡化檢視中的步驟實例互動，以及 prototype 端的 `prototypeFlowInteractive` 互動預覽契約與驗證器警告。

### Modified Capabilities

- `storybook-prototype-vue-support`: Vue prototype contract parity 需求加入 `prototypeFlowInteractive` 互動預覽模式，Vue 模板與 React 模板一樣支援。

## Impact

- Affected specs: flow-frame-interaction（新）、storybook-prototype-vue-support
- 相依：在 rebuild-flow-canvas-camera、add-flow-canvas-level-of-detail（`a59669f`）、add-flow-canvas-comments、add-flow-journey-focus（`476f381`）、add-flow-auto-layout（`d6020a8`）與 add-flow-canvas-editing-tools（`abb6add`）之後實作，前置 change 都已實作並 commit（未歸檔）。依賴相機、快捷鍵 dispatcher、分層的固定名額與「已互動」標記、量測暫停、留言擷取模式的優先規則、選取與 Esc 順序，以及簡化檢視的步驟實例。
- 依賴前面 change 提供的介面：add-flow-canvas-level-of-detail 的固定畫面豁免、量測暫停 hook 與量測 observer 生命週期；rebuild-flow-canvas-camera 的 `targetIsControl`／`overlayOpen` 按鍵路由，以及其他畫布功能的程式化相機移動會結束 fit 追蹤；add-flow-journey-focus 的步驟實例鍵 `<stepIndex>:<nodeId>`。
- Affected code:
  - Modified:
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
    - storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
    - storybook-product-prototype/assets/prototype-template/docs/FLOW_SPEC.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/FLOW_SPEC.md
    - storybook-product-prototype/scripts/validate_prototype.py
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/scripts/check_flow_canvas_comments.mjs
    - storybook-product-prototype/references/ui-flow-contract.md
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/SKILL.md
  - New:
    - storybook-product-prototype/scripts/check_flow_frame_interact.mjs
  - Removed: (none)
