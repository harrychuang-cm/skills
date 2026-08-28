## Context

`native-product-implementation`（NPI）是 `frontend-product-implementation`（FPI）的原生姊妹 skill，設計原則為「繼承方法骨架、替換平台執行層」。它在 Phase 3 一輪寫成，未經實地使用。四視角稽核找出 49 個缺口（19 confirmed／30 overstated／0 refuted），全文存於本 change 目錄的 audit-findings.md。缺口分三類：(1) **繼承時流失**——FPI 有的實質內容在原生化過程被壓縮或漏掉（governance 綁定、Scope A 排除句、Parity Sweep 機制、token-bootstrap 銜接）；(2) **原生細節不正確**——編造了無法編譯或不符實際 API 的內容（`popToRoot` 的 `popUpTo` 用法、Gradle 任務名、TOKENS.json 形狀）；(3) **原生特有面向缺席**——web 沒有而原生必須處理的事（build target membership、Dynamic Type、safe area/insets、深色模式、旋轉與狀態保存、預測性返回、資源載入路徑）。既有結構：SKILL.md ＋ 四份 references（native-architecture、handoff-ingestion、implementation-workflow、verification-reporting）。

## Goals / Non-Goals

**Goals:**

- 消除會產生錯誤產出的三個 blocker：return 邊被實作成 push、為 Scope `A` 畫面建 seam、iOS 資源進不了 build。
- 讓「先找現成元件再建新的」這條紀律真的可執行：補齊 discovery 位置、handoff 元件對映消費、governance 平台裁剪。
- 把編造或不精確的原生技術內容改為可執行、可編譯的形態。
- 補齊原生特有的實作面向，且與 handoff 既有的 App Implementation Notes 欄位對應。
- 讓完成條件全部可執行：每個硬性門檻都有程序與降級路徑。

**Non-Goals:**

- 不改動其他三個 skill 的行為，也不改 `$design-system-governance` 本體。
- 不新增腳本或工具；全部是 skill 文件。
- 不寫 UIKit／Android Views 的完整實作指引，只裁定範圍與 migration 判定。
- 不做真實原生專案的實地驗證。
- 不追求與 FPI 逐字對稱——原生本來就不需要的東西（如 SSR/hydration、CSS 相關規則）不補。

## Decisions

### Governance 綁定採 FPI 的三重保險，並加平台裁剪說明

FPI 用三處綁定 `$design-system-governance`：description 的「Always follow design-system-governance」、獨立的 `## Required Companion Skill` 章節（含四條 gate 與兩句中文 ask template）、First Actions 的載入步驟。NPI 目前只在第三份 reference 的第 48 行提過一次。決定：比照補齊三處，ask template 兩句逐字保留（治理閘門靠這兩句話觸發，改寫會失效）。

額外決定：新增「平台裁剪」小段，逐項說明 governance skill 的 web-only 規則在原生的對應物——Storybook stories → SwiftUI `#Preview` / Compose `@Preview`；hover 狀態 → pressed/focused；CSS keyframes/cubic-bezier → SwiftUI animation curve / Compose `AnimationSpec`；px breakpoint → size class / window size class；`src/components/` → 見 Repo Discovery 的原生元件庫位置。理由：不裁剪的話，模型讀到 DSG 裡大量不可能滿足的 web 條款，會整份判定不適用而跳過治理——比沒綁定更糟。

### Scope A 排除寫進完成條件，而非只寫在 ingestion

NPI 目前在 ingestion 要求 Scope `A` 逐字照抄且不得重建，完成條件卻要求「每個 fixture group 都要有 DataSource」。兩條互斥時完成條件會贏（它是最後被檢查的）。決定：在 SKILL.md 完成條件與 verification-reporting 的 Completion Bar 兩處補上排除句，並把 implementation-workflow 的 DataSource Pattern 從「for every feature」限縮為「每個 in-scope（`B`／`C`-in-scope）fixture group」，三處說法一致。理由：FPI 已有這條排除句（SKILL.md 的 Data contracts 那條），這是繼承時流失而非新設計。

### Route Outcomes 增加 not-applicable，與共用 validator 相容

`validate_implementation.py` 要求 manifest 的每個 route id 都有終局結果，合法值為 `implemented`／`existing-verified`／`deferred`。多平台 handoff 中，route 可能在 iOS 欄寫 `Not in scope`——這既不是 implemented、也不是 existing-verified、更不該記成 deferred（deferred 錯誤地承諾未來會做）。決定：在 NPI 的 IMPLEMENTATION_MAP 契約中定義第四種終局 `not-applicable`，Evidence 欄填「Production Navigation Map 的本平台欄位為 Not in scope」。同時在 verification-reporting 註明：共用 validator 目前只認三種，遇到 `not-applicable` 會回報缺終局結果，因此要在最終報告中說明該列並人工確認——不修改 FPI 的腳本（那超出本變更範圍），而是讓落差可見。

### 導航正確性：尊重 kind，限縮 push 預設

上游 `export_flow.py` 的 `group_transitions_by_presentation` 明文把「無 presentation 的 return 邊」放進 unspecified 桶而非 push 桶，理由寫在該函式的 docstring：「Defaulting those to push would tell a native receiver to push a destination for what is actually a dismiss or a pop」。NPI 目前的規則正好與之相反。決定：(1) handoff-ingestion 的擷取清單加入 `kind`；(2) implementation-workflow 的預設規則限縮為「非 return 邊且無 presentation 時視為 push」，return 邊一律依 `backBehavior` 實作為返回，`backBehavior` 也缺席時預設 `pop`。

導航對映表改寫：目前多數格子是概念名詞而非可執行 API。決定改為每格給出實際呼叫形態，並修正 `popToRoot`——Compose 的正確寫法是 `popUpTo(startDestination) { inclusive = false }`（回到起點且保留起點），而非目前寫的 `popUpTo(startDestination)` 語焉不詳；`replace` 才是 `inclusive = true`。

### 新增 platform-conventions.md 承載原生特有面向

safe area／insets、深色模式、Dynamic Type、旋轉與狀態保存、多視窗與 iPad、預測性返回、無障礙、權限、Preview 共九個主題若全塞進 implementation-workflow，該檔會膨脹到難以導航（目前已 ~160 行）。決定：新增 `references/platform-conventions.md`，由 implementation-workflow 在 UI 實作步驟中指名載入。每個主題的寫法統一為三段：handoff 的哪個欄位描述它（對應 App Implementation Notes 的既有欄位）、iOS 怎麼做、Android 怎麼做。理由：與 handoff 欄位對齊，避免變成脫離交接文件的通用原生教學。

Preview 特別處理：SwiftUI `#Preview` / Compose `@Preview` 由 `Mock<Feature>DataSource` 驅動，列為交付物而非可選項——原生開發的迭代主要發生在 Preview，而 mock seam 正好是它的天然資料源，兩者不接起來等於浪費既有產出。

### Dynamic Type 與 sp/dp 寫進 token 規則而非只寫驗收

字體縮放在原生是 token 層決策（iOS 用 `Font.TextStyle` 相對級距而非固定 pt；Android 字級用 `sp` 隨系統縮放、間距與尺寸用 `dp` 不縮放），DTCG 匯出的 `dimension` 型別不區分這件事。決定：在 Token Consumption 明訂——`docs/TOKENS.json` 的 dimension token 進入原生時必須判定它是字級（→ iOS 相對 TextStyle／Android `sp`）還是間距尺寸（→ 固定值／`dp`），判定依據是該 token 在 UI_SPEC Token Binding 中的角色名，判不出來就停下來問。深色模式同理：TOKENS.json 只帶單一 `$value`（prototype CSS 的 fallback），原生需要 light/dark 兩組，決定要求以 asset catalog 的 Any/Dark appearance 或 Compose 的 light/dark color scheme 承載，並在缺 dark 值時停下來問而非自行推導。

### TOKENS.json 形狀描述改為與實際匯出一致

實際匯出結構是 `{ "$description": ..., "proto": { "<role>": { "$type", "$value", "$extensions": { "works.cm.storybook-product-prototype": { "sourceToken", "tokenPrefix" } } } } }`。`$value` 是 prototype CSS alias 的 **fallback 值**（中性預設），真正的專案 token 名在 `$extensions.sourceToken`。NPI 目前宣稱該檔帶「layered names」，會誤導模型以為 `$value` 就是專案的真值。決定：在 Token Consumption 明確描述三層——role 別名（鍵名）、fallback 值（`$value`）、來源 token 名（`$extensions`）——並規定當 handoff 同時提供 UI_SPEC Token Binding 記錄時，以 Token Binding 的專案 token 為準、TOKENS.json 的 `$value` 只作為該 token 未定義時的 fallback。

### iOS build membership 與資源載入獨立成節

原生相對 web 最根本的差異：檔案存在 ≠ 進得了 build。決定在 implementation-workflow 新增 `## Build Membership And Resources` 節，涵蓋：新增 Swift 檔要進 target（Xcode 專案需確認 `project.pbxproj` 的 target membership；使用 XcodeGen／Tuist 的專案要改 spec 檔並重新生成，直接改 pbxproj 會被下次生成覆蓋）、SPM package 的 `resources:` 宣告、`Bundle.module`（package 內）vs `Bundle.main`（app target 內）的選擇、Android 的 `assets/` vs `res/raw` vs test resources 差異。fixtures 的載入路徑錯誤是執行期崩潰或「只有測試綠燈」的典型來源，因此與 DataSource Pattern 交叉指名。

### 驗證可執行性與降級路徑

模擬器走查目前是硬性門檻但無程序，且與同檔開頭「指令不可用要照實說」矛盾。決定：verification-reporting 補實際程序（iOS：`xcrun simctl list devices` 選機、`xcodebuild -destination` 建置、`xcrun simctl install`／`launch`；Android：`adb devices`、`gradlew installDebug`、`adb shell am start`），並定義降級路徑——無模擬器環境時，以 Preview 快照或單元／UI 測試覆蓋走查項目，並在報告中明列「走查以降級方式完成」與未覆蓋項。硬性門檻改為「走查已完成或已記錄降級與缺口」，消除矛盾。

Gradle 任務名精確化：`gradlew :<module>:assembleDebug`、`:<module>:testDebugUnitTest`、`:<module>:lintDebug`（不是籠統的 `test`／`lint`，多 module 專案會跑錯範圍或全跑）。

### 跨 repo handoff 與 fixtures 再同步

原生 App 幾乎必然與 prototype 不同 repo。決定在 handoff-ingestion 新增短節：取得方式（本機路徑、git submodule、或人工複製）、複製進 App 資源後必須記錄來源與 manifest `docsDigest`、以及再同步規則——handoff 更新後以 `--verify-manifest` 判定漂移，fixtures 重新複製而非手改 App 內的副本（手改會讓 contract test 的黃金參考失真）。

### 平台適用性入口閘門

web-only handoff（Target Surfaces 的 App 欄為 `Not in scope`）被拿來跑 NPI 時，目前會一路做到底。決定在 SKILL.md First Actions 第 3 步後加入閘門：讀 `Target Surfaces` 與 Production Navigation Map 的本平台欄，兩者皆無本平台內容時停下來問使用者——是要先補 handoff 的原生欄位（回到 SPP），還是確認要在無原生規格的情況下推導。

## Implementation Contract

**可觀察行為：**

- NPI 的 SKILL.md 含 `## Required Companion Skill` 章節、frontmatter description 含 governance 綁定語、First Actions 含載入步驟與平台適用性閘門、Completion Criteria 含 Scope `A` 排除句。
- `references/platform-conventions.md` 存在，涵蓋九個主題，每個主題三段式（handoff 欄位／iOS／Android），並被 implementation-workflow 指名載入。
- Repo Discovery 的 iOS 與 Android 清單各含「共用元件庫位置」與「專案生成器與版本來源」兩項。
- handoff-ingestion 的 `Which columns are yours` 含 Components 一節（Design System Continuity、UI_SPEC 三節、`meta.components[].targets` 三態語意）；Extract These Contracts 含 `kind`、元件對映、Semantics 欄；含跨 repo 取得與再同步節。
- implementation-workflow 含 `## Build Membership And Resources` 節；DataSource Pattern 含 injection site 三形態與 fixtures 載入路徑；導航對映表每格為可執行 API 形態且 return 邊規則正確；Token Consumption 描述 TOKENS.json 三層結構、Dynamic Type/sp-dp 判定、深色模式要求、無 DTCG 時委任 token-bootstrap。
- verification-reporting 含完整 Parity Sweep（`prototypeRoute` 機制、Scope `C` 排除、跑不了時的誠實條款）、模擬器程序與降級路徑、精確的 Gradle 任務名、`not-applicable` 終局狀態與其與共用 validator 的落差說明。
- 全 skill 對 `export_flow.py` 的使用有實際指令、輸出位置與重新生成時機。

**失敗模式：** 本變更為純文件，無執行面。錯誤形態是內容不正確或自相矛盾，由驗收方式攔截。

**驗收方式：**

- 逐條對照 audit-findings.md：每個 confirmed 缺口都能在改動後的檔案中指出對應修正，或明確記錄為不修及理由。
- grep 檢查關鍵字實際落地：`design-system-governance`（SKILL.md 至少 3 處）、`not-applicable`、`Bundle.module`、`sp`/`dp`、`predictive back`、`prototypeRoute`、`simctl`、`targets.ios`。
- 交叉一致性檢查：Scope `A` 排除句在 SKILL.md 與 verification-reporting 皆存在且與 implementation-workflow 的 DataSource Pattern 範圍限縮一致；return 邊規則在 handoff-ingestion 與 implementation-workflow 說法一致。
- 技術正確性人工覆核：導航對映表的每個 API 形態、Gradle 任務名、simctl/adb 指令序列。
- Reference Loading 清單與實際檔案一一對應（新增 platform-conventions.md 後）。

**範圍邊界：** in scope = NPI 的 5 個既有檔案修改 ＋ 1 個新 reference；out of scope = 其他 skill 的任何改動、腳本、UIKit/Views 完整指引、真實專案驗證。

## Risks / Trade-offs

- [platform-conventions.md 可能膨脹成通用原生教學，脫離 handoff] → 每個主題強制三段式且第一段必須指名 handoff 的對應欄位；不對應任何 handoff 欄位的主題不收錄。
- [原生技術細節可能再次寫錯（本變更正是在修這類錯）] → 導航 API、建置指令、資源路徑三類內容在驗收時逐項人工覆核，且措辭保守（給形態與注意事項，不給宣稱能直接編譯的完整程式碼）。
- [`not-applicable` 與共用 validator 不相容] → 不改腳本，改為在文件中明示落差與人工確認步驟；若未來要對齊，是 FPI 端的獨立變更。
- [補太多內容反而讓 skill 難用] → 主體流程留在 SKILL.md 與 implementation-workflow，細節下沉到 platform-conventions.md 並由流程步驟指名載入，維持既有的「按需載入 reference」模式。
- [30 條 overstated 缺口若全數照修會過度膨脹] → 以 confirmed 為必修、overstated 依是否影響正確性擇要處理，未處理者在最終報告列出。
