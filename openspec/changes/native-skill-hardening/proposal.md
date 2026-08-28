## Why

`native-product-implementation`（NPI）在 Phase 3 一輪寫成，借用 `frontend-product-implementation`（FPI）的骨架但在原生化過程流失了實質內容，也編造了若干不正確的原生細節。四視角稽核（FPI 對照、handoff 載體消費、原生技術正確性、首次使用體驗）＋獨立查核共找出 49 個缺口：19 條確認、30 條「存在但嚴重度誇大」、0 條推翻。其中三項會直接產生錯誤產出：`kind: return` 的返回轉場會被實作成推入新畫面、完成條件要求為已上線（Scope `A`）畫面建 DataSource seam、iOS 的檔案與資源進不進得了 build（target membership / SPM resources / Bundle）完全沒寫。使用者提出的原始疑慮「會不會每次都重造元件」經查證成立：紀律有寫，但「去哪找元件」在 Repo Discovery、handoff 元件對映、委任的 governance skill 三個環節全斷。本變更把 NPI 從一輪草稿硬化為可交付的 skill。

## What Changes

- **治理與元件盤點**：SKILL.md 新增 `Required Companion Skill` 章節（比照 FPI 的三重保險：description、專章、First Actions），並說明 `$design-system-governance` 的哪些 web-only 規則在原生的對應物、哪些不適用；Repo Discovery 兩個平台各補「既有共用元件庫在哪」（iOS 的 local SPM package／`.library` products／Preview 目錄；Android 的 `:core:ui`／`:design-system` module／`@Preview`／Showkase）；handoff-ingestion 補元件欄位來源（`Design System Continuity`、`UI_SPEC` Component Map／Gaps／Token Binding、`meta.components[].targets.ios/.android` 的三態語意）。
- **Scope A 排除**：完成條件的「每個 fixture group 都要有 DataSource」補上 FPI 既有的排除句（已上線畫面的 fixture 不變成整合工作）；`Route Outcomes` 增加 `not-applicable` 終局狀態供「該 route 在本平台 Not in scope」使用；新增平台適用性入口閘門（web-only handoff 跑 NPI 時要停下來問，而非一路做到底）。
- **導航正確性**：擷取並尊重 `kind` 欄位——`kind: return` 依 `backBehavior` 實作為返回，不得套用「缺 presentation 即 push」的預設（該預設改為只適用於非 return 邊，與上游 `export_flow.py` 的行為一致）；導航對映表改寫為可執行的 API 形態，修正 `popToRoot` 的 `popUpTo` 用法。
- **Token 與主題**：修正 `docs/TOKENS.json` 的形狀描述（鍵為 `proto.<role>` 別名、`$value` 是 CSS fallback、分層 token 名在 `$extensions`）；新增 Dynamic Type／字體縮放與 sp/dp 區分規則；新增深色模式的 token 產出與驗證要求；補「有 token 但無 DTCG 匯出」的中間情境，委任 FPI 的 `token-bootstrap.md`（該檔已內建 SwiftUI 與 Compose 輸出列）。
- **原生平台慣例（新 reference）**：新增 `references/platform-conventions.md` 承載 safe area／edge-to-edge window insets、深色模式、Dynamic Type、螢幕旋轉與狀態保存、多視窗與 iPad 適配、Android 預測性返回（含 `backBehavior: none` 的正確做法）、無障礙實作規則（並說明 UI_SPEC 的 web a11y 語彙不可照搬）、權限請求流程的範圍裁定，以及把 SwiftUI／Compose Preview 當成交付物並以 mock DataSource 驅動。
- **DataSource seam**：定義原生的 injection site（`@Environment`／initializer／DI module 三種形態與其取捨）與 fixtures 的資源載入路徑（iOS `Bundle.module` vs `Bundle.main`、Android `assets/` vs test resources），避免執行期崩潰或只在測試綠燈；seam 設計階段納入 handoff 的 `Semantics` 欄（pagination／freshness／mutation／errors）。
- **驗證可執行性**：模擬器／模擬機走查補上實際程序（`xcrun simctl`、`adb`／`gradlew installDebug`）與「這台機器跑不了」的降級路徑，消除與「指令不可用要照實說」的矛盾；修正驗證指令的必要參數與 Gradle 任務名；Repo Discovery 補專案生成器（XcodeGen／Tuist）與版本來源，避免改動被靜默覆蓋；新增最低 OS/SDK 的 API 可用性閘門。
- **交接消費補完**：還原 FPI 的 `Prototype Parity Sweep` 完整機制（`prototypeRoute=<route-id>` 隔離渲染、Scope `C` 排除、跑不了時的誠實條款）；補 `export_flow.py --swift/--kotlin` 的實際指令、輸出位置與重新生成時機；補跨 repo 取得 handoff 與 fixtures 的方式與再同步規則；localization 規則加上「repo 有 i18n 系統時」的條件與對應 ask gate。

## Non-Goals

- 不改 `frontend-product-implementation`、`storybook-product-prototype`、`production-data-integration` 三個既有 skill 的行為（僅在 NPI 內以名稱委任它們）。
- 不改 `$design-system-governance` skill 本體——它是外部 skill，本變更只在 NPI 端說明平台裁剪。
- 不新增任何腳本或可執行工具；本變更全部是 skill 文件內容。
- 不建立 UIKit／Android Views 的完整實作指引，僅裁定其範圍邊界與 migration 判定。
- 不對真實 Xcode／Gradle 專案做實地驗證（那需要真實專案，屬後續工作）。

## Capabilities

### New Capabilities

- `native-component-governance`: NPI 的治理綁定與元件盤點——Required Companion Skill 章節、原生共用元件庫的 discovery 位置、handoff 元件對映（`targets` 三態、Design System Continuity、UI_SPEC Component Map）的消費，以及 governance skill 的平台裁剪說明。
- `native-scope-discipline`: Scope `A` 在完成條件中的排除、`Route Outcomes` 的 `not-applicable` 終局狀態、平台適用性入口閘門。
- `native-navigation-correctness`: `kind` 欄位擷取與 return 邊的正確處理、缺 presentation 的預設範圍限縮、導航對映表改為可執行 API 形態。
- `native-token-fidelity`: TOKENS.json 實際形狀的正確描述、Dynamic Type 與 sp/dp 規則、深色模式 token 要求、無 DTCG 匯出時委任 token-bootstrap。
- `native-platform-conventions`: 新 reference 承載 safe area／insets、深色模式、字體縮放、旋轉與狀態保存、多視窗與 iPad、預測性返回、無障礙實作、權限範圍、Preview 交付物。
- `native-seam-mechanics`: 原生 DataSource 的 injection site 形態、fixtures 資源載入路徑、seam 設計納入 Semantics 欄。
- `native-verification-executability`: 模擬器走查程序與降級路徑、驗證指令與任務名修正、專案生成器與版本來源的 discovery、最低 OS/SDK API 可用性閘門。
- `native-handoff-consumption`: Parity Sweep 完整機制還原、export_flow 骨架的使用與重生成、跨 repo handoff 取得與再同步、localization 條件化。

### Modified Capabilities

（無。本變更的修改對象是這個 skill 本身，它尚未有已歸檔的 spec，因此全部以新增 capability 表達。）

## Impact

- Affected specs: 新增上列 8 個 capabilities。
- Affected code:
  - New:
    - native-product-implementation/references/platform-conventions.md
  - Modified:
    - native-product-implementation/SKILL.md
    - native-product-implementation/references/handoff-ingestion.md
    - native-product-implementation/references/implementation-workflow.md
    - native-product-implementation/references/verification-reporting.md
    - native-product-implementation/references/native-architecture.md
  - Removed: （無）
- 稽核發現全文存於 openspec/changes/native-skill-hardening/audit-findings.md，實作時逐條對照。
