## 1. UI Flow 模組組合

- [x] 1.1 為 UI Flow module set 實作規則解析器 `storybook-product-prototype/scripts/flow_css_rules.mjs`，採用「以規則為單位拆出 UI Flow 樣式」：匯出 `splitCssRules`、`isFlowRule`、`findFlowRules`、`stripFlowRules`。介面與失敗行為依 design 的 Implementation Contract：保留前導註解；at-rule 依內部規則判斷；忽略字串裡的大括號；不成對的大括號會丟出含位置的錯誤。驗證：新增 `storybook-product-prototype/scripts/test_flow_css_rules.test.mjs`，`node --test` 涵蓋以下項目並通過：
  - spec 的規則歸屬範例表（7 列）。
  - `splitCssRules` 的片段依序串接等於原文（對上游 `prototype-inspector.css` 與一段含巢狀 `@media`、字串大括號的樣本各驗一次）。
  - `stripFlowRules` 只移除 UI Flow 規則，其餘位元組不變。
  - 不成對大括號會報錯。
- [x] 1.2 [after: 1.1] 實作 UI Flow module set 的樣式拆分，依「以規則為單位拆出 UI Flow 樣式」與「flow-canvas.js 依序載入兩份樣式表」拆分上游樣式表：
  - 用解析器把 `prototype-inspector.css` 的 UI Flow 規則（含前導註解）移到新的 `storybook-product-prototype/assets/prototype-inspector/flow-canvas.css`，順序不變。
  - `flow-canvas.js` 開頭先 `import "./prototype-inspector.css";`，再 `import "./flow-canvas.css";`。
  - 原本對 `prototype-inspector.css` 做的 UI Flow 斷言改讀 `flow-canvas.css`：SSR 測試的 `css` 變數、對比度與規則順序檢查等。`test_flow_canvas_ssr.mjs` 也要確認互動規則仍排在擷取規則之前。

  驗證：
  - 拆分前，先在 bench fixture（`create_flow_bench_fixture.mjs` 產生，含 growth-fund 與 example prototype）用 Chrome 記錄固定清單元素的計算樣式：縮放與 layout 群組、按鈕、縮放選單、框、框標籤、連線標籤、功能流程清單、小地圖、選取外框、分區名稱、互動標示，各取 display、position、color、background-color、font-size、font-weight、padding、border、box-shadow、z-index、transform、inline-size、block-size。拆分並同步 fixture 後再記錄一次，兩份完全相同。
  - `test_flow_css_rules.test.mjs` 新增斷言：上游 `prototype-inspector.css` 沒有 UI Flow 規則、`flow-canvas.css` 只有 UI Flow 規則且不含 `var(--sbt-`。
  - `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` 通過。
- [x] 1.3 [after: 1.2] 實作 UI Flow module set 的匯出與版本號，依「共用量測函式與 UI Flow 版本號由 flow-canvas.js 匯出」完成以下項目：
  - `getMeasuredFramePreviewSize` 與 `routePreviewMeasurementSelector` 改為匯出。
  - 新增 `export const flowCanvasVersion = "flow-canvas-<套用當日 YYYY-MM-DD>"`。
  - UI Flow 根元素帶 `data-flow-canvas-version`。

  驗證：SSR 測試先對實作前的程式確認失敗，再斷言根元素的 `data-flow-canvas-version` 等於匯出值且符合 `flow-canvas-YYYY-MM-DD`，兩個量測工具是匯出的函式與字串；`python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 的 import 介面檢查與鏡像比對通過（同步 template 鏡像後）。

## 2. 只更新 UI Flow 的安裝模式

- [x] 2.1 [after: 1.3] 實作 UI Flow-only installer update，依「安裝器的 --ui-flow-only 模式」實作 `install_prototype_inspector.mjs` 的三個新旗標 `--ui-flow-only`、`--dry-run`、`--strip-flow-css`：
  - 不合法組合在任何檢查前以 exit 1 拒絕。
  - 寫入前依序檢查：React-only renderer guard、資料夾存在、`preview.js` 從 `./flow-canvas.js` 匯入 `PrototypeFlow`、匯入的名稱都還存在。任一失敗就印出一行 `ui-flow-only: <原因>` 並 exit 1，不寫入。
  - 只寫入六個模組檔；helper 缺少必要匯出時才換新；fingerprint 缺少時才安裝。
  - 依 Implementation Contract 的輸出格式回報：版本前後、缺少的 `--pi-*` token、殘留的 UI Flow 規則（`--strip-flow-css` 時用解析器移除）。

  驗證：`test_install_prototype_inspector.mjs` 新增案例並通過，涵蓋：
  - spec 的六個情境：客製的 `preview.js`／CSS／manager／preset／main 位元組不變；內建舊版 UI Flow 時停下且不寫入；缺少匯入名稱時停下並列出；缺少 token 時列出且 exit 0；殘留規則只在 `--strip-flow-css` 時移除，Components 規則不變；dry run 不寫入。
  - 旗標範例表的 7 列。
  - 新案例先對實作前的安裝器確認失敗。

## 3. 文件與回歸

- [x] 3.1 [after: 2.1] 更新文件、鏡像與版本標記：
  - `storybook-product-prototype/references/storybook-integration.md` 新增「客製專案只更新 UI Flow」一節，依「一次性抽離寫在文件，不寫成工具」寫出以下內容：
    - 判斷是否需要一次性抽離。
    - 抽離步驟：刪內建 UI Flow、改成匯入兩個模組、共用函式改用新匯出。
    - `--ui-flow-only --dry-run`、`--strip-flow-css` 的用法。
    - 缺少 token 時依專案自己的包法補上。
    - 驗證方式。
    - 不要對客製專案用 `--force`。
  - `storybook-product-prototype/SKILL.md` 的安裝與更新說明加入 `--ui-flow-only`。
  - 同步 template 鏡像（含新檔 `flow-canvas.css`）。
  - 兩份 `preview.js` 的 `prototypeInspectorBuildTag` 改為 `ui-flow-boundary-<套用當日 YYYY-MM-DD>`。

  驗證：內容審閱；`grep -n "ui-flow-only" storybook-product-prototype/references/storybook-integration.md storybook-product-prototype/SKILL.md` 兩處都有結果；`test_scaffold_validate.py` 的鏡像比對通過。
- [x] 3.2 [after: 3.1] 整體回歸。
  - 執行並全部以零碼結束：
    - `node --test storybook-product-prototype/scripts/test_flow_canvas_geometry.test.mjs storybook-product-prototype/scripts/test_flow_snapshot_cache.test.mjs storybook-product-prototype/scripts/test_flow_snapshot.test.mjs storybook-product-prototype/scripts/test_flow_css_rules.test.mjs`
    - `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs`
    - `node storybook-product-prototype/scripts/test_authority_inspector.mjs`
    - `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs`
    - `python3 storybook-product-prototype/scripts/test_scaffold_validate.py`
    - storybook-template 的 `npm run typecheck`
    - 在 template 目錄執行 `npx esbuild .storybook/prototype-inspector/preview.js --bundle --format=esm --outdir=<暫存資料夾>`，並確認輸出的 CSS 中共用規則排在 UI Flow 規則之前。
  - 在同步後的 bench fixture 上執行 `check_flow_canvas_comments.mjs`、`check_flow_canvas_editing.mjs`、`check_flow_frame_interact.mjs`、`check_flow_auto_layout.mjs`（growth-fund 與 example）。
  - 用 `--ui-flow-only --dry-run` 試兩個 scratchpad 副本，不修改真實專案：
    - cm-chipK 專案：預期因內建舊版 UI Flow 而停下。
    - 一份 template 副本，Components 區段加了客製規則：預期只寫入六個檔案，並正確列出結果。
  - 結果記錄在 `openspec/changes/isolate-ui-flow-update-boundary/bench/check.md`。
