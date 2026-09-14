## Summary

以本專案 ds-governance 作為共用治理來源，遷移現行引用並讓規則適用 Cursor、Codex、Claude Code 與 Web／原生平台。

## Motivation

新加入的資料夾與 skill frontmatter 名稱不同，已使共用安裝器失敗；現行文件仍指向外部 skill。原版治理混入特定品牌風格、固定 CSS 路徑與重複批准要求，限制跨專案使用。

## Proposed Solution

統一 skill 身分為 ds-governance，提供平台中立的 discovery、token 與 composition gates、授權沿用、依專案設計的視覺原則與可核對的完成回報。遷移實作 skills、原型流程、coverage companion、產生文件的模板與現行規格，更新安裝指南與受管模板雜湊。

## Capabilities

### New Capabilities

- `ds-governance`: 專案內來源、可攜載入、跨平台治理與三種 agent 的安裝驗證。

### Modified Capabilities

- `native-component-governance`: companion 名稱、跨平台定位與已有授權的 gate 語意。
- `component-reuse-map`: 將 discovery 來源遷移至 ds-governance。
- `production-token-bootstrap`: 以 ds-governance 的既有層級相容規則作為 token 依據。

## Impact

- Modified: `ds-governance/SKILL.md`, `ds-governance/principles.md`, `frontend-product-implementation/SKILL.md`, `frontend-product-implementation/references/runtime-architecture.md`, `frontend-product-implementation/references/implementation-workflow.md`, `frontend-product-implementation/references/token-bootstrap.md`, `native-product-implementation/SKILL.md`, `native-product-implementation/references/implementation-workflow.md`, `native-product-implementation/references/handoff-ingestion.md`。
- Modified: `storybook-product-prototype/SKILL.md`, `storybook-product-prototype/references/component-discovery.md`, `storybook-product-prototype/references/production-handoff.md`, `storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md`, `storybook-tools-install/SKILL.md`, `storybook-tools-install/template/skills/component-coverage-implement/SKILL.md`, `storybook-tools-install/template/src/storybook/component-coverage/ReportView.tsx`, `storybook-tools-install/template/scripts/check-component-coverage-agent-skills.mjs`, `storybook-tools-install/template/TEMPLATE_MANIFEST.json`。
- Modified: `design-system-to-storybook/storybook-template/design-system/STORYBOOK_ARCHITECTURE.md`, `design-system-to-storybook/storybook-template/docs/design-system/index.html`, `README.md`, `docs/skills-usage.md`, `docs/skills-guide.html`。
- Modified specs: `openspec/specs/native-component-governance/spec.md`, `openspec/specs/component-reuse-map/spec.md`, `openspec/specs/production-token-bootstrap/spec.md`。
- New: `ds-governance/agents/openai.yaml`, `openspec/specs/ds-governance/spec.md`。
- 驗證沿用共用安裝器與 coverage checker；checker 需能讀現行 per-tool manifest 及舊版 flat manifest，才可驗證新 companion 與雜湊。

## 文件補充範圍

依使用者後續要求，補齊 docs 內三份指南的 ds-governance 使用情境、必要／條件式搭配關係、可複製提示與平台／授權說明；新增受影響文件 `docs/designer-guide-storybook-to-production.html`。僅修改文件與本變更紀錄，保留既有完成項目及其他進行中的變更。
