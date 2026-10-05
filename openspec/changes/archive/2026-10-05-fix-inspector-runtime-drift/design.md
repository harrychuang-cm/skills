## Context

Prototype Inspector 以檔案形式散佈在三個地方：skill 原始檔（`storybook-product-prototype/assets/prototype-inspector/`、`assets/prototype-flow-layout/prototypeFlowLayout.ts`、`assets/prototype-review/fingerprint.mjs`）、storybook-template 的鏡像副本（`.storybook/prototype-inspector/`、`src/pages/prototypes/prototypeFlowLayout.ts`、`scripts/prototype-review/fingerprint.mjs`），以及安裝器 `install_prototype_inspector.mjs` 寫入的外部專案。preview.js 用固定相對路徑 import helper（`../../src/pages/prototypes/prototypeFlowLayout`）與 fingerprint（`../../scripts/prototype-review/fingerprint.mjs`），並由 preset 註冊為全域 previewAnnotation，所以任何一個 import 解析失敗，整個 Storybook preview 都會載入失敗。

現況（2026-10-02 驗證）：

- template helper 停在 v1（commit 5f5a135），template preview.js 用 esbuild bundle 失敗；以 skill helper 覆寫後，template `tsc --noEmit` 通過、bundle 成功（在暫存副本驗證）。
- 安裝器不安裝 fingerprint.mjs；以安裝器產物組成的專案樹 bundle 失敗。
- smoke test 的 `check_inspector_copies` 只比對 `INSPECTOR_COPY_FILES = ("preview.js", "prototype-inspector.css")`，並在 template 不存在時印出提示後略過。smoke test 已有「改壞檔案再還原」的自我測試寫法可沿用。
- `PrototypeFlow` 的持久化 effect 依賴 `draggedPositions`，掛載時就執行；helper 的 `writePrototypeFlowLayoutPositions` 遇到空 positions 會 `removeItem`，normalize 會濾掉未知 id。
- 設計系統工具 repo 的安裝器測試慣例是 `design-system-to-storybook/scripts/test_install_figma_export_addon.mjs`（Node 標準函式庫、暫存資料夾）。

## Goals / Non-Goals

**Goals:**

- template Storybook 恢復可載入，且以後 helper 或任何 Inspector 執行檔的副本漂移都會被 smoke test 攔下。
- 安裝器產出的專案一定能解析 Inspector 的每個 import；遇到不相容的既有 helper 時明確失敗，不再靜默產出壞掉的安裝。
- 開啟 UI Flow 不再改動使用者存好的 layout；一次拖曳只寫一次。

**Non-Goals:**

- 不改 UI Flow 的互動、外觀與渲染架構（由後續四個 change 處理）。
- 不替外部專案執行升級，也不處理 cm-chipK fork 的合併。
- 不改 fingerprint 演算法、不改 skill 版 flow layout payload 格式與 storage key。
- 不讓 `--force` 清除目標資料夾的舊檔。

## Decisions

### 以位元組覆寫同步 template helper

直接把 skill 原始檔的 `prototypeFlowLayout.ts` 複製到 template。新版的 API 只新增選用參數（`viewportSignature?`、`expectedViewport?`）與 export；payload 版本由 1 升為 2 並多出 `viewport` 欄位，與 skill 版現行格式相同（template 內唯一寫入 payload 的 preview.js 本來就使用這個格式）。兩參數的 `readPrototypeFlowLayoutPositions` 呼叫維持「不檢查 signature」的舊行為，normalize 也不檢查版本，所以 `ExamplePrototypeFlowExport.tsx` 不需修改。替代方案「在 template 保留 v1 並讓 preview.js 偵測 export 是否存在」被否決：ES module 的具名 import 無法執行期偵測，而且會讓兩份 preview.js 必須分岔。

### 安裝器依 import 路徑安裝 fingerprint

把 `assets/prototype-review/fingerprint.mjs` 安裝到 preview.js 實際 import 的位置 `<project>/scripts/prototype-review/fingerprint.mjs`，已存在且未加 `--force` 時沿用。替代方案「把 fingerprint 搬進 `.storybook/prototype-inspector/` 改用 `./fingerprint.mjs`」被否決：fingerprint.mjs 檔頭宣告它是瀏覽器（Inspector）與 node 端（executor、check script）共用的單一實作；目前 repo 內只有兩份 preview.js 使用它，但保留 `scripts/prototype-review/` 這個位置，未來 node 端 review 腳本才能與 Inspector 共用同一份凍結的演算法，不必在 Inspector 資料夾內另放可能分岔的副本。

### 寫入前檢查既有 helper 的 export

安裝器在 React-only 檢查之後、既有 Inspector 資料夾檢查（`<dir> already exists. Pass --force…`）之前，也就是任何寫入之前，讀取專案既有 helper，以正規表示式抽出 `export function|const|let|type|interface <name>` 的名稱，與 Inspector 模組從 helper import 的名稱比對（從 asset 的 import 宣告動態抽取，不寫死清單）。缺少任何名稱且未加 `--force` 時，以非零碼結束並列出缺少的名稱。檢查放在資料夾檢查之前，同時有舊 Inspector 資料夾與 v1 helper 的專案（四個實際專案都是）才會看到缺少的名稱，而不是只看到資料夾已存在。替代方案「自動覆寫舊 helper」被否決：helper 位於使用者的 `src/`，可能被專案改過，靜默覆寫會吃掉變更；明確失敗並提示 `--force` 讓使用者自行決定。

### 以資料夾清單比對取代固定檔名清單

`check_inspector_copies` 改為遞迴列出兩邊資料夾的相對路徑集合（忽略 `.DS_Store`），比對集合差異與每個共同檔案的位元組，再額外比對 helper 與 fingerprint 兩組成對副本。往後新增 Inspector 模組不必更新任何清單。替代方案「繼續擴充 `INSPECTOR_COPY_FILES`」被否決：template helper 自 2026-08-28 起與 skill 版不同步卻沒被攔下，正是因為清單沒涵蓋到。

### 以 import surface 檢查攔住解析不到的 import

smoke test 以正規表示式讀取每個 Inspector `.js` 模組的靜態 import 宣告：只辨識位於敘述開頭的 `import ... from "x"` 與 `import "x"`，`import.meta`（例如 preset.js 的 `import.meta.url`）與動態 `import(` 不算 import 宣告，不受檢。相對路徑從安裝位置 `<project>/.storybook/prototype-inspector/` 解析成專案相對路徑，只允許資料夾內的檔案與安裝器會放置的 helper、fingerprint；具名 import 自 helper 時，名稱必須在兩份 helper 中 export（template 樹不存在時只比對 skill asset 的 helper，並印出略過 template 副本的提示）；裸套件名稱只允許 `react`、`storybook/*`、`@storybook/*`；preset.js 由 Storybook 在 Node 端載入，另允許 `node:` 內建模組（現行 preset.js 使用 `node:path` 與 `node:url`），其他模組出現 `node:` 視為違規。這同時把「Inspector 不新增 npm 依賴」變成可檢查的規則，也讓後續 change 新增的模組自動受檢。

### 只在明確的 layout 操作時寫入

移除監看 `draggedPositions` 的持久化 effect，改在三個操作處理函式中呼叫 `writeStoredFlowLayout`：拖曳結束且位置確實改變（`endDrag`）、確認 Reset（`confirmResetLayout`，positions 清空，helper 以一次 `removeItem` 清除）、Import 成功（`importLayout`）。規格把可寫入的操作寫成開放清單：後續 UI Flow canvas 能力定義的 committed layout action（例如 add-flow-canvas-editing-tools 的鍵盤微調、undo、redo）也各寫一次；本 change 只實作上述三個既有操作。已存 layout 只在 `useState` 初始化時讀一次；重新讀取的 effect 只在 storage key、node id 集合或 viewport signature 於掛載後改變時才執行，避免掛載時重複讀取造成第二次 console.info。替代方案「保留 effect 但跳過第一次執行」被否決：effect 在每次重新讀取後仍會寫回並修剪未知 id。

## Implementation Contract

**Behavior**

- template Storybook 的任一 story 可正常載入；template preview.js 可被 esbuild bundle。
- `install_prototype_inspector.mjs` 成功結束後，專案內 `.storybook/prototype-inspector/`、`src/pages/prototypes/prototypeFlowLayout.ts`、`scripts/prototype-review/fingerprint.mjs` 齊全，Inspector 每個相對 import 都指向存在的檔案。
- 開啟 UI Flow 不呼叫 `localStorage.setItem` 或 `removeItem`；拖曳放開（有位移）、確認 Reset、Import 成功各寫一次。

**Interface / data shape**

- 安裝器新增輸出行：`Installed fingerprint: <path>` 或 `Reused fingerprint: <path>`（沿用既有 `Installed|Reused flow layout helper` 的格式）。
- 不相容 helper 的錯誤輸出（stderr）：`Existing flow layout helper <path> is missing exports required by the Prototype Inspector: <name>[, <name>...]. Rerun with --force to replace it with the bundled helper.`，結束碼非零。
- smoke test 的失敗訊息格式：`inspector mirror: <relative path> differs|only in skill asset|only in storybook-template`、`inspector imports: <module> imports <specifier> — <reason>`。
- skill asset 的 flow layout payload 格式、storage key（`prototype-inspector:flow-layout:<id>`）與 helper 既有函式的簽名不變；template helper 同步後與 skill 版相同（payload version 2、含 viewport）。

**Failure modes**

- template 樹不存在（獨立安裝的 skill）：mirror 與 import surface 中涉及 template 的比對略過並印出提示，與現行行為一致；import surface 對 asset 自身的 helper 仍要檢查。
- localStorage 例外：沿用 helper 既有的 try/catch 與 console.warn，不中斷 UI。
- 安裝器在不相容 helper 時不寫入任何檔案（包括 Inspector 資料夾與 main.ts 的 preset 接線）。

**Acceptance criteria**

- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過，且其內建的自我測試證明：改壞任一鏡像檔、在單邊新增檔案、helper 移除一個被 import 的名稱、在 preview.js 暫存副本加入 `import "node:fs"`，都會讓對應檢查回報失敗並指出檔名或名稱；未修改的 preset.js（`node:path`、`node:url`、`import.meta.url`）通過。
- `node storybook-product-prototype/scripts/test_install_prototype_inspector.mjs` 通過（涵蓋全新安裝、fingerprint 沿用、v1 helper 拒絕且無寫入、`--force` 升級、非 React 專案拒絕）。
- `node storybook-product-prototype/scripts/test_authority_inspector.mjs` 通過。
- 在 template 執行上述 esbuild bundle 指令成功（node_modules 不存在時先在該目錄執行 `npm ci`）。
- 手動驗證持久化：在 DevTools 以 `localStorage.setItem`／`removeItem` 包裝計數，依 tasks 3.1 的步驟確認開啟不寫入、拖曳一次寫一次、signature 不符只出現一次 console.info 且已存資料不變。template 的 example prototype 沒有宣告 viewport（signature 為 `null`，Inspector 不檢查），所以 signature 不符的步驟需暫時為 `examplePrototypeFlow` 加上 phone viewport，檢查完還原。

**Scope boundaries**

- In scope：template helper 同步、安裝器 fingerprint 與 helper 相容檢查、smoke test 的 mirror 與 import surface 檢查、preview.js 持久化時機、build tag、安裝文件。
- Out of scope：UI Flow 互動與外觀、後續 canvas 能力新增的 committed layout action（鍵盤微調、undo、redo）、fallback grid 間距、⧉ 按鈕深連結、外部專案升級、`--force` 清理舊檔、template `check:figma-plugin` 失敗、template 自己 Spectra root（`design-system-to-storybook/storybook-template/openspec/`）的 spec 調整。

## Risks / Trade-offs

- [未合併的分支 feature/handoff-blocking-gate-20261001 大幅修改 `test_scaffold_validate.py` 的 `main()`] → 新檢查寫成獨立函式，`main()` 只增加一行呼叫；若該分支先合併，重新 rebase 時只需處理這一行。
- [以正規表示式抽 export／import 名稱可能漏掉 `export { a as b }` 或多行 import] → 目前 helper 與 Inspector 只使用 `export function|const|type` 與單一或多行 `import {...} from`；正規表示式需支援跨行的大括號清單，並在 design 列出不支援 re-export 語法；以 `import` 關鍵字開頭但無法解析的靜態宣告（不含 `import.meta` 與 `import(`）視為失敗而不是略過。
- [外部專案停在舊版 Inspector] → 它們的舊 Inspector 與 v1 helper 目前可正常載入；以本 change 之前的安裝器 `--force` 升級會因缺 fingerprint 而壞掉，本 change 之後的安裝器會一併安裝 fingerprint 並升級 helper。文件在 SKILL.md 安裝章節寫明升級指令 `node <skill>/scripts/install_prototype_inspector.mjs --project-root <repo> --force --token-prefix <prefix>`，並提醒 `--force` 會覆寫自訂過的 Inspector（cm-chipK fork）。
- [持久化改為放開時才寫，Static Flow 分頁不再即時跟著拖曳移動] → 這是預期行為，在 storybook-integration.md 註明「放開後同步」。
- [「開啟不寫入、一次拖曳寫一次」沒有 repo 內可重複執行的測試] → 本 change 以一次性的 Playwright 檢查驗證 tasks 3.1 的 (a)–(d)（17/17 通過）。使用者於 2026-10-05 決定不為此新增 jsdom 開發依賴，改由 rebuild-flow-canvas-camera 的 `bench_flow_canvas.mjs`（task 1.1 量測「開啟 UI Flow 至就緒期間對 `prototype-inspector:flow-layout:*` 的 `setItem`／`removeItem` 次數」與「一次拖曳的 `setItem` 次數」，task 4.2 斷言開啟時為 0）作為可重複執行的回歸防線。
- [template 自己 Spectra root 的 `viewport-token-tier` 規格「Inspector runtime copies stay in sync with the skill asset」仍只列 preview.js 與 prototype-inspector.css] → 本 change 只擴大根目錄的 inspector-runtime-distribution；template root 的規格調整併入 rebuild-flow-canvas-camera 4.5 記錄的 template Spectra root 後續 change，本 change 不修改 template 的 openspec。

## Migration Plan

合併後重新安裝 skill 到使用者層級（`node scripts/install_agent_skills.mjs --agent all --scope user --skill storybook-product-prototype --force`）。外部專案各自以 `--force --token-prefix <prefix>` 升級；不升級的專案行為不變。回滾只需 revert 本 change 的 commit：skill 版資料格式沒有變更；template 同步後寫出的 version 2 payload 仍能被 v1 helper 讀取，因為 v1 的 normalize 只取位置資料、不檢查版本。
