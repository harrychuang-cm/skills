## Why

前一變更（prototype-production-readiness）完成了契約補強與載體中立化：handoff 已可版本化、token/flow/data 都有平台中立載體。但 handoff 的「執行端」仍只有 web——SwiftUI/Kotlin 目標沒有任何 skill 能機械地消費 handoff；真實資料串接的第三棒仍無承載者（mock→real 的替換靠口頭交接）；flow 的導航語意欄位還不能生成原生導航骨架；六站流程（產出→demo 確認→定版→組裝→串接→QA）只存在於研究報告，未成為可重跑的 pipeline。本變更補齊 skill 家族，讓「同一份 handoff、分平台實作、記名串接、可重跑」成立。

## What Changes

- **新 skill：native-product-implementation**——SwiftUI（Xcode/SPM）與 Jetpack Compose（Gradle）的 production 實作 skill。繼承 frontend-product-implementation 的方法骨架（handoff ingestion 契約、架構決策紀錄、Component Porting、mock-mode walkthrough、IMPLEMENTATION_MAP），替換三層：repo discovery（Xcode project/Package.swift/Gradle）、token 產出（消費 docs/TOKENS.json 生成 Swift extension/Compose theme）、驗證指令（xcodebuild/gradle）。FPI 維持 web 專職不泛化。
- **新 skill：production-data-integration**——第三棒：以 PRODUCTION_HANDOFF 的 API And Data Contracts、IMPLEMENTATION_MAP 的 Data Adapter Seams、fixtures/*.json 與 DATA_SPEC JSON Schema 為輸入，實作真實 client/auth/cache/persistence、替換 mock、以 contract test 驗證真實回應符合 schema。明訂不改 UI 行為與 route flow 的邊界。
- **flow codegen**：新增 storybook-product-prototype/scripts/export_flow.py——從 *PrototypeFlow.ts 抽出去布局化的 docs/flow.json，並可生成 Swift enum + NavigationStack 骨架與 Kotlin sealed class + NavHost 骨架（presentation/backBehavior 語意驅動 push/sheet/dialog 的選擇）。
- **六站 pipeline reference**：新增共用 reference 定義六站（SPP 產出 → 團隊 demo 確認 → handoff 定版 → 前端組裝 mock 模式 → 資料串接 → 視覺/驗收 QA）各站輸入/產出/把關、站 3 之後的平台分岔，附 agent-automation-orchestrate 的 config 編排範例；四個 skill 的 SKILL.md 各加指向。FPI 的視覺 QA 範圍由「新建元件」擴大為「全部 Scope B 畫面」。
- **API 契約語意欄位**：data-contract.md 的 API Replacement Points 與 PRODUCTION_HANDOFF 模板表補 pagination、sort/filter、freshness（static/poll/push）、mutation 語意（冪等/optimistic）、error taxonomy（可重試/不可重試/需重新授權）。
- 既有文件的第三棒指名：FPI 轉交條款與 SPP Integration Ownership 可直接指名 production-data-integration 為 stage-3 承接選項。

## Capabilities

### New Capabilities

- `native-product-implementation`: SwiftUI/Compose 目標的 production 實作 skill——native 架構決策紀錄、原生 repo discovery、TOKENS.json 消費、DataSource protocol/interface + fixtures.json mock、導航語意實作、xcodebuild/gradle 驗證與 IMPLEMENTATION_MAP 稽核。
- `production-data-integration`: 真實資料串接 skill——wiring 工作流（seam 盤點、endpoint 確認、real 實作、注入點替換）、contract testing（schema 驗證、error taxonomy 對映）、不動 UI 的邊界與完工報告。
- `flow-codegen`: export_flow.py 的 flow.json 匯出與 Swift/Kotlin 導航骨架生成。
- `pipeline-stations`: 六站 pipeline 共用 reference、agent-automation-orchestrate 編排範例、四 skill 指向，以及 FPI 視覺 QA 範圍擴大到全部 Scope B 畫面。
- `api-contract-semantics`: API 契約的 pagination/sort/freshness/mutation/error-taxonomy 語意欄位。

### Modified Capabilities

（無——production-token-bootstrap 與 agent-automation-orchestration-skill 僅被引用，需求不變。）

## Impact

- Affected specs: 新增上列 5 個 capabilities。
- Affected code:
  - New:
    - native-product-implementation/SKILL.md
    - native-product-implementation/agents/openai.yaml
    - native-product-implementation/references/native-architecture.md
    - native-product-implementation/references/handoff-ingestion.md
    - native-product-implementation/references/implementation-workflow.md
    - native-product-implementation/references/verification-reporting.md
    - production-data-integration/SKILL.md
    - production-data-integration/agents/openai.yaml
    - production-data-integration/references/data-wiring-workflow.md
    - production-data-integration/references/contract-testing.md
    - storybook-product-prototype/scripts/export_flow.py
    - storybook-product-prototype/references/pipeline-stations.md
  - Modified:
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/data-contract.md
    - storybook-product-prototype/references/production-handoff.md
    - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
    - storybook-product-prototype/scripts/test_scaffold_validate.py
    - frontend-product-implementation/SKILL.md
    - frontend-product-implementation/references/verification-reporting.md
  - Removed: （無）
