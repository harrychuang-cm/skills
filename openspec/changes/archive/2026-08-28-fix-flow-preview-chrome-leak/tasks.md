## 1. 模板修正

- [x] 1.1 React 模板 chrome 條件渲染:`FeaturePrototype.tsx.template` 中的 header(Prototype eyebrow + 路由標題)與 nav(路由按鈕列)改為僅在 `!isEmbeddedFlowPreview` 時渲染;flow preview 模式下輸出的 DOM 不含這兩個區塊,一般 story 模式行為不變(satisfies Requirement: Flow preview hides prototype chrome)。驗證:對 scaffold 產物 grep `!isEmbeddedFlowPreview &&` 條件包住 header 與 nav,並由 scripts/test_scaffold_validate.py 煙霧測試通過。
- [x] 1.2 Vue 模板 chrome 條件渲染:`FeaturePrototype.vue.template` 的 header 與 nav 加上 `v-if="!isEmbeddedFlowPreview"`,與 React 行為一致(prop 或 `prototypeFlowPreview=true` query 皆隱藏;satisfies Requirement: Flow preview hides prototype chrome)。驗證:scaffold --framework vue 產物含該 v-if,scripts/test_scaffold_validate.py 通過。
- [x] 1.3 共用 CSS 防護規則:`feature-prototype.css.template` 在 `.__FEATURE_CSS_CLASS__--flow-preview` 範疇下加入隱藏 `__header` 與 `__nav` 的 `display: none` 規則,使 class 命名保留但標記被改寫的原型也被涵蓋(satisfies Requirement: Defensive CSS chrome hiding)。驗證:內容審閱確認規則存在且僅作用於 flow-preview modifier 範疇內。

## 2. 驗證器強化

- [x] 2.1 validate_prototype.py 新增 chrome 隱藏檢查:原型元件檔缺少 `!isEmbeddedFlowPreview` 條件時,驗證輸出一條指名「prototype must hide its own chrome (header/route nav) in flow preview mode」的錯誤;React 與 Vue 模式行為一致(satisfies Requirement: Validator enforces chrome hiding)。驗證:以缺少該條件的元件跑 validate_prototype.py 得到該錯誤(負向案例),再以新 scaffold 的 React 與 Vue 原型各跑一次確認通過(正向案例)。

## 3. 文件契約

- [x] 3.1 契約文件明文化:references/ui-flow-contract.md 的 Acceptance 清單、references/storybook-integration.md 的 flow preview 條目、SKILL.md 的 `prototypeFlowPreview` 條目各自加上「flow preview 模式必須隱藏原型自身 chrome(header 與路由導覽)」的規則(satisfies Requirement: Documentation declares the chrome contract)。驗證:內容審閱三個檔案皆含該規則描述。

## 4. 整體驗證

- [x] 4.1 端到端煙霧測試:執行 python3 storybook-product-prototype/scripts/test_scaffold_validate.py,React 與 Vue 兩種 scaffold 產物在含新檢查的驗證器下全部通過。驗證:測試腳本結束碼為 0 且輸出無錯誤。
