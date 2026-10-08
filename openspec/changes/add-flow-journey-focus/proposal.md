## Why

prototype 一複雜，UI Flow 就同時畫出所有分支：一個判斷節點分出 6 條線時，6 條路徑的畫面與連線疊在同一張畫布上，審閱者很難只看「某一個功能」怎麼走。growth-fund 有 30 個 route、32 條顯示的連線、4 段 user story（實測），全部擠在一起。使用者希望有一份「功能清單」，點一個功能就只看那條流程，而且排成單純的一條線，不再有連線互相重疊。PRD 模板本來就有 `## Core Journeys`（Journey 1、Journey 2…），但這些旅程目前沒有進到 flow 的資料裡，UI Flow 無從得知。

## What Changes

- **flow 可宣告功能流程（journeys）**：flow 模板新增選用的 `journeys`，每筆是 `{ id, title, description?, steps }`，`steps` 依序列出 route id 或 flow node id，對應 PRD 的 Core Journeys；模板的匯出值保持字面上的 `[]`，用法範例寫在型別的 JSDoc。storybook-product-prototype 的 Step 4（Model UI Flow Before UI）改為從 PRD 的 Core Journeys 產生 journeys；storybook-template example 的 PRD 改為兩段 Journey，flow 宣告對應的 `approve-request` 與 `request-changes`。驗證器去除註解後讀取 journeys，檢查步驟是否為 `flow.routes`／`flow.nodes` 中的 id、journey id 是否為小寫 kebab-case、是否重複、至少兩步（錯誤），以及相鄰兩步之間是否有任何 transition（警告）。
- **沒有宣告時自動從分支推導**：以 flowLine 為 key 或 reference、kind 不是 return 或 global 的 transition 建立路徑圖。合格出邊通往兩個以上畫面的節點是分支點，每條分支出邊各推導一條短流程：分支點前最多兩步的前文、分支點、該出邊的目的畫面，再沿只有一條出邊的畫面往下走，遇到下一個分支點、匯合點、終點或重複的畫面就停止。名稱取自 transition 標籤加上目的畫面標題（例如「Approved · Implementation Handoff」），回到先前畫面時標上「↩」。一個判斷節點分出 6 條線時，就得到該判斷節點下的 6 條單線流程；分支點串接多段的 flow 也不會組合爆炸（growth-fund 為 17 條、最長 7 步，實測）。與宣告相同的推導不列出。
- **功能流程清單**：UI Flow 分頁左側新增與畫布並排、可收合的清單，依序是「全部」（完整 UI Flow）、宣告的功能流程（含步數），以及依分支點分組的「自動分支」區段；只有「全部」一項時不顯示清單。選擇會依 prototype 記在 sessionStorage；`[` 與 `]` 切換上一個與下一個，縮放選單列出這兩個鍵。
- **簡化檢視**：選擇一條流程後，畫布只顯示該流程的步驟實例（同一畫面出現兩次就有兩個實例，各自以「步驟索引:node id」識別），由左到右排成一列，每列最多 8 步、超過換行，每一步的可見預覽區在列中線上垂直置中；只畫相鄰兩步之間的連線（列內是水平直線，換列時沿兩列之間的空隙轉折），標籤沿用完整畫布的「條件／點擊」與 transition 標籤，fit 後也看得到；沒有 transition 的相鄰兩步畫成點線。推導的流程若因為回到先前步驟而停止，最後會顯示回到哪個畫面的標記。切換時相機 fit 該流程；簡化檢視的相機不寫入相機記憶，回到「全部」時恢復完整畫布的相機。
- **簡化排版即時計算、不寫入 layout**：簡化檢視是唯讀檢視：不能拖曳畫面，Reset 與 Import 停用並顯示「簡化檢視：位置不會儲存」；已存的 layout、Static Flow 與 layout payload 都不受影響。畫面仍沿用分層、截圖與 live iframe 的規則。

## Non-Goals

- 不把 journeys 匯出到 `docs/flow.json`，也不給 native／frontend 實作 skill 使用（可另案擴充 flow-codegen）。
- 不在簡化檢視中編輯或儲存位置，也不提供每條流程各自的自訂排版。
- 不自動修改既有 prototype 的 flow 檔；外部專案可自行加入 journeys。
- 不改 Static Flow、route iframe 契約與 flow layout payload。
- 不在本 change 定義編輯工具與互動模式在簡化檢視中的行為（分別由 add-flow-canvas-editing-tools 與 add-flow-frame-interact-mode 定義）。

## Capabilities

### New Capabilities

- `flow-journey-focus`: flow 的功能流程宣告與驗證、沒有宣告時的分支自動推導、UI Flow 的功能流程清單，以及只顯示單一流程的簡化檢視與其排版規則。

### Modified Capabilities

(none)

## Impact

- Affected specs: flow-journey-focus（新）
- 相依：rebuild-flow-canvas-camera（檢查點 commit e040d7d，未歸檔）與 add-flow-canvas-level-of-detail（commit a59669f，未歸檔）都已實作，本 change 接在它們之後。本 change 依賴它們預留的擴充點，不修改其規格：flow-canvas-navigation 的唯讀檢視（不啟動拖曳、Reset 與 Import 停用）、以畫布目前顯示的畫面為對象的 fit、只在顯示完整 flow 時寫入的相機記憶、可見矩形、由其他 capability 定義的連線標籤顯示規則、螢幕座標圖層跟隨相機，以及其他 capability 按鍵的路由規則；flow-canvas-level-of-detail 以畫面實例鍵識別分層與固定名額、以 route id 共用尺寸與截圖。其中「唯讀檢視」「只 fit 目前顯示的畫面」「只在顯示完整 flow 時寫入與還原相機」三項目前只寫在 flow-canvas-navigation 規格，程式還沒有，由本 change 加上。add-flow-canvas-editing-tools 與 add-flow-frame-interact-mode 排在本 change 之後，分別定義簡化檢視中編輯工具與互動模式的行為。
- 留言：add-flow-canvas-comments（仍在進行中）的「Canvas coordinate declaration」在套用本 change 前修改為：計算出位置的檢視保留 viewport 的 `data-sbfx-canvas`、world 圖層不帶 `data-sbfx-canvas-world`（2026-10-08 使用者決定）；本 change 依此實作，並完成該 change 延後到 journey 才能驗證的「同一畫面只有第一個實例帶錨點」。
- Affected code:
  - Modified:
    - storybook-product-prototype/assets/prototype-template/featurePrototypeFlow.ts.template
    - storybook-product-prototype/assets/prototype-template/docs/FLOW_SPEC.md
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas.js
    - storybook-product-prototype/assets/prototype-inspector/flow-canvas-geometry.js
    - storybook-product-prototype/assets/prototype-inspector/prototype-inspector.css
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/flow-canvas-geometry.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/prototype-inspector.css
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/examplePrototypeFlow.ts
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/PRD.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/FLOW_SPEC.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/docs/ACCEPTANCE.md
    - design-system-to-storybook/storybook-template/src/pages/prototypes/README.md
    - storybook-product-prototype/scripts/validate_prototype.py
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs
    - storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs
    - storybook-product-prototype/scripts/bench_flow_canvas.mjs
    - storybook-product-prototype/scripts/check_flow_canvas_comments.mjs
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/ui-flow-contract.md
    - storybook-product-prototype/references/storybook-integration.md
  - New: (none)
  - Removed: (none)
