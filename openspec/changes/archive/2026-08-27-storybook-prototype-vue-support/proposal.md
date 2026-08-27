## Why

storybook-product-prototype skill 目前硬性預期 React/TypeScript Storybook 專案：模板全為 .tsx、scaffold 產出檔名硬編碼 React 檔案、validator 以 *Prototype.tsx glob 定位檔案。在 Vue Storybook 專案中使用時，每次都要臨場把 React 模板心譯成 Vue SFC（產出慣例不一致），且 validate_prototype.py 直接失效（品質門檻與 --handoff-ready 檢查歸零）。當 Vue 成為反覆出現的 prototype 目標時，這是每次執行都要重付的經常性成本。

## What Changes

- 新增 Vue SFC 模板覆蓋組（overlay）：只包含框架相關檔案（Prototype SFC、stories、Static Flow export SFC、index.ts），與既有 `prototype-template/` 中框架中立的檔案（flow/data/meta TS、CSS、docs）共用，不重複維護。
- `scaffold_prototype.py` 新增 `--framework` 參數（auto/react/vue，預設 auto）：auto 模式從 target root 向上找最近的 package.json 依賴判斷框架；vue 模式改用 Vue 覆蓋組產出 `.vue` 與 `.stories.ts` 檔案。
- `validate_prototype.py` 新增框架偵測（由 prototype 資料夾內容自動判斷，或 `--framework` 覆寫）：檔案 glob、import 白名單（vue/@vue vs react/react-dom）、錯誤訊息措辭依框架切換；文字型檢查（parameters.prototype、Static Flow 契約、viewer 相容性 data 屬性）維持框架中立。
- `install_prototype_inspector.mjs` 加入 React-only 防護：偵測到非 React Storybook framework 時中止並輸出明確訊息（Inspector Vue 移植屬方案三範圍）。
- `SKILL.md` 與 `references/storybook-integration.md` 更新：宣告 Vue 支援範圍、Vue CSF 寫法、Inspector 在 Vue 專案不可用時的替代審查方式。
- 新增 scaffold→validate 煙霧測試腳本，覆蓋 react 與 vue 兩種框架路徑。

## Capabilities

### New Capabilities

- `storybook-prototype-vue-support`: storybook-product-prototype 的框架偵測、Vue SFC 模板組 scaffold、Vue prototype 驗證，以及 Inspector 的 React-only 安裝防護。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 `storybook-prototype-vue-support`
- Affected code:
  - New:
    - `storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.vue.template`
    - `storybook-product-prototype/assets/prototype-template-vue/FeaturePrototype.stories.ts.template`
    - `storybook-product-prototype/assets/prototype-template-vue/FeaturePrototypeFlowExport.vue.template`
    - `storybook-product-prototype/assets/prototype-template-vue/FeaturePrototypeFlowExport.stories.ts.template`
    - `storybook-product-prototype/assets/prototype-template-vue/index.ts`
    - `storybook-product-prototype/scripts/test_scaffold_validate.py`
  - Modified:
    - `storybook-product-prototype/scripts/scaffold_prototype.py`
    - `storybook-product-prototype/scripts/validate_prototype.py`
    - `storybook-product-prototype/scripts/install_prototype_inspector.mjs`
    - `storybook-product-prototype/SKILL.md`
    - `storybook-product-prototype/references/storybook-integration.md`
  - Removed: (none)
