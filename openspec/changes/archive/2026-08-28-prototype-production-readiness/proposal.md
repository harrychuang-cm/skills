## Why

研究確認（8-agent 交叉查核，51 條主張 48 條成立）：storybook-product-prototype（SPP）與 frontend-product-implementation（FPI）的 handoff 文件契約健全，但存在四道結構性缺口——真實資料串接的 ownership 真空與 FPI 的條件式後門、handoff 無版本化導致 drift 不可偵測、驗收條款無 ID 導致 traceability 斷鏈、token/flow/data 三種載體（CSS、TypeScript、自由文字）使 SwiftUI/Kotlin 等原生 production 目標無法機器消費 handoff。本變更實作研究報告的 Phase 1（契約補強）與 Phase 2（載體中立化），讓「prototype → production」流程在 web 端立即更可靠，並為原生平台鋪好先決條件。

## What Changes

- **封死 FPI 資料後門、三段式 ownership**：FPI 總則與 Implementation Rules 中「使用者明確要求且 repo 提供 pattern 時可接真實 API」的條件式後門改為轉交條款；SPP 的 Integration Ownership 由二段式升為三段式（prototype → frontend assembly → data integration），PRODUCTION_HANDOFF 新增記名的 Data Integration Ownership 欄位。
- **DataSource 契約規範**：FPI 的 API/Data Adapter Pattern 升級為具名契約——每個 fixture group 對應 DataSource interface 方法與 Mock 實作，PRODUCTION_HANDOFF 的 API And Data Contracts 表新增 Adapter interface 欄。
- **Mock-Mode Flow Walkthrough gate**：FPI 驗收新增流程級 done 定義（mock 模式走通 FLOW_SPEC primary journey 與全部 in-scope 分支）；ACCEPTANCE 模板新增對應章節。
- **Handoff 版本化**：validate_prototype.py 在 --handoff-ready 通過時產出 HANDOFF_MANIFEST.json（各 doc sha256、route/fixture 快照、Scope digest、Review Status、changelog）；新增 --verify-manifest 模式偵測 drift；FPI ingestion 記錄消費的 manifest hash，並新增 Review Status 閘門（非 confirmed 即停下詢問）。
- **Acceptance ID 三層貫穿**：ACCEPTANCE 模板 criteria 加穩定 ID（AC-S-*/AC-H-*/AC-P-*，新增 production integration 驗收段）；validator 檢查 ID 唯一與三段齊備；FPI 最終報告新增逐條 Acceptance Traceability 表。
- **語言中立資料契約**：DATA_SPEC 每個 fixture group 附 JSON Schema 區塊；fixtures 由 .ts 同步匯出 fixtures/*.json；validator 檢查兩者一致。
- **Token 交換格式**：新增匯出腳本由 UI_SPEC Token Binding 產出 docs/TOKENS.json（W3C DTCG 格式）；FPI token-bootstrap 的輸出格式表新增 SwiftUI 與 Compose 兩列並接受 DTCG 輸入。
- **Flow 導航語意**：flow 契約的 Route 型別加 params/deepLink、Transition 加 presentation/backBehavior（全 optional、向後相容）；FLOW_SPEC 的 Production Navigation Map 由 prose 升級為表格；validator 於 App 目標 in scope 時檢查 presentation 欄。
- **元件對映 per-platform 化**：meta.components entry 新增 optional targets 欄（web/ios/android）；Prototype To Frontend Map 支援 per-target Scope 欄。
- **FPI 端機器 validator**：新增 validate_implementation.py，機檢 route 終態覆蓋、Scope A evidence path、AC-P 覆蓋、manifest hash 一致。

## Capabilities

### New Capabilities

- `data-wiring-boundary`: FPI 資料邊界收斂——轉交條款取代真實串接後門、三段式 Integration Ownership、DataSource 契約命名規範、mock-mode flow walkthrough done gate。
- `handoff-versioning`: HANDOFF_MANIFEST.json 產出與 drift 偵測（--verify-manifest），以及 FPI ingestion 端的 Review Status 閘門與 manifest hash 消費記錄。
- `acceptance-traceability`: AC-S/AC-H/AC-P 三層驗收 ID 制度、validator 檢查、FPI 報告的逐條 traceability 表。
- `neutral-data-contracts`: DATA_SPEC 的 JSON Schema 區塊、fixtures/*.json 匯出與 .ts↔.json 一致性檢查。
- `token-interchange-export`: 由 UI_SPEC Token Binding 生成 docs/TOKENS.json（W3C DTCG 格式）的匯出流程。
- `flow-navigation-semantics`: flow 契約的導航語意欄位（params、deepLink、presentation、backBehavior）與 Production Navigation Map 表格化。
- `platform-component-mapping`: meta.components 的 per-platform targets 欄與 Prototype To Frontend Map 的 per-target Scope。
- `implementation-validation`: FPI 端的 validate_implementation.py 機器稽核（終態覆蓋、evidence path、AC-P 覆蓋、manifest hash 比對）。

### Modified Capabilities

- `production-token-bootstrap`: 輸出格式表新增 SwiftUI（Color/Font extension）與 Compose（theme object）兩列，並將 W3C DTCG JSON（docs/TOKENS.json）列為 token 來源優先序的一員。

## Impact

- Affected specs: 新增上列 8 個 capabilities；修改 production-token-bootstrap。
- Affected code:
  - New:
    - storybook-product-prototype/scripts/export_prototype_contracts.py
    - storybook-product-prototype/assets/prototype-template/fixtures/__FEATURE_CAMEL__Routes.json
    - frontend-product-implementation/scripts/validate_implementation.py
  - Modified:
    - frontend-product-implementation/SKILL.md
    - frontend-product-implementation/references/handoff-ingestion.md
    - frontend-product-implementation/references/implementation-workflow.md
    - frontend-product-implementation/references/verification-reporting.md
    - frontend-product-implementation/references/token-bootstrap.md
    - storybook-product-prototype/SKILL.md
    - storybook-product-prototype/references/production-handoff.md
    - storybook-product-prototype/references/data-contract.md
    - storybook-product-prototype/references/ui-flow-contract.md
    - storybook-product-prototype/references/storybook-integration.md
    - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
    - storybook-product-prototype/assets/prototype-template/docs/DATA_SPEC.md
    - storybook-product-prototype/assets/prototype-template/docs/ACCEPTANCE.md
    - storybook-product-prototype/assets/prototype-template/docs/FLOW_SPEC.md
    - storybook-product-prototype/assets/prototype-template/featurePrototypeFlow.ts.template
    - storybook-product-prototype/scripts/validate_prototype.py
    - storybook-product-prototype/scripts/scaffold_prototype.py
    - storybook-product-prototype/scripts/test_scaffold_validate.py
  - Removed: （無）
