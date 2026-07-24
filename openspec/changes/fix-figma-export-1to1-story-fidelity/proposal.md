## Why

以 80sJP-Grok 專案的 Components/Actions/Text Link「Inline」story 驗證 storybook-code-to-design 匯出/匯入管線時，Figma 端的還原結果與 Storybook 實際渲染有明顯落差：整段 375px 寬、兩行的明朝體段落（「詳細はこちらをご確認ください。…」）只剩下 64×16 的「こちら」單一文字節點，字型也從 Hiragino Kaku Gothic ProN W6 變成 Noto Sans JP Bold。使用者的目標是讓工具能一比一還原 Storybook story 到 Figma，這些缺陷必須修正。

## What Changes

已確認四項缺陷（皆以 headless Chrome 對 story 實測的 computed styles 與 Figma 現況節點比對佐證）：

- **Story 脈絡遺失**：exporter 的 findExportRoot 在 story scope 內只有單一 data-component 元素時，直接以該元件節點為匯出根，丟棄 story 周圍的示範標記（段落、版面、背景）。修正為一律以 story 的實際渲染根（scope 的第一個元素子節點）為匯出根，元件參照保留在內層節點上；importer 已支援任意深度的 component reference（collectComponentDefinitionSpecs 會遞迴收集），可據以同時建立元件定義與 story 畫面。
- **日文字型 style 對映失敗**：importer 的字重→Figma 字型 style 候選清單只含歐文命名（Bold、Semibold…），Hiragino 系列在 Figma 的 style 名是 W0–W9，weight 700 全部落空後 fallback 到後位家族 Noto Sans JP。修正為候選 style 全部失敗時，改查 figma.listAvailableFontsAsync 取得該家族實際 style 清單，解析 style 名稱的字重語意（W#、數字、歐文命名）後選擇最接近的字重，維持第一順位家族。
- **文字節點寬度膨脹**：exporter 的 getTextExportWidth 對非固定寬度文字一律加 max(12, fontSize) 的 safety width（48px 變 64px），破壞一比一寬度。修正為匯出精確的 rect 寬度，改以 textAutoResize 提示讓 Figma 端以自身字型度量避免換行，對齊補償邏輯（getTextExportX）同步調整。
- **inline 文字行高裁切**：瀏覽器對 inline 元素回報的 rect 高度是字型內容高（16px），但 line box 是 26.4px；importer 依 payload 尺寸強制 resize 後，Figma 內 26.4px 行高的文字被裁進 16px 高的節點，垂直位置偏移。修正為 exporter 對單行 inline 文字以 line box 模型補償（高度取 line-height、y 依 half-leading 上移），使 Figma 繪製基線與瀏覽器一致。

版本推進：addon 0.7.0 → 0.8.0、importer 1.6.1 → 1.7.0，並同步至 80sJP-Grok 的安裝副本（vendor tgz 重打包、figma/storybook-code-to-design 外掛檔案）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `figma-export-capture`：匯出根選擇改為 story 渲染根（新 requirement）；文字寬度捕捉移除 safety width、inline 文字行高盒補償（修改 Text style capture）。
- `figma-import-reconstruction`：字型解析在候選 style 落空時查詢實際可用 style 並依字重語意選擇，涵蓋日文字型 W# 命名（修改 Text style application）。

## Impact

- Affected specs: `figma-export-capture`、`figma-import-reconstruction`
- Affected code:
  - Modified: design-system-to-storybook/assets/figma-export-addon/src/domExport.ts（authoritative exporter source）
  - Modified: design-system-to-storybook/assets/figma-export-addon/package.json（0.8.0）
  - Modified: design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/（src/dist/package.json 同步）
  - Modified: design-system-to-storybook/storybook-template/vendor/figma-export/（src/dist/package.json 同步）
  - Modified: design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts（importer 1.7.0）
  - Modified: design-system-to-storybook/assets/figma-plugin-code-to-design/package.json
  - Modified: design-system-to-storybook/assets/figma-plugin-code-to-design/package-lock.json
  - Modified: design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
  - Modified: design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-manifest.mjs
  - Modified: design-system-to-storybook/storybook-template/figma/storybook-code-to-design/code.js（含 ui.html、manifest.json 同步）
  - New: design-system-to-storybook/assets/figma-export-addon/test/story-fidelity-fixture.html
  - New: design-system-to-storybook/assets/figma-export-addon/test/run-story-fidelity-fixture.mjs
  - Modified: 下游安裝副本（80sJP-Grok 專案，位於本 repo 之外）：vendor tgz 0.8.0、package.json 依賴、figma/storybook-code-to-design 外掛
