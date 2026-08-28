## 1. 治理綁定與元件盤點

- [x] 1.1 依 design「Governance 綁定採 FPI 的三重保險，並加平台裁剪說明」在 native-product-implementation/SKILL.md 新增 `## Required Companion Skill` 章節（載入指示、四條 gate、兩句中文 ask template 逐字保留）、frontmatter description 補 governance 綁定語、First Actions 補載入步驟（spec: Governance companion binding），並在同章節加入平台裁剪小段，逐項給出 Storybook stories／hover／CSS keyframes／px breakpoint／src/components 五類 web-only 規則的原生對應物（spec: Governance platform tailoring）；驗證方式：grep SKILL.md 的 `design-system-governance` 至少 3 處命中，五類對應物逐一人工確認存在。
- [x] 1.2 在 references/implementation-workflow.md 的 Repo Discovery iOS 與 Android 清單各新增「共用元件庫位置」項（iOS：Packages/ 下的 local SPM package、Package.swift 的 .library products、DesignSystem/UIComponents targets、#Preview 作為元件目錄；Android：:core:ui / :design-system module、settings.gradle 的 include 清單、@Preview／Showkase／Paparazzi），並在該節開頭加一句「共用元件庫通常不在 app module 內，先讀依賴宣告再決定掃描範圍」（spec: Native shared component discovery）；驗證方式：兩平台清單各含該項且列出實際路徑證據，人工覆核路徑慣例正確。
- [x] 1.3 在 references/handoff-ingestion.md 的 `Which columns are yours` 新增 Components 一節（來源為 PRODUCTION_HANDOFF 的 Design System Continuity 與 UI_SPEC 的 Component Map／Component Gaps／Token Binding；`meta.components[].targets.ios/.android` 的三態語意：字串＝重用既有、null＝需新建走 composition gate、缺 key＝該平台不在範圍），並在 `Extract These Contracts` 補元件四項（要重用的元件、缺的元件或 token、可移植的 prototype 原始檔、要補的測試與 Preview）（spec: Handoff component mapping consumption）；驗證方式：grep `targets.ios`、`Design System Continuity`、`Component Gaps` 命中，三態語意表格存在。
- [x] 1.4 在 SKILL.md 的 Implementation Rules 把 localization 規則改為條件式（「repo 有 i18n 系統時」），並定義沒有時的 ask gate（停下來問是否建立，而非把硬寫文字當成無解的違規）（spec: Conditional localization rule）；驗證方式：內容審閱確認條件與 gate 並存，且措辭與 FPI 同類規則對齊。

## 2. Scope 紀律與平台適用性

- [x] 2.1 依 design「Scope A 排除寫進完成條件，而非只寫在 ingestion」在 SKILL.md 完成條件與 references/verification-reporting.md 的 Completion Bar 兩處補上排除句（已上線畫面的 fixture group 不成為 seam、不進 IMPLEMENTATION_MAP 的整合工作、要記錄為排除），並把 references/implementation-workflow.md 的 DataSource Pattern 從「for every feature」限縮為 in-scope fixture group（spec: Already-shipping surfaces excluded from seam work）；驗證方式：三處說法交叉一致，人工確認不再與 ingestion 的 Scope A 規則互斥。
- [x] 2.2 依 design「Route Outcomes 增加 not-applicable，與共用 validator 相容」在 references/verification-reporting.md 的 IMPLEMENTATION_MAP 契約新增第四種終局 `not-applicable`（用於本平台 Not in scope 的 route，Evidence 填 Production Navigation Map 的對應欄位），並註明共用 validator 只認三種、遇到此值會回報缺終局結果，需在最終報告說明並人工確認（spec: Not-applicable route outcome）；驗證方式：grep `not-applicable` 命中，落差說明段落存在且未修改 FPI 腳本。
- [x] 2.3 在 SKILL.md 的 First Actions 新增平台適用性入口閘門：讀 Target Surfaces 與 Production Navigation Map 的本平台欄，兩者皆無本平台內容時停下來問（退回 SPP 補原生欄位，或確認要在無原生規格下推導），不得靜默做到底（spec: Platform applicability gate）；驗證方式：內容審閱確認閘門在讀 handoff 之後、實作之前的正確位置。

## 3. 導航正確性

- [x] 3.1 依 design「導航正確性：尊重 kind，限縮 push 預設」在 references/handoff-ingestion.md 的擷取清單加入 `kind`，並在 references/implementation-workflow.md 把「缺 presentation 即 push」限縮為僅適用非 return 邊、return 邊一律依 backBehavior 實作為返回（backBehavior 也缺席時預設 pop）（spec: Return transitions respect their kind）；驗證方式：兩檔說法一致，並與上游 export_flow.py 的 group_transitions_by_presentation docstring 行為對照確認不再相反。
- [x] 3.2 改寫 references/implementation-workflow.md 的兩張導航對映表為可執行 API 形態，修正 popToRoot（popUpTo 起點且 inclusive = false）與 replace（inclusive = true）的區分，並在表後加一句「這是契約意圖的形態，要接進 App 既有 router，不得另建第二套導航」（spec: Executable navigation mapping）；驗證方式：逐格人工覆核 API 形態正確且可編譯語意無誤。
- [x] 3.3 在 references/implementation-workflow.md 補 export_flow.py 生成骨架的使用說明：實際指令（含 --swift／--kotlin）、輸出檔放哪、是 scaffolding 非成品、以及重新生成時機（handoff 版本更新且 flow metadata 有變時）（spec: Flow skeleton usage）；驗證方式：grep `export_flow.py` 命中且含完整指令，人工確認與 SPP 端腳本的實際參數一致。

## 4. Token 與主題

- [x] 4.1 依 design「TOKENS.json 形狀描述改為與實際匯出一致」改寫 references/implementation-workflow.md 的 Token Consumption：三層結構（鍵為 proto.<role> 別名、$value 為 CSS fallback、分層 token 名在 $extensions.sourceToken），並規定有 UI_SPEC Token Binding 時以專案 token 為準、$value 僅作 fallback（spec: Accurate token export structure）；驗證方式：對照 export_prototype_contracts.py 實際輸出的 TOKENS.json 結構逐欄確認描述正確。
- [x] 4.2 依 design「Dynamic Type 與 sp/dp 寫進 token 規則而非只寫驗收」在 Token Consumption 新增 Dynamic Type 與單位規則（dimension token 必須判定是字級還是間距尺寸；字級→ iOS 相對 TextStyle／Android sp，間距尺寸→固定值／dp；判定依據為 Token Binding 的角色名，判不出來就停下來問）並附對照表（spec: Type scaling and unit rules），以及深色模式要求（兩組值以 asset catalog appearance 或 Compose color scheme 承載，缺 dark 值停下來問不自行推導）（spec: Dark mode token requirement）；驗證方式：grep `sp`、`dp`、`dark` 命中，對照表三列與 spec 範例一致。
- [x] 4.3 在 Token Consumption 補「有 token 來源但無 DTCG 匯出」的中間情境，以 skill 名委任 frontend-product-implementation/references/token-bootstrap.md（該檔已含 SwiftUI 與 Compose 輸出列與來源優先序），並註明姊妹 skill 缺席時人工照同程序執行並記錄（spec: Token bootstrap delegation）；驗證方式：內容審閱確認委任明確且涵蓋缺席降級。

## 5. 原生平台慣例（新 reference）

- [x] 5.1 依 design「新增 platform-conventions.md 承載原生特有面向」建立 references/platform-conventions.md，涵蓋 safe area 與 window insets（含 edge-to-edge）、深色模式、Dynamic Type、旋轉與狀態保存與多視窗與大螢幕適配、Android 預測性返回（含 backBehavior: none 的正確做法）、無障礙實作規則（含 UI_SPEC 的 web a11y 語彙不可照搬的說明）、權限請求流程的範圍裁定，每個主題統一三段式（handoff 的哪個欄位描述它／iOS 怎麼做／Android 怎麼做），不對應任何 handoff 欄位的主題不收錄（spec: Platform conventions reference、Covered native concerns）；驗證方式：逐主題確認三段式完整且第一段指名實際存在的 handoff 欄位。
- [x] 5.2 在 platform-conventions.md 加入 Preview 章節：SwiftUI #Preview／Compose @Preview 由 Mock<Feature>DataSource 驅動、每個文件化的分支狀態都要可預覽、列為交付物而非選配（spec: Previews as a deliverable），並在 SKILL.md 的 Reference Loading 與 references/implementation-workflow.md 的 UI 實作步驟指名載入這份新 reference（spec: Platform conventions reference）；驗證方式：Reference Loading 清單與實際檔案一一對應，implementation-workflow 有載入指示。

## 6. Seam 機制與建置

- [x] 6.1 依 design「DataSource seam」在 references/implementation-workflow.md 的 DataSource Pattern 定義原生 injection site 三形態（environment／composition-local、constructor 注入 view model、DI module 註冊）與其取捨，要求記錄用了哪一種與位置，並在 IMPLEMENTATION_MAP 的 seams 表帶上該位置（spec: Injection site definition）；同時補 fixtures 資源載入路徑（iOS Bundle.module vs Bundle.main、Android assets/ vs res/raw vs test resources）與錯選的後果（執行期崩潰或只有測試綠燈）（spec: Fixture resource loading）；驗證方式：內容審閱三形態齊備、seams 表欄位對應、載入路徑兩平台皆有。
- [x] 6.2 依 design「iOS build membership 與資源載入獨立成節」在 references/implementation-workflow.md 新增 `## Build Membership And Resources` 節：檔案存在不等於進得了 build；Xcode target membership；專案生成器（XcodeGen／Tuist）要改 spec 並重新生成、直接改生成檔會被覆蓋；SPM 的 resources 宣告；Android 的 assets／res/raw／test resources 差異（spec: Build membership and resources），並與 DataSource Pattern 的 fixtures 載入交叉指名；驗證方式：grep `Bundle.module`、`target membership`、生成器名稱命中，交叉指名雙向存在。
- [x] 6.3 在 DataSource Pattern 要求設計介面時讀取 handoff 契約的 Semantics 五項（pagination／sort-filter／freshness／mutation／errors）使方法形狀能承載它們，未決項是給記名 owner 的問題而非寫死假設（spec: Contract semantics inform the seam）；驗證方式：內容審閱確認五項列出且與 SPP 端 Semantics 欄定義一致。

## 7. 驗證可執行性與交接消費

- [x] 7.1 依 design「驗證可執行性與降級路徑」在 references/verification-reporting.md 補模擬器／模擬機走查的實際程序（iOS：xcrun simctl 選機、xcodebuild -destination 建置、simctl install／launch；Android：adb devices、gradlew installDebug、adb shell am start），並把完成門檻改為「走查已完成，或已記錄降級替代與未覆蓋項」以消除與「指令不可用要照實說」的矛盾（spec: Runnable walkthrough procedure）；驗證方式：內容審閱兩平台程序完整、降級路徑明確、矛盾消除。
- [x] 7.2 修正 references/verification-reporting.md 的驗證指令精確度：Android 任務改為 module 與 variant 限定（:<module>:assembleDebug、:<module>:testDebugUnitTest、:<module>:lintDebug），iOS 建置與測試指令標明所需 scheme 與 destination（spec: Precise verification commands）；並在 references/implementation-workflow.md 的 Repo Discovery 補最低 OS/SDK 版本宣告位置與專案生成器偵測，加上 API 可用性閘門（不得用高於下限的 API，需改用可用替代或加可用性防護）（spec: Version and generator discovery）；驗證方式：指令逐一人工覆核，閘門規則存在。
- [x] 7.3 還原 references/verification-reporting.md 的完整 Prototype Parity Sweep：涵蓋全部 Scope B 畫面、使用 prototypeRoute=<route-id> 隔離渲染機制、排除 Scope A 與 Scope C、prototype 跑不了時要說出哪些畫面未驗證而非宣稱通過（spec: Full parity sweep on native）；驗證方式：grep `prototypeRoute` 命中，三項排除與誠實條款齊備。
- [x] 7.4 依 design「跨 repo handoff 與 fixtures 再同步」在 references/handoff-ingestion.md 新增跨 repo 取得與再同步節（取得方式、複製時要記錄來源與 manifest docsDigest、再同步以 --verify-manifest 判定漂移後重新複製而非手改副本）（spec: Cross-repository handoff access），並新增委任韌性說明：列舉所有以 frontend-product-implementation 之名委任的契約與腳本，說明姊妹 skill 缺席時人工執行同樣條件並在報告記錄（spec: Delegation resilience）；驗證方式：內容審閱兩節齊備，委任項目可列舉。

## 8. 整體一致性與驗收

- [x] 8.1 依 design 的 Implementation Contract 逐條對照 openspec/changes/native-skill-hardening/audit-findings.md：每個 confirmed 缺口都能指出對應修正，或明確記錄為不修及理由；執行 grep 驗收清單（design-system-governance 至少 3 處、not-applicable、Bundle.module、sp/dp、predictive back、prototypeRoute、simctl、targets.ios）；並做交叉一致性檢查（Scope A 排除三處一致、return 邊規則兩處一致、Reference Loading 與實際檔案一一對應）；驗證方式：逐項 grep 實際執行並記錄結果，未修項目列成清單。
