## 1. 選擇規則的純函式化

- [x] 1.1 依 design「決策一：名稱比對升級為硬性資格，數量門檻降為後備」、「決策二：巢狀且名稱不符的組不得成為 root」與「失敗模式」，完成 requirement「Variant group selection never replaces the payload root with a nested component」的選擇規則：在 `code.ts` 內建立不依賴 Figma runtime API 的 variant 組選擇純函式，輸入為候選 variant 組集合與 payload `componentTitle`，輸出為所選組或明確的 no-selection 結果，並附帶被略過候選組的識別名稱；名稱正規化相符者優先且不受組內 variant 數量限制，無相符組時僅允許 root 層級且含至少 2 個 variant 的組，其餘一律回傳 no-selection，任何輸入都不得拋出例外。以外掛目錄的 `npm run build` 通過型別檢查驗證。
- [x] 1.2 依 design「介面」與「驗收」，完成 requirement「Variant group selection is testable without the Figma runtime」：在 `test/verify-pure-functions.cjs` 新增涵蓋四種行為的案例，分別為名稱相符且多 variant、名稱相符但僅單一 variant、無名稱相符但 root 層級有多 variant 組、無名稱相符且多 variant 組皆位於巢狀層級；每個案例同時斷言回傳的被略過候選組名稱，且測試不得載入 Figma plugin runtime。以 `node test/verify-pure-functions.cjs` 全數通過驗證。

## 2. 匯入流程接線

- [x] 2.1 依 design「可觀察行為」，將 requirement「Variant group selection never replaces the payload root with a nested component」接上匯入流程：把 `createComponentSetFromVariants` 的候選挑選改為呼叫 1.1 的純函式，當結果為 no-selection 時改以 payload 的 `root` 重建實際節點樹而非回傳任何 variant 組，並保留既有 `combineAsVariants`、variant set 命名與排版行為不變。以外掛目錄的 `npm run build` 通過型別檢查驗證。
- [x] 2.2 依 design「決策三：選擇結果納入匯入統計」，將所選組識別名稱與被略過候選組名稱寫入匯入統計，使外掛回報可顯示本次採用了哪一組；no-selection 時明確記錄未採用任何組並改建實際樹。以匯入後統計輸出包含所選組與被略過組欄位驗證。

## 3. 建置、同步與端到端驗收

- [x] 3.1 依 design「Goals / Non-Goals」與「範圍邊界」，先遞增外掛 `package.json` 版本號再執行 `npm run build`，使 prebuild 的 `scripts/stamp-version.mjs` 把新版本寫入 `code.ts` 的 `PLUGIN_VERSION` 與 `ui.html` 的 build 徽章，並由 tsc 產生更新後的 `code.js`；接著將 runtime 檔案 `code.js`、`ui.html`、`manifest.json`、`README.md` 同步至 `design-system-to-storybook/storybook-template/figma/storybook-code-to-design`，該鏡像僅收 runtime 檔案，不得放入 `code.ts`、`package.json`、測試或建置設定。不得改動匯出端 addon、payload schema 或 `page` 匯入路徑。以正本與鏡像四個 runtime 檔案的 md5 全數相同、且 `node test/verify-manifest.mjs` 通過驗證。
- [x] 3.2 依 design「驗收」，以 `components-broker-import-broker-import-menu--default` 與 `components-actions-text-link--inline` 兩份 payload 於 Figma Desktop 實際匯入：前者須產出含 6 個 frame、5 個 text、3 個 svg 的完整樹且下拉框、兩顆按鈕與時間文字皆存在，後者結果須與修正前一致不得退化。以匯入後節點樹比對驗證，並執行 `node test/verify-pure-functions.cjs`、`node test/verify-manifest.mjs`、`node test/verify-bridge-helpers.cjs` 三項測試全數通過。
