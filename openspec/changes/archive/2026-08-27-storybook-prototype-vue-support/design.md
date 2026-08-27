## Context

storybook-product-prototype skill 的產出鏈分兩層：框架中立層（docs 模板、`*Flow.ts` / `*Data.ts` / `*Meta.ts` metadata、CSS、`parameters.prototype` 契約）與框架相關層（Prototype 元件、stories、Static Flow export，目前全為 React `.tsx` 模板）。`scaffold_prototype.py` 的 TOKEN_FILES 對照表硬編碼 `.tsx` 產出檔名；`validate_prototype.py` 的 validate_files 以 `*Prototype.tsx` 等 glob 定位檔案，import 白名單只認 react/react-dom；`install_prototype_inspector.mjs` 安裝的 Inspector addon 在 preview 端回傳 React element，僅能在 React Storybook 運作。

在 Vue Storybook 專案中，這條產出鏈於框架相關層斷裂：scaffold 產出無法使用、validator 找不到檔案直接失敗、Inspector 裝了也無法渲染。

## Goals / Non-Goals

**Goals:**

- Vue Storybook 專案可用 scaffold 產出可直接填寫的 Vue SFC prototype 檔案組。
- validator 在 Vue prototype 資料夾上維持與 React 相同的檢查涵蓋面（檔案齊全、docs 一致性、component map、token 紀律、meta 契約、viewer 相容性）。
- Inspector 安裝腳本在非 React 專案上安全失敗，不留下壞掉的安裝。
- SKILL.md 與 references 準確描述 Vue 支援範圍與限制。

**Non-Goals:**

- Prototype Inspector 的 Vue 移植（方案三，另案處理）。
- Angular、Svelte、Web Components 等其他框架支援。
- 重構既有 React 模板的目錄結構或內容（overlay 方案不動 `prototype-template/`）。
- `inventory_components.py` 的修改：其 STORY_GLOBS 已涵蓋 `.stories.ts` / `.stories.js`，Vue 專案的 stories 檔可被現行邏輯發現。
- design-system-to-storybook skill 的任何變更。

## Decisions

### Vue 模板採 overlay 覆蓋組

新增 `assets/prototype-template-vue/`，只放框架相關檔案：Prototype SFC、Prototype stories、FlowExport SFC、FlowExport stories、index.ts。scaffold 在 vue 模式下先套用 `prototype-template/` 中未被覆蓋的框架中立檔案（docs、flow/data/meta TS、CSS），再套用覆蓋組，並跳過 React 專屬的四個 `.tsx` 模板。

替代方案與否決理由：
- 全套複製一份 Vue 模板目錄：docs 與 metadata 模板會出現兩份維護點，改一處漏一處。
- 重構為 shared/react/vue 三層目錄:更乾淨但要搬動既有 React 模板路徑，動到已驗證的產出鏈，風險與收益不成比例。

### scaffold 框架偵測與 --framework 參數

`scaffold_prototype.py` 新增 `--framework` 參數，值域 `auto`（預設）、`react`、`vue`。auto 模式從 `--target-root` 解析後的絕對路徑向上走訪，找最近的 package.json，讀 dependencies 與 devDependencies：含 `vue` 或任何 `@storybook/vue3*` 套件判為 vue；含 `react` 判為 react；兩者皆無或找不到 package.json 時回退 react 並在 stdout 印出偵測結果與回退原因。偵測結果一律印出，讓使用者可即時發現誤判並以明確值覆寫。

替代方案與否決理由：讀 `.storybook/main.*` 的 framework 欄位更精準，但 main 檔可能是 ts/js/mjs/cjs 多種格式且含任意程式碼，Python 端解析成本高；package.json 依賴判斷已足夠，誤判時有明確覆寫途徑。

### validator 依資料夾內容偵測框架

`validate_prototype.py` 新增 `--framework` 參數（`auto` 預設、`react`、`vue`）。auto 模式以資料夾內容判斷：存在 `*Prototype.vue` 判為 vue，存在 `*Prototype.tsx` 判為 react，兩者皆無時報 missing component file 錯誤並以 react 措辭輸出其餘缺檔訊息。偵測後 validate_files 依框架切換 glob 對照：vue 模式為 `*Prototype.vue`、`*Prototype.stories.ts`、`*PrototypeFlowExport.vue`、`*PrototypeFlowExport.stories.ts`；flow/data/meta/css/index/flow layout helper 檔案模式兩框架相同。錯誤與警告訊息中的 `*Prototype.tsx` 措辭改由框架對應的檔名模式代入。validate_component_usage 的 import 白名單依框架切換：react 模式維持現行集合，vue 模式改排除 `vue` 與 `@vue/` 開頭套件。

### Vue 檔案慣例與框架中立契約檢查

Vue 模板遵循以下慣例，使 validator 的文字型檢查在兩框架通用：

- SFC 使用 `<script setup lang="ts">`，stories 使用 CSF3 與 `@storybook/vue3` 的 Meta/StoryObj 型別。
- SFC template 內的元件引用一律 PascalCase，使現行 render regex（`<Name` 形式）不需修改即可檢查。
- Prototype SFC 自行實作 `prototypeFlowPreview` 與 `prototypeRoute` query 參數處理（URLSearchParams 邏輯在元件內，不依賴 Inspector），並輸出 `data-prototype-root` 與 `data-prototype-route-preview` 屬性。
- FlowExport SFC 滿足 validate_static_flow_export 的全部文字契約：import `../prototypeFlowLayout`、使用 readPrototypeFlowLayoutPositions 與 getPrototypeFlowLayoutStorageKey、支援 isFlowPreview、輸出 data-layout-source 與 data-figma-text-auto-width。
- stories 模板帶 `layout: "fullscreen"` 與 `parameters.prototype`，FlowExport stories 匯出名為 StaticFlow 的 story。

如此 validate_story、validate_static_flow_story、validate_static_flow_export、validate_viewer_compatibility、validate_meta 五個檢查函式完全不需框架分支，只有檔案定位與 import 白名單分框架。

### Inspector 安裝加入 React-only 防護

`install_prototype_inspector.mjs` 在複製檔案前讀取 `.storybook/main.*` 內容，以字串比對偵測非 React renderer 套件（`@storybook/vue3`、`@storybook/angular`、`@storybook/svelte` 等已知前綴）：偵測到即以非零 exit code 中止，stderr 輸出「Prototype Inspector 目前僅支援 React Storybook」與 SKILL.md 對應段落指引，且不寫入任何檔案。偵測不到 main 檔或無法判斷時維持現行行為（照常安裝），避免防護誤傷既有 React 使用者。

### 煙霧測試腳本

新增 `scripts/test_scaffold_validate.py`：對 react 與 vue 兩框架各執行一輪「scaffold 到暫存目錄（明確傳 --framework）→ 立即執行 validate_prototype.py」。斷言：scaffold 成功產出對應框架的檔案組（vue 輪不得出現 .tsx，react 輪不得出現 .vue）；validator 的框架偵測結果正確；validator 對剛 scaffold 的模板輸出的 errors 清單與既有 React 模板的基準行為一致（模板含未填寫的 bracketed guidance，容許與基準相同的預期輸出，不容許 missing file 類錯誤）。腳本以 python3 直接執行、無第三方依賴，回傳非零 exit code 表示失敗，與 repo 內其他 skill 的 test_*.mjs 自足測試腳本慣例一致。

## Implementation Contract

**行為：**

- 在 Vue Storybook 專案執行 scaffold 並指定或自動偵測為 vue 時，產出資料夾包含 `<Feature>Prototype.vue`、`<Feature>Prototype.stories.ts`、`<Feature>PrototypeFlowExport.vue`、`<Feature>PrototypeFlowExport.stories.ts`、index.ts，以及與 React 模式相同的 flow/data/meta TS、CSS、docs 檔案組；資料夾內不得出現任何 .tsx 檔。
- 對該資料夾執行 validate_prototype.py 時，validator 自動判為 vue 並完成全部檢查段落，missing file 類錯誤為零；`--strict-style`、`--handoff-ready`、`--storybook-index` 參數在 vue 模式行為與 react 模式一致。
- React 專案的現行行為完全不變：不帶 `--framework` 的既有呼叫產出與驗證結果與變更前相同。
- 在 Vue Storybook 專案執行 install_prototype_inspector.mjs 時，安裝中止、無檔案寫入、exit code 非零、stderr 說明 React-only 限制。

**介面：**

- `scaffold_prototype.py` 新增 `--framework {auto,react,vue}`，預設 auto；stdout 印出偵測到的框架與依據。
- `validate_prototype.py` 新增 `--framework {auto,react,vue}`，預設 auto；輸出訊息中的檔名措辭與偵測框架一致。
- `test_scaffold_validate.py` 無必要參數，成功時 exit 0 並印出兩框架各自的通過摘要。

**失敗模式：**

- scaffold auto 偵測不到 package.json 或依賴無法判斷：回退 react，印出回退原因，不中止。
- validator auto 偵測在資料夾同時存在 .tsx 與 .vue prototype 檔時：報錯提示框架混雜並要求以 `--framework` 明確指定，不猜測。
- installer 讀不到 `.storybook/main.*`：照常安裝（維持現行行為），不因防護新增誤判中止。

**驗收：**

- 執行 python3 storybook-product-prototype/scripts/test_scaffold_validate.py 回傳 exit 0。
- 手動驗收：在一個 Vue3 + Vite Storybook 專案 scaffold 一個 feature，npm run storybook 可載入 Prototype story 與 StaticFlow story，`?prototypeRoute=<entry>` 與 `?prototypeFlowPreview=true` query 模式渲染正確。
- 對既有 React 範例 prototype 資料夾（若 repo 內存在）重跑 validator，輸出與變更前一致。

**範圍邊界：**

- In scope：上述兩個 Python 腳本、installer 防護、Vue 模板覆蓋組、SKILL.md 與 storybook-integration.md 文件更新、煙霧測試。
- Out of scope：Inspector addon 本體（assets/prototype-inspector/ 不動）、prototypeFlowLayout.ts helper（框架中立，不動）、React 模板內容、inventory_components.py、其他 skill。

## Risks / Trade-offs

- [Vue SFC 全文跑 import regex 可能誤抓 template 區塊文字] → import 語句僅存在於 script 區塊且 IMPORT_PATTERN 錨定 import 關鍵字語法，誤抓機率低；煙霧測試覆蓋 vue 模板的 component usage 檢查路徑。
- [monorepo 中 auto 偵測找到錯誤的 package.json] → 偵測結果一律印出，且 `--framework` 明確值永遠優先於偵測。
- [Vue 專案缺 Inspector，UI Flow runtime 審查缺席] → SKILL.md 記載替代審查路徑：StaticFlow story 作為 flow 審查面、docs 直接閱讀；此為方案三前的已知限制，不隱藏。
- [installer 字串比對防護漏判自訂 framework 套件名] → 防護採已知前綴清單、漏判時行為等同現狀（安裝後不渲染），不會比變更前更糟。
- [模板含 bracketed guidance 時煙霧測試的 validator 基準可能隨模板演進漂移] → 測試以「react 輪與 vue 輪輸出等價」為主要斷言，而非硬編碼完整訊息清單。
