## Why

範例原型 `ExamplePrototype` 在 flow preview 模式沒有隱藏自身 chrome:topbar(request id + 路由標題 + 狀態徽章)與路由 tab 按鈕列無條件渲染,`--flow-preview` CSS modifier 只移除 padding 與 border,因此 Static Flow 卡片頂端黏著真實頁面不存在的原型操作介面。此外元件只認 `isFlowPreview` prop、從不讀取 `prototypeFlowPreview=true` query 參數,iframe 路由預覽根本無法進入 flow preview 模式。此範例是下游專案照抄的原型契約示範,缺陷會被複製。上游 cm-skills 的 storybook-product-prototype 模板已以同名 change 修正,本變更讓範例與正典契約一致。

## What Changes

- ExamplePrototype.tsx:新增從 URL 讀取 `prototypeFlowPreview=true` 的 flow preview 判定(prop 或 query 任一成立即生效),topbar 與 tabs 僅在非 flow preview 時渲染。
- example-prototype.css:在 `--flow-preview` modifier 範疇下加入隱藏 `__topbar` 與 `__tabs` 的防護規則。
- src/pages/prototypes/README.md:原型撰寫規範加上「flow preview 模式必須隱藏原型自身 chrome(topbar 與路由導覽)」的規則。

## Non-Goals

- 不改動 Static Flow 匯出卡片自身的資訊 header(flowGroup/標題/viewport 徽章)——那是 flow 卡片的合法外框,不是原型 chrome。
- 不修改 Prototype Inspector 資產(.storybook/prototype-inspector/)——其行為不依賴範例 chrome,且該資產須與上游 skill 副本位元組一致。
- 不引入新的 props 或 query 參數;沿用正典契約既有的 `isFlowPreview` prop 與 `prototypeFlowPreview` query 機制。

## Capabilities

### New Capabilities

- `flow-preview-chrome`: flow preview 模式下範例原型必須隱藏自身 chrome(topbar 與路由導覽)並支援 `prototypeFlowPreview=true` query 判定的渲染契約,涵蓋條件渲染、CSS 防護規則與 README 規範宣告。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 `flow-preview-chrome`
- Affected code:
  - Modified: src/pages/prototypes/example-prototype/ExamplePrototype.tsx
  - Modified: src/pages/prototypes/example-prototype/example-prototype.css
  - Modified: src/pages/prototypes/README.md
- 驗證途徑:npm run typecheck 確認元件改動可通過型別檢查;內容審閱確認 CSS 規則與 README 規範。
