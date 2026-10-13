## Context

Prototype Inspector 由 `install_prototype_inspector.mjs` 把 `storybook-product-prototype/assets/prototype-inspector/` 整個資料夾複製到專案的 `.storybook/prototype-inspector/`。這個資料夾目前有 9 個檔案，複製方式是 `cpSync`，有 `--force` 時直接覆蓋。專案常在這裡加自己的工具。

cm-chipK 的比對結果（2026-10-12，`chip-k divergence` 調查）：
- 它的 `preview.js` 約 13,700 行，`prototype-inspector.css` 約 4,800 行。
- 自有程式全部在 Components 審查與 Data fallback，和 UI Flow 沒有重疊。
- 上游自那之後已把 UI Flow 移到 5 個 `flow-*.js` 模組。

即使如此，只更新 UI Flow 目前仍要人工合併，原因有三：
1. UI Flow 的樣式混在共用的 `prototype-inspector.css`。以規則為單位分析，UI Flow 規則分布在檔案前段，中間夾著 Docs 的標題、分頁、markdown 規則與共用的 `.prototype-inspector__visually-hidden`。
2. `getMeasuredFramePreviewSize` 與 `routePreviewMeasurementSelector` 在 `flow-canvas.js` 內部，沒有匯出，但 chip-k 的 Components 審查也會用到。
3. 沒有 UI Flow 自己的版本號，只有專案擁有的 `prototypeInspectorBuildTag`。

既有的測試 harness（SSR、authority）以 `/^import[\s\S]*?;\n/gm` 移除 import 行，所以新增的副作用 import（`import "./flow-canvas.css";`）不影響它們。UI Flow 規則引用的變數只有 `--pi-*`、`--prototype-flow-*`，以及帶預設值的 `--sbfx-workspace-reserved-*`，沒有 `var(--sbt-`。所以安裝器的 `--token-prefix` 改寫與 `flow-canvas.css` 無關。

## Goals / Non-Goals

**Goals:**

- 已經從 `./flow-canvas.js` 匯入 UI Flow 的專案，可以用一個指令只更新 UI Flow 模組組合，其他 inspector 檔案位元組不變。
- 舊版內建 UI Flow 的專案，工具會在寫入前停下，說明一次性抽離怎麼做。
- 專案 token 層缺的 token、專案 CSS 殘留的舊 UI Flow 規則，都由工具明確列出。
- 拆分前後，UI Flow 的實際樣式不變。

**Non-Goals:**

- 自動改寫專案的 `preview.js`：一次性抽離由專案端的 AI 依文件手動處理。
- 自動補 token：各專案的 token 包法不同，例如 chip-k 是 `var(--cm-X, var(--sbt-X, …))`。
- 把 Inspector 做成 npm 套件或 plugin，屬於另外的分發議題。
- 更新 Story、Docs、Components、Data，以及 figma-export addon 的同步。
- 調整 UI Flow 的任何行為或外觀。

## Decisions

### 以規則為單位拆出 UI Flow 樣式

`storybook-product-prototype/scripts/flow_css_rules.mjs` 提供規則解析：
- 逐條讀出最上層規則，保留每條規則前面的註解。
- at-rule（例如 `@media`）依其內部規則的選擇器判斷。
- 選擇器清單裡每個選擇器都在括號、中括號與字串之外含 `.prototype-inspector--flow` 或 `.prototype-inspector__flow-*` class（完整的 class 名稱，不是更長名稱的一部分），才屬於 UI Flow。選擇器以括號感知的方式切分，`:is(a, b)` 裡的逗號不會切開；跳脫字元（`\(`、`\{`）不算結構符號。
- at-rule 在內部規則全屬 UI Flow，或前導名稱是 `prototype-inspector-flow` 或以 `prototype-inspector-flow-` 開頭的識別字時屬於 UI Flow，例如 `@keyframes prototype-inspector-flow-dash`，它的內部選擇器是 `from`／`to`；`prototype-inspector-flowchart-pulse` 不算。
- 兩種選擇器混在同一個清單裡，或 UI Flow class 只出現在 `:not()`、`:is()` 等括號裡的，是「混合規則」：它可能也在套用其他模式的樣式。上游不允許出現；專案樣式表裡的混合規則，安裝器只列出、不移除。

實作時查到的情況（2026-10-12）：上游有兩條 markdown 標題規則混入 `.prototype-inspector__flow-summary h3`。全 repo 沒有任何元素使用 `prototype-inspector__flow-summary`，所以拆分時刪掉這個死選擇器，這兩條規則留在 `prototype-inspector.css`。

同一份解析器用在三個地方：一次性產生上游的 `flow-canvas.css`、測試檢查兩份樣式表的歸屬、安裝器偵測與移除專案 CSS 殘留的 UI Flow 規則。

替代方案是按行號切，已否決：中間夾著共用規則，而且行號會漂移。

### flow-canvas.js 依序載入兩份樣式表

`flow-canvas.js` 在檔案開頭先 `import "./prototype-inspector.css";`，再 `import "./flow-canvas.css";`。
- 打包時 CSS 依 import 圖的走訪順序輸出，而 `preview.js` 先 import `flow-canvas.js`、最後才 import `prototype-inspector.css`。如果只在 `flow-canvas.js` import `flow-canvas.css`，UI Flow 規則會排到共用規則前面。同等 specificity 的衝突（例如 `.prototype-inspector button` 對上 UI Flow 的按鈕規則）結果就會改變。
- 先 import 共用樣式表，可以讓順序和拆分前一樣，專案的 `preview.js` 也不必調整。
- 重複的 import 由打包器去重。

替代方案是要求各專案調整 `preview.js` 的 import 順序，已否決：違反「專案檔案不動」。

### 共用量測函式與 UI Flow 版本號由 flow-canvas.js 匯出

- `getMeasuredFramePreviewSize(iframe)` 與 `routePreviewMeasurementSelector` 改為 `export function` 與 `export const`。harness 只處理這兩種形式，所以維持這個寫法。
- 新增 `export const flowCanvasVersion = "flow-canvas-2026-10-12"`，UI Flow 根元素帶 `data-flow-canvas-version`。
- 規則：任何 UI Flow 模組組合的檔案改動，都在同一次編輯更新這個字串。`prototypeInspectorBuildTag` 維持「整個 inspector 資料夾」的意義，客製專案可以自己改。

### 安裝器的 --ui-flow-only 模式

- 新旗標 `--ui-flow-only`、`--dry-run`、`--strip-flow-css`。不合法的組合在任何檢查前拒絕（例如 `--ui-flow-only` 搭配 `--force` 或 `--token-prefix`）。
- 檢查依序執行：
  1. React-only renderer guard。
  2. 資料夾存在。
  3. `preview.js` 從 `./flow-canvas.js` 匯入 `PrototypeFlow`。
  4. inspector 資料夾中模組組合以外的每個 JS 檔，從五個 UI Flow JS 模組匯入或轉出的名稱都還存在（含 default import；型別匯入不檢查）。讀不懂的 import 會停下並指出檔案與行號。import 由一個小型 JavaScript 掃描器找出：略過註解、字串、template literal（含巢狀 `${}`）與 regex literal，只認括號外的宣告。
  5. 專案的 `prototype-inspector.css` 能被解析（大括號成對、註解與字串都有結尾）。
  6. helper 比 runtime 舊（缺少必要匯出，或 `prototypeFlowLayoutSchemaVersion` 缺少或較低）時，它必須與 skill 出過的某個 helper 版本逐位元組相同（換行符號、BOM 與檔尾空行除外）；被改過的舊 helper 停下，請專案以 bundled helper 為底手動合併（複查後改為比對內容，不再讀匯出名稱判斷）。
- 寫入：只寫六個模組檔、必要時寫 helper、缺少時寫 fingerprint。
- 報告：版本前後、缺少的 `--pi-*` token、缺少的共用規則、殘留的 UI Flow 規則與混合規則。`--strip-flow-css` 用解析器移除殘留規則：每條連同正上方的註解、前面的空行與它最後一行的其餘內容一起移除；空行隔開的註解與其他規則保留，不會讓兩行保留的內容黏在一起。

`--token-prefix` 不適用於這個模式，因為 `flow-canvas.css` 不含 `--sbt-`，而主樣式表不由這個模式改寫。

### 一次性抽離寫在文件，不寫成工具

舊版專案（例如 chip-k 9 月初分出的版本）要做三件事：
1. 刪掉 `preview.js` 內建的 UI Flow 程式。
2. 改成像上游 `preview.js` 那樣，從 `./flow-canvas.js`、`./flow-canvas-geometry.js` 匯入。
3. 共用函式改用新的匯出。

`references/storybook-integration.md` 新增「客製專案只更新 UI Flow」一節，列出步驟與驗證。做完抽離後，之後每次只需要跑 `--ui-flow-only`。

## Implementation Contract

**Behavior**

- 上游：
  - UI Flow 樣式全部在 `flow-canvas.css`，`prototype-inspector.css` 不含 UI Flow 規則。
  - UI Flow 的實際樣式和拆分前一致。
  - 根元素帶 `data-flow-canvas-version`。
  - `flow-canvas.js` 匯出兩個量測工具與版本號。
- 專案端：`node <skill-root>/scripts/install_prototype_inspector.mjs --project-root <project> --ui-flow-only [--dry-run] [--strip-flow-css]` 依 spec 的檢查、寫入與報告運作。

**Interface / data shape**

- `flow_css_rules.mjs` 匯出：
  - `splitCssRules(source)`：回傳 `{ text, selector, isFlow }` 陣列，`text` 含前導註解與結尾換行，依序串接等於原文。
  - `isFlowRule(rule)`。
  - `findFlowRules(source)`：回傳 UI Flow 規則的選擇器清單。
  - `stripFlowRules(source)`：回傳移除 UI Flow 規則後的文字。
- 安裝器輸出：
  - 每個檢查失敗時印出一行 `ui-flow-only: <原因>`；React-only renderer guard 沿用既有的兩行訊息。
  - 成功時依序印出：
    - `Updated UI Flow module set (<before> -> <after>)`，dry run 時改印 `Would update …`。
    - helper 與 fingerprint 的結果。
    - `Missing --pi tokens: …` 或 `Missing --pi tokens: none`（涵蓋 `flow-canvas.css` 與模組 JS 的 inline 樣式）。
    - `Missing shared rules in prototype-inspector.css: …` 或 `… none`：UI Flow 會渲染、但規則放在共用樣式表的 class（上游 `prototype-inspector.css` 有規則、`flow-canvas.css` 沒有），專案樣式表缺少時列出，不寫入。`visually-hidden` 這類 UI Flow 一定要有的工具規則，改在 `flow-canvas.css` 以 `.prototype-inspector--flow` 限定範圍放一份相同宣告，所以不需要專案補。
    - `Stale UI Flow rules in prototype-inspector.css: <count>`，加上前 10 個選擇器，以及移除與否。
    - 有混合規則時：`Mixed rules in prototype-inspector.css (UI Flow and other selectors in one list, never removed): <count>`，全部列出（通常很少）。

**Failure modes**

- 檢查失敗：exit 1，不寫任何檔案。
- 專案的 helper 比 runtime 舊、而且內容和 skill 出過的任何 helper 版本都不同（被改過）：換掉會失去專案的程式，而那些程式可能是任何寫法（`export enum`、`class`、解構），也可能經由任何形式被使用，所以停下，請專案以 bundled helper 為底、把自己的程式加回去。只補缺少的匯出會得到仍寫入 version 1 版面的混合 helper，所以 schema 版本較舊也算過舊（複查後補上，2026-10-12）。安裝器記錄 skill 出過的 helper 的 SHA-256（目前只有 2026-06 的 version 1）；之後 helper 有新版本時，要把被取代的版本加進這個清單。
- 專案 `prototype-inspector.css` 不存在：缺少的 token 視為全部缺少並列出；殘留規則視為 0。
- 解析器遇到不成對的大括號：停下並 exit 1，訊息指出位置，不寫入。

**Acceptance criteria**

- `node --test storybook-product-prototype/scripts/test_flow_css_rules.test.mjs`：
  - 涵蓋 spec 的規則歸屬範例表。
  - `splitCssRules` 串接後等於原文。
  - `stripFlowRules` 只移除 UI Flow 規則。
  - 不成對大括號會報錯。
  - 對上游 `prototype-inspector.css` 與 `flow-canvas.css` 斷言兩者的規則歸屬。
- `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs`：涵蓋 spec 的所有情境與旗標範例表。
- `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs`：
  - 原本對 `prototype-inspector.css` 的 UI Flow 斷言改讀 `flow-canvas.css`。
  - 新增根元素版本屬性與兩個匯出的斷言。
- `test_authority_inspector.mjs`、`test_scaffold_validate.py`（鏡像比對、import 介面檢查）通過。
- Chrome 計算樣式比對：拆分前後在同一個 fixture 量測固定的元素與屬性，全部相同。
- `check_flow_canvas_comments.mjs`、`check_flow_canvas_editing.mjs`、`check_flow_frame_interact.mjs`、`check_flow_auto_layout.mjs` 照常通過。

**Scope boundaries**

- In scope：上游樣式拆分與載入順序、兩個匯出與版本號、安裝器 `--ui-flow-only`、解析器與測試、鏡像、文件、build tag。
- Out of scope：專案 `preview.js` 的自動改寫、token 自動補齊、Inspector 套件化、addon 同步、任何 UI Flow 行為或外觀變動。

## Risks / Trade-offs

- [CSS 串接順序改變可能讓同等 specificity 的規則換贏家] → 由 `flow-canvas.js` 先 import 共用樣式表；拆分前後在 Chrome 比對計算樣式。
- [解析器不是完整的 CSS parser] → 只需處理本專案的樣式表（註解、巢狀 at-rule、字串裡的大括號）。測試涵蓋這些情況，遇到不成對大括號就停下。
- [專案端的 AI 可能跳過一次性抽離、直接 `--force`] → 文件與 `--ui-flow-only` 的停下訊息都明確寫出不要對客製專案用 `--force`。
- [flowCanvasVersion 忘記更新] → 文件規定與 UI Flow 檔案同一次編輯更新；SSR 斷言版本格式與根元素一致。沒有自動比對 HEAD，這個取捨寫在這裡。
