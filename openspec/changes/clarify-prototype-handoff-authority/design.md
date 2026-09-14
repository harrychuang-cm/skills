## Context

本次沿用七份 handoff 文件、React／Vue 共用模板、DataSource seam、現有 validator 與 project installer。問題集中於同一條交付鏈的權威判定，不需要新增平台或後端服務。

## Goals / Non-Goals

**Goals / In scope:** Fake 與正式契約分離、可追溯決策與 review、清楚的 Remote Config 文字需求、完整導航與 motion 描述、內容漂移偵測、repo skill 交付。修改 producer、web／native consumer 及 data integration 的相關規則與測試。

**Non-Goals / Out of scope:** 不修改任何實際產品專案、不呼叫真實 API、不代訂業務規則或 Remote Config key、不建立動畫引擎、不自動發布雲端文件、不自動安裝到使用者全域目錄、不 commit／push／merge。本次只測試臨時專案內安裝。現有元件治理與 native 平台架構維持原範圍。

## Decisions

### Data Authority

保留 Data Spec 的 schema 小節與既有入口，加入唯一 Data Authority fenced JSON。Inspector 從既有 raw markdown 讀取同一 registry，不新增 metadata 鏡像。比起每份文件加 FAKE 警語，結構化紀錄能讓接收端分清用途與權威；比起拆成多份規格，單一入口較容易同步。

### Decision Review

confirmed 只適用有來源的特定決策；proposed、open 與 superseded 不得成為正式契約。產品 demo review 與資料契約確認獨立。Remote Config 以產品意圖、展示狀態、未定項目及 RD owner 交付，不要求 prototype 猜技術細節。

### Navigation Motion

每條進入可見 route 的導頁記錄導航、返回及 motion 意圖。none／platform-default 是明確選擇，custom 由文件 reference 解釋；不實作動畫引擎。缺漏只阻擋受影響行為，不能以 push 或單步返回填補。

### Artifact Integrity

沿用 manifest，新增完整載體 hash，而不是另建版本服務。文件 hash 只證明內容是否變更；語意 review 另記 reviewer、日期、範圍與關聯更新結果。重新產 manifest 不代表外部來源已核实。

### Project Skill Delivery

既有 installer 新增 opt-in record-usage，明確選取者表示本次使用，必要依賴另列 support／required。使用單一 dependencies registry、內容 hash 與受管 Markdown 區塊，避免重写整份 CLAUDE 或 AGENTS 文件。

## Implementation Contract

Data Authority registry 位於 Data Spec 的同名二級小節，只允許一個 JSON code block，形狀為 schemaVersion: 1、fixtures 陣列、contracts 陣列。每個 fixture record 包含 group、values（固定 fake）、schemaScope（ui-model 或 transport）、status（proposed／open／confirmed／superseded）、source、owner；可選 contractId 指向 contracts 的 id。contract record 包含 id、kind（api／analytics／remote-config／storage／static）、status、source、owner。source 為 null 或包含 reference、revision、confirmedBy、confirmedOn 的物件。confirmed record 必須有完整 source；ui-model confirmed 只授權 UI model。正式 transport 依據可來自 fixture 的 transport confirmed source，或獨立 api contract 的 confirmed source 所指向的正式 schema；後者允許 linked UI fixture 保持 ui-model/proposed，DTO 經 mapper 轉入 UI，不要求改寫 fixture。已知 response DTO 可先準備，未知 endpoint/auth 仍阻擋依賴它們的接線。fixture 的 owner 記錄需求方提供者；contract 的 owner 記錄裁示方。

validator 在一般閱讀缺 registry 時提示未確認，在 handoff-ready 時缺 registry 報錯；壞 JSON、錯誤 version／enum、空 owner、重複 id／group、不存在的 contractId、缺來源的 confirmed 一律報錯。handoff-ready 必須覆蓋全部 fixture groups，active fixture 不得為 superseded 或引用 superseded contract。Fake-only proposed／open 且 owner 明確可通過資料權威檢查，Real Data Contract 為空陣列合法。驗證器不核實外部文件的真偽。

共同 handoff-authority reference 規定 UI model／mock 與真實 transport DTO 的區別；三個 consumer 在本地入口也保留關鍵規則，避免 sibling reference 缺失時自行提升權威。Data Adapter Seams 記錄 fixture、UI model、interface、mock path、injection site、schema authority/source、integration status/owner。既有 injection registration 若位於 UI 入口檔，只替換依賴 binding 屬資料接線；不得改 rendering、UI 行為或導航，缺 seam 則回 assembly owner。正式 transport schema 與 UI fixture 不同時以 mapper 保持 UI 行為；若缺少業務語義才提出具體受影響決策。埋點規格未列 reason 時，不因 Builder 建議新增正式參數。

Review Status 在 handoff-ready 時必須有 confirmed、Confirmed by、Confirmed on、Reviewed demo、確認範圍；另有 Semantic Review 記錄 reviewer、日期、檢查範圍、結果。日期使用 YYYY-MM-DD，空白欄位不得借用下一列內容通過。review 必須檢查建議未升格、有效條款無作廢路徑、受影響的 Data／Handoff／Flow／Acceptance／fixtures／metadata／測試已同步。機器只檢查記錄完整，不宣稱完成內容裁示。未知正式 API 不阻擋無依賴的 UI assembly；未知導航目的與轉場阻擋該 flow 的完整交付。

Transition 新增 motion: none | platform-default | custom 與可選 motionRef。handoff-ready 對進入可見 route 的 transition 要求 motion、非 return 的 presentation 及 return 的 backBehavior；custom 必須有 FLOW_SPEC.md#anchor reference 且文件中有該 anchor。app 的全部非 return transition 維持 presentation 覆蓋但缺漏升為 error，不依賴 strict-style。一般 draft 仍可閱讀缺漏欄位。flow JSON 與 native skeleton 註解保留 motion 資訊；未確認導航留 unspecified，不推定值。

manifestSchemaVersion 升為 2，保留 docs 與 docsDigest；新增 artifacts（prototype 相對路徑至 sha256）及 artifactsDigest。範圍含 required docs、實際使用的 Flow／Data／Meta、fixtures JSON、存在的 docs/flow.json 與 docs/TOKENS.json，排除 manifest 本身。verify-manifest 比對內容及檔案集合；新增／移除／變更都回 non-zero。舊版 manifest 需重新 review／產生才有完整驗證能力。consumer 同時記錄 artifactsDigest（存在時）與 docsDigest，受影響資料在開始與結束時檢查。

installer record-usage 僅 project scope，必須明確 skill 清單，拒絕 all。scripts/skill-dependencies.json 宣告 frontend 必需 ds-governance，native 必需 ds-governance 及作為 support 的 frontend；prototype 既有 standalone fallback 保留，下一階段 data integration 不自動安裝。參數、來源依賴、destination、受管標記與不可攜 symlink 在寫入前檢查，錯誤即零寫入；dry-run 零寫入。docs/SKILL_USAGE.json upsert 保留先前紀錄，包含 source repo／commit（非 Git 時 null）、dirty 狀態、選取／依賴角色、内容 sha256 與相對安裝位置。使用原有檔案集合排除規則，source／installed hash 一致才記錄成功。CLAUDE.md／AGENTS.md 受管區塊使用相對連結，保留其餘 bytes，重跑不重複；不提交到 Git。另更新 README.md 與 docs/skills-usage.md 的 opt-in 使用方式。

驗證目標為既有 test_scaffold_validate.py 的 React／Vue scaffold 與 Inspector parity，加 Data Authority 正反例、motion coverage／export、carrier drift 與 malformed registry；installer 用 Node 內建測試在 tmp repo 驗證 dry-run、依賴、失敗零寫入、內容 hash、累積紀錄、managed blocks 與 clone 可攜性。完成後以獨立 agent 給 Fake-only、正式 DTO 與 UI model 不同、埋點建議、Remote Config 未決等原始案例檢查接收行為；skill frontmatter 與 Spectra artifacts 也需驗證。

## Risks / Trade-offs

- 舊 handoff 無分類 → draft 保持可讀，交付前補分類；不得自行填成 confirmed。
- 來源紀錄完整但內容錯誤 → 明確區分結構驗證與語意 review，確認原始來源與裁示仍由需求方／RD 負責。
- Inspector 有兩份副本 → 同步兩份 runtime，保留 byte-identical 測試。
- 技能與文件安裝目的地已有自訂內容 → record-usage 在任何寫入前檢查覆蓋需求與受管標記，保留既有非受管 bytes。

## Migration Plan

新 scaffold 直接產出 Fake UI schema 的 registry 與可填寫的 review／motion 契約。舊 prototype 可開啟檢視，正式 handoff 前由 owner 補來源與未決分類，完成關聯 review 後產生 v2 manifest。新安裝紀錄由 opt-in 開始，未使用旗標的既有 installer 行為不變。若需撤回，恢復本 change 的 allowlist 檔案與已生成交付快照的對應版本，不自動回復外部專案。
