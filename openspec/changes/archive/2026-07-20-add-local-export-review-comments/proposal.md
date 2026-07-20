## Why

設計師會在每週設計會議中，透過同一台主機的區網 IP 開啟本機 Storybook prototype；現有 Export review 只有單一可覆寫 notes，無法把留言綁定到點擊位置與當下互動狀態，也不足以保證多人會議後仍保留可回看的證據。需要一個不依賴登入或外部服務的 visual comment 流程，讓每則意見連同當下 UI 截圖、定位與會議報告一起持久化。

## What Changes

- 在既有 Export review overlay 內加入 visual comments 區域，提供顯示名稱、Start meeting、End meeting、目前會議、留言清單與 report 入口；所有連到同一 Storybook host 的瀏覽器共用 server 上的 active meeting。
- 加入 comment capture mode：使用者點擊 prototype 的某一位置時，preview 端攔截該次互動、保留點擊前的 UI state、排除 addon chrome 後自動擷取乾淨 snapshot，並保存相對於 capture bounds 的 normalized pin。
- 將 screenshot 視為不可變的會議狀態證據；story、route、可選 semantic state、viewport 與 scroll 僅作 metadata，不承諾序列化或重播任意 React state。
- 新增 same-origin local review API，以 meeting session 為單位 append visual comments，將 canonical JSON 與獨立 binary image assets 寫入 repo 內的 design-system review 目錄；使用 request limits、idempotency、server-side mutation queue 與 atomic rename，避免多人同時留言時遺失資料。
- 每次 meeting/comment mutation 後，從 canonical JSON 產生可攜式 root index 與 per-meeting static HTML report；report 依 story 與 snapshot 分組，以 HTML/CSS 疊加編號 pin 和 plain-text comment，並使用 relative asset paths。
- 擴充 project-local Figma export config、Storybook template wiring、prototype capture-root metadata、文件與測試；保留既有 review status、Figma source 與 notes 行為，visual comments 為 additive capability。
- 依 bundled tool release flow bump addon version、重建 dist，並同步兩份 Storybook template vendor mirrors。

## Capabilities

### New Capabilities

- `visual-export-review-comments`: Covers shared meeting sessions, point-based client capture of the current Storybook UI state, persistent append-only visual comments, concurrent local storage, and portable static HTML review reports.

### Modified Capabilities

(none)

## Impact

- Affected specs: new `visual-export-review-comments` capability.
- Affected code:
  - New:
    - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
    - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
    - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture.html
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-fixture.mjs
    - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - Modified:
    - design-system-to-storybook/assets/figma-export-addon/src/review.ts
    - design-system-to-storybook/assets/figma-export-addon/src/review.css
    - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
    - design-system-to-storybook/assets/figma-export-addon/package.json
    - design-system-to-storybook/assets/figma-export-addon/package-lock.json
    - design-system-to-storybook/assets/figma-export-addon/README.md
    - design-system-to-storybook/assets/figma-export-addon/dist/
    - design-system-to-storybook/scripts/generate_figma_export_config.mjs
    - design-system-to-storybook/references/figma-export-review-setup.md
    - design-system-to-storybook/SKILL.md
    - design-system-to-storybook/storybook-template/.storybook/project.config.ts
    - design-system-to-storybook/storybook-template/.storybook/main.ts
    - design-system-to-storybook/storybook-template/.storybook/preview.ts
    - design-system-to-storybook/storybook-template/src/pages/prototypes/example-prototype/ExamplePrototype.tsx
    - design-system-to-storybook/storybook-template/README.md
    - design-system-to-storybook/storybook-template/vendor/figma-export/
    - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/
  - Removed: none.
- Runtime and storage impact: the React-only review entry gains a browser DOM-to-image dependency; the local Vite middleware writes session JSON, immutable image assets, and derived HTML under design-system/figma-export-review/. No external database, authentication service, WebSocket, or cloud deployment is introduced.
