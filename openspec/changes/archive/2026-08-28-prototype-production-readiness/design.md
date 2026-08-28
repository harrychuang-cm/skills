## Context

storybook-product-prototype（SPP）產出七份 handoff docs 與 typed flow/fixture 檔，frontend-product-implementation（FPI）消費它們做 production 前端實作。研究確認四個結構性缺口：(1) 真實資料串接的 ownership 真空——SPP 指給「receiving implementation」、FPI 留有條件式後門又無 reference 支撐；(2) handoff 無版本化，demo 確認後的續改不可偵測；(3) 驗收條款無 ID，criteria → 實作 → 驗證報告的鏈條在 FPI 端斷開；(4) token/flow/data 三種載體（CSS custom properties、TypeScript、自由文字 Markdown）使 SwiftUI/Kotlin 等原生目標無法機器消費。現有工具鏈：validate_prototype.py（1290 行、stdlib-only Python）、scaffold_prototype.py、test_scaffold_validate.py（React/Vue 雙框架 scaffold→validate 回歸測試）。

## Goals / Non-Goals

**Goals:**

- 把 FPI 的資料邊界從「預設不做」升級為「結構上不做」：轉交條款、三段式 ownership、具名 DataSource seam。
- 讓 handoff 可版本化、drift 可機器偵測（HANDOFF_MANIFEST.json + --verify-manifest）。
- 讓驗收三層（Storybook / handoff / production）以穩定 ID 貫穿並可機器稽核（validate_implementation.py）。
- 為 token、flow、data 三種載體補平台中立形式（DTCG TOKENS.json、導航語意欄位、JSON Schema + fixtures.json），作為原生平台支援的先決條件。
- 全部向後相容：既有 prototype 不因升級而由綠轉紅。

**Non-Goals:**

- 不建立 native-product-implementation 與 production-data-integration 新 skills（Phase 3，另開 change）。
- 不做 flow.ts → Swift/Kotlin codegen、不做 Vue 版 Prototype Inspector。
- 不改變 SPP 的 React/Vue scaffold 框架選擇邏輯（storybook-prototype-vue-support 範圍）。
- 不引入任何第三方 Python/Node 依賴；腳本維持 stdlib-only。
- 不重寫既有 handoff 文件的其他章節結構。

## Decisions

### 三段式資料串接 ownership 與轉交條款

FPI SKILL.md 移除「unless the user explicitly asks and the repo provides the pattern」後門，改為轉交條款：使用者要求真實串接時，FPI 產出 adapter interface + mock 後，把替換工作連同契約轉交記名承接者，不自行 wiring。SPP 的 Integration Ownership 由二段升三段：prototype（SPP）→ frontend assembly（FPI）→ data integration（記名 owner）；PRODUCTION_HANDOFF 模板新增「Data Integration Ownership」欄位要求填入承接者（團隊名、系統名、或 open decision + owner）。理由：後門沒有任何 reference 支撐、與使用者的邊界願景相違；替代方案「保留後門但補 reference」被否決，因為它會把 FPI 的職責擴到本 skill 生態刻意排除的範圍。

### DataSource 契約命名規範

implementation-workflow.md 的 API/Data Adapter Pattern 升級為具名契約：介面名 `<Feature>DataSource`（web 為 TS interface；原生對應 protocol/interface 於未來 skill 沿用同名），mock 實作名 `Mock<Feature>DataSource`，每個 fixture group 對應一個方法，狀態枚舉沿用 DATA_SPEC 的 state 語彙（default/loading/empty/error）。PRODUCTION_HANDOFF 的 API And Data Contracts 表新增「Adapter interface」欄，記錄介面與 mock 實作的檔案路徑。理由：可預期的 seam 讓下一棒不需逆向工程；替代方案「各專案自行命名」即現況，已證實產生不可預期的替換點。

### HANDOFF_MANIFEST 結構與 drift 偵測

validate_prototype.py 於 --handoff-ready 全部通過時產出 `docs/HANDOFF_MANIFEST.json`，欄位：manifestSchemaVersion（整數，起始 1）、feature、generatedAt（ISO 日期）、reviewStatus{status, confirmedOn}、docs（每份 doc 檔名 → sha256）、flow{routeIds, flowNodeIds, transitionCount}、fixtures{exports}、scopeDigest（Prototype To Frontend Map 章節文字的 sha256）、changelog（陣列：{version, date, summary}）。重新產出時 version 遞增、summary 取自新參數 --changelog（未提供時記 "regenerated"）。新增 --verify-manifest 模式：比對現行 docs 與 manifest，輸出漂移的檔名清單，有漂移時以非零 exit code 結束。FPI handoff-ingestion 要求把消費的 manifest hash（docs 區塊整體的 sha256）記入實作地圖。理由：hash 快照是最小可行的 drift 偵測，不需 git 依賴；替代方案「靠 git log」被否決，因 handoff docs 可能被複製到 production repo 之外的位置消費。

### FPI ingestion 的 Review Status 閘門

handoff-ingestion.md 的抽取清單與 FPI SKILL.md First Actions 新增：讀 PRODUCTION_HANDOFF.md 時先檢查 Review Status；status 為 pending 或章節缺失時停下詢問使用者是否確已通過團隊 demo 確認，未獲確認不得作為實作 brief。與 SPP 端 --handoff-ready 形成雙端防護。理由：現況為單點防護，繞過 validator 直接餵 docs 即失效。

### Acceptance ID 三層制度

ACCEPTANCE.md 模板每條 criteria 加穩定 ID：AC-S-NNN（Storybook 驗收）、AC-H-NNN（handoff 驗收）、AC-P-NNN（production 驗收，新增章節承載目前懸空的第三層）。AC-P 條目附 owner 標記 `(assembly)`（FPI mock 模式內可驗）或 `(integration)`（資料串接後才可驗）。validate_prototype.py 檢查：ID 格式合法、全檔唯一；--handoff-ready 時三段皆至少一條、AC-P 章節存在（舊 handoff 缺章節僅 warning）。FPI verification-reporting.md 的 Final Response Contract 新增 Acceptance Traceability 表：每列 AC ID → 實作檔案/測試/story → 結果（pass / deferred / not-applicable + 理由）。理由：複製 Scope 欄「SPP 寫入+機檢、FPI verbatim 消費+終態記錄」的既有成功模式。

### Mock-Mode Flow Walkthrough 完工閘門

verification-reporting.md 於 UI Verification 之後新增流程級檢查：以 mock adapter 在 production shell 走通 FLOW_SPEC 的 primary journey 與全部 in-scope 分支（loading/empty/error/permission），每個 transition trigger 可互動觸發；completion bar 改寫為明確 done 定義：mock 模式全流程可走通 + 每個 fixture group 有 typed interface、mock 實作與替換點記錄 + 零真實 endpoint/auth/環境變數引入 + 每項 real integration 有記名 owner。ACCEPTANCE.md 模板的 AC-P (assembly) 條目即對應此閘門。理由：現有 UI Verification 只驗單 route 狀態渲染，缺流程級驗收。

### fixtures.json 與 JSON Schema 的作者責任制一致性

DATA_SPEC.md 模板新增「Data Schemas (JSON Schema)」章節：每個 fixture group 一個 fenced json 區塊。fixtures 以 `fixtures/<group>.json` 形式與 .ts 並存，由 skill 作者（AI）於建立 fixtures 時同步撰寫，不做 TS → JSON 自動轉譯（stdlib 解析任意 TS 不可靠）。validate_prototype.py 的 --handoff-ready 新增結構性一致檢查：.ts 的 fixture export 名與 fixtures/*.json 的 group 對應齊全、JSON 可解析、JSON 內引用的 route id 存在於 flow 檔；深度值相等不檢查（warning 級提示 route id 集合差異）。理由：作者責任制 + 結構機檢是 stdlib-only 條件下可靠性最高的組合；替代方案「Python 解析 TS literal」被否決（維護成本高、邊界情況多），「Node 執行 .ts」被否決（需 loader 依賴）。

### TOKENS.json 匯出來源與 DTCG 對應

新增 storybook-product-prototype/scripts/export_prototype_contracts.py：解析 prototype CSS 的 `--proto-*` alias 區塊（格式固定：`--proto-<role>: var(--<prefix>-<token>, <fallback>);`），產出 `docs/TOKENS.json`（W3C DTCG 格式）：每個 role 一個 token，$value 取 fallback 值，$type 依值形態推斷（hex/rgb/hsl → color；px/rem/em → dimension；數字 → number；其餘 → string 並於 $description 註明），$extensions 記來源 token 名與 prefix。同腳本並對 fixtures/*.json 做格式正規化（排序鍵、縮排）。理由：alias 區塊是 visual-quality.md 已強制的固定格式，regex 解析可靠；替代方案「解析 UI_SPEC Token Binding 的 Markdown」被否決（自由文字、不穩定）。

### Flow 導航語意欄位與向後相容

featurePrototypeFlow.ts.template 的 Route 型別加 `params?: { name: string; type: string }[]` 與 `deepLink?: string`；Transition 加 `presentation?: 'push' | 'modal' | 'sheet' | 'fullscreen' | 'replace'` 與 `backBehavior?: 'pop' | 'popToRoot' | 'dismiss' | 'none'`。全部 optional，既有 prototype 不需改動。ui-flow-contract.md 同步文件化欄位語意；FLOW_SPEC.md 模板的 Production Navigation Map 由 prose 升級為表格（Route id / Web path / iOS destination / Android route）。validate_prototype.py：--handoff-ready 且 Target Surfaces 含 app 時，非 return 類 transition 缺 presentation → warning，--strict-style 升級為 error。理由：optional 欄位 + 分級檢查讓升級不破壞既有 prototype；web 端（modal vs page）同樣受益。

### 元件對映 per-target 化

storybook-integration.md 的 meta.components entry 新增 optional `targets` 欄：`{ web?: string; ios?: string | null; android?: string | null }`（null 表「需新建」）。production-handoff.md 與模板的 Prototype To Frontend Map：單一目標維持 Scope 單欄；多平台交付時使用 Scope(web) / Scope(app) 欄。validate_prototype.py 的 scope 檢查同時接受兩種欄形。理由：契約已規定 consumer 容忍未知欄位，可平滑演進；替代方案「一律 per-target」被否決（單目標交付佔多數，強制雙欄徒增噪音）。

### validate_implementation 與 IMPLEMENTATION_MAP 契約

新增 frontend-product-implementation/scripts/validate_implementation.py（stdlib-only）：輸入 handoff docs 目錄與 FPI 產出的 IMPLEMENTATION_MAP.md。verification-reporting.md 規定 FPI 必須輸出 IMPLEMENTATION_MAP.md，固定章節：Consumed Manifest（記 hash）、Route Outcomes（route id → implemented / existing-verified + evidence path / deferred）、Acceptance Traceability（AC ID → 對象 → 結果）、Data Adapter Seams（fixture group → interface 名 + mock 路徑）。腳本機檢：manifest 每個 route id 有終態、existing-verified 的 evidence path 存在於 production repo、每個 AC-P (assembly) ID 出現且非 deferred、消費 hash 與現行 manifest 一致（不一致列出漂移 doc 並以非零 exit code 結束）。理由：把 FPI 的 prose 自律升為可重跑稽核，選 Markdown 章節而非 JSON 作為報告載體，因為它同時是給人讀的交接文件。

### 向後相容與警告分級原則

所有新增檢查遵循既有 validator 的分級慣例：新欄位/新章節缺失在一般模式為 warning，--strict-style 或 --handoff-ready 視項目性質升級為 error；僅「新產物自身格式錯誤」（如 fixtures/*.json 無法解析、AC ID 重複）直接 error。HANDOFF_MANIFEST 僅由 --handoff-ready 產出，舊 prototype 不受影響。test_scaffold_validate.py 維持綠燈是本變更的硬性驗收。

## Implementation Contract

**可觀察行為：**

- 對一個 scaffold 出來的新 prototype 執行完整流程後：`docs/` 內存在 ACCEPTANCE.md（含 AC-S/AC-H/AC-P 三段 ID）、DATA_SPEC.md（含 JSON Schema 章節）、FLOW_SPEC.md（含導航對映表）、PRODUCTION_HANDOFF.md（含三段式 ownership、Data Integration Ownership、Adapter interface 欄）；`fixtures/` 內存在與 .ts export 對應的 *.json。
- `python3 scripts/validate_prototype.py <folder> --handoff-ready --changelog "<summary>"` 於全部通過時寫出 `docs/HANDOFF_MANIFEST.json`（結構如 Decisions 所述），重跑時 changelog version 遞增。
- `python3 scripts/validate_prototype.py <folder> --verify-manifest`：docs 與 manifest 一致時 exit 0 且輸出無漂移訊息；任一 doc 內容變動後 exit 非 0 且列出漂移檔名。
- `python3 scripts/export_prototype_contracts.py <folder>` 產出 `docs/TOKENS.json`；對模板 CSS 的 alias 區塊可無錯解析；alias 區塊缺失時輸出明確錯誤訊息並 exit 非 0。
- `python3 frontend-product-implementation/scripts/validate_implementation.py --handoff <docs-dir> --map <IMPLEMENTATION_MAP.md> --repo <production-root>`：對符合契約的 map 檔 exit 0；缺 route 終態、evidence path 不存在、AC-P (assembly) 缺席、或 hash 漂移時 exit 非 0 並逐項列出。
- 兩個 skills 的 SKILL.md 與 references 不再含「使用者明確要求即可接真實 API」語意；FPI 文件描述轉交條款與 Review Status 閘門。

**介面 / 資料形狀：** HANDOFF_MANIFEST.json、TOKENS.json（DTCG）、fixtures/<group>.json、IMPLEMENTATION_MAP.md 四種產物的欄位如 Decisions 各節所述；flow 契約新增之 optional 欄位名稱與 union 值固定為 Decisions 所列字串。

**失敗模式：** 所有腳本以非零 exit code + 人類可讀清單表達失敗；warning 不影響 exit code（沿用既有慣例）；--strict-style 將指定 warning 升級為 error。

**驗收方式：**

- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過（React 與 Vue 兩輪 scaffold→validate 均綠）。
- 手動流程驗收：scaffold 一個測試 prototype → 填最小內容 → --handoff-ready 產出 manifest → 改一份 doc → --verify-manifest 偵測到漂移。
- 文件驗收：grep 兩個 skills 目錄，確認後門語句已移除、新章節與欄位在 references 與模板中對應出現。

**範圍邊界：** in scope = 上列 19 個檔案（17 修改 + 2 新增）與其行為；out of scope = 新 skills、codegen、Inspector、scaffold 框架邏輯、既有 handoff 文件其他章節的重寫。

## Risks / Trade-offs

- [fixtures.json 與 .ts 可能值漂移（作者責任制不做深度比對）] → 結構機檢（export 名、route id 集合）+ warning 提示差異；深度一致性留給未來 codegen 階段。
- [validate_prototype.py 已 1290 行，再加檢查恐難維護] → 新檢查各自獨立函式、集中於 handoff-ready 區段，並由 test_scaffold_validate.py 回歸保護。
- [舊 prototype 在 --handoff-ready 下可能新增 warning 噪音] → 全部新章節缺失類檢查對舊檔為 warning 級，僅新產物自身格式錯誤為 error。
- [IMPLEMENTATION_MAP.md 是新契約，FPI 端 AI 可能漏產] → SKILL.md Completion Criteria 明列，validate_implementation.py 對缺章節給出可讀錯誤，形成雙保險。
- [DTCG $type 推斷可能誤判非常規值] → 推斷失敗時降級為 string 並在 $description 註明 raw，不阻斷匯出。
