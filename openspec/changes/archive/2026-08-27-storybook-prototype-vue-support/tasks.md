## 1. Vue 模板覆蓋組

- [x] 1.1 依 design「Vue 模板採 overlay 覆蓋組」與「Vue 檔案慣例與框架中立契約檢查」建立 `storybook-product-prototype/assets/prototype-template-vue/` 中的 FeaturePrototype.vue.template 與 FeaturePrototype.stories.ts.template：SFC 使用 `<script setup lang="ts">`、template 內元件引用一律 PascalCase、元件內以 URLSearchParams 實作 prototypeFlowPreview 與 prototypeRoute query 模式並輸出 data-prototype-root 與 data-prototype-route-preview 屬性；stories 為 @storybook/vue3 CSF3、含 `layout: "fullscreen"` 與 parameters.prototype，滿足 spec「Vue prototype contract parity」。驗證：以 grep 確認兩個模板含上述全部 token，並由 5.1 煙霧測試的 vue 輪通過 validate_viewer_compatibility 與 validate_story 檢查。
- [x] 1.2 建立 FeaturePrototypeFlowExport.vue.template、FeaturePrototypeFlowExport.stories.ts.template 與 index.ts：FlowExport SFC import `../prototypeFlowLayout`、使用 readPrototypeFlowLayoutPositions 與 getPrototypeFlowLayoutStorageKey、支援 isFlowPreview、輸出 data-layout-source 與 data-figma-text-auto-width；stories 匯出名為 StaticFlow 的 story；index.ts 匯出 Vue 元件。驗證：grep 確認契約 token 齊全，並由 5.1 煙霧測試 vue 輪通過 validate_static_flow_export 與 validate_static_flow_story 檢查。

## 2. Scaffold 框架支援

- [x] 2.1 依 design「scaffold 框架偵測與 --framework 參數」為 `storybook-product-prototype/scripts/scaffold_prototype.py` 加入 `--framework {auto,react,vue}`（預設 auto）：auto 模式從 target root 向上找最近 package.json，依 vue/@storybook/vue3* 與 react 依賴分類，明確值優先於偵測，stdout 印出選定框架與依據，偵測不到時回退 react 並印出原因、不中止，滿足 spec「Scaffold framework selection」。驗證：對三個暫存 fixture（vue 依賴、react 依賴、無 package.json）各執行一次 CLI，stdout 分別顯示 vue、react、react（含 fallback 原因）。
- [x] 2.2 實作 vue 模式的 overlay 產出邏輯：套用框架中立模板後以 prototype-template-vue 覆蓋框架相關檔案並跳過四個 React `.tsx` 模板，產出資料夾含 `.vue` 元件、`.stories.ts` stories、index.ts 與既有 flow/data/meta/CSS/docs 檔案組且不含任何 `.tsx`，滿足 spec「Vue template overlay scaffold output」；react 模式（含 auto 判為 react）產出檔案組與變更前完全相同。驗證：`--framework vue` scaffold 至暫存目錄後以 find 斷言無 .tsx 且必要檔案齊全；`--framework react` scaffold 輸出與變更前基準檔案清單 diff 為空。

## 3. Validator 框架支援

- [x] 3.1 依 design「validator 依資料夾內容偵測框架」為 `storybook-product-prototype/scripts/validate_prototype.py` 加入 `--framework {auto,react,vue}`（預設 auto）：存在 *Prototype.vue 判 vue、存在 *Prototype.tsx 判 react、兩者並存時報 mixed-framework 錯誤並要求明確指定且不執行框架相關檢查、皆無時以 react 措辭報 missing component file，滿足 spec「Validator framework detection」。驗證：對 vue 資料夾、react 資料夾、混雜資料夾三個 fixture 各執行 CLI，輸出分別為 vue 措辭檢查、react 措辭檢查、mixed-framework 錯誤。
- [x] 3.2 實作 vue 模式檢查對照：validate_files 依框架切換 component/story/static flow glob（*Prototype.vue、*Prototype.stories.ts、*PrototypeFlowExport.vue、*PrototypeFlowExport.stories.ts），flow/data/meta/css/index/flow layout helper 不變；validate_component_usage 的 import 白名單在 vue 模式排除 `vue` 與 `@vue/` 前綴；錯誤與警告訊息措辭代入框架對應檔名模式；--strict-style、--handoff-ready、--storybook-index 行為兩框架一致，滿足 spec「Validator coverage parity in vue mode」。驗證：對 2.2 剛 scaffold 的 vue 資料夾執行 validator，missing-file 錯誤為零且 react 模式的全部檢查段落皆有執行。
- [x] 3.3 確認 react 行為回歸不變，滿足 spec「React validation behavior is preserved」：不帶 --framework 對既有 React prototype 資料夾（以變更前程式 scaffold 的基準資料夾）執行 validator，errors 與 warnings 輸出與變更前逐行一致。驗證：以 git stash 或基準輸出檔比對變更前後 validator 輸出，diff 為空。

## 4. Inspector 安裝防護

- [x] 4.1 依 design「Inspector 安裝加入 React-only 防護」為 `storybook-product-prototype/scripts/install_prototype_inspector.mjs` 加入寫檔前檢查：讀取 .storybook/main.* 內容，字串比對到 @storybook/vue3、@storybook/angular、@storybook/svelte 等已知非 React renderer 前綴時以非零 exit code 中止、stderr 說明 Prototype Inspector 僅支援 React Storybook、不寫入任何檔案；讀不到或無法分類 main 檔時維持現行安裝行為，滿足 spec「Inspector installer React-only guard」。驗證：對含 @storybook/vue3-vite main.ts 的 fixture 執行 → exit code 非零且 fixture 目錄樹無新增檔案；對無 main 檔的 fixture 執行 → 安裝流程照舊完成。

## 5. 煙霧測試

- [x] 5.1 依 design「煙霧測試腳本」建立 `storybook-product-prototype/scripts/test_scaffold_validate.py`：python3 直接執行、無第三方依賴，對 react 與 vue 各執行 scaffold（明確 --framework）→ validate 一輪；斷言產出不含另一框架的元件格式、validator 框架偵測正確、無 missing-file 錯誤、vue 輪輸出與 react 輪基準等價；成功 exit 0 並印出每框架摘要，任一斷言失敗 exit 非零並指名缺失檔案，滿足 spec「Scaffold and validate smoke test」。驗證：python3 storybook-product-prototype/scripts/test_scaffold_validate.py 回傳 exit 0；暫時移除一個 vue overlay 模板重跑 → exit 非零且訊息指名該檔。

## 6. 文件更新

- [x] 6.1 更新 `storybook-product-prototype/SKILL.md`：description 與內文宣告 Vue Storybook 專案支援 scaffold 與驗證、記載兩個腳本的 --framework 參數、明載 Prototype Inspector 為 React-only 並指名 StaticFlow story 與直接閱讀 docs 作為 Vue 專案的 flow 審查替代路徑，滿足 spec「Documentation states the Vue support scope」。驗證：內容審閱——依 spec 場景「Vue user finds the support boundary」逐項核對三個資訊點（支援範圍、--framework、Inspector 限制與替代路徑）皆可在 SKILL.md 找到。
- [x] 6.2 更新 `storybook-product-prototype/references/storybook-integration.md`：記載 overlay 模板使用的 Vue CSF 慣例（@storybook/vue3 Meta/StoryObj、.stories.ts 檔名、SFC PascalCase 元件引用、parameters.prototype 掛法與 React 相同），滿足 spec「Documentation states the Vue support scope」的 Storybook integration reference 要求。驗證：內容審閱——文件列出的慣例與 1.1、1.2 模板實際內容一致。
