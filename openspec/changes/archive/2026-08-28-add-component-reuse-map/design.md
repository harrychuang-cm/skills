## Context

兩個實作 skill（frontend-product-implementation、native-product-implementation）已強制掛載 design-system-governance：Phase 0 discovery、Token Gate、Composition Gate 與兩句繁中提問模板都已存在，implementation-workflow 的 Design-System Governance Gate 也要求「先列出既有元件、先嘗試組裝」。缺口在於產物層：handoff 元件 → production 元件的解析結果只被要求出現在最終回報文字（verification-reporting 的 Final Response Contract），不在 IMPLEMENTATION_MAP.md 的四段合約內，validate_implementation.py 也不稽核它。因此「先找元件再組裝」無法在事前被強制、事後被機器驗證。

handoff 端已有可消費的來源：PRODUCTION_HANDOFF.md 的 Per-screen composition echo（鏡射 meta.components，含 origin 與 story id）、meta.components 的 targets 欄位（platform-component-mapping 能力，可指名各平台 production 對應元件或以 null 宣告需新建）、以及 Promotion candidates 清單。

## Goals / Non-Goals

**Goals:**

- 在寫任何 UI 程式碼之前，範圍內每個 handoff 元件都有一個已解析的重用決定，未解析者觸發既有的 governance 提問門檻。
- 解析結果成為 IMPLEMENTATION_MAP.md 的第五段，逐列帶證據路徑，並被 validate_implementation.py 稽核。
- native skill 以繼承共享合約的方式取得同一行為，不複製整份規則。

**Non-Goals:**

- 不改動 design-system-governance skill 本身（它不在本 repo，且其 gate 語意不變）。
- 不改動 storybook-product-prototype 端的 handoff 產出格式（composition echo 與 targets 已足夠作為列來源）。
- 不引入元件相似度自動比對工具或評分機制；解析仍由實作 pass 以 repo 證據判斷。
- 不改變 Scope A/B/C/U 語意；Scope A 路由的元件不進入 map。

## Decisions

### 列來源以 handoff 組成回聲為準並允許 source none 逃生口

Component Map 的列 = 範圍內路由（Scope B，加上已解除封鎖的 U 列）在 Per-screen composition echo 中出現的去重元件集合。handoff 沒有 composition echo 時退回 UI_SPEC.md 的每路由組成記錄；兩者皆無（舊版 handoff）時，段內寫一行 `- source: none` 並免除逐列義務——比照 Consumed Manifest 的 `unversioned` 樣式，讓舊 handoff 不會無法通過稽核。替代方案「強制所有 handoff 補件」被否決：會把新門檻變成舊管線的硬升級。

### 解析詞彙五值終態

每列的 Resolution 必為 `reused`（直接重用既有 production 元件）、`composed`（由多個既有元件組裝，含 prototype-local 元件在 production 以既有共用元件組成 feature-local 實作的情形）、`extended`（在既有共用元件上經核准新增 variant/state）、`created`（經核准新建共用元件，走既有 Approved Component Porting 程序）、`deferred`（含原因）。前置階段允許暫時未解析，但每個未解析列必須在寫 UI 前觸發 Composition Gate 提問；完成時不得殘留非終態列。替代方案「沿用最終回報的三分類（reused/created/deferred）」被否決：缺少 composed 與 extended 會把最常見的兩種合法結果擠進錯誤分類，稽核就失去意義。

### targets 欄位作為候選種子且需存在性驗證

當 meta.components 的 targets 為本平台指名 production 元件時，該名稱是候選而非真相：實作 pass 驗證該元件確實存在於 production root 並記錄其路徑作為 Evidence；targets 為顯式 null 時預示該列將走 created 路徑，仍需 Composition Gate 核准。替代方案「targets 指名即視為已解析」被否決：prototype 端的指名可能過時或拼錯，未驗證的名稱會產生假證據。

### 第五段 Component Map 的表格形狀與稽核規則

段落固定為 `## Component Map`，可含一行 `- source: <來源說明或 none>`，表格欄位為 `Handoff component`、`Resolution`、`Production component`、`Evidence`、`Notes`。Evidence 放 repo 相對路徑（多個以逗號分隔）；created 列的 Notes 必填核准記錄與 prototype 來源，deferred 列的 Notes 必填原因。validate_implementation.py 新增檢查：段落存在；`- source: none` 且無表格列時跳過逐列檢查；每列 Resolution 屬於五值集合；reused/composed/extended/created 列的每個逗號分隔 Evidence 路徑存在於 production root 之下；created 與 deferred 列的 Notes 非空。任何失敗列入清單並以非零碼結束，與既有檢查一致。替代方案「只檢查段落存在」被否決：無逐列檢查等於回到不可稽核的現狀。

### native 以 Inherited Shared Contracts 繼承並在原生 gate 落實

native-product-implementation 的 SKILL.md 在 Inherited Shared Contracts 清單加入 Component Map 合約條目（第五段、同表格欄位、同稽核），其 implementation-workflow 的 Design-System Governance Gate 將「列出既有元件」升級為「完成 Component Reuse Map 解析」，Evidence 使用原生模組路徑（Swift package、Gradle module）。替代方案「在 native 全文複製規則」被否決：兩份規則會漂移，Inherited Shared Contracts 正是為此存在。

### 時序門檻寫入 SKILL 的 First Actions 與 workflow gate

frontend SKILL.md First Actions 的 governance 載入步驟之後、實作步驟之前，加入「建立並解析 Component Reuse Map；未解析列先提問」的明確步驟；native SKILL.md First Actions 對應步驟同樣加入。implementation-workflow 的 Design-System Governance Gate 段落改寫為以 map 為產出的四步：取列來源 → 逐列對照 production → 未解析列觸發提問 → map 完成才進入 UI 實作。verification-reporting 的 Final Response Contract 改為引用 map 段落而非另行複述，避免雙重真相。

## Implementation Contract

- 行為：實作 pass 在寫第一個 UI 檔案之前，產生（至少草稿版）IMPLEMENTATION_MAP.md 的 `## Component Map` 段；完成時該段每列皆為五值終態之一且帶證據；`python3 frontend-product-implementation/scripts/validate_implementation.py --handoff <docs> --map IMPLEMENTATION_MAP.md --repo <root>` 對違規逐列列出主體並以非零碼結束，乾淨時 exit 0。
- 資料形狀：`## Component Map` 段 = 選配的 `- source: ...` 前導行 + Markdown 表格（欄位 Handoff component / Resolution / Production component / Evidence / Notes）。Resolution 僅允許 reused、composed、extended、created、deferred。Evidence 為 repo 相對路徑，多值以逗號分隔。
- 失敗模式：缺段落、非法 Resolution 值、Evidence 路徑不存在、created/deferred 列 Notes 空白 → 均為 audit error（列出主體、非零 exit）。`- source: none` 且無表格列 → 跳過逐列檢查、不報錯。
- 驗收：以 python3 -c doctest 式煙霧測試或臨時 fixture 執行 validate_implementation.py，覆蓋「缺段」「非法值」「路徑不存在」「source: none 通過」「完整五值通過」五種情境並確認 exit code 與訊息；兩個 SKILL.md 與三份 references 的文字變更以閱讀驗證，內容須含五值詞彙、列來源優先序、targets 驗證規則與時序門檻。
- 範圍界線：僅改兩個 skill 的 SKILL.md、implementation-workflow、verification-reporting 與 frontend 的 validate_implementation.py；不動 design-system-governance、storybook-product-prototype、production-data-integration 及任何 handoff 模板。

## Risks / Trade-offs

- [舊 IMPLEMENTATION_MAP 無第五段，升級後重跑稽核會失敗] → 稽核與 map 由同一次實作 pass 產生，跨版本重稽核本就代表 map 過期；`- source: none` 逃生口另外涵蓋舊 handoff 的新實作。
- [Evidence 多路徑逗號分隔在含逗號路徑上會誤切] → repo 相對路徑含逗號極罕見；規則寫明路徑不得含逗號，遇到時以引用單一目錄路徑替代。
- [列來源依賴 composition echo 品質，prototype 漏列元件則 map 也漏] → map 規則要求實作中發現 echo 未列的新元件時補列並標記來源為 discovered，稽核不區分來源。
- [前置解析增加一次文件往返成本] → 解析步驟重用 governance discovery 已讀過的元件清單，增量成本低於重建元件的浪費。
