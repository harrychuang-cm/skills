## Summary

修正 prototype 到正式實作的文件權威邊界，讓 Fake Data、已確認契約、作者建議與未決事項可辨識、可驗證，並補齊轉場、完整同步及 repo 內 skill 交付。

## Motivation

分享會指出展示用欄位與作者建議被下游當成正式 API／埋點規格，且規格更新只改部分文件。現有禁止 live API 的規則沒有阻止 schema 被自動升格；native 會在導航缺漏時預設 push，資料接線測試還要求正式回應符合 prototype fixture。

## Proposed Solution

- 在 Data Spec 保留原入口，分開 Fake Data 與 Real Data Contract，加入可供驗證器及 Inspector 讀取的 Data Authority registry；樣本值用途與 schema 確認狀態獨立記錄。
- 建立 confirmed、proposed、open、superseded 決策規則與有範圍的文件 review；確認產品 demo 不代表確認 API。Remote Config 可交清楚的產品文字與 RD owner。
- frontend／native 只由展示 schema 建 UI model／mock；production-data-integration 使用有來源的正式 transport contract 與 mapper 驗收。
- 每個導頁 transition 有導航及 motion 意圖，無資料時不得預設 push；保留明確授權的平台預設。
- 擴充 manifest 對 flow、data、metadata、fixtures 與匯出載體的內容追蹤；規格更新需列出受影響關聯及作廢內容，重新 review 才發布新快照。
- 沿用 project skill installer，以明確使用清單保存必要依賴、版本與內容 hash，維護 CLAUDE.md／AGENTS.md 的受管區塊。

## Capabilities

### New Capabilities

- `prototype-data-authority`: Fake／Real 分類、決策效力、Remote Config 與 producer／consumer review 契約。
- `project-skill-delivery`: repo 內已使用 skill、必要依賴與版本紀錄。

### Modified Capabilities

- `neutral-data-contracts`: fixture schema 與正式 transport schema 的用途分離。
- `handoff-versioning`: review 證據與完整交付檔案 hash。
- `flow-navigation-semantics`: 每條導航的 motion 意圖與缺漏處理。
- `native-navigation-correctness`: 移除未授權的 push／back 推定。
- `flow-codegen`: 匯出 motion 並保留未確認導航狀態。
- `production-data-integration`: 正式回應依來源契約驗收，fixture 只作 UI／mock 參照。

## Impact

- Affected specs: prototype-data-authority、project-skill-delivery、neutral-data-contracts、handoff-versioning、flow-navigation-semantics、native-navigation-correctness、flow-codegen、production-data-integration。
- Affected code:
  - Modified: `storybook-product-prototype/SKILL.md`、`storybook-product-prototype/references/`、`storybook-product-prototype/assets/prototype-template/`、`storybook-product-prototype/assets/prototype-inspector/preview.js`、`storybook-product-prototype/scripts/scaffold_prototype.py`、`storybook-product-prototype/scripts/validate_prototype.py`、`storybook-product-prototype/scripts/export_flow.py`、`storybook-product-prototype/scripts/test_scaffold_validate.py`。
  - Modified: `frontend-product-implementation/SKILL.md`、`frontend-product-implementation/references/`、`native-product-implementation/SKILL.md`、`native-product-implementation/references/`、`production-data-integration/SKILL.md`、`production-data-integration/references/`。
  - Modified: `design-system-to-storybook/storybook-template/.storybook/prototype-inspector/preview.js`、`scripts/install_agent_skills.mjs`、`README.md`、`docs/skills-usage.md`、`frontend-product-implementation/scripts/validate_implementation.py`。
  - New: `storybook-product-prototype/references/handoff-authority.md`、`scripts/skill-dependencies.json`、`scripts/test_install_agent_skills.mjs`、`storybook-product-prototype/scripts/test_authority_inspector.mjs`。
  - Removed: 無。
