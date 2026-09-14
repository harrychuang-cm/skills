## Context

本次由使用者直接授權遷移引用並優化既有 skill。工作起點只有 ds-governance 目錄為未追蹤內容。現行消費者分布於實作 skills、原型、coverage 受管模板與設計系統模板；歷史封存與本機 Claude 權限紀錄也保有舊名稱。

## Goals / Non-Goals

目標：專案內單一來源、可攜 skill 身分、遵守既有設計系統與已有授權、三 agent 安裝可驗證。
不在範圍：產品程式實作、歷史封存內容改寫、本機權限修改、全域 skills 覆寫、commit、push、品牌重新設計。

## Decisions

### 治理身分與平台中立規則

採 ds-governance 作為資料夾、frontmatter 與 prompt 名稱，不保留會競爭的舊名 alias。SKILL.md 承載必要流程與平台對應，principles.md 說明依專案取捨的原則。保留 Phase 0、Token Gate、Composition Gate、Token Layer Rules 名称與兩句繁中提示以維持 companion 可讀性；提示可翻譯，判斷不依賴字串觸發。新增 Codex UI metadata，但流程不依賴它、MCP 或某家 agent 的工具名稱。

### 現行引用與來源解析

更新全部非封存 skill、reference、模板、指南與三份相關現行規格。mandatory companion 必須能從 skill catalog、相鄰安裝或明確的 cm-skills checkout 定位；禁止默認載入機器上的舊名副本。原型保留既有 optional companion 加獨立 fallback。缺失治理只阻擋受影響 UI，可繼續唯讀盤點。

### 受管模板與可執行驗證

coverage implement prompt、checker 與 SHA-256 一起更新，模板 patch 版改為 0.10.2。checker 同時讀新版 tools.component-coverage 與舊版 flat manifest，保留缺失、雜湊漂移與內容契約失敗。三 agent 安裝均在暫存專案，逐檔比對原始來源。

## Implementation Contract

- 身分：ds-governance 的 name 與資料夾一致；現有安裝器對單一 skill 及 all 的 dry-run 成功。optional agents/openai.yaml 的 default_prompt 使用 $ds-governance；相對 reference 可從三份安裝中開啟。
- 治理：先依所選 target 與依賴盤點 token/theme、元件、排版、動態、localization、驗證方法與證據路徑。既有二層 token、不同命名、無 Storybook、SwiftUI 與 Compose 不觸發架構遷移。沒有證據不捏造 token 或重建元件。
- 授權：同一範圍已核准的新 token／shared component 沿用決策；籠統 feature 要求不等同新增共用設計系統授權。新缺口先提供具體選項再詢問，僅暫停受影響範圍。feature-local composition 不因函式拆分被當成新的 shared component。
- 風格：不再預設飽和色、pill、36–96px 字級、固定 stagger／breakpoint 或强制 ambient motion；依設計規範與平台能力驗證對比、focus、字級縮放及 reduce motion。沒有 localization/catalog 時記錄缺口與建立決策，不強制額外工具安裝。
- 遷移：現行引用使用 ds-governance；舊名只允許出現在歷史封存、本機既有設定與本次遷移說明。Native 平台章節與現行 spec 不再說 companion 僅懂 web。保留兩句繁中提示，但已有授權時不重問。
- 驗證：quick_validate 檢查 ds-governance；暫存專案對 claude/codex/cursor 安裝並逐檔比對；coverage checker 對新版與 flat manifest 通過，移除 companion 舊名替換、內容破壞及缺檔 fixture 都必須非零退出。無三個 agent 的實際互動 session 證據時只宣稱結構與安裝驗證。
- 邊界：不改歷史封存、不覆寫全域技能、不改既有產品檔案、不擴大 coverage runtime 行為；checker 只調整 manifest 解析及治理名稱。

## Risks / Trade-offs

- 舊全域副本仍存在：新流程明確指向新名及專案來源，安裝指南給精準來源與命令；本次不移除舊副本。
- 規則過度放寬：保留來源證據、實際 token 層級約束、受影響範圍 gate 與具名決策，仍禁止未授權 shared API 或 token 變更。
- 三 agent 行為非純靜態檢查可證明：回報清楚分開安裝與實際互動測試。

## 文件補充契約

- docs/skills-usage.md 提供完整定位、輸入與輸出、必要／條件式 companion 對照，並區分單獨 review 與搭配實作的提示。
- docs/skills-guide.html 使用既有旅程、目錄與口令 UI，新增治理旅程，目錄提供目標與設計來源說明，口令可複製並保留同範圍授權。
- docs/designer-guide-storybook-to-production.html 在路線、紅綠燈與名詞小抄說明 ds-governance；修正缺 token／component 必定重問及 token 強制三層的過度概括。治理是 UI 實作配套，原有設計審查、交接、資料串接責任不變。
- 驗證：三份文件的來源連結存在、無舊版外部安裝說法；兩份 HTML 的 inline JavaScript 語法通過，瀏覽器驗證新增旅程、目錄、口令及設計師路線／紅綠燈呈現與互動。
- 範圍：不安裝全域 skills、不修改產品程式、不操作另一個進行中的 change、不 commit／push／發佈網頁。
