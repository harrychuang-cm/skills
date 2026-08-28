## Why

storybook-product-prototype 的 flow preview 模式(Static Flow 卡片與 `prototypeFlowPreview=true` iframe 路由預覽)沒有隱藏原型自身的操作 chrome:`FeaturePrototype` 模板(React 與 Vue)無條件渲染「Prototype」eyebrow + 路由標題 header 以及一排路由切換按鈕 nav,而 `--flow-preview` CSS modifier 只移除 padding 與 border。結果每張 UI Flow 卡片頂端都黏著「PROTOTYPE / <路由標題>」與路由按鈕列,真實產品頁面並不存在這些元素,污染 flow 審閱與 Figma 匯出。這是模板層缺陷,凡由模板 scaffold 出的原型一律重現。

## What Changes

- React 模板 FeaturePrototype.tsx.template:header 與 nav 改為僅在非 flow preview(`!isEmbeddedFlowPreview`)時渲染。
- Vue 模板 FeaturePrototype.vue.template:header 與 nav 加上 `v-if="!isEmbeddedFlowPreview"`,與 React 行為一致。
- 共用 CSS 模板 feature-prototype.css.template:在 `--flow-preview` modifier 下加入隱藏 `__header` 與 `__nav` 的防護規則,涵蓋標記結構被改寫但 class 命名保留的已生成原型。
- 驗證器 validate_prototype.py:新增檢查——原型元件必須依 `!isEmbeddedFlowPreview` 條件隱藏自身 chrome,缺少時報錯。
- 文件契約:ui-flow-contract.md Acceptance、storybook-integration.md、SKILL.md 明文規定 flow preview 模式必須隱藏原型自身 chrome(header 與路由導覽)。

## Non-Goals

- 不修改 design-system-to-storybook/storybook-template 的 ExamplePrototype(同類缺陷,但屬於獨立 Spectra 專案,由該專案自己的 change 處理)。
- 不回填修復既有專案中已 scaffold 出的原型實例;本變更只根除模板與契約來源。
- 不改動 Static Flow 匯出卡片自身的資訊 header(flowGroup/標題/viewport 徽章)——那是 flow 卡片的合法框架,不是原型 chrome。
- 不引入新的 query 參數或 props;沿用既有 `isFlowPreview` prop 與 `prototypeFlowPreview` query 機制。

## Capabilities

### New Capabilities

- `flow-preview-chrome`: flow preview 模式下原型自身 chrome(header 與路由導覽)必須隱藏的渲染契約,涵蓋 React 與 Vue 模板的條件渲染、共用 CSS 防護規則、驗證器檢查與文件宣告。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 `flow-preview-chrome`
- Affected code:
  - Modified: storybook-product-prototype/assets/prototype-template/FeaturePrototype.tsx.template
  - Modified: storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template
  - Modified: storybook-product-prototype/assets/prototype-template/feature-prototype.css.template
  - Modified: storybook-product-prototype/scripts/validate_prototype.py
  - Modified: storybook-product-prototype/references/ui-flow-contract.md
  - Modified: storybook-product-prototype/references/storybook-integration.md
  - Modified: storybook-product-prototype/SKILL.md
- 驗證途徑:storybook-product-prototype/scripts/test_scaffold_validate.py 既有 scaffold+validate 煙霧測試會在兩個框架下行使新驗證器檢查。
