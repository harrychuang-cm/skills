# CM Skills 使用指南

這份文件用比較簡單的方式說明每個 skill 的用途、什麼時候用、怎麼搭配使用。

這些 skills 不是只給 Codex 使用。它們的核心是一個 skill 資料夾和裡面的 `SKILL.md` 指令，也可以被 Cursor、Claude Code、Codex，或其他能讀取專案文件的 AI coding agent 使用。

## 在不同 AI coding agent 中怎麼使用

最穩定的使用方式是：告訴 AI 你要使用哪個 skill，並提供 repo、設計稿、handoff docs 或 reference screenshot 的路徑。

如果你的工具已經支援 skills，可以直接用 skill 名稱：

```text
Use $frontend-product-implementation to implement <feature> from <handoff docs path> into <product repo path>. Follow $ds-governance.
```

如果你的工具不會自動辨識 `$skill-name`，就明確要求它先讀對應的 `SKILL.md`：

```text
Read <cm-skills path>/frontend-product-implementation/SKILL.md and follow that workflow to implement <feature> into <product repo path>. Also follow <cm-skills path>/ds-governance/SKILL.md.
```

`ds-governance` 由本 repo 的 `ds-governance/SKILL.md` 維護，可直接讀取，也能透過共用安裝器安裝到三個 agent。

通用使用原則：

- Cursor、Claude Code、Codex 都可以使用同一份 skill 文件。
- skill 的名字只是快捷入口，真正的規格以各資料夾中的 `SKILL.md` 為準。
- 請求中要提供明確路徑，例如 target repo、design-system docs、Storybook、reference images、prototype docs。
- 如果是 UI 實作，請同時要求遵循 `$ds-governance`。
- 如果 AI 找不到 token、元件或資料 contract，應該先停下來確認，而不是直接硬寫。

## 快速選擇

| 你想做的事 | 使用 skill | 簡單說明 |
|---|---|---|
| 從截圖、Figma、既有產品整理出設計系統 | `$design-system-extractor` | 先把設計語言、tokens、元件盤點整理成文件。 |
| 把設計系統文件做成 Storybook 元件庫 | `$design-system-to-storybook` | 把 tokens、components、stories 落地到產品 repo。 |
| 從一張畫面拆成可重用 Storybook 元件 | `$ui-screenshot-to-storybook-product` | 適合只有截圖或單一畫面時，先做元件化再組畫面。 |
| 建立產品流程 prototype 和前端 handoff 文件 | `$storybook-product-prototype` | 產出 PRD、Flow、UI Spec、Data Spec、Frontend Handoff 和 clickable prototype。 |
| 根據 handoff 文件實作前端產品功能（web） | `$frontend-product-implementation` | 把 handoff docs 變成產品 repo 裡的 routes、screens、states、fixtures、mock adapters。 |
| 用同一份 handoff 文件做 iOS / Android 版 | `$native-product-implementation` | `$frontend-product-implementation` 的姊妹 skill：一樣的文件與把關，執行層換成 SwiftUI 與 Jetpack Compose。（機制完備，尚未對真實原生專案實戰過） |
| 把 mock 資料換成真的 API、auth、cache | `$production-data-integration` | prototype → production 的第三棒：接上真實資料並用 contract test 證明，不動 UI。 |
| 確保 UI 開發遵循設計系統規則 | `$ds-governance` | 搭配實作類 skill 使用，先檢查 tokens、元件庫、i18n，缺 token/元件要先問。（本 repo 維護；已授權的同範圍變更不重問） |
| 把畫面修成跟參考來源一致 | `$ui-compare-to-reference` | 參考來源可以是 Figma、設計圖，或另一個平台的原始碼（網頁 ↔ App 互為標準）。修在 token 或共用元件上，不是修在單一畫面。 |
| 產出設計落差稽核報告 | `$ui-pixel-align-report` | 兩邊都抽成同一份規格再比對，產出截圖證據、嚴重度、歸屬層級的離線 HTML 報告與 `findings.json`。 |
| 一個平台做完了，把功能交接給另一個平台並對齊 | `$platform-parity-handoff` | 先端合入整合分支後，從合併 diff 與原始碼產出九章交接包；次端實作前定位、實作後逐項對齊，只讀不改。 |
| 判斷 Figma 端修改要不要同步回 Storybook | `$figma-sync-back` | 三方比對分辨 Figma 改了／程式碼改了／兩邊都改，產出分流報告；只判斷、不動程式碼。 |
| 把重複性流程變成自動化 | `$agent-automation-orchestrate` | 自動化的起始點：建立專案契約，之後用它執行、續跑、查狀態。 |
| 在 Storybook 專案安裝通用工具頁（覆蓋率、元件時間軸） | `$storybook-tools-install` | 帶入「UI 圖片/PRD → 覆蓋率報告 → 審查 → 實作」工具、Component Timeline 頁面和配套 skills。 |
| 在其他專案安裝 Figma 清理自動化 | `$design-automation-hub-install` | 安裝 Figma plugin、本機 coordinator 和 figma-cleanup task。 |

## 每個 Skill 怎麼用

### `$design-system-extractor`

用途：從設計來源萃取出可重用的設計系統。

適合情境：

- 你有 Figma、截圖、品牌參考、既有 app 或 prototype。
- 還沒有清楚的 design tokens 或 component inventory。
- 想先建立設計系統文件，再進入實作。

會產出：

- design principles
- design elements
- token architecture
- component inventory
- component specs
- review HTML

範例：

```text
Use $design-system-extractor to extract a reusable design system from ./references/screenshots and ./figma-export.
```

### `$design-system-to-storybook`

用途：把已整理好的設計系統文件落地成 Storybook 元件庫。

適合情境：

- 已經有 `design-system/` 和 `tokens/`。
- 想建立 Storybook foundations、shared components、stories。
- 想讓元件可被之後的產品畫面重用。

會做的事：

- 讀 design-system docs 和 tokens。
- 建立或更新 Storybook。
- 建立 token-backed components。
- 補 stories 和驗證。
- 可搭配 Figma export/import workflow。

範例：

```text
Use $design-system-to-storybook with design system at ./design-system and product repo at ./apps/web.
```

### `$ui-screenshot-to-storybook-product`

用途：從單張 UI 圖片或 Figma export 開始，拆出元件，再組產品畫面。

適合情境：

- 你只有一張 screenshot 或 mockup。
- 想避免直接做一次性 page CSS。
- 想先把畫面拆成共用元件。

搭配方式：

- 如果畫面背後還沒有設計系統，先用 `$design-system-extractor`。
- 如果已有設計系統和 Storybook，可直接用這個 skill 做 screen-to-components。

範例：

```text
Use $ui-screenshot-to-storybook-product on reference/dashboard.png and implement it through reusable Storybook components.
```

### `$storybook-product-prototype`

用途：把產品想法變成可點擊的 Storybook prototype 和前端 handoff 文件。

適合情境：

- 還在討論產品流程。
- 想先確認 route、state、data contract、acceptance。
- 想把設計/產品想法交給工程師、Cursor、Claude Code、Codex 或其他 AI coding agent 繼續開發。

會產出：

- `PRD.md`
- `FLOW_SPEC.md`
- `UI_SPEC.md`
- `DATA_SPEC.md`
- `PRODUCTION_HANDOFF.md`
- `ACCEPTANCE.md`
- `IMPLEMENTATION_GUIDE.md`
- typed route metadata
- deterministic fixtures（`.ts` 之外同時寫 `fixtures/<group>.json`，原生平台和 mock adapter 可直接讀）
- `docs/TOKENS.json`（W3C DTCG token 交換格式，由 `scripts/export_prototype_contracts.py` 從 CSS 的 `--proto-*` alias 匯出）
- `docs/flow.json`（由 `scripts/export_flow.py` 匯出，可加 `--swift` / `--kotlin` 生成 Swift route enum 與 Kotlin sealed class 導航骨架）
- `docs/HANDOFF_MANIFEST.json`（`--handoff-ready` 全數通過時產出）
- Storybook prototype
- Static Flow export

交接定版與漂移偵測：`--handoff-ready` 全數通過時會產出 `docs/HANDOFF_MANIFEST.json`，記錄每份文件的 sha256、route/fixture 快照、Review Status 和 changelog 版本（可用 `--changelog "摘要"` 標註）。之後用 `--verify-manifest` 可以偵測「團隊 demo 確認後又改了文件」，列出漂移的檔案並以非零 exit code 結束。

驗收 ID 三層貫穿：`ACCEPTANCE.md` 每條都有穩定 ID — `AC-S-*`（Storybook 驗收）、`AC-H-*`（交接驗收）、`AC-P-*`（產品驗收）。`AC-P-*` 會標記 `(assembly)`（組裝階段用 mock 就能驗）或 `(integration)`（要等真實串接才能驗），讓後面兩棒各自知道要對哪些條目負責。

多平台交接：flow 契約新增 `params`、`deepLink`、`presentation`（push/modal/sheet/fullscreen/replace）、`backBehavior`（pop/popToRoot/dismiss/none）四個 optional 欄位，FLOW_SPEC 的 Production Navigation Map 升級成「Route id × Web path × iOS destination × Android route」表格；`meta.components` 可加 `targets` 欄分別標 web/ios/android，Prototype To Frontend Map 的 Scope 欄支援 `Scope(web)` / `Scope(app)` 雙欄。舊 prototype 不需改動。

注意：這個 skill 不負責接真實 API。它會寫清楚 API/data contract（契約新增 pagination、sort/filter、freshness、mutation、error taxonomy 五個語意欄位，在模板表以 `Semantics` 欄用 `key: value` 分號簡記）和 fixtures，並在 handoff 文件的 `Data Integration Ownership` 欄位寫明真實串接由誰承接（團隊、系統、人，或 `$production-data-integration`）；不知道就記成 open decision 並指定負責釐清的人。

範例：

```text
Use $storybook-product-prototype to create a checkout flow prototype with PRD, UI Flow, Data Spec, and Frontend Handoff docs.
```

### `$frontend-product-implementation`

用途：把 handoff docs 實作成產品 repo 裡的前端功能（web 目標；原生目標請改用 `$native-product-implementation`）。

適合情境：

- 已經有 `$storybook-product-prototype` 產出的 docs，且團隊已經確認過 demo。
- 想從 0 到 1 建立 frontend product。
- 想在既有產品中新增 route、screen、feature。
- 要在 mock 模式下把前端全流程走通 — 這一棒只交付 fixtures/mock adapter，真實 API 是否就緒都不改變這個邊界。

會做的事：

- 讀 `PRODUCTION_HANDOFF.md`，再 cross-check PRD、Flow、UI、Data、Acceptance。
- 先檢查交接文件的 Review Status；`pending` 或缺章節就停下來問，與 prototype 端的 validator 形成雙重防護。
- 判斷是 greenfield 還是 existing product。
- 掃描 target repo 的 routes、screens、tokens、component library、Storybook、i18n、data pattern。
- 遵循 `$ds-governance`。
- 優先重用現有 tokens 和 shared components。
- 如果缺 token 或 shared component，先問使用者。需要建立 token 時，來源優先序以 `docs/TOKENS.json`（DTCG）為第一位。
- 建立 typed contracts、fixtures，以及 `<Feature>DataSource` 介面加 `Mock<Feature>DataSource` 實作（每個 fixture group 一個方法）。
- 在產品環境用 mock adapter 走完主要旅程與全部分支狀態，每個 transition 都能互動觸發，才算完工。
- 產出 `IMPLEMENTATION_MAP.md`（Consumed Manifest、Route Outcomes、Acceptance Traceability、Data Adapter Seams 四個固定章節），用 `scripts/validate_implementation.py` 稽核 route 終態覆蓋、evidence path 存在、`AC-P-*` `(assembly)` 條目已解決、consumed manifest hash 未漂移。
- 把全部 Scope B（新建）畫面逐一與 prototype 並排比對；Scope A（已上線）畫面明文排除 — prototype 逼真度不是修改已上線畫面的理由。
- 跑 typecheck、tests、build 或 Storybook/app preview。

注意：資料邊界是硬性的 — 任何情況都不接真實資料，沒有例外條款。交付 DataSource 介面加 Mock 之後，把替換工作連同契約轉交 handoff 文件裡記名的第三棒（`$production-data-integration`，或指定的團隊/系統）。

範例：

```text
Use $frontend-product-implementation to implement the checkout flow from ./src/pages/prototypes/checkout-flow-prototype/docs into ./apps/web. Follow $ds-governance.
```

### `$native-product-implementation`

用途：把同一份 handoff docs 實作成 iOS（SwiftUI、Xcode、SPM）或 Android（Jetpack Compose、Gradle、Kotlin）的原生功能。

適合情境：

- 交接文件的目標平台是 App，不是網頁。
- 已經有 `$storybook-product-prototype` 產出的 docs — web 和原生共用同一份，不必重寫。
- 想在既有的 Xcode / Gradle 專案中新增畫面或功能。
- 要在 mock 模式下把 App 全流程走通 — App 一樣只交付 fixtures/mock，真實串接不在 scope。

它是 `$frontend-product-implementation` 的姊妹 skill：文件讀取順序、Review Status 閘門、Scope A/B/C/U 分類、Consumed Manifest 紀錄、`IMPLEMENTATION_MAP.md` 四章節、驗收 ID traceability 全部相同語意，只有執行層換成原生。機器稽核也沿用同一支 `frontend-product-implementation/scripts/validate_implementation.py`（原生 skill 底下沒有自己的 `scripts/`），所以做原生目標時要一併安裝 `$frontend-product-implementation` 的 skill 資料夾。

會做的事：

- 從 repo 證據判斷原生架構（`.xcodeproj` / `.xcworkspace` / `Package.swift` / `settings.gradle(.kts)` / `AndroidManifest.xml`），繼承既有 app 就不再追問，也不因為一個功能需求就換平台。
- 遵循 `$ds-governance`：動 UI 之前先盤點原生 theme/token 與共用元件，能組合就不新建，缺 token 或元件要先問。
- 把 `docs/TOKENS.json` 生成 SwiftUI 的 `Color` / `Font` extension，或 Compose 的 theme object。
- 把 flow 的 `presentation` / `backBehavior` 對映到 NavigationStack push、`.sheet`、`.fullScreenCover`，或 NavHost 的 navigate 與 `popUpTo`。
- 交付 `<Feature>DataSource` protocol/interface 加上讀 `fixtures/*.json` 的 Mock 實作。
- 跑 `xcodebuild build/test`、`swiftlint`，或 `gradlew assembleDebug/test/lint`、`detekt`，並在模擬器/模擬機做冒煙測試。

注意：這個 skill 一樣不接真實資料，只交付可替換的 DataSource 接縫，真實串接交給記名的第三棒。另外，它的機制已經完備，但尚未對真實 Xcode / Gradle 專案跑過一次完整交付 — 第一次使用請預留驗證時間。

範例：

```text
Use $native-product-implementation to implement the checkout flow from ./src/pages/prototypes/checkout-flow-prototype/docs into ./apps/ios. Follow $ds-governance.
```

### `$production-data-integration`

用途：把前一棒交付的 mock adapter 換成真實的 API client、auth/session、cache、storage、persistence 和環境設定，並用 contract test 證明真實回應符合文件寫的契約。這是 prototype → production 鏈的第三棒。

適合情境：

- 功能已經用 mock adapter 走通，要接上後端。
- `PRODUCTION_HANDOFF.md` 的 `Data Integration Ownership` 指名由這個 skill 承接。
- 要證明真實 API 的回應與 `DATA_SPEC.md` 的 schema 一致。

四項固定輸入：

- `PRODUCTION_HANDOFF.md` 的 API And Data Contracts（含 Adapter interface 欄與 Semantics 欄）
- `IMPLEMENTATION_MAP.md` 的 Data Adapter Seams 表
- `fixtures/*.json`
- `DATA_SPEC.md` 的 JSON Schema

contract test 的要求：每個 fixture group 一組 — 用 JSON Schema 驗真實回應、error taxonomy 逐類斷言 UI 錯誤態對映、每個 Semantics 條目至少一條行為斷言、`fixtures/*.json` 當 shape 的黃金參考（比欄位型別，不比值）。沿用專案既有的測試框架，不引入新框架。

邊界：不改 UI 行為、route flow、元件或 token。發現契約和真實 API 不符時，回報並回寫 handoff 文件，而不是就地改 UI；endpoint 或 auth 方式不明時停下來問記名 owner，不自行發明。

範例：

```text
Use $production-data-integration to replace the mock adapters for the checkout flow in ./apps/web with real API clients, using the contracts in ./src/pages/prototypes/checkout-flow-prototype/docs.
```

### `$ds-governance`

由本 repo 的 [`ds-governance/SKILL.md`](../ds-governance/SKILL.md) 維護。核心是可直接讀取的 Markdown，不依賴特定 agent 的提問工具、MCP 或 Storybook。`agents/openai.yaml` 只提供 Codex 顯示資訊。

從 cm-skills repo 安裝到三個 agent：

```bash
node scripts/install_agent_skills.mjs --agent all --scope user --skill ds-governance --dry-run
node scripts/install_agent_skills.mjs --agent all --scope user --skill ds-governance
```

若目標已有同名 skill，先比對再以 `--force` 更新。專案安裝使用 `--scope project --project-root <產品 repo>`。一般安裝不會自動安裝 companion；選擇 `frontend-product-implementation` 或 `native-product-implementation` 時，將 `ds-governance` 一起放入 `--skill` 清單。以下 opt-in 交付模式會解析已宣告的必要依賴。

將本次真正用過的 skills 與必要支援檔案放進同一個 repo：

```bash
node scripts/install_agent_skills.mjs --agent all --scope project --project-root <產品 repo> --skill storybook-product-prototype,native-product-implementation --record-usage --dry-run
node scripts/install_agent_skills.mjs --agent all --scope project --project-root <產品 repo> --skill storybook-product-prototype,native-product-implementation --record-usage
```

`--record-usage` 只接受 project scope 與明確 `--skill` 名單，不能用 `all`。名單表示呼叫方聲明本次用過的 skills，必要依賴另外列示；native 會帶入 `ds-governance` 與作為 support 的 frontend skill，讓共享規格、token bootstrap reference、`validate_implementation.py` 在新 clone 中都可讀取。support 不代表執行 web 階段，也不會自動安裝 `production-data-integration` 等下一階段接收者。prototype 保留既有 standalone fallback；實際用了選用 companion 時，將它明確加進名單。

交付會累積更新 `docs/SKILL_USAGE.json`，記錄來源 repo、commit、dirty 狀態、source／installed content hash、使用／依賴角色與 repo 相對路徑。不是 Git 來源時 commit 為 `null`、dirty 為 `null`，不把不明狀態寫成乾淨來源。同時維護 `CLAUDE.md` 與 `AGENTS.md` 的 `CM-SKILLS:USAGE` 受管區塊，保留其他 bytes。重跑不重複區塊，相同內容可直接重跑；有差異的既有 skill 仍須檢查後以 `--force` 更新。

參數、必要依賴、目的地、既有 usage JSON、受管標記與不可攜 symlink 會在複製前檢查；失敗或 dry-run 不寫檔。依輸出的 allowlist 將 skills、usage JSON、CLAUDE 與 AGENTS 文件納入版本控制，其他人 clone 後才能共用。被 ignore 的交付路徑會明列，安裝器不改 `.gitignore`，也不自動 stage／commit；本機交付完成不代表已發布。

在三個 agent 都可直接說：「先讀 `<cm-skills path>/ds-governance/SKILL.md`，再依它檢查這次 UI 修改。」請求中指定 checkout 時，以該來源為準；已有舊名 `design-system-governance` 的安裝不會自動被覆寫或刪除。

用途：讓這次 UI 工作遵守目標專案的設計系統。可以單獨做唯讀檢查，也可以搭配實作 skill；它不取代原本的產品實作、資料串接或視覺驗收責任。

開始時提供：目標 app／package／module 路徑、這次要做或檢查的範圍，以及可用的設計稿、UI spec 或 handoff 路徑。若本次已核准特定 token 或共用元件，帶上這項決策即可，不必重複批准。

目前專案中的搭配關係：

| 使用者 | 何時使用 ds-governance |
| --- | --- |
| `frontend-product-implementation` | 寫 UI 前必須載入，先盤點再組裝。 |
| `native-product-implementation` | 寫 UI 前必須載入，套用原生 theme、元件與平台驗證慣例。 |
| `storybook-product-prototype` | 可載入時使用；找不到時保留內建 component-discovery 流程並回報。 |
| `storybook-tools-install` 的 `component-coverage-implement` | 覆核清單有 extend／build-new 時，與 design-system-to-storybook 一起載入；reuse-only 清單保持組裝範圍。 |
| `design-system-to-storybook` 產出的專案模板 | 架構文件指示後續 UI 工作遵循 ds-governance。 |

其他 UI 工作也能由你主動指定搭配；這不代表每個 skill 都會自動載入它。

執行順序：

1. 盤點實際 tokens／theme、共用元件、排版與字級、動態、localization，以及可用的 stories、previews 或測試。每項記錄來源檔案；既有盤點仍有效就沿用。
2. 對照這次需求：先重用，再組合。feature-local 排版與 helper 可以保留，不可藉此複製共用 primitive。
3. 缺 token 或需要新增／擴充共用元件時，列出證據與最小方案。已有相同範圍授權就繼續；未決定的部分才詢問，受影響的 UI 暫停，其他獨立盤點仍可進行。
4. 依原有實作流程完成，再回報重用項目、核准的新增項目、驗證結果與尚未驗證的範圍。紀錄放進既有 implementation map 或工作報告。

適用範圍與限制：

- 沿用既有二層／三層 tokens、命名與品牌風格；不強制飽和色、圓角、大字或裝飾動畫。
- Web 用現有元件與驗證方式；SwiftUI／Compose 用原生 theme、previews、測試或裝置驗證。不因治理而額外安裝 Storybook。
- 顯示文字沿用既有 localization；沒有時先確認是否建立，並記錄已授權的例外或延期範圍。
- 唯讀 review 只列發現與建議，不改檔案。只有 source review／build 證據時，不宣稱已通過互動或視覺驗收。

可以直接複製的提示：

```text
用 $ds-governance 檢查 ./apps/web 的結帳 UI 是否沿用既有 tokens、共用元件、動態和多語系。這次只列出問題與建議，不修改檔案。
```

```text
用 $frontend-product-implementation，依 ./prototype/docs 把結帳流程做進 ./apps/web，並遵循 $ds-governance。先重用現有 tokens 和元件；同範圍已核准的項目沿用決策，只詢問未決定的新增項目。
```

```text
用 $native-product-implementation，依 ./prototype/docs 把結帳流程做進 ./apps/ios，並遵循 $ds-governance。保留現有 theme 層級與原生元件，依專案已有工具驗證；缺少的驗證能力請明確列出。
```

### `$ui-compare-to-reference`

用途：比對已經實作好的 UI 和參考來源，並修正偏差。

參考來源可以是三種，不只截圖：

- Figma 檔案或 frame（優先用 Figma MCP 讀出實際數值與變數名稱）
- 設計匯出圖或截圖（沒有 Figma 權限時的備案，數值是估算）
- 另一個平台的原始碼 — 拿網頁版當標準修 App，或拿 App 當標準修網頁

適合情境：

- 畫面已經做出來了，但和設計稿不一致。
- 要把某個畫面從網頁移植到 React Native / Flutter / iOS / Android，或反過來。
- 要修正 spacing、typography、color、layout 的偏差。

修的順序是 token → 共用元件 → 組裝 → 這個畫面。它也會區分「該修的落差」和「本來就該不一樣的平台適配」，不會把合理差異當成 bug 修掉。

範例：

```text
Use $ui-compare-to-reference on https://www.figma.com/design/...?node-id=1-234 and src/screens/WalletHome.tsx.
Use $ui-compare-to-reference with apps/web/src/pages/Wallet.tsx as the reference for apps/mobile/src/screens/WalletHome.tsx.
Use $ui-compare-to-reference on reference/dashboard.png and http://localhost:3000/dashboard.
```

### `$ui-pixel-align-report`

用途：產出設計 QA 報告，不直接修正 UI。參考來源與上一個 skill 相同（Figma / 設計圖 / 另一個平台的原始碼）。

作法是把參考與實作兩邊都抽成同一份平台中立的 UI Spec 再做結構化比對，截圖是證據而不是量測工具。

適合情境：

- 需要給設計師或工程師看逐項差異。
- 想保留每個問題的截圖證據和原始設計連結。
- 想先產出報告，再決定修哪些問題。
- 需要跨平台的一致性稽核（Figma ↔ 網頁 ↔ App，或 iOS ↔ Android）。

會產出：

- 可離線開啟的 static HTML report
- `findings.json`（可直接餵給 `$ui-compare-to-reference` 修復）
- `spec/reference.json` 與 `spec/implementation.json`
- 參考與實作的完整截圖，以及每一項問題的並排截圖

範例：

```text
Use $ui-pixel-align-report on https://www.figma.com/design/...?node-id=1-234 and http://localhost:3000/dashboard.
Use $ui-pixel-align-report on reference/dashboard.png and Dashboard.stories.tsx.
```

### `$platform-parity-handoff`

用途：一個平台（先端，例如 iOS）的功能合入整合分支後，從合併 diff 和原始碼產出交接包給另一個平台（次端，例如 Android）；再在次端用一份對齊報告把所有差異收斂。

適合情境：

- 先端功能已經合入整合分支，次端要做成一樣的。
- 之前用敘述式文件交接，結果次端做出來和先端對不上、來回修很多輪。
- 需要一份跨平台對齊報告，逐項附證據。

不適合：共用契約規則、功能規劃、只做單一平台的工作。

兩種模式：

- `export`：在先端合入整合分支後執行，輸入是該功能的合併 diff（first-parent）。產出 `00-manifest.md`（九章：凍結點、變更清單、畫面 × 狀態矩陣、視覺數值、字串 id、行為契約、API／remote config／事件 key、共用元件影響、允許的平台差異，每章標明來源是 diff、原始碼還是人工）、媒體索引與 `inventory/` 清單。
- `audit`：在次端執行。實作前定位把每一項對到次端落點並整理待決清單；實作後對齊對凍結 SHA 逐項判定 `一致`／`差異`／`允許差異`／`未驗`／`待決`，每列附證據，結尾是一次回寫清單。

會做的事：

- 讀專案的 JSON profile（字串存取方式、資源目錄、mapping 欄位、事件與 remote config 的搜尋樣式），值要從原始碼確認；沒有 profile 時腳本退回範例值，只適合試跑。
- 執行五支唯讀腳本列清單；腳本只讀 git 歷史與工作樹，不連網、不建置，`--out` 不能落在任何輸入 repo 內。
- 視覺比對交給 `$ui-pixel-align-report`（報告）和 `$ui-compare-to-reference`（修復）；兩者不在時改人工截圖對照並在報告寫明。

注意：不啟動 App、不修改任何產品 repo、不查翻譯後台；交接包不是需求權威，產品決策回寫專案的需求文件。目前掃描以 Swift 先端為主，先端是 Android 時分類可用 `--platform android`，其餘要擴充 profile 或人工補。

範例：

```text
Use $platform-parity-handoff with profile docs/handoff/parity-profile.json to export the handoff pack for <feature> from merge commit <sha> on develop into docs/features/<feature>/handoff/.
Use $platform-parity-handoff with profile docs/handoff/parity-profile.json to run audit pre on docs/features/<feature>/handoff/<date>/ for the Android side.
Use $platform-parity-handoff to run audit post on docs/features/<feature>/handoff/<date>/ against the frozen SHA and end with the write-back list.
```

### `$figma-sync-back`

用途：當元件或頁面曾用 Figma export addon 匯出到 Figma、之後在 Figma 端被繼續打磨，判斷哪些 story 需要同步回 Storybook，並把每個差異導到對的修法。只判斷、不動程式碼。

作法是三方比對：拿「上次確認同步的 baseline」當基準，跟「目前 Storybook 的匯出」和「目前 Figma 的狀態」各比一次，分辨出 Figma 單邊改（回流候選）、程式碼單邊改（該重新匯出）、兩邊都改（停下來問你）。匯出工具本來就做不到位的假差異（字型換行、色域壓縮等）會被濾掉，但保留在報告中可稽核。

適合情境：

- 設計師在 Figma 上調整了匯入的元件，想知道哪些元件、哪些屬性要跟著更新。
- 元件是先在 Storybook 做好、匯出到 Figma 打磨的（原本沒有設計稿也適用 — 匯入時外掛已寫好對應識別）。
- 想在動手修改前，先拿到一份「誰改了、差在哪、該怎麼修」的報告。

會產出：

- `design-system/figma-sync-report.md`（人看）與 `.json`（機器可讀）
- 每個 story 的方向判定：`synced` / `figma-only` / `code-only` / `conflict`
- 分流建議：token 差異 → `$design-system-extractor` 的 Late-Arriving Pass 裁決；視覺差異 → `$ui-compare-to-reference`；結構差異 → 人工處理
- 待你確認的「更新 baseline」指令清單

前置需求：Storybook 專案裝有 Figma export addon（含 review-server bridge），且元件曾用 Storybook Code To Design 外掛（1.10.0 以上）匯入 Figma。

範例：

```text
Use $figma-sync-back to check which stories need syncing back from Figma.
Use $figma-sync-back to check the Button component for Figma-side changes.
```

### `$agent-automation-orchestrate`

用途：自動化流程的起始點。把重複性的工作寫成一份專案契約，之後由它執行、續跑和回報。

適合情境：

- 同一件事要在多個專案、多次重複執行。
- 想讓 Claude Code、Codex、Cursor 等 CLI 依序 fallback，其中一個不能用時換下一個。
- 已經有 `.agent-automation/config.json`，要執行或續跑某個 task。
- 設計師想用白話描述一個自動化，不想碰指令和路徑。

五種模式：`bootstrap`（建立契約）、`guide`（白話引導設定）、`run`（執行 task）、`resume`（續跑）、`status`（查狀態）。查詢和報告狀態是唯讀的，不會啟動付費 agent。

契約分工：`runners` 放各家 CLI 的指令、preflight、timeout 和環境變數名稱；`tasks` 放這個專案的指示、配套 skill、驗證指令和必要產物。憑證一律不寫進契約。

範例：

```text
Use $agent-automation-orchestrate to set up automation for ./apps/web. I want ready-for-dev Figma components built into Storybook.
```

```text
Use $agent-automation-orchestrate to run the build-components task in ./apps/web, with a dry run first.
```

### `$storybook-tools-install`

用途：把一組通用的 Storybook「Tools」頁面安裝並綁定到 React + Vite 的 Storybook 專案。目前包含 Component Coverage Analyzer（元件覆蓋率）和 Component Timeline（元件時間軸）兩個工具，預設全裝，也可以只點名安裝其中一個。

適合情境：

- 想在新專案導入「UI 圖片或 PRD → 覆蓋率報告 → 開發者審查 → 實作」的流程。
- 想要一頁依 git 歷史呈現「每個元件何時誕生」的 Component Timeline，附 live story 預覽。
- 需要 Storybook Tools 頁、dev API、檢查腳本和配套的 analyze / implement skills。
- 要更新既有安裝版本（依 `TEMPLATE_MANIFEST.json` 的版本比對，只覆蓋模板擁有的檔案；舊的單工具安裝會升級成多工具佈局）。

範例：

```text
Use $storybook-tools-install to install the Storybook tools suite into ./apps/web.
```

```text
Use $storybook-tools-install to install only the component timeline into ./apps/web.
```

完整的安裝與使用說明（含 Coverage 覆核流程、Timeline 維運、更新與客製化範圍）：`storybook-tools-install/README.md`。

### `$design-automation-hub-install`

用途：把 Design Automation Hub 安裝到指定的目標專案。

適合情境：

- 其他專案需要同一套「Figma 清理 → AI 計畫 → 人工確認」流程。
- 不想複製整個產品 repo，也不想再裝第二套通用 runner。
- 需要先看不寫入任何檔案的安裝計畫再決定。

它會在既有的自動化契約上只加入 `figma-cleanup` task，保留原本的 runners 和其他 tasks。Figma Desktop 的 manifest 匯入是刻意保留給人工執行的步驟。

範例：

```text
Use $design-automation-hub-install to preview a Design Automation Hub installation for ./apps/web.
```

## 建議工作流

### 工作流 1：從設計稿到可重用元件庫

適合：你有 Figma、截圖、既有 app，想建立設計系統和元件庫。

```text
$design-system-extractor
-> $design-system-to-storybook
-> $ui-compare-to-reference
```

說明：

1. 先萃取設計系統。
2. 再把 tokens 和 components 做進 Storybook。
3. 最後比對實作和參考圖。

### 工作流 2：從產品想法到前端功能（web）

適合：你有產品需求，但還沒開始做 production frontend。

```text
$storybook-product-prototype
-> 團隊 demo 確認（人類）
-> $frontend-product-implementation
-> $production-data-integration
-> $ui-compare-to-reference
```

說明：

1. 先用 prototype skill 產出 PRD、Flow、Data Spec、Production Handoff，再用 `--handoff-ready` 定版並產出 `HANDOFF_MANIFEST.json`。
2. 團隊看過 demo、把 Review Status 改成 confirmed — 這一站沒有自動化能代勞。
3. 再用 frontend implementation skill 把 docs 實作到產品 repo，在 mock 模式下走通全流程。
4. 接著用 data integration skill 把 mock adapter 換成真實 API、auth、cache，並補上 contract test。
5. 最後用 compare skill 做視覺校正。

### 工作流 3：用同一份交接文件做原生 App

適合：產品要出 iOS 或 Android 版，而 prototype 已經做好。

```text
$storybook-product-prototype
-> 團隊 demo 確認（人類）
-> $native-product-implementation
-> $production-data-integration
-> $ui-compare-to-reference
```

說明：

1. 先用 prototype skill 產出同一份 handoff 文件，再用 `--handoff-ready` 定版 — 原型製作、團隊 demo 確認、交接定版這三站平台中立，平台分岔點在交接定版之後（web 走 `$frontend-product-implementation`，原生走 `$native-product-implementation`）。
2. 團隊看過 demo、把 Review Status 改成 confirmed — 這一站一樣沒有自動化能代勞。
3. 用 native implementation skill 在 mock 模式下把畫面和流程做出來，產出與 web 同格式的 `IMPLEMENTATION_MAP.md`。
4. 資料串接同樣交給 data integration skill，不因平台分成兩套 — 兩條線的對照表格式相同，這一站不需要知道是哪一條做的。
5. 最後用 compare skill 做視覺校正，過程中保留合理的平台適配差異。

注意：`$native-product-implementation` 的機制已完備，但尚未對真實 Xcode / Gradle 專案跑過一次完整交付，第一次使用要預留驗證時間。

### 工作流 4：從單張畫面開始做產品頁

適合：你只有一張 screenshot 或 Figma export。

```text
$ui-screenshot-to-storybook-product
-> $frontend-product-implementation
-> $ui-compare-to-reference
```

說明：

1. 先拆出畫面中的可重用 UI blocks。
2. 再把它接進產品 repo 的 route 或 screen。
3. 最後比對實作結果。

如果完全沒有 design system，應先改成：

```text
$design-system-extractor
-> $design-system-to-storybook
-> $ui-screenshot-to-storybook-product
```

### 工作流 5：既有產品新增功能

適合：產品 repo 已經存在，只是要新增一個頁面或功能。

```text
$frontend-product-implementation + $ds-governance
-> $production-data-integration
-> $ui-compare-to-reference
```

說明：

1. 先讀既有 repo 的 routes、tokens、shared components、i18n、tests。
2. 依照 design-system governance 重用現有元件。
3. 真實 API 一律不在這一棒的 scope：用 typed contracts、fixtures、mock adapters，真實串接交給記名的第三棒。
4. 由記名的第三棒接上真實資料並補 contract test。
5. 最後比對畫面。

### 工作流 6：設計 QA 和交付報告

適合：你想要一份可交付的設計差異報告。

```text
$ui-pixel-align-report
-> $ui-compare-to-reference
```

說明：

1. 先產生 pixel alignment report。
2. 再根據 report 修正 UI。

### 工作流 7：把流程變成可重複的自動化

適合：上面某個工作流已經做過幾次，想讓它可以重複執行。

```text
$agent-automation-orchestrate
-> 契約中指定的配套 skill
-> $ui-compare-to-reference
```

說明：

1. 用白話描述要自動化的事，讓它建立 `.agent-automation/config.json`。
2. 驗證契約，先 dry run 看執行計畫，再實際執行。
3. 每次執行結束後檢查驗證指令和必要產物，需要時用 `resume` 續跑。

如果要自動化的是 prototype 到 production 這條鏈，`storybook-product-prototype/references/pipeline-stations.md` 有一份可直接改用的編排範例：六站分工、把關條件，團隊 demo 確認保持人類停點，後面幾站以交接定版的 manifest 為前置條件。

### 工作流 8：一個平台做完，交接給另一個平台

適合：iOS 或 Android 其中一端已經把功能合入整合分支，另一端要做成一樣的。

```text
先端功能合入整合分支（人類確認凍結點）
-> $platform-parity-handoff（export）
-> $platform-parity-handoff（audit pre）
-> $native-product-implementation 或專案原本的實作流程
-> $platform-parity-handoff（audit post）
-> $ui-pixel-align-report / $ui-compare-to-reference
```

說明：

1. 先確認先端已合入整合分支，並準備好專案的 JSON profile；還在 feature branch 上的只能當參考。
2. 在先端用 export 從合併 diff 產出交接包，每章標明來源是 diff、原始碼還是人工。
3. 次端開工前用 audit pre 定位落點，把人工判斷的項目整理成開工前要決定的清單。
4. 照專案原本的流程實作；這個 skill 不動次端程式碼。
5. 做完後用 audit post 逐項判定並附證據，視覺差異交給比對報告與修正 skill；最後把回寫清單一次回到專案的需求文件。

## 哪些 Skill 常常搭配使用

| 上游 skill | 下游 skill | 為什麼搭配 |
|---|---|---|
| `$design-system-extractor` | `$design-system-to-storybook` | 先有設計系統文件，再落地成元件庫。 |
| `$design-system-to-storybook` | `$storybook-product-prototype` | 有元件庫後，prototype 可以重用 shared components。 |
| `$storybook-product-prototype` | `$frontend-product-implementation` | prototype docs 會成為 web production frontend 的實作輸入。 |
| `$storybook-product-prototype` | `$native-product-implementation` | 同一份 prototype docs 也能交給原生目標，交接定版之前不必為平台分岔。 |
| `$frontend-product-implementation` | `$production-data-integration` | 前端只交付可替換的 DataSource 接縫，真實 API、auth、cache 由第三棒接上。 |
| `$native-product-implementation` | `$production-data-integration` | 原生組裝同樣只交付 mock 接縫，資料串接不因平台而分成兩套。 |
| `$frontend-product-implementation` | `$ui-compare-to-reference` | 功能做完後，用參考圖檢查視覺偏差。 |
| `$native-product-implementation` | `$ui-compare-to-reference` | App 畫面同樣要跟 prototype 或設計來源比對，且會保留合理的平台適配差異。 |
| `$ui-pixel-align-report` | `$ui-compare-to-reference` | 先產出差異報告，再修正畫面。 |
| `$native-product-implementation` | `$platform-parity-handoff` | 先端合入整合分支後，用它把功能交接給另一個平台，而不是靠敘述文件。 |
| `$platform-parity-handoff` | `$ui-pixel-align-report`／`$ui-compare-to-reference` | 對齊審計把視覺比對交給它們；不在時改人工對照並在報告註明。 |
| `$figma-sync-back` | `$ui-compare-to-reference` | 分流報告裡的視覺差異，交給它以 Figma 節點為標準修正。 |
| `$figma-sync-back` | `$design-system-extractor` | 分流報告裡的 token 差異，走 Late-Arriving Authoritative Source Pass 裁決。 |
| `$ds-governance` | Frontend／Native 實作；其他 UI 工作可指定搭配 | 實作前盤點並重用，僅詢問未授權缺口；詳細必要／條件式關係見上方專節。 |
| `$agent-automation-orchestrate` | 契約中指定的配套 skill | runner 保持通用，專案自己的指示和驗證寫在 task 契約裡。 |
| `$design-automation-hub-install` | `$agent-automation-orchestrate` | 在既有契約上加 `figma-cleanup` task，不用再裝第二套 runner。 |

## 給 AI coding agent 的請求模板

這些模板可以直接用在 Cursor、Claude Code、Codex 或其他 AI coding agent。若該工具不支援 `$skill-name` 觸發，請把句子改成「先閱讀 `<skill folder>/SKILL.md`，再依照該 workflow 執行」。

### 檢查這次 UI 是否遵守設計系統

```text
用 $ds-governance 檢查 <目標 app/package 路徑> 的 <畫面或變更範圍>，參考 <設計規範路徑>。這次只做 review，列出重用情況、缺口與建議，不修改檔案。
```

### 建立設計系統

```text
Use $design-system-extractor to extract a reusable design system from <reference paths or Figma URL>.
```

### 建立 Storybook 元件庫

```text
Use $design-system-to-storybook with design system at <design-system path> and product repo at <repo path>.
```

### 建立產品 prototype 和 handoff

```text
Use $storybook-product-prototype to create a prototype for <feature name>. Include PRD, Flow Spec, UI Spec, Data Spec, Production Handoff, Acceptance, and deterministic fixtures.
```

### 實作到產品 repo

```text
Use $frontend-product-implementation to implement <feature name> from <handoff docs path> into <product repo path>. Follow $ds-governance. Real API integration is out of scope; use typed contracts, fixtures, and mock adapters.
```

### 實作到原生 App

```text
Use $native-product-implementation to implement <feature name> from <handoff docs path> into <iOS or Android app path>. Follow $ds-governance. Real data wiring is out of scope; deliver typed DataSource interfaces with mock implementations reading fixtures/*.json.
```

### 把 mock 換成真實資料

```text
Use $production-data-integration to replace the mock adapters for <feature name> in <product repo path> with real API clients, using the contracts in <handoff docs path> and the Data Adapter Seams table in IMPLEMENTATION_MAP.md. Add contract tests and do not change UI behavior, routes, components, or tokens.
```

### 比對畫面

```text
Use $ui-compare-to-reference on <reference screenshot> and <local URL or route or component file>.
```

### 產出 QA 報告

```text
Use $ui-pixel-align-report on <reference screenshot> and <local URL>.
```

### 交接給另一個平台

```text
Use $platform-parity-handoff with profile <profile path> to export the handoff pack for <feature> from merge commit <sha> on <integration branch> into <output dir>.
```

### 在另一個平台做對齊審計

```text
Use $platform-parity-handoff with profile <profile path> to run audit pre on <handoff pack dir> for the <follower platform> side.
Use $platform-parity-handoff to run audit post on <handoff pack dir> against the frozen SHA and end with the write-back list.
```

### 檢查 Figma 端修改要不要同步回來

```text
Use $figma-sync-back to check which stories need syncing back from Figma. Storybook runs at <storybook URL>.
```

### 建立自動化

```text
Use $agent-automation-orchestrate to set up automation for <repo path>. <用白話描述你想自動化的事>.
```

### 執行既有的自動化

```text
Use $agent-automation-orchestrate to run the <task id> task in <repo path>, with a dry run first.
```

## 重要原則

- 如果是 UI 實作，優先使用 `$ds-governance`。
- 如果沒有 design system，先不要直接做產品畫面，先決定是否要建立設計系統。
- 如果缺 token 或 shared component，要先問使用者。
- 前端和原生的組裝永遠不接真實資料：只交付 typed DataSource 介面加 mock 實作，真實 API、auth、cache 由 handoff 文件裡記名的第三棒（`$production-data-integration`，或指定的團隊/系統）承接。
- 如果還不知道第三棒是誰，就在 handoff 文件的 `Data Integration Ownership` 記成 open decision 並指定負責釐清的人，不要讓資料串接無人認領。
- 團隊 demo 確認是人類的站，沒有自動化能通過；Review Status 還是 `pending` 就不要開始實作。
- 如果只是想確認產品流程，先用 `$storybook-product-prototype`，不要急著進 production repo。
- 如果畫面已經做完，再用 `$ui-compare-to-reference` 或 `$ui-pixel-align-report` 做 QA。
- 跨平台交接以先端合入整合分支的 diff 與原始碼為準，不用敘述文件；審計裡沒有證據的項目是「未驗」，不是「一致」。
- 如果同一件事要重複做，用 `$agent-automation-orchestrate` 收成契約，不要每次重寫一次流程。
- 自動化的完成判定要分開看：契約驗證、agent 結束、專案驗證、commit、push 是五件事，不能互相代表。
