## 1. Frontend skill 前置門檻與 map 合約

- [x] 1.1 在 frontend-product-implementation/SKILL.md 的 First Actions 中、governance 載入步驟之後與實作步驟之前，加入建立 Component Reuse Map 的明確步驟，落實 spec 的「Pre-implementation component resolution gate」：未解析列必須先觸發 Composition Gate 或 Token Gate 提問才能寫 UI 程式碼（依設計決策「時序門檻寫入 SKILL 的 First Actions 與 workflow gate」）。驗證：內容審閱確認步驟位置正確、載明未解析列的提問義務與完成時不得殘留非終態列。
- [x] 1.2 改寫 frontend-product-implementation/references/implementation-workflow.md 的 Design-System Governance Gate 段落，使其產出即為 Component Reuse Map，並落實 spec 的「Component map row source」：列來源優先序為 Per-screen composition echo、UI_SPEC.md 每路由組成、最後 `- source: none` 逃生口；Scope A 路由元件不入列；實作中發現的元件以 discovered 補列（依設計決策「列來源以 handoff 組成回聲為準並允許 source none 逃生口」）。驗證：內容審閱確認三層優先序、Scope A 排除與 discovered 規則皆有明文且與 spec 一致。
- [x] 1.3 在同一 gate 段落寫入 spec 的「Resolution vocabulary」五值終態定義（reused、composed、extended、created、deferred，extended/created 須先經核准）與「Targets metadata as verified seed」規則：targets 指名的 production 元件須經存在性驗證後才可作為 Evidence，顯式 null 預示 created 路徑仍需核准（依設計決策「解析詞彙五值終態」與「targets 欄位作為候選種子且需存在性驗證」）。驗證：內容審閱確認五值定義與 targets 驗證規則完整、與兩份 spec 的措辭不衝突。
- [x] 1.4 更新 frontend-product-implementation/references/verification-reporting.md：Implementation Map File 段由四段合約改為五段，新增 `## Component Map` 的表格形狀（欄位 Handoff component、Resolution、Production component、Evidence、Notes，Evidence 逗號分隔 repo 相對路徑）與選配 `- source:` 前導行，落實修改後的「Implementation map contract」；並將 Final Response Contract 的元件對應報告改為引用 map 段落，落實「Final response references the map」（依設計決策「第五段 Component Map 的表格形狀與稽核規則」）。驗證：內容審閱確認五段清單、欄位名稱、`- source: none` 規則與報告引用規則皆載明。

## 2. Native skill 繼承

- [x] 2.1 在 native-product-implementation/SKILL.md 的 Inherited Shared Contracts 清單加入 Component Map 合約條目（同段名、同表格欄位、同五值詞彙、同稽核），並在 First Actions 加入與 frontend 對應的 map 建立步驟，落實 spec 的「Native inheritance of the component map contract」（依設計決策「native 以 Inherited Shared Contracts 繼承並在原生 gate 落實」）。驗證：內容審閱確認條目載明四個共享面向且 First Actions 時序與 frontend 一致。
- [x] 2.2 更新 native-product-implementation/references/implementation-workflow.md 的 Design-System Governance Gate 與 references/verification-reporting.md：map 解析對照 Repo Discovery 找到的原生元件來源，Evidence 使用原生模組（Swift package、Gradle module）內的 repo 相對路徑，最終回報引用 map 段落而非另列清單。驗證：內容審閱確認原生證據路徑規則與報告引用規則，且未複製 frontend 的整段規則本文。

## 3. 稽核 script

- [x] 3.1 擴充 frontend-product-implementation/scripts/validate_implementation.py，落實修改後的「Machine audit of the implementation map」：檢查 `## Component Map` 段存在；`- source: none` 且無表格列時跳過逐列檢查；每列 Resolution 屬於五值集合；reused、composed、extended、created 列的每個逗號分隔 Evidence 路徑存在於 production root 之下；created 與 deferred 列的 Notes 非空。每個違規以 Handoff component 為主體列出，任何失敗以非零碼結束，乾淨執行 exit 0。驗證：任務 3.2 的煙霧測試全數通過。
- [x] 3.2 在 scratchpad 建立臨時 IMPLEMENTATION_MAP fixture，對五種情境執行 python3 frontend-product-implementation/scripts/validate_implementation.py 驗證行為：缺 Component Map 段（非零）、非法 Resolution 值如 ported（非零且訊息含該列主體）、reused 列 Evidence 路徑不存在（非零）、`- source: none` 無列（exit 0）、完整五值合法 map（exit 0）。驗證：逐情境記錄實際 exit code 與輸出訊息，fixture 不進入 repo。

## 4. 一致性驗證

- [x] 4.1 交叉檢查兩個 skill 的 SKILL.md、implementation-workflow、verification-reporting 與稽核 script 使用的段落名 `## Component Map`、表格欄位名與五值詞彙完全一致，且變更清單僅含 proposal Impact 所列七個檔案（未動 design-system-governance、storybook-product-prototype、production-data-integration）。驗證：以 grep 比對各檔的段名、欄位名與五值詞彙一致，並以 git status 確認變更檔案集合與 Impact 相符。
