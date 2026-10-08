## Summary

讓 UI Flow 不再為每個 route 同時開一個完整的 Storybook iframe。依縮放與畫面在螢幕上的大小決定顯示方式：在視窗外的畫面不渲染、縮小時顯示快取的截圖、放大或 hover 時才掛上 live iframe，而且同時最多 6 個。截圖用 Inspector 內建、不依賴任何套件的 DOM 點陣化程式產生，並存在 IndexedDB，下次開啟幾乎立即顯示。

## Motivation

UI Flow 卡頓的主因是 iframe 數量，不是繪圖方式。2026-10-02 實測（headless Chromium、Apple Silicon、Vite dev 已暖機，cm-linepay growth-fund，30 個 route；量自 cm-linepay 的舊版 4,131 行 Inspector 安裝，目前版本的基準由 rebuild-flow-canvas-camera 的 bench 重新量測）：

- **實測**：Story 模式 0.35 秒就緒、Chromium renderer 行程記憶體 146MB；UI Flow 4.6 秒就緒（Vite 冷啟動 12.1 秒）、686MB、31 個 document、15,413 個 DOM 節點。平均每多一個 route iframe 約 18MB。
- 每個 route iframe 都是完整的 Storybook preview：載入 index.json、所有 preview annotation（包含 236KB 的 Inspector 本身與專案的 token CSS；236KB 是 cm-linepay 舊版安裝的量測值，2026-10-07 的 Inspector 為 preview.js 173KB、flow-canvas.js 77KB、geometry 32KB、CSS 82KB），dev 模式下還各開兩條 WebSocket。iframe 用 `loading="eager"` 一次全部載入，量尺寸則每 250ms 輪詢一次、最多 80 次。
- 在筆電上 fit 時，實際 prototype 的畫面只有 57–248px 寬，這個大小下 live iframe 與截圖看起來幾乎一樣，卻要付出完整的執行成本。
- **實測**（研究原型，靜態 build）：30 個 live iframe 增加 238MB、6 個增加 37MB，30 張點陣圖低於量測雜訊；自製點陣化每個 375×812 畫面中位數 26ms，與瀏覽器實際截圖相比只有 0.01% 的像素不同。html-to-image 要 43ms、差 2.07%，而且在 token 很多的專案（cm-chipK 的 `:root` 有 9,577 個 custom property）單一畫面要 116–149 秒。

## Proposed Solution

- **畫面顯示分層。** 以縮放、畫面在螢幕上的寬度 W 與可見比例決定：視窗外（含半個視窗的緩衝）不渲染，只保留定位框，連線照畫；W < 40px 顯示扁平佔位；其餘顯示截圖（尚無截圖時顯示標題骨架）；縮放 ≥ 0.8 且至少 40% 可見時升為 live iframe，降回門檻為縮放 0.64（避免來回切換）；hover 停留 200ms 或被選取時，縮放 ≥ 0.4 也會升為 live。live 門檻依縮放而不是寬度，因為內容以 1:1 像素渲染，桌機畫面不會在內文只有幾 px 時就占用 live 名額；手機畫面的結果與「W ≥ 300px」相同。被其他功能固定的畫面（例如後續 change 的互動模式）不受門檻與剔除影響。同一 route 在畫布上出現多次時（後續 change 的簡化檢視），每個 instance 各自分層、共用尺寸與截圖。分層只在相機閒置、hover、固定、提升、尺寸、畫布尺寸或畫面位置改變時重新計算，相機閒置時的分層與相機狀態在同一次 React commit 套用。
- **live iframe 上限。** 同時最多 6 個 live iframe，另保留 1 個名額給其他功能固定的畫面（例如後續 change 的互動模式），加上 1 個截圖用的隱藏 iframe。依優先順序（固定的、被選取的、hover 的、可見面積大且靠近中央的）分配，其餘以 LRU 降回截圖。同時只開機 1 個 iframe。降級時直接移除 iframe 元素並釋放所有 contentWindow 參考，live 期間不移動 iframe 的 DOM 位置，以免觸發重新載入。開機完成前用截圖蓋住，不會閃白。
- **尺寸快取。** 量到的預覽尺寸依 story、prototype、route 與 viewport signature 快取並隨截圖紀錄持久化，所有分層都用同一個尺寸，切換顯示方式時畫面與連線不會跳動。這是每個瀏覽器各自的渲染快取：不寫入 flow layout payload，Static Flow 也不讀取（以 delta 修改 flow-viewport-declaration 的對應敘述）。量測改為每次 live iframe 文件載入後對預覽標記掛 ResizeObserver、每幀合併一次，取代 80 次輪詢，並防止 `100vh` 造成的尺寸回授迴圈；截圖產生器也以同一套規則量測從未 live 過的畫面。其他功能（例如互動模式）可暫停單一畫面的量測寫入。
- **零依賴截圖。** 新模組 `flow-snapshot.js`：複製 iframe 內的 DOM，只內嵌與瀏覽器預設值不同的標準 CSS 屬性（不列舉 custom property），內嵌用到的字型與圖片，序列化成 SVG foreignObject（以 data: URL 載入，blob: URL 會汙染 canvas），畫到 canvas 後以 WebP（不支援時用 PNG）編碼。重驗時傳入上次的雜湊，相同就不繪製也不編碼。附有空白偵測、8 秒逾時、尺寸上限與 `data-sbfx-capture-ignore` 排除。失敗時改顯示骨架，不影響其他功能。
- **截圖產生器。** 單一隱藏但有排版的 iframe，以 `history.replaceState` 加上 Storybook 的 FORCE_REMOUNT 原地切換 route（研究以 data-route 判斷就緒時每次 6–40ms；等待 Storybook 的 completed phase 時每次至少約 100ms，估計），送出前訂閱 `storyRenderPhaseChanged`，看到送出後的 loading 再 completed 才截圖，不會截到上一個 route。在瀏覽器閒置時一次截一張，順序是可見的、靠近視窗的、其他的；手勢、拖曳或分頁隱藏時暫停，並中止進行中的截圖。從 StaticFlow story 開啟時不產生截圖。
- **快取與失效。** 記憶體 LRU 加上 IndexedDB（`prototype-inspector-snapshots`）。開啟時先顯示快取，每個工作階段再重新渲染恰好一次並比對序列化內容的雜湊，不同才換圖。dev 模式下 Vite HMR 更新會把截圖標成待更新，等截圖產生器自己套用更新（收到它的 `storyHotUpdated`）後才重截，先更新可見的。以一般預覽網址載入且沒被互動過的 live iframe 也會順便更新截圖。
- **非 live 的畫面不可聚焦。** iframe 加上 `inert`、`tabindex="-1"`、`aria-hidden`，鍵盤 Tab 不會跑進 route 文件。

## Non-Goals

- 不修改 route iframe 的 URL 契約、prototype 模板，也不要求 prototype 配合任何改動。
- 不做 build 時期的截圖產生（例如以 CDP 預先截圖寫入 storybook-static），可作為後續選項。
- 不在截圖中呈現 Components 模式的 composition、prop override 或 token sandbox 變體；UI Flow 只呈現預設 composition。
- 不讓 route iframe 跟隨 Storybook 工具列的 theme／backgrounds（維持現況的 initialGlobals）。
- 不支援從 StaticFlow story 開啟 UI Flow：route iframe 沿用目前 story id（與現況相同），且此時不產生、不儲存截圖。
- 不新增任何 npm 依賴，不修改 `fingerprint.mjs`。

## Alternatives Considered

- **html-to-image**：只透過 figma-export addon 間接存在，Inspector 引用會變成新依賴；在 token 很多的專案每個畫面要數秒到兩分鐘以上，且會把字級改小 0.1px 造成換行不同。因此否決。
- **無腳本的靜態 DOM 複本（srcdoc iframe）**：每張約 4.3–5.6MB，仍是一張一個 document，且失去 canvas 內容與表單狀態。因此否決。
- **只用骨架佔位、不做截圖**：fit 時看不到任何畫面內容，失去 UI Flow 總覽的意義。只保留為截圖失敗時的備案。
- **build 時期以 CDP 預先截圖**：只適用靜態 build，dev 模式仍需執行期截圖；列為後續選項。
- **以畫面寬度作為 live 門檻**：桌機畫面在縮放約 0.2 時就達到 300px，內文卻只有約 3px（估計），會把 live 名額與 dev 開機成本花在看不清的畫面上。因此改以縮放判斷。
- **以共用的 canonical story id 作為截圖鍵**：同一 prototype 的不同 story 可能傳入不同 args，共用截圖可能顯示錯誤狀態，且需要新的 meta 欄位。因此否決，截圖仍以目前 story id 為鍵。

## Impact

- Affected specs: flow-canvas-level-of-detail（新）、flow-viewport-declaration（修改 Layout payload viewport signature：只持久化 positions 的敘述限定在 flow layout payload）
- 相依：必須在 rebuild-flow-canvas-camera 之後實作（依賴其相機狀態、閒置事件、geometry 模組、flow-canvas.js、`bench_flow_canvas.mjs` 與 `create_flow_bench_fixture.mjs` 產生的 fixture）。
- Affected code:
  - Modified:
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/assets/prototype-inspector/preview.js（只改 build tag）
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/scripts/test_authority_inspector.mjs（注入新模組）
    - storybook-product-prototype/scripts/check_flow_canvas_comments.mjs（capture 案例先讓畫面升為 live）
    - storybook-product-prototype/scripts/bench_flow_canvas.mjs
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/storybook-integration.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
  - New:
    - storybook-product-prototype/assets/prototype-inspector/flow-snapshot.js
    - storybook-product-prototype/assets/prototype-inspector/flow-snapshot-cache.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-hmr.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-snapshot.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-snapshot-cache.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-hmr.js
    - storybook-product-prototype/scripts/test_flow_snapshot.test.mjs
    - storybook-product-prototype/scripts/test_flow_snapshot_cache.test.mjs
    - storybook-product-prototype/scripts/test_flow_snapshot_fidelity.mjs
  - Removed: (none)
