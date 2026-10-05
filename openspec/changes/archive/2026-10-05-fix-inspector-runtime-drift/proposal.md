## Problem

Prototype Inspector 的執行檔在兩個地方已經壞掉或會壞掉，而且開啟 UI Flow 本身就會改寫使用者存好的 layout：

- **storybook-template 的 Inspector 目前無法載入。** template 的 `.storybook/prototype-inspector/preview.js`（與 skill 原始檔逐位元組相同）會從 `../../src/pages/prototypes/prototypeFlowLayout` import `getPrototypeFlowLayoutViewportSignature`，但 template 自己的 `src/pages/prototypes/prototypeFlowLayout.ts` 仍是 2026-06-22 的 v1，沒有這個 export。用 template 的 esbuild bundle preview.js 會失敗：`No matching export in "src/pages/prototypes/prototypeFlowLayout.ts" for import "getPrototypeFlowLayoutViewportSignature"`。preset 把 preview.js 註冊成全域 previewAnnotation，所以 template Storybook 的每個 story 都受影響；用 install_storybook_template.mjs 從 template 建立的新專案也會繼承這個錯誤。
- **安裝器漏裝 Inspector 依賴的檔案。** preview.js 自 2026-09-04（commit 4f158b1）起 import `../../scripts/prototype-review/fingerprint.mjs`，但 `install_prototype_inspector.mjs` 只複製 `assets/prototype-inspector/` 與 flow layout helper。以安裝器產生的檔案配置 bundle preview.js 會失敗（`Could not resolve "../../scripts/prototype-review/fingerprint.mjs"`）。cm-linepay、cm-invoice、80sJP 三個實際專案都沒有這個檔案，以目前的安裝器照文件用 `--force` 升級 Inspector 會直接壞掉。
- **安裝器會靜默沿用過期的 helper。** 專案已有 `src/pages/prototypes/prototypeFlowLayout.ts` 但還沒有 `.storybook/prototype-inspector/` 時（例如先前以 scaffold_prototype.py 建立 prototype 的專案），安裝器在未加 `--force` 時沿用舊檔並回報成功，新的 Inspector 卻因 helper 缺少 export 而無法載入。四個實際專案都已有 Inspector 資料夾：未加 `--force` 會先因資料夾已存在而失敗，加 `--force` 則 helper 會被覆寫。
- **開啟 UI Flow 就會刪掉或修剪已存的 layout。** 規格要求 viewport signature 不符的已存 layout 要「被忽略」，但實際上 Inspector 掛載時就以空的 positions 寫回，helper 對空 positions 的處理是 `localStorage.removeItem`，整筆 layout 因此被刪除；已存位置中不屬於目前 flow 的 node id 也會在開啟時被剪掉。同一次開啟，signature 不符的 console.info 會出現兩次。拖曳時每個 pointermove 都寫一次 localStorage，並對所有同源文件（包含每個 route iframe 與 Static Flow 分頁）觸發 storage 事件。

## Root Cause

- 2026-08-28 的 add-flow-viewport-contract 只更新了 skill 原始檔的 helper（commit 9e6bbbf），template 副本沒有同步。smoke test 的 `INSPECTOR_COPY_FILES` 只列 `preview.js` 與 `prototype-inspector.css`，SSR harness（`test_authority_inspector.mjs`）只比對 preview.js，template 的 `tsc --noEmit` 因 `allowJs: false` 不檢查 preview.js，所以沒有任何檢查涵蓋 helper 副本或 Inspector 的 import 是否都解析得到。
- commit 4f158b1 新增 fingerprint import 時，沒有同步更新安裝器與安裝文件。
- 安裝器的 `installFlowLayoutHelper` 只用「檔案是否存在」決定沿用或安裝，不檢查既有 helper 是否提供 Inspector 需要的 export。
- `PrototypeFlow` 用 `useEffect` 監看 `draggedPositions` 來持久化 layout，這個 effect 在掛載時與每次重新讀取後都會執行；而 helper 的 `writePrototypeFlowLayoutPositions` 對空 positions 的語意是「刪除」，normalize 又會濾掉不在目前 flow 的 id。已存 layout 在 `useState` 初始值與掛載 effect 各讀一次，所以 console.info 重複。

## Proposed Solution

- 以 skill 原始檔逐位元組覆寫 template 的 `prototypeFlowLayout.ts`。新版的 API 是舊版的超集合（只新增選用參數與 export）；payload 版本由 1 升為 2 並多出 `viewport` 欄位，與 skill 版現行格式相同（template 內唯一寫入 payload 的 preview.js 本來就使用這個格式）。`ExamplePrototypeFlowExport.tsx` 的兩參數讀取不檢查版本，行為不變。已在暫存副本驗證 template `tsc --noEmit` 通過、esbuild 可 bundle preview.js。
- 安裝器把 `assets/prototype-review/fingerprint.mjs` 安裝到 `<project>/scripts/prototype-review/fingerprint.mjs`（已存在且未加 `--force` 時沿用並印出動作）。寫入任何檔案前（在 React-only 檢查之後、既有 Inspector 資料夾檢查之前），先檢查專案既有 helper 是否 export Inspector import 的每個名稱；缺少且未加 `--force` 時以非零碼結束，列出缺少的名稱並建議 `--force`，不寫入任何檔案。
- smoke test 的副本檢查改為：遞迴比對整個 Inspector 執行檔資料夾的檔案清單與內容，再加上 helper、fingerprint 兩組副本。新增 import surface 檢查：Inspector 執行檔中的每個相對 import 都必須指向安裝器會安裝的檔案，從 helper import 的每個名稱都必須在兩份 helper 中 export；裸套件只允許 `react`、`storybook/*`、`@storybook/*`，由 Storybook 在 Node 端載入的 preset.js 另允許 `node:` 內建模組。
- 持久化只在使用者明確操作時寫入：拖曳放開、確認 Reset、成功 Import。開啟 UI Flow 不再寫入、修剪或刪除已存 layout；signature 不符時每次掛載只出現一次 console.info；一次拖曳只寫一次。規格把可寫入的操作寫成開放清單：後續 UI Flow canvas 能力定義的 committed layout action（例如鍵盤微調、undo、redo）同樣各寫一次，本 change 只實作上述三個既有操作。
- 新增 `inspector-runtime-distribution` 能力來承載安裝與副本完整性，把原本放在 `inspector-viewport-resolution` 的「Inspector asset copies stay byte-identical」移過去並擴大範圍。
- bump `prototypeInspectorBuildTag`，並更新 SKILL.md 安裝章節、storybook-integration.md 與根 README 的目錄樹。

## Non-Goals

- 不改 UI Flow 的操作方式、外觀或渲染架構；那些屬於後續的 rebuild-flow-canvas-camera、add-flow-canvas-level-of-detail、add-flow-canvas-editing-tools 與 add-flow-frame-interact-mode。
- 不升級已安裝 Inspector 的外部專案（cm-linepay、cm-invoice、80sJP、cm-chipK）。本 change 只讓安裝器與文件正確；cm-chipK 的 fork（preview.js 實測 13,703 行）需人工合併。
- 不修改 `fingerprint.mjs` 的演算法（review ledger 依賴它固定不變）。
- 不讓 `--force` 刪除目標資料夾中已不存在於 asset 的舊檔案。
- 不修 template `npm run check` 中與 Inspector 無關的 `check:figma-plugin` 失敗（`ERR_PACKAGE_PATH_NOT_EXPORTED './plugin-code'`）。

## Success Criteria

- 在 `design-system-to-storybook/storybook-template` 執行 `node_modules/.bin/esbuild .storybook/prototype-inspector/preview.js --bundle --format=esm --outfile=/dev/null --external:react "--external:storybook/*" "--external:*.css"` 以零碼結束（node_modules 不在版控，不存在時先在該目錄執行 `npm ci`）。
- 對一個只含安裝器產物（Inspector 資料夾、helper、fingerprint）的暫存專案樹執行同樣的 bundle，以零碼結束。
- 新的安裝器測試證明：專案有 v1 helper 且未加 `--force` 時，安裝器以非零碼結束、輸出列出 `getPrototypeFlowLayoutViewportSignature`，且專案檔案完全未變；全新安裝會裝好 fingerprint 與 helper；加 `--force` 時 helper 被升級。
- smoke test 在任一副本差一個位元組、多一個檔案或少一個檔案時以非零碼結束並指出檔名；helper 缺少 Inspector import 的名稱時以非零碼結束並指出名稱。
- 手動驗證：開啟一個已存 layout 的 viewport signature 不符的 prototype 的 UI Flow 後，該 localStorage 項目內容不變，console 只出現一次 signature 不符的 console.info；拖曳一個節點從按下到放開只呼叫一次 `localStorage.setItem`。該 prototype 必須宣告 viewport，未宣告時 Inspector 不檢查 signature；template 的 example prototype 沒有宣告，檢查時需暫時加上（步驟見 tasks 3.1）。
- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 與 `node storybook-product-prototype/scripts/test_authority_inspector.mjs` 通過。

## Impact

- Affected specs: inspector-runtime-distribution（新）、inspector-viewport-resolution、storybook-prototype-vue-support
- Affected code:
  - Modified:
    - design-system-to-storybook/storybook-template/src/pages/prototypes/prototypeFlowLayout.ts
    - storybook-product-prototype/scripts/install_prototype_inspector.mjs
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - storybook-product-prototype/assets/prototype-inspector/preview.js
    - design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/storybook-integration.md
    - README.md
  - New:
    - storybook-product-prototype/scripts/test_install_prototype_inspector.mjs
  - Removed: (none)
