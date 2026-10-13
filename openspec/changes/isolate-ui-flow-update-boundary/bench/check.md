# 只更新 UI Flow 的邊界：回歸紀錄（task 3.2）

檢查對象：`create_flow_bench_fixture.mjs` 產生的 fixture（暫存資料夾，含 storybook-template 的 example prototype 與 bench prototypes），Storybook dev（`storybook dev -p 6170`），Inspector build tag `ui-flow-boundary-2026-10-12`，`flowCanvasVersion` `flow-canvas-2026-10-12`，figma-export addon 0.15.0，Chrome 154.0.8037.98（headless），Node 26.8.2，機器 Mac16,1（Apple M4，16 GB），macOS 27.0.1。fixture 的 `.storybook/prototype-inspector/` 與 skill asset 逐位元組相同（`diff -rq` 無輸出）後才量測；review 修正之後 runtime 檔沒有再變動，最後一輪瀏覽器檢查與計算樣式量測都是最終版。

## 拆分前後的計算樣式（task 1.2，spec「Splitting the stylesheet keeps the computed styles」）

方法：`computed-style-snapshot.mjs`（本資料夾）以 CDP 開啟 growth-fund 與 example prototype 兩個 story，各在 1600、1000、640 px 寬（640 px 另外模擬 `prefers-reduced-motion: reduce`）下記錄四個狀態：開啟時的 fit、縮放選單打開、點選一個 route 框、雙擊進入互動模式。每個狀態記錄文件中所有帶 `prototype-inspector*` class 的元素（同一組 class 取前 3 個），每個元素記錄 spec 列出的 13 項（display、position、color、background-color、font-size、font-weight、padding、border、box-shadow、z-index、transform、inline-size、block-size），另加 23 項（fill、stroke、opacity、border-radius、outline、gap、visibility、pointer-events、cursor、animation-name、overflow、line-height、inset、margin 等），有內容的 `::before`／`::after` 也一起記錄。共 24 個狀態，每次約 7.4 萬個值。`compare-styles.mjs` 逐值比對兩份輸出。

| 比對 | 值的差異 | 只出現在其中一次的元素 |
| --- | --- | --- |
| 拆分前第 1 次 vs 第 2 次（量測雜訊） | 0 | 1（example 1600 選取狀態的第 3 張快照圖） |
| 拆分前 vs 拆分後（第一版） | 8 | 1 |
| 拆分前第 1 次 vs 最終版（含 review 後的 `visually-hidden` 規則） | 0（73,800 個值） | 2（同上，快照圖） |
| 拆分前第 2 次 vs 最終版 | 0（73,800 個值） | 0 |

- 只出現在一次的元素都是快照圖片：選取時第 3 張快照是否已載入取決於載入時機，兩次拆分前的量測之間也有，不是樣式差異。
- 第一版的 8 個差異都是 640 px 時 UI Flow 根元素的 `padding`（16px → 0）。原因：`prototype-inspector.css` 的 `@media (max-width: 700px) { .prototype-inspector { padding: var(--pi-sys-spacing-screen-gutter); } }` 原本排在 `.prototype-inspector--flow { padding: none }` 之後，同等權重下勝出；拆分後 UI Flow 規則排在後面。UI Flow 的畫布層都對 padding box 絕對定位，所以畫面不變（其餘 7 萬多個值相同），但為了符合 spec，`flow-canvas.css` 加了同條件的 `.prototype-inspector--flow` padding 規則保留原值。
- review 後 `flow-canvas.css` 加入 `.prototype-inspector--flow .prototype-inspector__visually-hidden`（宣告與共用規則相同、權重較高）。最終版量測包含 24 個 `visually-hidden` 元素，值都沒變。
- 靜態檢查順序風險：在拆分前的檔案中，找出排在第一條 UI Flow 規則之後、主體選擇器的 class 都出現在 `flow-canvas.js` 的共用規則，只有 `.prototype-inspector__visually-hidden`、`.prototype-inspector__components-count`（及其 `:focus-visible`）、`.prototype-inspector__empty` 與上述 700 px 規則。前三者沒有同等權重的 UI Flow 規則套在同一元素上，不受順序影響。

## 指令回歸（2026-10-12，複查修正後重跑，全部以 0 結束）

| 指令 | 結果 |
| --- | --- |
| `node --test` geometry、snapshot cache、snapshot、css rules 四個測試檔 | 123 項通過（css rules 30 項：spec 規則歸屬表 15 列、串接等於原文、`listSelectors`、strip 保留同行註解與空行隔開的註解、strip 不切開註解也不讓行黏在一起（含 CRLF、@media 第一條規則、同行規則）、跳脫字元、選擇器字串裡的註解符號、多行規則與 BOM、at-rule 開頭行的註解、partition、兩份上游樣式表的歸屬、`flow-canvas.css` 自帶的 `visually-hidden`、不成對大括號） |
| `node storybook-product-prototype/scripts/test_flow_canvas_ssr.mjs` | 通過（UI Flow 斷言改讀 `flow-canvas.css`、token fallback 讀 `prototype-inspector.css`、兩份 CSS 的 import 順序、版本號與兩個匯出；新斷言先對實作前的程式確認失敗） |
| `node storybook-product-prototype/scripts/test_authority_inspector.mjs` | 通過（沒有修改） |
| `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` | 38 項通過（新增 26 項 `--ui-flow-only` 案例；新案例先對實作前的安裝器確認失敗，複查這一輪的失敗情境由複查代理在修正前的程式上重現） |
| `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` | 通過（沒有修改；鏡像比對涵蓋 10 個 runtime 檔，import 介面檢查接受 `flow-canvas.js` 的兩個 CSS import） |
| storybook-template 的 `npm run typecheck` | 通過 |
| template 目錄的 `npx esbuild .storybook/prototype-inspector/preview.js --bundle --format=esm` | 通過；以解析器讀輸出的 `preview.css`：190 條共用規則全部排在 165 條 UI Flow 規則之前，沒有混合規則 |

## 瀏覽器檢查（Chrome，fixture 為最終版 runtime，18:05–18:13）

| 腳本 | 結果 |
| --- | --- |
| `check_flow_canvas_comments.mjs`（example） | 38/38 通過 |
| `check_flow_canvas_editing.mjs`（growth-fund，journey 用 example，resize 用 viewport-overflow） | 22/22 通過 |
| `check_flow_frame_interact.mjs`（example，加上 round-up、inventory、viewport-overflow） | 27/27 通過 |
| `check_flow_auto_layout.mjs`（growth-fund／example） | 26/26、16/16 通過 |

拆分後第一輪（17:35–17:42，加入 `visually-hidden` 規則前）結果相同。兩輪留言檢查在 fixture 的 review session 各新增 7 則留言，都已透過 review server 刪除，原有的 3 則留言保留。執行時負載平均值約 7–34（10 核）。

## `--ui-flow-only` 試跑（scratchpad 副本，最終版安裝器，不修改真實專案）

cm-chipK（`ds-lab/project`，HEAD `c0218c1b8`，8 筆未提交改動維持不變）：複製 `.storybook`、`package.json`、`prototypeFlowLayout.ts`、`scripts/prototype-review` 到暫存資料夾。

- `--ui-flow-only --dry-run`：exit 1，副本所有檔案的雜湊值不變。輸出：`ui-flow-only: <copy>/chipk/.storybook/prototype-inspector/preview.js does not import PrototypeFlow from ./flow-canvas.js, so it still embeds an older UI Flow. Do the one-time extraction in storybook-product-prototype/references/storybook-integration.md ("Update Only the UI Flow in a Customized Project") first. Do not rerun with --force: it replaces preview.js, prototype-inspector.css and every other customized inspector file.`
- 模擬抽離後（另一份副本只在 `preview.js` 開頭加上 `import { PrototypeFlow } from "./flow-canvas.js";`，其餘不動）的 dry run：`Would update UI Flow module set (none -> flow-canvas-2026-10-12)`；`Would replace flow layout helper (missing exports: getPrototypeFlowLayoutViewportSignature; schema version 1, the runtime needs 2)`（chip-k 的 helper 與 skill 2026-06 出的 version 1 逐位元組相同，所以直接替換）；`Missing --pi tokens: --pi-sys-color-annotation-touch-target`；`Missing shared rules in prototype-inspector.css: none`；`Stale UI Flow rules in prototype-inspector.css: 84`；2 條混合規則（markdown 標題規則混入沒有元素使用的 `.prototype-inspector__flow-summary h3`）。
- 以解析器在 chip-k 樣式表的唯讀副本上執行 strip：84 條殘留規則全部移除（668 行），沒有任何非 UI Flow 選擇器被刪，註解數量不變（46 則），混合規則保留，結果可以重新解析。
- 最後一輪的 chip-k 副本包含整個 `src/pages/prototypes`（`FontSizeSettingPrototypeFlowExport.tsx` 以 `type PrototypeFlowLayoutPositions` 從 helper 匯入），模擬抽離後照常替換 helper，沒有被型別匯入誤擋。

template 副本：在 Components 區段加 `.prototype-inspector__components-acme-badge`、檔尾留一條 `.prototype-inspector__flow-viewport`（上方有註解）、`preview.js` 加客製 export、六個模組檔改成舊版（版本 `flow-canvas-2026-09-30`）。

| 執行 | 結果 |
| --- | --- |
| `--ui-flow-only --dry-run` | exit 0，副本不變；`Would update UI Flow module set (flow-canvas-2026-09-30 -> flow-canvas-2026-10-12)`、六個路徑、helper 與 fingerprint 為 Reused、`Missing --pi tokens: none`、`Missing shared rules in prototype-inspector.css: none`、`Stale UI Flow rules in prototype-inspector.css: 1`（`line 1610: .prototype-inspector__flow-viewport`），並提醒保留的規則仍會蓋過新畫布 |
| `--ui-flow-only --strip-flow-css` | exit 0；改變的檔案正好是六個模組檔與 `prototype-inspector.css`，六個模組檔等於 bundled；CSS 只刪掉那條殘留規則與它正上方的註解，Components 客製規則保留 |
| 再跑一次 `--dry-run` | `flow-canvas-2026-10-12 -> flow-canvas-2026-10-12`、`Missing --pi tokens: none`、`Missing shared rules in prototype-inspector.css: none`、`Stale UI Flow rules in prototype-inspector.css: 0` |

## verify 後的修正（2026-10-12）

- 混合規則改為全部列出（殘留的 UI Flow 規則仍是數量加前 10 條）；spec 的報告文字與名稱檢查範圍改成與實作一致，並補上「混合規則只列出」「缺少 `prototype-inspector.css`」兩個情境。
- `--ui-flow-only` 模式下，上游模組含讀不懂的 import 時，錯誤訊息改為不建議 `--force`。
- 安裝器測試補上：客製 `preview.js` 實際匯入兩個量測工具、混合規則在 `--strip-flow-css` 後仍保留、缺少 `prototype-inspector.css`、讀不懂的上游 import。

## review 後的修正（2026-10-12）

`/spectra-review` 找到 1 個 Warning；之後以多代理工作流程再審一次（安裝器安全、CSS 解析器、文件正確性、樣式拆分保真度四個角度，每個發現由一位反方查核者重現），確認 3 個中等問題與 8 個輕微問題，全部修正：

- UI Flow 依賴共用樣式：`flow-canvas.css` 自帶 `visually-hidden`（chip-k 沒有這條）；安裝器新增 `Missing shared rules in prototype-inspector.css`（UI Flow 會渲染、規則只在共用樣式表的 class），token 檢查涵蓋模組 JS 的 inline `var(--pi-*)`。
- helper：`export { … }` 清單匯出的 helper 不再被誤判缺匯出；要換掉 helper 時，若 `.storybook/` 或 `src/` 有檔案從它匯入上游 helper 沒有的名稱，停下並列出，不寫入。
- 分類：UI Flow class 只出現在 `:not()`、`:is()`、屬性值等括號或字串裡時改判為混合規則（只列出、不移除）；上游兩份樣式表與 chip-k 都沒有這種選擇器。
- 保留舊規則：訊息與文件改為說明它們仍會先載入並蓋過新畫布，文件與 SKILL.md 的標準用法改為 `--ui-flow-only --strip-flow-css`。
- strip：同一行在保留規則後面的註解跟著保留；空行隔開的註解（例如段落標題）保留；文字改為「連同正上方的註解一起移除」。
- 名稱檢查也看 `export { … } from` 轉出；讀 import 前先遮掉註解與 template literal，被註解掉的 import 不再算數；`--project-root`、`--token-prefix` 沒給值時 exit 1。
- 文件：混合規則的處理建議改寫；驗證版本號的指令改成從 Storybook 頁面讀 preview iframe。

## 複查後的修正（2026-10-12）

再以三個代理分別嘗試推翻安裝器、解析器、文件與 spec 的修正，重現到以下問題，全部修正：

- helper 停止條件誤判 TypeScript 型別匯入（chip-k 與 skill 自己的 FlowExport template 都會被擋）；追蹤匯入者也漏掉 `.js` specifier、alias、namespace、`export *` 與 `import()`。改為保守停下：只要專案 helper 匯出了上游 helper 沒有的名稱（含 `default` 與 `export *`）就停下，不再追蹤匯入者；型別匯入在名稱檢查中略過。chip-k 的 helper 沒有這種匯出，不受影響。
- 註解遮罩不認得 regex literal：bundled `preview.js` 的 markdown regex 含反引號，讓之後的程式全部錯位，可能捏造或藏住 import。改為小型 JavaScript 掃描器（註解、字串、template literal 含巢狀 `${}`、regex literal 以前一個 token 判斷，只認括號外的 import／export）。以 TypeScript 的 `ts.preProcessFile` 為基準比對 70 個真實檔案（bundled inspector、chip-k 的 inspector 與 prototypes、template 的 src），找到的 specifier 完全一致；在每個檔案結尾加一行真的 import、一段 template 裡的假 import 與一行註解掉的 import，70 個檔案都只認出真的那行。
- strip：註解裡的空行被當成分隔，留下半個沒結尾的註解；CRLF 檔案的段落標題被刪；跳脫的括號移動了括號深度；刪掉 @media 第一條規則或同一行的規則時兩行黏在一起；`.acme-prototype-inspector__flow-badge` 與 `@keyframes prototype-inspector-flowchart-pulse` 被當成 UI Flow。全部修正並加上測試。
- inspector 資料夾中名稱像模組的資料夾與壞掉的 symlink 不再讓安裝器當掉；`--project-root ""` 被拒絕；保留舊規則時的警告改為「更具體或新規則沒設定的屬性」；spec 補上樣式表解析失敗與讀不懂的 import 兩個停止條件；design 的分類與檢查描述更新；文件的驗證步驟改用 `git status --short`。

## 第三輪複查後的修正（2026-10-12）

第三輪三個代理針對上一輪的新程式（掃描器、helper 規則、strip 的換行處理）再試一次。掃描器在 876 個 chip-k／template／asset 檔案與約 9,000 個 node_modules 檔案上和 TypeScript AST 比對沒有差異；strip 以約 46 萬份隨機樣式表檢查（重新解析、保留所有非 UI Flow 選擇器、可重複執行）只找到換行的邊界情況。確認的問題全部修正：

- helper 規則仍靠讀出匯出名稱，漏掉 `export class`／`enum`／`var`／解構等寫法時會照樣覆蓋專案的 helper；照停止訊息只補缺少的匯出，會得到仍寫入 version 1 版面的混合 helper。改為比對內容：helper 比 runtime 舊（缺少匯出，或 `prototypeFlowLayoutSchemaVersion` 缺少或較低）時，只有與 skill 出過的某個版本逐位元組相同（換行符號、BOM 與檔尾空行除外）才替換，否則停下並請專案以 bundled helper 為底手動合併。skill 只出過兩個 helper 版本（2026-06 的 version 1 與目前的 version 2）；chip-k 與其他早期專案的 helper 都是 version 1 原檔。v1 原檔存為測試 fixture。
- 掃描器：TypeScript 的 `x!` 與後置 `++`／`--` 之後的 `/` 改判為除號；掃描結束時仍有未關閉的括號、註解或 template 就停下（不再可能藏住後面的 import）；非 ASCII 的 default import 名稱、`{ type as t }`、匯出清單裡的 `type X` 都正確處理；匯出改在掃描器找到的最外層 `export` 位置讀取（字串裡的文字不再被當成匯出），以 TypeScript AST 核對五個 bundled 模組與兩版 helper 完全一致。
- strip：選擇器字串裡的 `/*`、`*/` 不再被當成註解；跨多行的被移除規則前後若是同一行的保留內容，會補回換行；檔頭 BOM 保留；安裝器訊息改為「連同正上方的註解一起移除，其他規則與註解保留」。

## 第四輪複查後的修正（2026-10-12）

第四輪兩個代理：掃描器在約 2,400 個本機專案檔案與 3,568 個 node_modules 檔案上和 TypeScript AST 比對；strip 以約 88 萬份隨機樣式表檢查不變量。確認的問題全部修正：

- helper 的 schema 版本原本以文字比對讀取：`: number = 2` 這種寫法讀不到，註解裡的版本號會被當真（讓混合 helper 通過，或讓最新的 helper 被擋）。改為在遮掉註解與字串後，以宣告形式讀取，允許型別標註。
- `.jsx`／`.tsx` 專案模組裡的 JSX `</tag>`、`<X />` 被當成 regex，造成誤停；這兩種檔案中的 `</`、`/>` 改視為標籤符號。
- at-rule `{` 那一行的註解在刪掉區塊內第一條規則時被刪；改為歸到 at-rule 的開頭。
- helper 比對時另外忽略 BOM 與檔尾空行（和換行符號一樣不含程式碼）。
- 以第四輪代理留下的 probe 與 fuzz 腳本對修正後的程式重跑：helper 的 18 種寫法、schema 註解、JSX、完整安裝路徑的結果都符合預期。重跑 token-soup fuzz 時，第四輪沒用到的 seed 找到 17 個案例：無效 CSS 裡「選擇器後面直接接分號」的敘述被分類成 UI Flow，外層 at-rule 卻不認得它，所以刪除時不會移除它，查詢時卻又數到它。改為沒有區塊的敘述一律不算 UI Flow 規則，並補上測試；17 個案例重新檢查全部通過。修正後重跑：token-soup fuzz 3 個 seed 各 30,000 份（約 5 萬份可解析）、一般 fuzz 2 個 seed 各 30,000 份、chip-k 樣式表重新排列 300 份，全部 0 失敗。

## 手動檢查

這個 change 不改變 UI Flow 的行為與外觀，Chrome 的計算樣式比對已涵蓋樣式；Safari 與 Firefox 依相同的樣式表順序套用規則，沒有另外安排手動檢查。
