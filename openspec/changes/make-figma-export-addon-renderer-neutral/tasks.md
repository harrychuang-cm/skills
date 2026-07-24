## 1. 環境偵測與安裝契約

- [x] 1.1 實作「使用能力矩陣自動偵測，而不是以 React 作預設」與 Storybook environment detection and capability report：`detectStorybookEnvironment({ productRoot, rendererOverride? })` 對 React、Vue 3、builder、Storybook major、衝突與 unknown 回傳規格化結果；以 `node design-system-to-storybook/scripts/test_detect_storybook_environment.mjs` 的 table tests 驗證。
- [x] 1.2 將 Interfaces and data shapes 與 Failure modes 接入 `install_figma_export_addon.mjs`，讓 `--renderer`、`--json`、pre-mutation ambiguity guard 與 capability-scoped 結果成為可觀察 CLI 契約；以 `node design-system-to-storybook/scripts/test_install_figma_export_addon.mjs` 驗證成功輸出、override、衝突不寫檔與非零 exit code。

## 2. 真實框架測試基線

- [x] 2.1 在 addon test 範圍建立最小 React 與 Vue 3 + Vite + Storybook 10 fixtures，兩者使用相同 story 語意、options 與 review server 設定，且 Vue manifest 不宣告 `react`／`react-dom`；以兩個 fixture 的 `storybook build` 與 manifest assertion 驗證。
- [x] 2.2 實作「以共享功能契約驗證 React 與 Vue」及 Shared real-Storybook renderer parity verification harness，讓同一 browser suite 可參數化執行 export、review、comment、persistence、report、source action 與 failure state；先以 React baseline 全數通過、Vue 未完成項目明確失敗來驗證 harness 能偵測 renderer-specific regression。

## 3. Renderer-neutral Review runtime

- [x] 3.1 從現有 React review view 拆出 framework-neutral meeting、comment、capture、report 與 capability controller，維持 channel event、HTTP request、options 與 storage data shape；以既有 `npm run test:visual-comments` 及新增 controller tests 驗證行為與序列化結果不變。
- [x] 3.2 實作「將 Preview UI 改為 renderer-neutral 的獨立 DOM host」基礎 workspace，讓 disclosure、Review 狀態、capability status、來源與報告入口掛在 `document.body` 且不成為 story root 後代；以 React／Vue browser DOM assertions 與 workspace interaction tests 驗證。
- [x] 3.3 在 DOM host 完成 meeting start／join／end、歷史 meeting、comment list、edit／delete 與 report lifecycle，使 Vue visual review and comment feature parity 的資料操作與 React 相同；以 shared browser meeting/comment lifecycle scenarios 與 HTTP/store tests 驗證。
- [x] 3.4 在 DOM host 完成 Renderer-neutral visual capture surface，包括 pre-action capture、captureSelector、composer、normalized pins、evidence preview、portal、report actions 與 AI fix context；以 React／Vue shared capture scenarios、viewport rerender assertions 與既有 visual comment fixture tests 驗證。
- [x] 3.5 完成 Renderer-neutral review workspace decorator：decorator strict-identity 回傳 React element 或 Vue vnode，story／viewMode／HMR 會清理暫態資源，preview／review artifacts 無 React、React DOM 或 icons imports；以 identity unit tests、lifecycle browser tests 及 build artifact scan 驗證。
- [x] 3.6 完成 Cross-renderer review data interoperability，讓 React 建立的 meeting 可由 Vue 讀寫、Vue 產生的 report 可由 React 開啟，且舊 store 無 schema migration；以共享 temporary comments store 的雙向 browser/API fixture 驗證 metadata、evidence、pins、reports 與 AI context 一致。

## 4. Vue 完整對等與單一發佈面

- [x] 4.1 落實「保留單一 addon 與既有對外介面」，維持 package name、version、`./preview`、`./review`、`./review-server`、options 與 payload contract，同時移除 Vue product 對 React peers 的要求；以 package export tests、`npm pack --dry-run`、React upgrade fixture 與 Vue dependency assertion 驗證。
- [x] 4.2 落實「先完成 Vue 3 + Vite 的完整對等」與 Complete Vue export and review workspace parity，讓 installer 產生正確 Vue 接線並將四項 capabilities 標為 `supported`；以 Vue 真實 fixture 跑完整 shared parity suite，並確認 React fixture 同套件同版本回歸通過。
- [x] 4.3 重建 canonical dist 並同步 `storybook-template/.storybook/vendor/figma-export-addon/` 與 `storybook-template/vendor/figma-export/`，讓三個發佈面版本、公開檔案與 artifact hash 一致；以同步檢查 script、`npm pack --dry-run` 與乾淨 diff inventory 驗證。

## 5. Skill、文件與總驗收

- [x] 5.1 更新 `design-system-to-storybook/SKILL.md`、framework adaptation、review setup 與 tooling updates，清楚區分 core export／full review 矩陣、自動偵測、override、Vue 完整流程與 unsupported fallback；以 Skill Creator `quick_validate.py` 及文件內容檢查驗證，不建立完整 Vue template。
- [x] 5.2 依 Observable behavior、Acceptance criteria 與 Scope boundaries 執行總驗收：addon build、plugin-code、visual-comments、React／Vue parity、installer tests、artifact forbidden-import scan、mirror hash、Skill validation、`spectra analyze make-figma-export-addon-renderer-neutral` 與 `spectra validate make-figma-export-addon-renderer-neutral --strict` 全數通過，並確認 diff 未觸及 Figma plugin、payload schema、Webpack adapter 或既有不相關 dirty changes。
