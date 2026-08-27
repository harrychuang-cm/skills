## Context

component-coverage-install 是 cm-skills 裡的安裝器 skill：把 Storybook「Component Coverage Analyzer」工具頁（React UI、dev API vite plugin、check 腳本、配套 analyze/implement skills）複製進目標專案，並由 AI 產生專案專屬的 componentCatalog.ts 綁定。template 的檔案契約集中在 template/TEMPLATE_MANIFEST.json（目前 version 0.9.1，扁平的 verbatim/adaptable/generated 清單）。

ds-lab 專案另外長出了第二個工具頁 Component Timeline（Storybook 側欄 Tools/Component Timeline）：以 git 歷史推導每個元件的誕生日期，與 componentCatalog join 後依日期分組呈現、並掛 live story 預覽。它有三處 ds-lab 專屬耦合，通用化時必須拆掉：

1. build 腳本寫死元件都住在 src/components/<id> 資料夾。
2. 頁面 import ds-lab 的 componentPipelineStats（figma-extraction coordinator sqlite 快照）。
3. 文案來自 ds-lab 的 stories/_shared/copy 共用模組。

既有安裝專案（如 ds-lab）在 outputs/component-coverage/TEMPLATE_MANIFEST.json 留有安裝當時的 manifest 副本，更新流程靠它比對版本。

## Goals / Non-Goals

**Goals:**

- skill 改名為 storybook-tools-install，定位為「多個通用 Storybook Tools 頁面」的安裝器。
- template 依工具模組化：shared core ＋ per-tool 模組，未來新工具頁可獨立加入。
- 把 Component Timeline 通用化為第二個工具模組，任何符合 catalog 契約的 React + Vite Storybook 專案都能安裝。
- 更新流程能辨識既有安裝專案的舊版單工具 manifest 並平滑升級。

**Non-Goals:**

- 不動 ds-lab 等目標專案（同步依 rsync 慣例另開各專案自己的變更）。
- 不改 Component Coverage Analyzer 的任何行為、資料契約與 review 流程。
- 不遷移既有安裝專案的 outputs 資料（requests、reports 路徑全部維持原狀）。
- 不做互動式「勾選工具」UI — 安裝粒度只到 SKILL.md 流程層級的文字指定。
- 不把 ds-lab 的 pipeline stats 面板納入 template（它依賴 figma-extraction coordinator，非通用）。

## Decisions

### 決策 1：skill 整樹以 git mv 改名為 storybook-tools-install，不保留舊名

整個 component-coverage-install/ 目錄搬到 storybook-tools-install/，SKILL.md 的 frontmatter name、description 與觸發條件改寫為多工具安裝器；repo 內所有引用（README.md、docs/skills-usage.md、openspec/specs/component-coverage-review/spec.md 的路徑清單、componentCatalog.template.ts 註解）同步更新，openspec/changes/archive/ 底下的歷史文件不動。

替代方案：保留舊目錄放轉址說明 — 否決。cm-skills 是內部 repo，引用點已盤點完且都在本變更內更新，留殼只會讓 skill 清單出現兩個入口。

### 決策 2：維持單一 TEMPLATE_MANIFEST.json，改為 sharedCore 加 tools 兩層結構

manifest 仍是 template 根目錄的一個 JSON 檔，name 改為 storybook-tools、version 升為 0.10.0，結構改為：

- sharedCore：所有工具共用的檔案與契約 — componentCatalog.template.ts（generated）、check-component-catalog.mjs、catalog 的 pathContracts。
- tools.component-coverage 與 tools.component-timeline：各自的 files（verbatim/adaptable/generated）、installTargets、checks（該工具要接進 npm run check 的腳本清單）、pathContracts。coverage 工具的內容從現行扁平清單原樣搬入，檔案本體不改。

替代方案：每個工具一份獨立 manifest — 否決。安裝端要留副本比對版本，多檔會產生互相漂移的版本號；單檔一個 version 就能描述整套 template 的狀態。

### 決策 3：安裝粒度預設全裝，SKILL.md 流程支援指定工具子集

安裝流程預設把 tools 底下所有工具裝齊；使用者在指示中點名（例如只要 timeline）時，只複製 sharedCore 加該工具模組。更新流程以安裝端 manifest 副本記錄的已裝工具集合為準，只更新已裝的工具，並提示尚未安裝的工具可以補裝。

替代方案：一律全裝 — 否決。coverage 工具帶 dev API 與 outputs 目錄的侵入性明顯高於純靜態的 timeline，強迫綁售會讓只想要 timeline 的專案卻步。

### 決策 4：timeline 資料由 componentCatalog 的 componentPath 推導 git 首次 commit

通用版 build-component-timeline.mjs 不再列舉 src/components 目錄，改為：

1. 依 catalog 解析契約（id 為每筆 entry 第一個欄位、字串欄位單行）從 src/storybook/componentCatalog.ts 取出每筆 entry 的 id 與 componentPath。
2. 對每個 componentPath（資料夾或單檔皆可）跑 git log --diff-filter=A --reverse 取首次 commit 的日期、短 hash 與 subject。
3. 產出 src/storybook/componentTimeline.ts，資料形狀維持 ds-lab 現狀：{ id, firstSeen, commit, subject }，最新日期在前、同日期依 id 字母序；componentPath 尚未 commit 的 entry 記在檔案註解的 untracked 清單，不算失敗。

check-component-timeline.mjs 重新產生後做逐 byte 比對，不一致即失敗並在訊息中指示重跑 build:component-timeline npm script；timeline id 對不到 catalog entry 同樣失敗。

替代方案：沿用 src/components/<id> 資料夾慣例 — 否決。template 的 catalog 契約本來就以顯式 componentPath 描述元件位置（與 ds-lab 的推導慣例不同），寫死資料夾佈局會讓非此慣例的專案裝不了。

### 決策 5：timeline 頁面 self-contained，專案擴充走 timelineExtrasRegistry 插槽

ComponentTimeline.tsx 列為 verbatim：文案字串內建、不 import 任何 catalog 與 timeline 資料檔以外的專案模組。頁面頂部的專案自訂面板（ds-lab 的 pipeline stats 屬此類）改為從 adaptable 的 timelineExtrasRegistry.tsx 讀取：registry 預設回傳 null，頁面此時不渲染該區塊；專案要加料時只改 registry 檔，比照 coverage 工具的 compositionPreviewRegistry 模式。分頁上限（每頁 30 張卡、控制同時掛載的 story iframe 數）與 live story 預覽行為維持 ds-lab 現狀。

替代方案：把 pipeline stats 面板抽象成通用統計契約 — 否決。它的資料源是 figma-extraction coordinator sqlite，非通用；抽象一個只有一個消費者的契約是過度設計。

### 決策 6：安裝端 manifest 副本落點移至 outputs/storybook-tools，並支援舊落點升級

新安裝把 manifest 副本寫到 outputs/storybook-tools/TEMPLATE_MANIFEST.json，並記錄已安裝的工具集合。更新流程先讀新落點；讀不到時回退讀 outputs/component-coverage/TEMPLATE_MANIFEST.json，讀到 0.9.x 扁平結構即視為「已裝 component-coverage、未裝 timeline」，升級時寫入新落點並移除舊副本。coverage 工具自身的 pathContracts（apiPath、dataDir 等）全部不變，避免動到既有專案的 outputs 資料。

替代方案：manifest 副本留在原落點 — 否決。路徑名綁著單一工具，後續每加一個工具都會更難解釋；趁這次 BREAKING 改名一併搬走，成本最低。

## Implementation Contract

**行為：**

- 呼叫 storybook-tools-install skill 後，SKILL.md 引導完成安裝或更新；安裝結果是目標專案的 Storybook 側欄 Tools 分類下出現所選工具頁（Component Coverage Analyzer、Component Timeline），且對應 check 腳本接進目標專案的 npm run check 鏈。
- repo 內（openspec/changes/archive/ 除外）不再有 component-coverage-install 字串引用；skill 清單只剩 storybook-tools-install 一個安裝器入口。
- timeline 工具裝好後：跑 build:component-timeline npm script 產生 src/storybook/componentTimeline.ts；跑 check:component-timeline npm script 在資料檔過期或 id 對不到 catalog 時以非零碼結束，訊息指名重新產生的指令。

**介面／資料形狀：**

- TEMPLATE_MANIFEST.json：{ name: "storybook-tools", version: "0.10.0", sharedCore: { files, pathContracts }, tools: { "component-coverage": {...}, "component-timeline": {...} } }；每個工具物件含 files.verbatim / files.adaptable / files.generated、installTargets、checks、pathContracts。coverage 工具的 skillContentSha256 雜湊維持現值（skills 內容不變）。
- componentTimeline.ts 匯出 ComponentTimelineEntry 型別與 componentTimelineEntries 常數，欄位 id / firstSeen（ISO 日期）/ commit（短 hash）/ subject，排序為最新日期在前、同日依 id 字母序。
- timelineExtrasRegistry.tsx 匯出單一 getTimelineExtras（或等價具名匯出）供 ComponentTimeline.tsx 呼叫，預設實作回傳 null。

**失敗模式：**

- build 腳本在 componentPath 無 git 歷史時不失敗，將該 id 記入產出檔註解的 untracked 清單；在 catalog 檔缺失或解析不到任何 entry 時以非零碼結束並說明解析契約。
- check 腳本失敗訊息必須包含修復指令名稱（build:component-timeline），與 coverage 系列 check 腳本的訊息風格一致。
- 更新流程在新舊兩個落點都找不到 manifest 副本時，視為全新安裝而非報錯。

**驗收條件：**

- node --check 通過兩支新 .mjs 腳本；TEMPLATE_MANIFEST.json 可被 JSON.parse 且其中列出的每個 template 檔案路徑實際存在（以一次性驗證步驟確認）。
- 以 grep 確認 repo 內除 openspec/changes/archive/ 外無 component-coverage-install 殘留引用。
- coverage 工具模組搬入 manifest 新結構後，files 清單與 0.9.1 扁平清單逐項等價（無新增、無遺漏）。
- SKILL.md 的安裝、更新、驗證三段流程都同時涵蓋兩個工具，並寫明 timeline 需要目標專案具備完整（non-shallow）git 歷史的前置條件。

**範圍邊界：**

- In scope：cm-skills repo 內的改名、manifest 改版、timeline 模組新增、文件與 spec 路徑引用更新。
- Out of scope：任何目標專案的實際安裝或同步、coverage 工具行為調整、outputs 既有資料搬遷、ds-lab 端 pipeline stats 的後續接回（屬 ds-lab 自己的 adaptable 修改）。

## Risks / Trade-offs

- [既有安裝專案的更新流程認不得新 manifest 結構] → 決策 6 的雙落點回退邏輯寫進 SKILL.md 更新流程，0.9.x 扁平結構有明確的升級語意。
- [catalog 解析 regex 在目標專案格式漂移時抓不到 entry] → timeline 腳本沿用 check-component-catalog.mjs 已強制的解析契約（id 欄位在首位、字串欄位單行），解析不到時報錯並引用契約說明，不靜默產出空 timeline。
- [目標專案是 shallow clone，firstSeen 全部失真成 clone 日] → SKILL.md 前置條件明文要求完整 git 歷史，安裝流程檢查 git rev-parse --is-shallow-repository。
- [改名讓外部 workspace 設定、其他 repo 的舊路徑引用失效] → 本變更只能保證 cm-skills 內部一致；SKILL.md 更新段落提醒既有安裝專案下次更新時同步，ds-lab 的 workspace 額外目錄路徑由後續 ds-lab 變更處理。
- [單一 manifest 版本號無法表達「只更新了一個工具」] → 接受此 trade-off：version 描述整套 template，工具層的差異由安裝端記錄的已裝工具集合與逐檔比對承擔。

## Migration Plan

1. cm-skills 內一次完成：git mv 搬移 → manifest 改版 → timeline 模組加入 → 文件與 spec 引用更新，單一變更集提交。
2. 既有安裝專案（ds-lab 等）不受本變更影響；各自於下次執行 storybook-tools-install 更新流程時完成 manifest 落點搬遷與 timeline 補裝，或依 rsync 慣例另開變更同步。
3. 回滾策略：git revert 本變更集即可整體還原，無資料遷移需要回退。

## Open Questions

（無 — 全部決策已定案；timeline 之後的第三個工具要不要進 template，等有具體候選再開新變更。）
