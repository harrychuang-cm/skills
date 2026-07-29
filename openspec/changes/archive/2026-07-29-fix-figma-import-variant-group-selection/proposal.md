## Problem

以 `Storybook Code To Design` 外掛（build 1.7.0）匯入複合元件的 payload 時，整棵元件樹被丟棄，Figma 只會產出一個巢狀子元件的 variant set。

實測案例：`cm-chipK/ds-lab/project` 的 `components-broker-import-broker-import-menu--default`。匯出的 payload 結構完整（schema `version: 2`、6 個 frame、5 個 text、3 個 svg、深度 3、token bindings 齊全），但 Figma 內只出現一個名為 `Icon` 的 component set 與其三個 variant，下拉框、兩顆按鈕、時間文字、外框與背景全部消失。

失敗是靜默的：外掛不回報錯誤，使用者只看到一個與請求無關的元件集。

## Root Cause

`design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts` 的 `importStorybookDesign` 在 `artifactKind` 為 `component` 且 payload 未攜帶 root component reference（`payload.component` 與 `payload.root.component` 皆不存在）時，會呼叫 `createComponentSetFromVariants`，改以「從整棵樹蒐集到的 variant 組」重建結果，並直接回傳該組作為 root node，不再建立 payload 的實際樹。

`createComponentSetFromVariants` 透過 `chooseVariantGroup` 挑選要重建的組，而 `chooseVariantGroup` 先以「組內 variant 數量至少 2」過濾候選，之後才在排序階段用 `isPreferredVariantGroup` 比對 payload 的 `componentTitle`。名稱比對因此永遠輪不到只有單一 variant 的目標組。

以實測案例為例，樹內共有兩組 variant 參照：`Broker Import Menu`（1 個 variant `with-timestamp`）與 `Icon`（3 個 variant）。目標組在數量過濾階段即被剔除，僅存的 `Icon` 組不戰而勝，於是巢狀子元件取代了整個 root。

`getVariantGroupDepth` 目前僅參與排序，並未作為硬性條件，因此深層巢狀的組同樣有資格取代 root。

`80sJP-Grok` 的 `components-actions-text-link--inline` 之所以正常，是因為樹內沒有任何一組達到 2 個 variant，`chooseVariantGroup` 回傳 undefined 後改走 `chooseComponentDefinitionSpec` 分支而正確建出元件；該路徑屬於巧合而非設計意圖。

觸發條件為：`artifactKind` 為 `component`、payload 無 root component reference、且元件內部使用同一個設計系統元件的兩個以上 variant。複合元件內含多個 icon 是常見組合，此缺陷不限於單一專案或單一設計系統。

## Proposed Solution

調整 `chooseVariantGroup` 與 `createComponentSetFromVariants` 的候選規則，使名稱比對與巢狀深度成為硬性條件，而非僅參與排序：

- 名稱相符優先於數量門檻：與 payload `componentTitle` 相符的 variant 組，不論組內 variant 數量多寡皆優先採用。
- 數量門檻退居後備：僅在沒有任何名稱相符的組時，才套用現行「至少 2 個 variant」的啟發式。
- 巢狀組不得取代 root：位於 root 之下、且名稱與 `componentTitle` 不符的 variant 組，一律不得成為匯入結果的 root node；此類 payload 應改建 payload 的實際樹。
- 匯入統計需記錄該次選擇結果與被略過的候選組，使使用者能從外掛回報得知採用了哪一組，而非只看到非預期輸出。

## Non-Goals

- 不處理機器上五份使用舊 `sbfx-json-importer` plugin id 的 fork（`cm-chipK/ds-lab`、`80sJP-DS`、`80sJP-Fable`、`seven-lights`、`seven-lights-neo`）。使用者實際於 Figma Desktop 執行的是 cm-skills 正本外掛，舊 fork 不在本缺陷的失敗路徑上；外掛散佈一致性與版本握手另案處理。
- 不變更匯出端 addon 的 payload schema，也不新增 root component reference 欄位。本次修正僅在匯入端完成，不要求重新匯出既有 payload。
- 不調整 variant set 的命名、排版或既有 `combineAsVariants` 行為。
- 不變更 `artifactKind` 為 `page` 的匯入路徑。

## Success Criteria

- 以 `components-broker-import-broker-import-menu--default` 的 payload 匯入後，Figma 內產出包含 6 個 frame、5 個 text、3 個 svg 的完整樹，且下拉框、兩顆按鈕與時間文字皆存在。
- 以 `components-actions-text-link--inline` 的 payload 匯入後，結果與修正前一致，不因本次調整而退化。
- 當 payload 的 `componentTitle` 與樹內某個 variant 組相符時，該組被採用，即使組內僅有一個 variant。
- 當 payload 無任何名稱相符的組時，僅有位於 root 層級的組有資格成為結果；巢狀組不得取代 root。
- 匯入統計包含所選 variant 組的名稱與被略過的候選組名稱。
- 外掛既有測試（`test/verify-pure-functions.cjs`、`test/verify-manifest.mjs`、`test/verify-bridge-helpers.cjs`）維持通過。

## Impact

- Affected specs: figma-import-reconstruction
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
    - design-system-to-storybook/assets/figma-plugin-code-to-design/code.js
    - design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html
    - design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
    - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
    - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js
    - design-system-to-storybook/storybook-template/figma/storybook-code-to-design/ui.html
  - New: (none)
  - Removed: (none)
