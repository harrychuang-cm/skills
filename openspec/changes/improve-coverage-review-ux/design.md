## Context

Component Coverage Analyzer 是 component-coverage-install skill 安裝到目標專案的 Storybook 工具：開發者提交 UI 圖／PRD，AI agent 依元件目錄產出覆蓋報告，開發者逐區塊覆核後交接實作。覆核決策契約的單一真實來源是 component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts 的 coverageReviewDecisionsBySection，並被四處鏡像：dev API（component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs）、報告檢查腳本（component-coverage-install/template/scripts/check-component-coverage-reports.mjs）、analyze 與 implement 兩份 SKILL.md。現況限制：

- extend 分類只允許「同意擴充／不需擴充／不實作」，沒有「改用現有元件」；reusable 分類不能標「不實作」。AI 判斷錯誤時審核者無法完整推翻。
- 「改用現有元件」選擇器是列出全目錄的原生 select（僅顯示 name 與 id），目錄大時難以尋找；分析器已在 block.matches 提供的候選也沒有被優先呈現。
- 「不實作」區塊在 implement skill 的工作清單已被排除（skip removes the node from production composition），但組裝預覽只以透明度 0.52 調暗，仍完整渲染元件，審核者難以辨識「這塊不會做」。
- 展開的報告卡片與組裝畫布皆有 overflow hidden，浮動式下拉選單會被裁切。
- preview-contract 檢查腳本以字面子字串 grep 五個檔案，UI 改動必須同步更新其守護字串清單。
- 兩份 skill 檔案受 TEMPLATE_MANIFEST.json 的 SHA-256 鎖定；任何 skill 內容改動必須重算雜湊。

## Goals / Non-Goals

**Goals:**

- 審核者在任何區塊分類都能改選現有元件（use-existing），reusable 區塊也能標記不實作（skip）。
- skip 區塊在組裝預覽收合為排除狀態，同時保留重新覆核入口；實作端維持既有的排除行為。
- 「改用現有元件」提供可搜尋、候選優先、分類分組的選擇體驗。
- 審核面板初始狀態更輕量（漸進揭露）。
- 全部契約鏡像、檢查腳本、manifest 版本與遷移註記在同一變更內同步，安裝驗證流程全數通過。

**Non-Goals:**

- 不改報告 JSON 與 composition 的資料契約（composition 仍必須引用每個區塊恰一次；不做資料遷移）。
- 不改 summary 統計規則（deriveCoverageSummary 仍依分類計數，不受覆核決策影響）。
- 不改元件目錄 schema（check-component-catalog.mjs 的 regex 解析契約不動）。
- 不新增 template 檔案（避免更動安裝檔案清單契約），選擇器實作於 ReportView.tsx 內。
- 不動 IntakeForm、請求管線、分析提示詞產生器與 Storybook 接線方式。

## Decisions

### 決策一：extend 與 reusable 決策集合擴充，五份鏡像同步

coverageReviewDecisionsBySection 改為：missing 維持 build-new｜use-existing｜skip；extend 增為 extend｜no-extend｜use-existing｜skip；reusable 增為 approve｜use-existing｜skip。理由：審核的核心原則是「AI 可能錯，審核者永遠可以改用現有元件或不實作」。同步對象：coverageTypes.ts（來源）、vite-plugin.mjs 的 reviewDecisionsBySection、check-component-coverage-reports.mjs 的 reviewDecisionsBySection、analyze SKILL.md 的決策集合條文、implement SKILL.md 的決策工作表（新增 extend＋use-existing 列：以 overrideComponentId 組合、不做 variant；reusable＋skip 沿用既有 skip 排除語意）。同時更新 ReportView 的 section 提示文案。替代方案（拒絕）：改為所有分類共用同一決策集合——會讓 missing 區塊出現無意義的「同意擴充」，且喪失分區驗證能力。確認閘門規則不變：reusable 區塊未覆核不阻擋確認。

### 決策二：不實作區塊在組裝預覽收合為排除狀態（純渲染層）

skip 決策的區塊在組裝預覽不再渲染元件本體，改渲染一列緊湊的排除標示（顯示「不實作」徽章與區塊名稱），維持原 grid 格位與 span、仍可點選以在 Inspector 重新覆核。移除既有的透明度調暗規則。理由：審核者要一眼看出「這塊不會做」，同時「消失」必須可逆——完全隱藏會失去預覽模式下唯一的重新覆核入口。替代方案（拒絕）：(a) 完全隱藏＋「顯示已排除」開關——多一個控制項且入口隱蔽；(b) 允許 composition JSON 省略 skip 節點——破壞「每區塊引用恰一次」的資料契約，需要驗證器與既有報告遷移。分析明細分頁維持完整列出（含「不實作」chip），作為第二個重新覆核入口。

### 決策三：改用現有元件選擇器改為 inline 可搜尋清單（候選優先、分類分組）

原生 select 改為：搜尋輸入框＋文件流內（inline）的可捲動選項清單（非浮動 popover）。搜尋以不分大小寫比對目錄項目的 name、id、category、keywords。清單分兩段：首段「分析候選」列出該區塊 block.matches 的元件（分析器已判定相關，最常見的正確答案）；次段「全部元件」依 category 分組列出其餘項目。僅能點選清單項目（不接受自由輸入），維持 overrideComponentId 必為目錄成員的保證。選取後立即觸發既有 draft-override 即時試用預覽事件流，儲存閘門維持「未選元件不能儲存」。鍵盤支援：上下鍵移動、Enter 選取、Escape 清除搜尋，自訂清單項目補上 focus-visible 樣式（全域 focus ring 只涵蓋原生元素）。理由：inline 清單完全避開報告卡片與畫布的 overflow hidden 裁切與 z-index 疊層問題，且在 Inspector 的 270–320px 窄欄可用。替代方案（拒絕）：(a) portal 浮動 popover——需要 portal 容器與疊層管理，複雜度高；(b) datalist／自由文字輸入——無法保證目錄成員資格，會把驗證壓力推給檢查腳本。

### 決策四：審核面板漸進揭露

未選任何決策時，面板只顯示標題與決策按鈕列；選了決策後才顯示備註欄與儲存／取消動作；選了 use-existing 才顯示元件選擇器（既有行為）。已儲存的覆核摘要顯示不變。理由：初始視覺負擔降到「一組按鈕」，決策優先；備註與儲存是決策後的次要動作。替代方案（拒絕）：整卡收合（accordion）——會把「待覆核」狀態也藏起來，違背覆核進度可視性。

### 決策五：檢查腳本、manifest 版本與遷移註記同步

check-component-coverage-preview-contract.mjs 的守護字串清單隨新 UI 更新：移除因重構消失的字串、新增選擇器搜尋輸入、候選段標示、skip 收合標示等新守護字串。TEMPLATE_MANIFEST.json 版本 0.7.1 → 0.8.0；兩份 SKILL.md 重算 CRLF→LF 正規化後的 SHA-256。component-coverage-install/SKILL.md 追加 0.7.x → 0.8.0 遷移段落（決策集合擴充、skip 收合、可搜尋選擇器、漸進揭露；既有報告契約相容、無資料遷移；CSS 為 adaptable 檔，更新時需在新基線上重套目標專案的 accent／preview-bg／theme selector 綁定）。理由：這些是本 skill 既定的發布不變量，漏一項安裝驗證即失敗。

## Implementation Contract

**可觀察行為：**

1. 覆核一個 extend 區塊時，決策按鈕為「同意擴充／不需擴充／改用現有元件／不實作」四項；覆核 reusable 區塊時為「確認可用／改用現有元件／不實作」三項；missing 區塊維持「同意新建／改用現有元件／不實作」。
2. 任何分類選「改用現有元件」→ 出現搜尋輸入框與 inline 選項清單；輸入關鍵字後清單即時過濾（比對 name／id／category／keywords，不分大小寫）；該區塊的分析候選顯示在清單首段；點選項目後組裝預覽立即以試用（draft-override）方式顯示該元件；未選元件時儲存按鈕維持停用；儲存後 review.overrideComponentId 寫入報告，預覽槽渲染改用的元件。
3. 已儲存「不實作」的區塊在組裝預覽渲染為收合的排除列（含「不實作」徽章與區塊名稱），不渲染元件預覽，保留原 grid 格位；點擊排除列仍可選取該區塊並在 Inspector 重新覆核；分析明細分頁仍完整列出該區塊。
4. 審核面板未選決策時僅顯示決策按鈕；選了決策後出現備註欄與儲存動作。
5. dev API 接受 extend＋use-existing 與 reusable＋skip 的覆核儲存；「use-existing 但缺 overrideComponentId」仍被拒（HTTP 400）；確認閘門規則不變（extend／missing 區塊全數有決策才能 confirmed，reusable 不阻擋）。
6. 檢查腳本對含新決策組合的報告通過；對「use-existing 指向不存在目錄 id」的報告仍報錯。

**介面／資料形狀：** CoverageBlockReview 形狀不變（decision、note?、overrideComponentId?、reviewedAt）；coverageReviewDecisionsBySection 為唯一擴充點；CoverageReport 與 composition JSON 形狀不變；覆核提交仍為整份 reviews map 的 PUT（省略的區塊視為刪除覆核）。

**失敗模式：** use-existing 缺 overrideComponentId → dev API 400、檢查腳本報錯、UI 儲存鈕停用（三層一致）；overrideComponentId 不在目錄 → 檢查腳本報錯、預覽槽顯示既有的「找不到元件目錄項目」不可用狀態；搜尋無結果 → 清單顯示「沒有符合的元件」空狀態，儲存維持停用。

**驗收方式：** 在 scratchpad 建立驗證 harness（複製 template、以 componentCatalog.template.ts 產生測試目錄、stub Storybook 匯入）後：TypeScript 全檔 tsc --noEmit 通過；四支檢查腳本以涵蓋新決策組合的 fixture 報告執行通過；以 Node 直接呼叫 vite-plugin 的覆核更新函式驗證新決策接受與確認閘門；負向 fixture（use-existing 缺 id、未知 id、extend 區塊用 approve）確認仍被拒。

**範圍邊界：** 只動 proposal Impact 列出的 template 檔案與 installer SKILL.md；不動元件目錄 schema、報告資料契約、IntakeForm、請求管線與 index.ts 匯出面。

## Risks / Trade-offs

- [preview-contract 檢查腳本與新 UI 脫鉤，安裝驗證誤報] → 同一任務內更新守護字串清單，並在 harness 實際執行該腳本確認通過。
- [skip 收合後，只用預覽模式的審核者找不到被排除的區塊] → 排除列仍佔原格位且可點選；分析明細分頁完整列出；Inspector 重新覆核流程不變。
- [自訂清單元件的可及性退化（原生 select 免費取得鍵盤與焦點行為）] → 明確實作上下鍵／Enter／Escape、aria-selected 與 focus-visible 樣式；驗收含鍵盤操作檢查。
- [reusable 區塊新增 skip 可能被誤解為影響確認閘門] → 契約與 spec 明文維持「reusable 不阻擋確認」；implement SKILL.md 明文 reusable＋skip 一樣排除。
- [兩份 SKILL.md 雜湊漏更新，安裝端 agent-skills 檢查全數失敗] → 遷移任務內含重算與 harness 驗證步驟。
- [ReportView.tsx 單檔繼續變大] → 接受此 trade-off（不新增檔案是既定 Non-Goal，避免動安裝清單契約）；選擇器以獨立元件函式實作於同檔內，維持可讀性。
