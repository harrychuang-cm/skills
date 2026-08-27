## Why

Storybook 與 Figma 之間的橋目前是單向的：figma-export-addon 只能把 rendered story 匯出成 payload、由 Storybook Code To Design plugin 匯入 Figma。使用者在 Figma 端打磨匯入的元件後，AI 沒有任何機制能判斷「哪些 story 需要從 Figma 更新回 Storybook」，也無法區分「Figma 單邊改、code 單邊改、雙邊都改」三種情境。

回流所需的三方資料其實已經存在——payload store 保存匯出快照、component-review-status.json 保存 Figma node URL 與審查狀態、Figma MCP 可讀取設計現況——但有兩個結構性缺口讓它們無法組成同步判斷：(1) payload store 以 storyId 覆寫式寫入，baseline 會被下一次 export 蓋掉，三方比對塌成兩方；(2) plugin 匯入時只以 private plugin data 寫入 storyId，MCP 與 REST API 都讀不到，node↔story 對應無法從 Figma 端反查。

## What Changes

- **Figma importer plugin 寫入共享識別**：匯入時除既有 private plugin data 外，於 section 節點以 shared plugin data（namespace `storybook`）寫入 `storyId`，使 Figma REST API 的 `plugin_data` 查詢與外部工具可反查 node↔story 對應；重複匯入既有 section 時補寫，讓 legacy 匯入結果也能被識別。
- **payload store 增加 baseline 凍結**：review-server 的 payload store 新增 synced baseline 儲存區，保存「上次確認同步」的 payload 版本，不被後續 export 覆寫；新增 promote 端點將現行 payload 升級為 baseline，並在列表摘要標示 baseline 存在與時間。
- **新 skill `figma-sync-back`**：以 review status 與 Figma shared plugin data 建立 story↔node 對應表，執行三方比對（base＝synced baseline payload、ours＝現行渲染的新 export、theirs＝Figma MCP 讀出的設計現況），以四格矩陣分類（已同步／Figma 單邊改／code 單邊改／雙邊衝突），套用 exporter known-limitation 濾網剔除假差異，最後產出分流報告：token 差異導向 design-system-extractor 的 Late-Arriving Authoritative Source Pass、視覺差異導向 ui-compare-to-reference、結構差異標記人工處理。skill 本身不直接修改產品 code。

## Capabilities

### New Capabilities

- `figma-sync-back-skill`: 偵測 Figma 端修改並產出回流分流報告的 skill——對應表建立、三方比對、四格矩陣分類、known-limitation 濾網、分流與報告契約、baseline 更新規範。

### Modified Capabilities

- `figma-export-workflow`: payload store 端點新增 synced baseline 儲存與 promote 行為；baseline 不被一般 export 的 POST 覆寫。
- `figma-import-reconstruction`: 匯入建立或重用 component section 時，必須以 shared plugin data 寫入 storyId 識別，供外部工具讀取。

## Impact

- Affected specs: `figma-sync-back-skill`（新增）、`figma-export-workflow`（修改）、`figma-import-reconstruction`（修改）
- Affected code:
  - New:
    - figma-sync-back/SKILL.md
    - figma-sync-back/references/sync-decision-matrix.md
    - figma-sync-back/references/known-limitation-filter.md
    - figma-sync-back/scripts/compare_payload_baseline.mjs
    - figma-sync-back/scripts/test_compare_payload_baseline.mjs
  - Modified:
    - design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts
    - design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs
    - design-system-to-storybook/assets/figma-plugin-code-to-design/README.md
    - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
    - design-system-to-storybook/assets/figma-export-addon/test/run-payload-store-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon（mirror 同步）
    - design-system-to-storybook/storybook-template/vendor/figma-export（mirror 同步）
    - design-system-to-storybook/SKILL.md（交叉引用新 skill 的回流入口）
  - Removed: （無）
