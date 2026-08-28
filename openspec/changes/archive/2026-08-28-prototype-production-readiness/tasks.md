## 1. FPI 資料邊界與 SPP ownership 契約

- [x] 1.1 依 design「三段式資料串接 ownership 與轉交條款」改寫 frontend-product-implementation/SKILL.md 的總則、Implementation Rules 與 Completion Criteria：交付行為變為「產出 adapter interface + mock 後將真實串接連同契約轉交記名承接者」（spec: Real data wiring hand-over clause），完成後以 grep 確認「unless the user explicitly asks and the repo provides the pattern」語句不再出現於 frontend-product-implementation/，並人工審閱轉交條款與記名 owner 要求已出現在總則、規則與完工檢查三處。
- [x] 1.2 在 storybook-product-prototype/references/production-handoff.md 與 assets/prototype-template/docs/PRODUCTION_HANDOFF.md 落實三段式 Integration Ownership（prototype → frontend assembly → data integration）並新增 Data Integration Ownership 欄位（spec: Three-stage integration ownership），驗證方式：模板審閱確認三段敘述與欄位存在，且 validate_prototype.py 對缺此欄位的舊 handoff 僅回報 warning（手動以舊格式檔案驗證）。
- [x] 1.3 依 design「DataSource 契約命名規範」升級 frontend-product-implementation/references/implementation-workflow.md 的 API/Data Adapter Pattern：介面 <Feature>DataSource、mock 實作 Mock<Feature>DataSource、每 fixture group 一方法、state 語彙沿用 DATA_SPEC（spec: DataSource contract naming），並在 PRODUCTION_HANDOFF 模板的 API And Data Contracts 表新增 Adapter interface 欄；驗證方式：兩檔內容審閱，命名對照表與欄位齊備。
- [x] 1.4 依 design「Mock-Mode Flow Walkthrough 完工閘門」在 frontend-product-implementation/references/verification-reporting.md 新增流程級檢查與新的 done 定義（spec: Mock-mode flow walkthrough gate），並在 ACCEPTANCE 模板的 AC-P 段落放入對應的 (assembly) 條目；驗證方式：內容審閱確認 walkthrough 步驟、四項 done 條件與 AC-P (assembly) 條目互相對應。

## 2. Handoff 版本化與 ingestion 閘門

- [x] 2.1 依 design「HANDOFF_MANIFEST 結構與 drift 偵測」在 storybook-product-prototype/scripts/validate_prototype.py 實作 manifest 產出：--handoff-ready 全數通過時寫出 docs/HANDOFF_MANIFEST.json（manifestSchemaVersion、docs sha256、flow/fixtures 快照、scopeDigest、reviewStatus、changelog），支援 --changelog 參數且重跑時 version 遞增（spec: Handoff manifest generation）；驗證方式：對 scaffold 出的測試 prototype 連跑兩次 --handoff-ready，確認第一次 version 1、第二次 version 2 且 summary 取自 --changelog。
- [x] 2.2 在 validate_prototype.py 新增 --verify-manifest 模式：全部相符時 exit 0，任何 doc 內容變動或缺檔時列出檔名並以非零 exit code 結束（spec: Manifest drift verification）；驗證方式：產出 manifest 後修改 PRD.md 一行，重跑 --verify-manifest 確認列出 PRD.md 且 exit code 非 0。
- [x] 2.3 依 design「FPI ingestion 的 Review Status 閘門」修改 frontend-product-implementation/references/handoff-ingestion.md 與 SKILL.md First Actions：讀 PRODUCTION_HANDOFF.md 先檢查 Review Status，pending 或缺章節即停下詢問（spec: Ingestion review status gate），並要求把消費的 manifest docs hash 與 changelog version 記入實作地圖、無 manifest 時記 unversioned（spec: Manifest consumption record）；驗證方式：內容審閱確認閘門與消費記錄要求各自出現在抽取清單與 First Actions。

## 3. Acceptance ID 三層制度

- [x] 3.1 依 design「Acceptance ID 三層制度」改寫 assets/prototype-template/docs/ACCEPTANCE.md：全部 criteria 加 AC-S-/AC-H-/AC-P- 三位數 ID，新增 Production Integration Acceptance 章節且 AC-P 條目帶 (assembly)/(integration) 標記（spec: Three-tier acceptance identifiers）；驗證方式：scaffold 一個新 prototype 後審閱生成的 ACCEPTANCE.md 含三段 ID 與標記。
- [x] 3.2 在 validate_prototype.py 實作 ID 檢查：格式與唯一性為 error，--handoff-ready 下三段各至少一條且 AC-P 章節存在、legacy 無 ID 檔案降為 warning（spec: Acceptance identifier validation）；驗證方式：手動製造重複 AC-S-003 確認 error、以無 ID 舊檔確認僅 warning。
- [x] 3.3 在 frontend-product-implementation/references/verification-reporting.md 的 Final Response Contract 新增 Acceptance Traceability 表要求：每個 AC ID 一列、結果為 pass/deferred/not-applicable+理由、integration 標記條目 deferred 給記名 owner（spec: Acceptance traceability report）；驗證方式：內容審閱確認表格式與 deferred 規則。

## 4. 語言中立資料契約

- [x] 4.1 依 design「fixtures.json 與 JSON Schema 的作者責任制一致性」更新 assets/prototype-template/docs/DATA_SPEC.md（新增 Data Schemas (JSON Schema) 章節，spec: JSON Schema sections in DATA_SPEC）與 storybook-product-prototype/references/data-contract.md、SKILL.md 步驟 5（要求每個 fixture group 同步撰寫 fixtures/<group>.json，spec: Fixture JSON export）；驗證方式：模板與 reference 內容審閱，SKILL 工作流步驟明列 JSON 同步責任。
- [x] 4.2 在 validate_prototype.py 的 --handoff-ready 新增結構一致檢查：.ts export 與 fixtures/*.json 對應齊全、JSON 可解析、route id 存在於 flow 為 error，兩載體 route id 集合差異為 warning（spec: Structural fixture consistency validation）；驗證方式：手動刪除一個 json 檔確認 error、製造 route id 差集確認 warning。

## 5. Token 交換格式

- [x] 5.1 依 design「TOKENS.json 匯出來源與 DTCG 對應」新增 storybook-product-prototype/scripts/export_prototype_contracts.py：解析 --proto-* alias 區塊產出 docs/TOKENS.json（DTCG，$value 取 fallback、$extensions 記來源 token，spec: DTCG token export from the prototype alias block），$type 依值形態推斷且推斷失敗不中斷（spec: Token type inference），alias 區塊缺失時明確報錯 exit 非 0；驗證方式：對模板 CSS 跑出合法 TOKENS.json 並抽查 color/dimension/string 三型，對無 alias 的 CSS 確認非零 exit。
- [x] 5.2 更新 frontend-product-implementation/references/token-bootstrap.md：token 來源優先序加入 docs/TOKENS.json 為第一位（spec: Prototype token source discovery order），輸出格式表新增 SwiftUI 與 Compose 兩列（spec: Target styling technology adaptation）；驗證方式：內容審閱確認四級順序與六列格式表。

## 6. Flow 導航語意與元件對映

- [x] 6.1 依 design「Flow 導航語意欄位與向後相容」更新 assets/prototype-template/featurePrototypeFlow.ts.template（Route 加 params/deepLink、Transition 加 presentation/backBehavior，全 optional，spec: Navigation metadata fields on the flow contract）、references/ui-flow-contract.md 欄位語意，以及 assets/prototype-template/docs/FLOW_SPEC.md 的 Production Navigation Map 表格化（Route id / Web path / iOS destination / Android route，spec: Production navigation map table）；驗證方式：scaffold 後 validate_prototype.py 全綠，模板表格欄位齊備。
- [x] 6.2 在 validate_prototype.py 實作 app 目標的 presentation 覆蓋檢查：--handoff-ready 且 Target Surfaces 含 app 時，非 return transition 缺 presentation 為 warning、--strict-style 升 error、web-only 不觸發（spec: Presentation coverage check for app targets）；驗證方式：手動把 Target Surfaces 改為 native app 並移除 presentation，確認 warning 與 strict 模式 error，改回 web only 確認無 finding。
- [x] 6.3 依 design「元件對映 per-target 化」更新 references/storybook-integration.md（meta.components 新增 optional targets 欄與 null 語意，spec: Per-platform targets on component metadata）與 references/production-handoff.md、PRODUCTION_HANDOFF 模板（Scope 單欄與 Scope(web)/Scope(app) 雙欄皆合法，spec: Per-target scope columns on the frontend map），並讓 validate_prototype.py 的 scope 檢查同時接受兩種欄形；驗證方式：內容審閱 + 手動製作雙欄 map 確認驗證通過且欄值仍受 A/B/C/U 檢查。

## 7. FPI 機器稽核與整體回歸

- [x] 7.1 依 design「validate_implementation 與 IMPLEMENTATION_MAP 契約」在 frontend-product-implementation/references/verification-reporting.md 定義 IMPLEMENTATION_MAP.md 四章節契約（spec: Implementation map contract），並新增 frontend-product-implementation/scripts/validate_implementation.py 機檢 route 終態、evidence path、AC-P (assembly)、manifest hash（spec: Machine audit of the implementation map）；驗證方式：以手工樣例跑通 clean map exit 0、缺 route 終態/假 evidence path/hash 漂移三種失敗各 exit 非 0 且訊息點名主體。
- [x] 7.2 整合與回歸：更新 storybook-product-prototype/SKILL.md 工作流與 Quality Bar（manifest、fixtures json、TOKENS.json 匯出、新驗證項的觸發點）、更新 scripts/test_scaffold_validate.py 覆蓋新產物，並依 design「向後相容與警告分級原則」確認所有新檢查對舊 prototype 僅 warning；驗證方式：python3 storybook-product-prototype/scripts/test_scaffold_validate.py 兩框架全綠，並完成端到端手動流程（scaffold → 填內容 → --handoff-ready 產 manifest → 改 doc → --verify-manifest 偵測 drift）。
