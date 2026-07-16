## Why

前一個 change（upgrade-figma-export-fidelity）解決了「匯出保真度」，但其 Non-Goals 記錄了四個通用性缺口，仍限制這條 Storybook→Figma 管線的適用範圍：(1) addon 的 preview 端以 React 元件包裝 story（FigmaCodeExporter decorator），Vue/Svelte/Angular/Web Components 的 Storybook 無法安裝——SKILL.md 因此把自動安裝限制在 React baseline；(2) 專案沒有 `--prefix-layer-*` 三層 token 時 detectTokenPrefix 直接 throw，完全不能匯出；(3) 遍歷不進 open Shadow DOM、也不讀 adoptedStyleSheets，Lit/Web Components 元件匯出為空；(4) 匯出→匯入靠手動複製貼上 JSON，多 story 工作流成本高。

## What Changes

- **Renderer-agnostic preview 端**：以 vanilla DOM overlay（掛載於 document.body）取代 React 版 FigmaCodeExporter；decorator 改為 pass-through（記錄 story context 後原樣回傳 storyFn 結果，不包裝 story），任何 renderer 皆可用；匯出範圍改以 id 為 storybook-root 的預覽根元素解析（保留現有 findExportRoot 邏輯）；preview 進入點不再 import react；React 僅存在於 manager 工具列與選配的 review 面板（review 模組維持 React-only 並如實記錄）。overlay 保留既有三動作（Copy JSON、Plugin Console Script、Copy design to Figma）與狀態顯示，viewMode 非 story 時不顯示。
- **Token-less 降級模式**：偵測不到 token prefix 時 detectTokenSystem 回傳空 token system（空 catalog、空 prefix）而非 throw；綁定掃描跳過、payload.tokens 為空陣列、匯出照常完成；overlay 摘要顯示 0 variables。
- **Shadow DOM 支援**：元素具 open shadowRoot 時以 shadowRoot 子元素作為其子層遍歷，slot 元素以 assignedElements flatten 展開；token 綁定規則收集改為 per-root——document 與各 shadowRoot 的 styleSheets 與 adoptedStyleSheets 皆納入；tokenExport 的 token 蒐集加入 document.adoptedStyleSheets。closed shadow root 維持現狀（不可見即不匯出其內部）。
- **本機批次匯入橋**：review-server（Vite middleware）新增 payload store 端點——POST 儲存匯出 payload、GET 列表、GET 單筆，回應帶寬鬆 CORS 標頭供 Figma plugin iframe 讀取；exporter 在設定啟用時於匯出成功後自動 POST payload；Figma plugin UI 新增「Load from Storybook」：輸入 Storybook 網址（預設 http://localhost:6006）、抓取 payload 清單、選取後走既有 import-json 流程匯入；plugin manifest 加入 networkAccess devAllowedDomains（localhost/127.0.0.1）。貼上與選檔流程完全保留。
- **副本同步與文件**：assets 權威副本同步至兩個 template 副本與 template plugin 執行檔；design-system-to-storybook/SKILL.md 的安裝門檻由「React + Storybook 10 baseline」放寬為「Storybook 10（任何 renderer）」並註明 review 面板仍為 React-only；addon/plugin README 與 references/figma-export-readiness.md 更新；補上兩份主 specs 的 Purpose 佔位文字。
- **驗證擴充**：overlay fixture（headless Chromium 驗證 vanilla overlay 掛載、狀態與匯出動作，剪貼簿以 stub 驗證輸出）、token-less fixture（無 token 頁面匯出不 throw 且 tokens 為空）、主 fixture 新增 open shadow root + adoptedStyleSheets 案例、payload store 的 node HTTP 測試；plugin 的 Load from Storybook 因需 Figma 桌面環境，以 code review + 手動驗證步驟記錄。

## Capabilities

### New Capabilities

- `figma-export-workflow`: addon 的匯出工作流——renderer-agnostic decorator/overlay 契約、匯出範圍解析、以及 exporter 端的 payload 自動上傳行為

### Modified Capabilities

- `figma-export-capture`: 新增 Shadow DOM 遍歷與 token-less 降級兩項擷取需求（ADDED，不變更既有需求）
- `figma-import-reconstruction`: 新增「自本機 Storybook 橋載入 payload」匯入需求（ADDED，不變更既有需求）

## Impact

- Affected specs: `figma-export-workflow`（新增）、`figma-export-capture`（ADDED delta）、`figma-import-reconstruction`（ADDED delta）
- Affected code:
  - New:
    - `design-system-to-storybook/assets/figma-export-addon/src/overlay.ts`（vanilla DOM overlay，取代 React 版）
    - `design-system-to-storybook/assets/figma-export-addon/test/overlay-fixture.html`
    - `design-system-to-storybook/assets/figma-export-addon/test/tokenless-fixture.html`
    - `design-system-to-storybook/assets/figma-export-addon/test/run-overlay-fixture.mjs`
    - `design-system-to-storybook/assets/figma-export-addon/test/run-payload-store-test.mjs`
  - Modified:
    - `design-system-to-storybook/assets/figma-export-addon/src/preview.tsx`（改為無 react 的 preview 進入點）
    - `design-system-to-storybook/assets/figma-export-addon/src/FigmaCodeExporter.tsx`（移除，邏輯遷入 overlay.ts）
    - `design-system-to-storybook/assets/figma-export-addon/src/domExport.ts`（Shadow DOM 遍歷、per-root 規則）
    - `design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts`（token-less 降級、adoptedStyleSheets）
    - `design-system-to-storybook/assets/figma-export-addon/src/review-server.ts`（payload store 端點）
    - `design-system-to-storybook/assets/figma-export-addon/src/options.ts`（自動上傳設定）
    - `design-system-to-storybook/assets/figma-export-addon/src/index.ts`、`design-system-to-storybook/assets/figma-export-addon/tsup.config.ts`、`design-system-to-storybook/assets/figma-export-addon/package.json`（entry 重整）
    - `design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html`、`design-system-to-storybook/assets/figma-export-addon/test/run-export-fixture.mjs`（shadow DOM 案例）
    - `design-system-to-storybook/assets/figma-export-addon/README.md`
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/ui.html`（Load from Storybook）
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/manifest.json`（networkAccess）
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/README.md`
    - `design-system-to-storybook/SKILL.md`（安裝門檻放寬）
    - `design-system-to-storybook/references/figma-export-readiness.md`
    - `design-system-to-storybook/storybook-template/vendor/figma-export/`（同步）
    - `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/`（同步）
    - `design-system-to-storybook/storybook-template/figma/storybook-code-to-design/`（同步）
    - `openspec/specs/figma-export-capture/spec.md`（Purpose 補寫）
    - `openspec/specs/figma-import-reconstruction/spec.md`（Purpose 補寫）
  - Removed: （無——FigmaCodeExporter.tsx 內容遷移後刪檔，已列於 Modified）
- 相依性：preview 端零新增相依且移除 react 依賴；plugin manifest networkAccess 僅新增 dev 網域；payload 走 version 2 不變。
