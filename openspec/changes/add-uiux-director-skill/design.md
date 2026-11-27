## Context

`uiux-director/` 目前只有一份未進 git 的 `SKILL.md` 草稿：frontmatter 為 `name: design-director-avatar`，內容是三種模式加上去 AI 味禁止清單、柔性護欄、自我審查與寫死的占位 Tokens／元件清單。它有三個結構性問題：

1. 安裝腳本 `scripts/install_agent_skills.mjs` 在列舉 skill 時要求 frontmatter `name` 等於資料夾名稱，不符就整體失敗；目前裝任何 skill 都會報錯 `SKILL.md name "design-director-avatar" must match folder name "uiux-director".`
2. 「背景追蹤變更」與「匯出規格」只存在對話中，換 session 就消失，無法讓之後的 AI 依同一份方向設計與開發。
3. 去 AI 味與 token／元件治理和 repo 既有的 `anti-ai-style`、`ds-governance` 重疊，且以寫死清單取代從專案偵測。

使用者（PM 與設計主管）要的兩個情境：0→1 探索時逐步釐清 TA、產品目的、設計風格與呼吸感並寫成文件；以及 vibe coding 做到一半時，由「設計總監」健檢體驗，特別是不讓使用者迷路、不把重點功能藏太深，同時保留隨時增刪功能的彈性。

已確認的使用者決定：文件放目標專案 `product-design/`；文件語言第一次詢問、預設繁體中文；設計方向比較頁放第一階段，且要提供參考案例與 demo；design token 採用 Google Material Design 3 的方法（實作前補充）。

repo 內既有的 MD3 慣例：`design-system-extractor/references/token-architecture.md` 已使用 `--md-ref-*`／`--md-sys-*`／`--md-comp-*` 三層命名；使用者本機另裝有 `figma-m3-variables`（不在本 repo），以 `ref/`／`sys/`／`comp/` 管理 Figma Variables，並提供 M3 色彩角色、typescale、shape scale、spacing ladder、elevation 與 state layer 的詞彙。

## Goals / Non-Goals

**Goals:**

- 讓 PM 能用五個模式完成「釐清 → 定方向 → 做畫面 → 健檢 → 修正 → 增刪功能」的循環。
- 所有決定落在 `product-design/` 四份文件，之後任何 agent（Claude Code、Codex、Cursor）都能接手。
- 把「不迷路」與「功能深度」變成可逐項檢查、可量化的規則。
- 把「呼吸感」變成由 TA 推導、有具體數值的密度設定。
- 提供附真實參考案例與自家畫面 demo 的方向比較頁，讓 PM 用看的選。
- 修復安裝腳本因名稱不符而全部失敗的問題。
- 設計 token 決策以 MD3 三層方法記錄，命名與 extractor、figma-m3-variables 一致，讓設計方向可以直接接到 token 實作。

**Non-Goals:**

- 不做自動計算功能深度的腳本（從 routes 推算步數需依框架處理，列為第二階段）。
- 不重做 `anti-ai-style` 的 tell 目錄或掃描器，也不重做 `ds-governance` 的 token／元件閘門；只呼叫並在缺席時提供精簡底線。
- 不產生 Storybook 原型、PRD、UI Flow 或 Production Handoff；這些交給 `storybook-product-prototype`。
- 不串接真實資料、不修改資料流、state 管理、API 呼叫或事件邏輯。
- 不建立任何特定產品的 token 或元件清單。
- 不內附 tonal palette 產生腳本；palette 來源用 Material Theme Builder、`@material/material-color-utilities` 或設計師提供，並記錄來源。
- 不在 Token Gate 核准前寫入任何 token 檔；不把既有的非 MD3 token 系統遷移成 MD3。
- 不要求畫面使用 Material 元件庫或呈現 Google 產品外觀。

## Decisions

### 文件放在目標專案 product-design/ 四份文件

決定：在目標專案建立 `product-design/PRODUCT_BRIEF.md`、`DESIGN_DIRECTION.md`、`EXPERIENCE_MAP.md`、`DECISION_LOG.md`，另有 `direction-comparison.html` 與 `reviews/` 子資料夾。

理由：與 `design-system-extractor` 的 `design-system/` 並列、分工清楚——一個記「產品要什麼」，一個記「元件長怎樣」。拆成四份是因為讀者與更新頻率不同：brief 很少變、direction 偶爾變、experience map 每次增刪功能都變、log 只追加。

替代方案：單一 `PRODUCT_DESIGN.md`——檔案會快速膨脹，增刪功能時容易誤改方向段落；放進 `design-system/`——會與 extractor 的稽核腳本與檔案契約混在一起。

### 文件語言首次詢問並記錄在 DECISION_LOG

決定：第一次建立 `product-design/` 前詢問一次，選項順序為繁體中文（預設推薦）、English、其他；記錄為 `Document Language: zh-Hant (繁體中文)` 一行於 `DECISION_LOG.md` 開頭，存在且可辨識就不再問。

理由：使用者明確要求先問、預設中文。沿用 `design-system-extractor` 的 Report Language 模式（記錄格式、缺漏或無法辨識視為首次、切換要記錄且不重寫既有段落），讓 repo 內行為一致。預設不跟隨對話語言，因為使用者指定中文為預設。

### 標題沿用英文正規名稱加語言註記

決定：文件的章節標題與表頭固定英文正規名稱，非英文時在後面加全形括號註記（例如 `## Target Users（目標使用者）`），內文用文件語言。

理由：第二階段的步數檢查腳本與其他 agent 需要穩定的錨點；PM 仍能直接讀懂。與 extractor 的雙語標題規則一致。

替代方案：全中文標題——之後的腳本需要多語系對照表，且切換語言會讓錨點失效。

### 五個模式與預設路由

決定：`discover`、`build`、`review`、`fix`、`feature-change`。使用者明講的模式優先；沒講時依請求意圖、`PRODUCT_BRIEF.md` 是否存在、目標是否已有 UI 判定（見 spec 的範例表），並在第一句回覆說出所選模式。

理由：對應使用者的兩個情境（0→1 用 discover／build、做到一半用 review／fix）與共用的增刪功能需求。把 review 與 fix 分開，延續原草稿「先出健檢報告、PM 確認再動手」的精神，並讓 review 可以保證不改程式碼。

替代方案：保留原草稿的探索／收斂／健檢三模式——「收斂模式」實質是交接到設計系統與 Storybook，已有專責 skill，且不涵蓋 0→1 的 TA 釐清與增刪功能。

### 步數計算定義與預設門檻

決定：一步 = 從產品入口畫面起，一次導航動作（點擊、輕觸、開啟選單、選取列表項目），算到「任務主要操作出現的畫面」為止。核心任務 ≤2 步、次要功能 ≤3 步，可在 `EXPERIENCE_MAP.md` 覆寫並寫明原因。核心任務若只能從溢出選單（⋯／更多）、設定頁或僅 hover 才出現的控制項進入，不論步數一律不通過。

理由：「功能藏太深」需要可重複的計算方式，否則每次健檢結論不同。算到「主要操作出現」而非「任務完成」，是為了不把表單填寫步驟算進導航深度。門檻是常見的產品經驗值（估計值，非量測），因此允許覆寫；之後可用真實使用數據或易用性測試驗證後調整。

### 呼吸感用密度檔位與數值表達

決定：`DESIGN_DIRECTION.md` 用密度檔位（compact／regular／spacious）加六個數值表達呼吸感：間距階層、相關元素間距、區塊間距、內文字級與行高、內容最大寬度、首屏可見主要項目數；每個數值寫出服務的 TA 或任務理由。只用「高級、現代、乾淨」等外觀詞辯護的選擇一律退回重推。每個密度檔位同時寫成 MD3 用語：元件高度的 M3 density scale、spacing ladder 標籤（`gap-stack-xs`、`md` 等）、內文用的 typescale role，以及依 window size class 的版面邊距（寬度小於 600px 用 16px，其餘 24px，除非方向寫明理由）。

理由：`anti-ai-style` 把「虛胖留白」列為 AI 味；呼吸感若等於「多留白」會與它衝突。從 TA 與任務推導（例如年長投資人偏寬鬆、專業交易員偏緊湊），才能同時讓畫面有呼吸感又不像模板。六個數值可被之後的 AI 照做、也可被健檢核對。`DESIGN_DIRECTION.md` 的其他段落沿用 `anti-ai-style/references/decisions.md` 的八項決策格式，讓 anti-ai-style 直接把它當作已記錄的 Design Direction。

### 設計方向比較頁：參考案例加自家畫面 demo

決定：提供 `assets/direction-comparison.template.html`，單檔、無外部網路依賴、寬螢幕並排、窄螢幕堆疊。每個候選方向一欄：一句話摘要、密度數值、key color 與主要 MD3 sys 選擇（色彩角色、typescale role、shape scale、density scale）、至少兩個真實參考產品（名稱、來源連結、借什麼、不借什麼）、以及同一個產品畫面在該方向下的 demo。demo 優先用 PM 自己的畫面；0→1 沒有畫面時，用 brief 的核心任務畫面加擬真領域內容。參考案例只放連結，不嵌入第三方截圖，除非是 PM 提供的。每個候選是一組 `--md-sys-*` 值加上指向它們的 `--md-comp-*` 槽位（例如列表列距用哪一級間距、主按鈕用哪一級圓角——這類「選哪一級」的決定在 MD3 屬於 comp 層），套在該欄的外層 class 上；demo 的 markup 與樣式只用 `var(--md-sys-*)` 與 `var(--md-comp-*)`，同一份 markup 換一組值就呈現另一個方向。

理由：使用者要求給 PM reference 與 demo。呼吸感與風格用文字很難對齊，同一個畫面並排比較最直接；用 PM 自己的畫面才看得出對自家產品的影響。只放連結避免散布第三方素材。比較頁本身也必須遵守去 AI 味規則，否則示範會自相矛盾。

替代方案：產生 Figma frame——需要 Figma 權限且 PM 不一定會用；只用文字 moodboard——無法傳達密度差異。

### 設計 token 採用 Material Design 3 三層方法

決定：`DESIGN_DIRECTION.md` 新增 `Material Design 3 Token Plan` 段落，以 Ref → Sys → Comp 三層記錄 token 決策。程式碼命名 `--md-ref-*`／`--md-sys-*`／`--md-comp-*`（key color 的 palette 預設 `--md-ref-palette-{key}-{tone}`，其他顏色沿用 extractor 的 `--md-ref-color-{hue}-{tone}`；目標專案已有命名慣例時從之），Figma 命名 `ref/`／`sys/`／`comp/`。色彩：由證據選 key color → tonal palette → M3 sys color roles；M3 沒有的領域語意（例如台股紅漲綠跌）用具名 extension role（`--md-sys-color-price-rise`），不挪用 `error`。字級用 M3 typescale roles、圓角用 shape scale、層次用 surface-container 與 elevation level、互動用 state layer opacity、密度用 density scale 與 spacing ladder。細節寫在新的 `references/md3-token-method.md`。

理由：使用者指定 design token 採 MD3 方法。repo 的 extractor 已用 `--md-*` 三層命名，figma-m3-variables 用同一套詞彙管理 Figma，三者對齊後，PM 定下的方向可以直接交給 extractor、ds-governance 或設計師的 Figma 流程，不需要再翻譯一次。MD3 的角色詞彙（primary／surface-container／on-surface-variant 等）也比「主色、背景、次要文字」更精確，讓之後的 AI 不會各自發明名稱。

替代方案：自訂兩層 token（primitive + semantic）——與 repo 其他 skill 的三層命名不一致，交接時要重新對應。

### MD3 是方法不是外觀

決定：只採用 MD3 的 token 結構與角色詞彙，不採用它的預設外觀。M3 baseline 主色 `#6750A4` 與 Roboto 只有在證據或 PM 明確選擇時才使用，且記錄來源；不要求使用 Material 元件庫。

理由：`anti-ai-style` 把未經選擇的靛紫色系列為 AI 味，M3 baseline 紫色正好落在這一類；照單全收會讓所有產品長得像 Google 範例。把「方法」和「外觀」分開，產品仍能依 TA 有自己的樣子。

### 既有 token 系統優先對應，沒有時經 Token Gate 提議 MD3 起始 token

決定：目標專案已有非 MD3 token 系統時，在 `DESIGN_DIRECTION.md` 寫一張 MD3 角色 → 既有 token 的對應表，不另建 `--md-sys-*` 平行系統；完全沒有 token 系統時，build 需要 token 時依 `ds-governance` Token Gate 列出最小的 MD3 起始 sys token 清單與值，核准後才寫檔。build 與 fix 產出的 UI 只引用 sys 或 comp token，不直接用 ref token 或字面值；review 把字面值與直接引用 ref token 列為發現。

理由：`ds-governance` 的規則是沿用既有 token 關係、不建立平行系統；強制遷移既有專案到 MD3 會變成大型重構，超出 PM 這個 skill 的範圍。對應表讓 MD3 詞彙仍能用在既有專案上。

### 交由既有 skill 負責去 AI 味、token、原型

決定：視覺 AI 味判斷交給 `anti-ai-style`（build 用 prevent、review 用 review），token 與共用元件交給 `ds-governance`，Storybook 原型與交接文件交給 `storybook-product-prototype`（把 `product-design/` 文件帶入其 PRD 訪談）。在 `scripts/skill-dependencies.json` 登記 `anti-ai-style` 與 `ds-governance` 為 `support`。Figma Variables 的工作在 `figma-m3-variables` 可用時交給它；它不在本 repo，安裝腳本會因找不到依賴而失敗，所以不登記。skill 內只保留一份精簡底線（漸層／毛玻璃／卡片包卡片／裝飾 emoji／敷衍假資料／無故置中），在同伴 skill 缺席時使用並明說。刪除原草稿寫死的 Tokens 與元件清單。

理由：避免兩份規則各自演化而衝突；`anti-ai-style` 的規則以證據判斷、有掃描器，比原草稿的禁止清單完整。用 `support` 而非 `required`，因為缺席時仍可用底線完成工作。

### 用 managed block 讓後續 AI 讀取 product-design

決定：第一次建立 `product-design/` 後，在目標專案根目錄已存在的 `AGENTS.md` 與 `CLAUDE.md` 中寫入 `<!-- uiux-director:START -->` … `<!-- uiux-director:END -->` 區塊，內容是「做 UI 前先讀 `product-design/` 四份文件；有衝突時以已確認的條目為準」。重跑時取代區塊、不重複、不動區塊外內容。兩者都不存在時先問使用者要建哪一個。

理由：文件本身不會被自動讀取，需要入口。沿用 repo 既有的 managed block 慣例（安裝腳本的 `--record-usage` 也用標記區塊）。兩者都不存在時詢問，是因為不同 agent 讀不同檔案，且建立新的根目錄指引檔屬於使用者的決定。

### 健檢報告存檔到 product-design/reviews/

決定：review 報告寫入 `product-design/reviews/<YYYY-MM-DD>-review.md`，同時在對話給摘要。格式來自 `references/review-report-template.md`：P0／P1／P2 分級，每項寫「問題 → 對使用者的影響 → 建議 → 改動範圍（只動 UI／需工程確認）」。

理由：fix 模式要能引用 PM 勾選的項目，報告必須存在檔案裡；保留歷次報告也讓 PM 看得到改善軌跡。

### 步數檢查腳本延後到第二階段

決定：本 change 只定義步數計算規則與 `EXPERIENCE_MAP.md` 欄位，由 AI 依規則手動計算；自動從 routes 推算深度的腳本另開 change。

理由：路由結構依框架差異大（React Router、Next.js、Vue Router、原生 NavigationStack 等），一次做完會讓本 change 超出範圍。先讓欄位與規則穩定，之後腳本才有固定格式可讀。

## Implementation Contract

**行為：**

- 從 repo 根目錄執行 `node scripts/install_agent_skills.mjs --agent claude --scope user --skill uiux-director --dry-run` 會列出 `uiux-director` 的安裝目的地且不報錯；指定其他 skill 的 dry-run 也不再因 `uiux-director` 失敗。
- agent 載入 `uiux-director/SKILL.md` 後，能依 spec 的路由表判定模式並在第一句回覆說明；能依 references 執行五個模式；能從 `assets/` 的模板建立四份文件與比較頁。
- `scripts/skill-dependencies.json` 的 `skills` 物件多出 `uiux-director` 鍵，值為兩筆 `{ name, role: "support", reason }`：`anti-ai-style` 與 `ds-governance`。

**檔案契約（skill 內）：**

- `uiux-director/SKILL.md`：frontmatter `name: uiux-director` 與英文 description（含中文觸發詞）；本文包含角色與原則、載入與範圍、權威順序（已確認的 `product-design/` 條目 → 設計證據 → 本次對話中 PM 的指示 → 同伴 skill 規則 → 本 skill 底線）、模式路由、各模式流程摘要、文件語言流程、managed block 流程、同伴 skill 分工與底線、停止點、資源索引。目標長度 200 行以內（估計值，依 `anti-ai-style/SKILL.md` 的 144 行與 `ds-governance/SKILL.md` 的 109 行推估），細節放 references。
- `uiux-director/references/`：`discovery-interview.md`（訪談題庫與停止條件）、`product-research.md`（研究對象、來源要求、事實與推論的標示法）、`design-direction.md`（八項決策對應、密度推導表與 MD3 對應、比較頁流程）、`md3-token-method.md`（三層命名、key color 與 tonal palette、sys 色彩角色與 extension role、typescale、shape、surface 與 elevation、state layer、density scale 與 spacing ladder、window size class 邊距、baseline 外觀防護、既有 token 對應表、Token Gate 起始清單）、`experience-review.md`（迷路檢查清單、步數計算定義與範例、門檻與覆寫）、`feature-change.md`（新增與刪除的影響檢查）、`review-report-template.md`（報告結構）。
- `uiux-director/assets/`：`PRODUCT_BRIEF.template.md`、`DESIGN_DIRECTION.template.md`（含 `Material Design 3 Token Plan` 段落：key colors 與來源、palette 來源、sys 角色對應表、typescale／shape／elevation／state／density 選擇、既有 token 對應表）、`EXPERIENCE_MAP.template.md`、`DECISION_LOG.template.md`（開頭含 `Document Language:` 一行）、`direction-comparison.template.html`、`agent-pointer.snippet.md`（managed block 內容）。
- `uiux-director/README.md`（繁中，給 PM 看的使用說明與範例對話）、`uiux-director/agents/openai.yaml`（沿用 `anti-ai-style/agents/openai.yaml` 結構）。
- repo `README.md` 新增 `### uiux-director` 段落，說明用途、五個模式、與同伴 skill 的關係與安裝指令。

**失敗模式：**

- 沒有網路研究工具：明說未研究，研究段標示未驗證，不捏造。
- 同伴 skill 缺席：使用底線並在輸出中說明。
- 無 `AGENTS.md`／`CLAUDE.md`：先問再建。
- fix 遇到需改邏輯的項目：不套用，標示需工程確認。

**驗收：**

- 上述兩個 installer dry-run 指令成功輸出目的地。
- `node --test scripts/test_install_agent_skills.mjs` 全數通過。
- `SKILL.md` 與 references 內所有相對連結指向存在的檔案（以一段 node 指令列出並檢查）。
- 四份模板的標題皆為英文正規名稱，且含 spec 要求的欄位。
- `direction-comparison.template.html` 在離線狀態以瀏覽器開啟可正常顯示，寬度 1280px 並排、375px 堆疊，不含漸層、毛玻璃與外部資源請求；每個候選以一組 `--md-sys-*` 值與指向它們的 `--md-comp-*` 槽位呈現，demo markup 與樣式中沒有 hex 值與 `--md-ref-*` 引用；模板預設值不含 `#6750A4` 與 Roboto。
- 以新 session 實際演練：一次 `discover`（從一句話產品點子開始）與一次 `review`（以使用者指定的 vibe-coded 專案），確認模式判定、語言詢問、文件產出與「review 不改 UI 原始碼」符合 spec。

**範圍：**

- 範圍內：`uiux-director/` 全部內容、`scripts/skill-dependencies.json` 的新鍵、repo `README.md` 的新段落；MD3 token 方法的文件化規則。
- 範圍外：修改 `anti-ai-style`、`ds-governance`、`storybook-product-prototype`、`design-system-extractor`、`figma-m3-variables` 的內容；tonal palette 產生腳本；修改安裝腳本本身；步數自動檢查腳本；任何目標產品專案的實際修改（演練產生的檔案不提交到本 repo）。

## Risks / Trade-offs

- [PM 覺得訪談太長而放棄] → 一次一題、每題附建議答案可直接採用；review 模式最多問三題；允許 PM 跳過並把該項標成未確認。
- [AI 研究的參考產品不存在或連結錯誤] → 每個參考必須附可開啟的來源連結；無法驗證就標示未驗證；禁止捏造。
- [手動計算步數在不同 session 結果不一] → 在 references 給明確定義與範例表，報告必須列出實際計算路徑，讓人能複查。
- [比較頁 demo 讓 PM 誤以為已是正式設計] → 比較頁標明是方向示意、非最終畫面；正式畫面仍走 build 與設計系統。
- [與 anti-ai-style 的規則分歧] → 本 skill 只保留精簡底線，且同伴 skill 存在時一律以它為準。
- [MD3 baseline 外觀混進產品（紫色、Roboto、Material 範例版型）] → 模板預設值不含 baseline 值；`md3-token-method.md` 明列防護規則；review 交給 anti-ai-style 檢查預設色系。
- [M3 角色不足以表達領域語意] → 用具名 extension role，不挪用 `error` 等既有角色，並在對應表記錄理由。
- [既有專案的 token 與 MD3 角色對不上] → 只寫對應表、對不上的角色標未對應並列為開放問題，不強制遷移。
- [managed block 寫入使用者的根目錄指引檔造成困擾] → 只在既有檔案中寫入標記區塊、可重跑取代；不存在時先問。

## Migration Plan

- 原草稿未進 git，直接以新內容取代；原草稿中仍有價值的內容（探索不阻擋、健檢先報告、邏輯鎖定、柔性護欄門檻、狀態完整度）併入新版。
- 已安裝舊版的使用者：目前因名稱不符無法透過安裝腳本安裝，預期沒有既有安裝；若有手動複製的副本，以 `--force` 重裝。
- 回滾：刪除 `uiux-director/` 與 `scripts/skill-dependencies.json` 的 `uiux-director` 鍵即可，不影響其他 skill。

## Open Questions

- 實際演練 `review` 要用哪一個 vibe-coded 專案，需在 apply 最後一個任務前由使用者指定。
