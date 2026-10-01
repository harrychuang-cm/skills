## Why

開發者過去是在 UI 稿上留言，再讓 AI 依留言理解並完成埋點（設定追蹤碼）。工作重心移到 Storybook 之後，figma export addon 的 Visual Comments 已能在 Story 上點選位置、留言並保存截圖，但它只為「修正視覺」設計：留言沒有類別、`Copy AI prompt` 固定輸出 `# Visual UI Fix Request`、一次只能複製一則。開發者因此無法用同樣順手的方式把埋點需求交給 AI，埋點留言也會和視覺修正留言混在一起。

## What Changes

- Visual Comments 的每則留言新增類別 `kind`，值為 `visual-fix` 或 `tracking`。新增留言時可選擇類別，預設 `visual-fix`；既有留言沒有此欄位，一律視為 `visual-fix`，既有 meeting 資料不需遷移。
- 已儲存的留言可以改類別，不需刪除重建，截圖證據保持不變。
- 報告頁的留言卡片顯示類別標籤；`tracking` 留言的 `Copy AI prompt` 改輸出埋點專用的 `# Tracking Instrumentation Request`，要求 AI 整理事件名、參數、記錄時機、數值定義四個欄位，並禁止自行發明留言沒寫的事件或參數。`visual-fix` 留言的輸出維持不變。
- 報告頁新增「一次複製全部埋點留言」的動作：把該 meeting 內所有未完成的 `tracking` 留言合併成一份 Markdown，可再依 Story 篩選。
- storybook-product-prototype 的交接規則補上一條：由 tracking 留言產生的埋點需求，在 prototype 的 Data Authority 中只能記為 `proposed` 的 `analytics` contract，需有確認來源才可改為 `confirmed`。
- addon 版本由 0.9.2 升為 0.10.0，重建 dist 並同步兩份 Storybook template 副本。

## Non-Goals (optional)

（範圍排除與否決的做法記錄於 design.md 的 Goals / Non-Goals。）

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `visual-export-review-comments`: 留言紀錄新增類別並允許修改類別；AI prompt 依類別輸出不同契約；新增埋點留言的批次匯出。
- `prototype-data-authority`: 新增 tracking 留言進入 Data Authority 時的狀態規則（只能是 proposed 的 analytics contract）。

## Impact

- Affected specs: `visual-export-review-comments`、`prototype-data-authority`
- Affected code:
  - Modified:
    - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
    - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.css
    - design-system-to-storybook/assets/figma-export-addon/package.json
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/assets/figma-export-addon/dist/（由 build 重新產生）
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
    - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - design-system-to-storybook/SKILL.md
    - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/（與 canonical 同步的副本）
    - design-system-to-storybook/storybook-template/vendor/figma-export/（與 canonical 同步的副本）
    - design-system-to-storybook/references/figma-export-review-setup.md
    - design-system-to-storybook/SKILL.md
    - storybook-product-prototype/references/handoff-authority.md
    - README.md
  - New: （無）
  - Removed: （無）
- 相容性：meeting.json 的 `version` 維持 1；舊版 addon 讀到新檔會忽略 `kind`，新版讀舊檔把缺少的 `kind` 視為 `visual-fix`。HTTP API 只新增選填欄位，沒有 breaking change。
- 相依：不新增任何 npm 相依。
