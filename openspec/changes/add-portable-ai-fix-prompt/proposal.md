## Why

Visual comment report 已保存截圖、Story metadata、pin 位置、viewport 與修改需求，但開發者在請 AI coding assistant 修正 UI 前，仍須手動重組這些證據。需要一個可攜的一鍵式提示詞，讓同一筆 report comment 能不依賴特定指令地交給 Claude、Claude Code、Cursor、Codex 或其他文字型 AI，且不遺失視覺脈絡。

## What Changes

- 在每張 visual comment card 新增 `Copy AI prompt` action。
- 產生 model-neutral Markdown，內容涵蓋 review objective、以不可信資料區塊包住的comment、Story identity與URL、專案相對screenshot path、report-relative screenshot path、screenshot URL、normalized pin、viewport、implementation constraints與具體verification expectations。
- 同時提供本機coding agent可讀取的專案相對screenshot path、可解析的same-origin screenshot URL與明確fallback：AI無法讀取path、URL或clipboard image時，必須請使用者手動附上截圖，不得猜測未檢視的視覺細節；不得輸出absolute host filesystem path。
- 瀏覽器能力允許時，嘗試把Markdown與PNG截圖一起寫入clipboard；任何圖片或rich clipboard步驟失敗時，仍必須保留text-only成功路徑並清楚回報是否包含圖片。
- 為每張comment提供accessible的完整成功、prompt-only fallback與clipboard failure feedback，且不得改變comment completion或delete state。
- 輸出不得包含Claude、Cursor、Codex或其他provider專屬的slash command、agent mode、API payload與hidden system instruction。
- 更新canonical addon build、patch version、文件、tests與兩份reusable vendor mirrors。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `visual-export-review-comments`: 在report comment cards加入portable AI fix context action，涵蓋model-neutral prompt、screenshot evidence references、clipboard fallback、accessible feedback與prompt-injection boundaries。

## Impact

- Affected specs: `visual-export-review-comments`
- Affected code:
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/README.md`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/package.json`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/package-lock.json`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js`
  - Modified: `design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md`
  - Modified: `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/README.md`
  - Modified: `design-system-to-storybook/storybook-template/vendor/figma-export/package.json`
  - New: (none)
  - Removed: (none)
