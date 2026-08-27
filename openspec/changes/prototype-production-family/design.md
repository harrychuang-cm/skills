## Context

prototype-production-readiness 已交付：三段式 ownership、HANDOFF_MANIFEST 版本化、AC-S/AC-H/AC-P 三層驗收、DTCG TOKENS.json、flow 導航語意欄位（presentation/backBehavior/params/deepLink）、fixtures 雙載體（.ts + fixtures/*.json + JSON Schema）、validate_implementation.py。現在 handoff 的內容與載體皆平台中立，但執行端家族尚缺：native 目標無實作 skill、真實串接無承載 skill、導航語意無 codegen、六站流程無共用定義。既有慣例：skill 以資料夾自包含（SKILL.md + references/ + agents/openai.yaml），跨 skill 以名稱互相指名（如 production-handoff.md 指名 frontend-product-implementation）；scripts 為 stdlib-only Python；本機無法假設 swiftc/kotlinc 可用。

## Goals / Non-Goals

**Goals:**

- 建立 native-product-implementation skill：同一份 handoff，SwiftUI/Compose 目標可被機械地承接。
- 建立 production-data-integration skill：mock→real 的替換有記名承載者與可驗證的完工定義。
- flow codegen：flow.ts 的導航語意可生成 Swift/Kotlin 導航骨架，消除人工翻譯。
- 六站 pipeline 成為共用 reference 並可用 agent-automation-orchestrate 編排重跑。
- FPI 視覺 QA 覆蓋全部 Scope B 畫面；API 契約補足串接期必問的語意欄位。

**Non-Goals:**

- 不改 frontend-product-implementation 的 web 專職範圍（不泛化 FPI）。
- 不做 Vue 版 Prototype Inspector（review 體驗優化，不擋交付）。
- 不生成完整可編譯的原生 app（codegen 產出是骨架檔，不是專案）；不在本機執行 xcodebuild/gradle 驗證 codegen 產物。
- 不改 agent-automation-orchestrate 與 design-system-governance 兩個 skill 本體。
- 不新增 validator 的 error 級檢查（本變更全部是新增檔案與指引欄位）。

## Decisions

### FPI 不泛化：native 姊妹 skill 的繼承分層

native-product-implementation 是 frontend-product-implementation 的姊妹 skill，繼承方法骨架、替換平台層。繼承（沿用同名概念與同格式產物）：handoff 讀取順序與 Review Status 閘門、Scope A/B/C/U verbatim 消費、Consumed Manifest 記錄、Approved Component Porting 的「從 prototype 原始檔推導、禁翻譯慣用法、記錄名稱映射」原則、mock-mode flow walkthrough done 定義、IMPLEMENTATION_MAP.md 四章節契約。替換（native 自己的 references）：架構決策紀錄（native-architecture.md）、repo discovery 與實作流程（implementation-workflow.md）、驗證鏈（verification-reporting.md）。理由：泛化 FPI 會稀釋其 web framework peers 原則與 JS 偵測精確性；姊妹 skill 讓兩邊各自精確。替代方案「單一 skill 加 native 分支」被否決——runtime-architecture 的每個欄位、每條驗證指令都要雙路徑，文件可讀性崩壞。

### 共用 ingestion 契約與 native deltas

native skill 的 references/handoff-ingestion.md 不複製 FPI 全文，而是「委任 + delta」：明文宣告 handoff 讀取順序、Review Status 閘門、Consumed Manifest、Scope verbatim 規則與 frontend-product-implementation 的同名 reference 完全一致（以 skill 名指名），檔內只寫 native 特有 delta——route 對映以 FLOW_SPEC 的 Production Navigation Map 表格 iOS/Android 欄為準、transition 消費 presentation/backBehavior、token 來源是 docs/TOKENS.json、fixtures 來源是 fixtures/*.json 與 DATA_SPEC 的 JSON Schema。理由：全文複製必然漂移；跨 skill 指名是 repo 既有慣例。

### native 架構決策紀錄

native-architecture.md 定義與 FPI runtime-architecture 同精神的決策紀錄，欄位換為 native 語彙：Target root（Xcode project/workspace、SPM package、Gradle module）、Platform（iOS、Android、multiplatform，各附最低 OS/SDK 版本政策）、UI framework（SwiftUI、UIKit 混用邊界；Compose、Views 混用邊界）、Navigation（NavigationStack/UIKit navigation controller；Compose Navigation/Fragment）、Language（Swift/Kotlin 版本政策）、Dependency 管理（SPM/CocoaPods；Gradle version catalog）、State/DI 模式、Tests（XCTest/swift-testing；JUnit/Compose UI test）、Decision source 與 Confidence。沿用 FPI 的 evidence priority、ask-vs-infer、migration approval gate 三節結構與語意。

### 原生 DataSource 與導航語意對映

implementation-workflow.md 落實兩張對映：(1) DataSource——`<Feature>DataSource` 於 Swift 為 protocol、Kotlin 為 interface，`Mock<Feature>DataSource` 讀取隨附的 fixtures/*.json（iOS：bundle resource；Android：assets 或 test resources），型別由 DATA_SPEC JSON Schema 生成（Codable / kotlinx.serialization），方法對應 fixture group，state 語彙沿用 default/loading/empty/error。(2) 導航——presentation→push=NavigationStack push/NavHost navigate、modal=fullscreen modal/dialog、sheet=.sheet/bottom sheet、fullscreen=.fullScreenCover/fullscreen dialog、replace=root swap/popUpTo inclusive；backBehavior→pop=環境 dismiss 單層/popBackStack、popToRoot=path 清空/popUpTo(start)、dismiss=關閉 overlay、none=不提供使用者返回。缺 presentation 的 transition（舊 handoff）以 push 為預設並記入 divergence。

### 原生驗證鏈與共用稽核

native verification-reporting.md 的驗證順序：iOS＝xcodebuild build → xcodebuild test（或 swift test）→ swiftlint（存在時）→ simulator 冒煙；Android＝gradlew assembleDebug → gradlew test → gradlew lint → detekt（存在時）→ emulator 冒煙；指令不可用時明講並列出最接近的替代。IMPLEMENTATION_MAP.md 契約與稽核腳本直接沿用：以 skill 名指名執行 frontend-product-implementation 的 scripts/validate_implementation.py（該腳本只讀 handoff 與 map、以 --repo 解析 evidence path，對 native repo 同樣有效，不複製第二份）。

### 第三棒邊界與輸入契約

production-data-integration 的輸入固定四件：PRODUCTION_HANDOFF.md 的 API And Data Contracts（含 Adapter interface 欄與 Semantics 欄）、IMPLEMENTATION_MAP.md 的 Data Adapter Seams 表、fixtures/*.json、DATA_SPEC 的 JSON Schema。邊界：實作 real client/auth/session/cache/storage/persistence/環境設定並替換 mock 注入點；不改 UI 行為、route flow、元件與 token——發現契約與現實不符時，回報並依 change rule 回寫 handoff docs 與 regression story，而不是就地改 UI。endpoint 或 auth 未知時停下問記名 owner，不發明。完工定義：每個 seam 有 real 實作與注入替換、contract tests 通過、AC-P (integration) 條目全 settle、IMPLEMENTATION_MAP 的 seams 表補上 real 實作路徑、mock 保留供測試。

### contract testing 策略

contract-testing.md 規定：每個 fixture group 一組 contract test——real response 以 DATA_SPEC 的 JSON Schema 驗證（web：ajv 或等價；iOS：Codable decode 即驗證；Android：kotlinx.serialization decode 即驗證）；error taxonomy 逐類觸發或模擬並斷言 UI 錯誤態對映；freshness/pagination 依 Semantics 欄記錄的語意各寫至少一條行為斷言；fixtures/*.json 作為 shape 的 golden reference（欄位集合與型別比對，不比對值）。測試工具沿用目標 repo 既有測試框架，不引入新框架。

### flow.json 結構與生成規則

export_flow.py 放在 storybook-product-prototype/scripts/，import 同目錄 validate_prototype 的既有解析函式（scan_matching_bracket/split_top_level_objects/extract_string_property 等），不重寫解析。輸出 docs/flow.json：{ flowSchemaVersion: 1, feature, routes: [{id, title, navigationId, component?, description?, params?, deepLink?}], nodes: [{id, title, shape, tone?, description?}], transitions: [{from, to, trigger, label, kind?, presentation?, backBehavior?}] }——一律剔除 flowPosition、sourceAnchor、flowLine 三個布局欄位。params 陣列以物件掃描解析 {name, type}。CLI：位置參數為 prototype 資料夾；預設寫 docs/flow.json；--swift <path> 生成 Swift 檔（enum <Feature>Route: Hashable，kebab id 轉 camelCase case，params 轉 associated values，型別對映 string→String、number→Double、boolean→Bool、其餘→String；附 deepLink 對照註解與依 presentation 分組的 NavigationStack/sheet/fullScreenCover 骨架註解）；--kotlin <path> 生成 Kotlin 檔（sealed class <Feature>Route，object/data class 對應無參/有參 route，route pattern 字串附 deepLink，NavHost 骨架註解）。找不到 *PrototypeFlow.ts 或無 route 時明確報錯 exit 非 0。生成檔開頭註明 generated-by 與再生成指令。驗證：不假設本機有 swiftc/kotlinc——test_scaffold_validate.py 以結構斷言把關（flow.json 無布局欄位、Swift 檔含 enum 與 case、Kotlin 檔含 sealed class）。

### 六站 pipeline 與 orchestrate 編排

新增 storybook-product-prototype/references/pipeline-stations.md（放在源頭 skill，因站 1 由它啟動）：定義六站表——站 1 SPP 產出（把關 validate_prototype + typecheck + storybook build）、站 2 團隊 demo 確認（人類 gate，Review Status → confirmed）、站 3 handoff 定版（--handoff-ready + HANDOFF_MANIFEST）、站 4 前端組裝 mock 模式（web＝frontend-product-implementation；native＝native-product-implementation；把關 governance gates + validate_implementation + mock walkthrough）、站 5 資料串接（production-data-integration；把關 contract tests + AC-P integration）、站 6 視覺/驗收 QA（ui-pixel-align-report 證據 → ui-compare-to-reference 修復 → AC traceability 全 pass）；平台分岔明訂在站 3 之後（文件不分家、執行 skill 分家）。附一段可直接改用的 agent-automation-orchestrate .agent-automation/config.json 範例：站 1/3 為可自動 task、站 2 為 designer decision 停點、站 4-6 各為獨立 task 並以站 3 的 manifest 為 handoff 條件。四個 skill 的 SKILL.md 各加一行指向此 reference。

### 視覺 QA 範圍與第三棒指名

FPI verification-reporting.md 的 prototype parity 比對範圍從「newly created components」擴大為「全部 Scope B 畫面」：每個 map 標 B 的 route/region 在 mock 模式下與 prototype Storybook 對應 route 做並排比對，ui-pixel-align-report 產證據、ui-compare-to-reference 修復；Scope A 畫面明文排除（不得拿 prototype 逼真度去「修」已上線畫面）。FPI SKILL.md 轉交條款與 SPP production-handoff.md 的 Data Integration Ownership 說明各補一句：stage-3 承接者可以是團隊、系統、或 production-data-integration skill。

### API 契約語意欄位落點

data-contract.md 的 API Replacement Points 欄位清單與 references/production-handoff.md 的 API And Data Contracts 清單各補五個語意：pagination（cursor/offset/none）、sort/filter、freshness（static/poll/push）、mutation semantics（create/update/delete、冪等性、optimistic 允許與否）、error taxonomy（可重試/不可重試/需重新授權）。PRODUCTION_HANDOFF 模板表新增單一「Semantics」欄集中承載五語意（避免表格欄位爆炸），格式為分號分隔的 key: value 簡記。不加 validator 檢查——欄位屬串接期指引，缺席時由 production-data-integration 的工作流負責補問。

## Implementation Contract

**可觀察行為：**

- 兩個新 skill 資料夾各自完整：native-product-implementation（SKILL.md、agents/openai.yaml、references/ 四份）、production-data-integration（SKILL.md、agents/openai.yaml、references/ 兩份）；SKILL.md frontmatter 具 name 與 description，Reference Loading 清單與檔案一一對應，且都指向 pipeline-stations reference 與既有契約（Scope verbatim、Review Status 閘門、IMPLEMENTATION_MAP、AC-P 標記）。
- 對 scaffold 出的 prototype 執行 python3 storybook-product-prototype/scripts/export_flow.py <folder>：寫出 docs/flow.json 且不含 flowPosition/sourceAnchor/flowLine 鍵；加 --swift out.swift 產出含 enum 與每個 route case 的 Swift 檔；加 --kotlin out.kt 產出含 sealed class 的 Kotlin 檔；資料夾無 *PrototypeFlow.ts 時印出明確錯誤並 exit 非 0。
- storybook-product-prototype/references/pipeline-stations.md 存在，含六站表、分岔說明與 orchestrate config 範例；四個 skill 的 SKILL.md 都含指向它的一行。
- FPI verification-reporting.md 的 parity 段明文覆蓋全部 Scope B 畫面並排除 Scope A。
- data-contract.md、production-handoff.md 與 PRODUCTION_HANDOFF 模板含五個語意欄位（模板為 Semantics 欄）。
- python3 storybook-product-prototype/scripts/test_scaffold_validate.py 全綠，且新增 export_flow 的結構斷言。

**介面 / 資料形狀：** flow.json 的鍵集合與 flowSchemaVersion 如 Decisions 所述；Swift/Kotlin 生成檔的命名規則（<Feature>Route enum / sealed class、camelCase case）固定；新 skill 的 IMPLEMENTATION_MAP 章節名與 FPI 完全一致。

**失敗模式：** export_flow.py 以非零 exit code + 具名錯誤訊息表達（缺 flow 檔、無 route、輸出路徑不可寫）；新 skills 純文件、無執行失敗面。

**驗收方式：** test_scaffold_validate.py（含新增斷言）通過；export_flow.py 對 scaffold prototype 的三種輸出人工抽查；grep 確認四個 SKILL.md 指向 pipeline-stations 與 Scope B 措辭；文件內容審閱。

**範圍邊界：** in scope＝Impact 列出的 12 個新檔與 7 個修改檔；out of scope＝FPI 泛化、Vue Inspector、orchestrate/governance skill 本體、可編譯原生專案生成、任何 validator error 級新檢查。

## Risks / Trade-offs

- [codegen 產物無法在本機編譯驗證] → 生成檔保持極小表面（enum/sealed class + 註解骨架），smoke test 做結構斷言；首次真實使用時由 native skill 的驗證鏈（xcodebuild/gradle）接手把關。
- [native skill 文件以名稱指名 FPI 的 reference 與腳本，安裝環境可能只裝其一] → 委任段落明文寫出被繼承規則的完整語意（閘門行為本身可獨立執行），僅腳本執行需要姊妹 skill 在場，缺席時降級為人工檢查並記入報告。
- [兩個新 skill 是純文件，行為靠 AI 自律] → 沿用既有把關面：IMPLEMENTATION_MAP + validate_implementation.py（站 4）與 contract tests + AC-P (integration)（站 5）是機器可驗的落點。
- [Semantics 單欄自由文字可能被亂填] → 欄位給定 key: value 簡記格式與枚舉值；由 production-data-integration 工作流在串接前逐項確認，缺席即補問。
- [orchestrate config 範例可能與使用者專案結構不合] → 範例明標為模板、每站指令留佔位，並指向 agent-automation-orchestrate 的 config 契約為準。
