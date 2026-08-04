## 1. 驗證 harness 建置

- [x] 1.1 建立可重複執行的模板驗證 harness：在 scratchpad 依安裝版面複製 template（src/、scripts/、outputs/component-coverage/TEMPLATE_MANIFEST.json、.agents 與 .claude skill 副本），由 componentCatalog.template.ts 產生 src/storybook/componentCatalog.ts，stub @storybook/react-vite 並安裝 react、react-dom、typescript；交付契約＝變更前基線下 tsc --noEmit 與 node scripts/check-component-catalog.mjs、node scripts/check-component-coverage-reports.mjs、node scripts/check-component-coverage-agent-skills.mjs、node scripts/check-component-coverage-preview-contract.mjs 全數通過，證明 harness 判定可信（驗證：上述指令在 harness 內全綠）。
- [x] 1.2 建立 SSR 冒煙渲染與 dev API 模擬驗證器：以 react-dom/server 渲染 BlockReviewPanel 與 CompositionPreview 的 fixture 標記檢查器，以及以 connect 風格假 req/res 呼叫 createComponentCoverageApiPlugin 中介層的 PUT review 模擬器；交付契約＝基線斷言（「開發者覆核」標題、既有決策按鈕、預覽槽渲染）通過（驗證：node 執行 harness 驗證腳本，斷言全數通過）。

## 2. 決策集合擴充（design 決策一：extend 與 reusable 決策集合擴充，五份鏡像同步）

- [x] 2.1 實作 Section-scoped review decision sets 與 use-existing overrides require a catalog component 的契約擴充：coverageTypes.ts 的 coverageReviewDecisionsBySection、vite-plugin.mjs 與 check-component-coverage-reports.mjs 的鏡像同步改為 missing→build-new|use-existing|skip、extend→extend|no-extend|use-existing|skip、reusable→approve|use-existing|skip；交付行為＝dev API 接受 extend+use-existing（含 overrideComponentId）與 reusable+skip、拒絕越區決策與缺 overrideComponentId 的 use-existing（HTTP 400）、確認閘門維持 reusable 不阻擋（驗證：harness dev API 模擬器對正負 fixture 斷言 200/400；check-component-coverage-reports.mjs 對含新決策組合的 fixture 通過、對 use-existing 缺 id／未知 id／extend 區塊用 approve 的負向 fixture 各回報對應錯誤；三份 JS 決策集合以比對腳本斷言完全一致）。
- [x] 2.2 同步兩份 companion skill 的決策契約條文：component-coverage-analyze SKILL.md 決策集合更新為擴充後集合；component-coverage-implement SKILL.md 工作表新增 extend＋use-existing 列（以 review.overrideComponentId 組合、不新增 variant）與 reusable＋skip 排除列，維持 skip 一律排除於 production composition 的語意；交付契約＝兩份文件與 coverageTypes.ts 集合逐字一致，且 .agents 與 .claude 副本 byte-identical（驗證：內容review比對決策集合；harness 內 diff .agents 與 .claude 副本無差異）。
- [x] 2.3 更新審核 UI 的決策呈現：extend 區塊顯示四顆決策按鈕、reusable 區塊顯示三顆（含「不實作」），sectionCopy 區塊提示文案同步改為列出新決策集合；交付行為＝各分類區塊的審核面板按鈕與 Section-scoped review decision sets 規格一致（驗證：SSR 冒煙渲染斷言各分類 fixture 的按鈕標籤集合；tsc --noEmit 通過）。

## 3. 不實作區塊收合（design 決策二：不實作區塊在組裝預覽收合為排除狀態（純渲染層））

- [x] 3.1 實作 Skipped blocks collapse in the preview and are excluded from implementation 的預覽行為：compositionPreviewModel／CompositionPreview 對 skipped 槽位改渲染收合排除列（「不實作」徽章＋區塊名稱、無元件本體、保留 grid 格位與 span、仍可點選重新覆核），composition JSON 契約不變；交付行為＝skip 區塊在組裝預覽為收合列且點擊後 Inspector 可重新覆核，分析明細分頁仍完整列出（驗證：SSR 冒煙渲染以 skip fixture 斷言收合列存在、元件本體不渲染、選取按鈕仍在；tsc --noEmit 通過）。
- [x] 3.2 更新收合狀態的樣式：新增排除列的 token-only 樣式並移除舊的 data-skipped 透明度調暗規則，收合列在暗色與亮色主題皆可讀；交付契約＝CSS 僅用 --cca-* token、無新硬編色彩（驗證：內容review確認無 hex 新增；grep 確認舊調暗規則已移除、新類別存在）。

## 4. 可搜尋元件選擇器（design 決策三：改用現有元件選擇器改為 inline 可搜尋清單（候選優先、分類分組））

- [x] 4.1 實作 Searchable component picker 的過濾與分組純函式（自 ReportView.tsx 匯出供驗證）：不分大小寫比對 name／id／category／keywords，回傳「分析候選優先段＋其餘依 category 分組段」結構；交付契約＝過濾行為符合規格 Example: filter fields 表（BUTTON 命中 name、按鈕 命中 keyword、button 不命中 stat-card）（驗證：node 單元驗證腳本以規格表列資料斷言）。
- [x] 4.2 實作選擇器 UI：搜尋輸入框＋inline 可捲動選項清單取代原生 select，候選段標示、分類分組、ArrowUp/ArrowDown/Enter/Escape 鍵盤操作、無結果空狀態「沒有符合的元件」、僅能自清單選取（無自由輸入提交路徑）；選取即觸發既有 draft-override 試用預覽事件流，儲存閘門維持未選元件即停用；交付行為＝use-existing overrides require a catalog component 的 UI 層守護與試用預覽不退化（驗證：SSR 冒煙渲染斷言搜尋框、候選段、空狀態標記；tsc --noEmit；內容review確認 onDraftOverrideChange 事件流與 canSave 閘門保留）。
- [x] 4.3 新增選擇器樣式：inline 清單、分組標題、選取態與自訂清單項目的 focus-visible 樣式（全域 focus ring 不涵蓋 ARIA role 清單項目），全部使用 --cca-* token 並符合 filled/tonal/ghost 動作層級（不新增第二個 filled 動作）；交付契約＝選擇器在 Inspector 窄欄（270–320px）不裁切、不溢出（驗證：內容review樣式規則；grep 確認新類別齊備）。

## 5. 審核面板漸進揭露（design 決策四：審核面板漸進揭露）

- [x] 5.1 實作 Progressive disclosure of the review form：未選決策時僅渲染面板標題與決策按鈕；選了決策後才渲染備註欄與儲存／取消動作；use-existing 才渲染選擇器；已儲存覆核的摘要呈現不變；交付行為＝初始表單只有決策按鈕（驗證：SSR 冒煙渲染斷言未選決策 fixture 無備註欄與儲存鈕、選了決策的 fixture 有；tsc --noEmit 通過）。

## 6. 發布契約同步（design 決策五：檢查腳本、manifest 版本與遷移註記同步）

- [x] 6.1 更新 check-component-coverage-preview-contract.mjs 守護字串與 stories 文件描述：移除因重構消失的字面字串、新增選擇器搜尋框、候選段、收合排除列的新守護字串；ComponentCoverageAnalyzer.stories.tsx 的 docs 描述補上可搜尋選擇器與 skip 收合行為（保留既有必查句）；交付契約＝守護清單與出貨 UI 原始碼一致（驗證：harness 內 node scripts/check-component-coverage-preview-contract.mjs 通過；故意改壞一字串可失敗以證明守護有效）。
- [x] 6.2 TEMPLATE_MANIFEST.json 版本 0.7.1 → 0.8.0 並重算兩份 SKILL.md 的 skillContentSha256（CRLF→LF 正規化後 SHA-256）；交付契約＝安裝端 skill 雜湊驗證通過（驗證：harness 內 node scripts/check-component-coverage-agent-skills.mjs 通過）。
- [x] 6.3 component-coverage-install/SKILL.md 追加 0.7.x → 0.8.0 遷移註記：決策集合擴充（extend+use-existing、reusable+skip）、skip 預覽收合、可搜尋選擇器、漸進揭露、既有報告契約相容無資料遷移、CSS adaptable 檔需在新基線重套 accent／preview-bg／theme selector 綁定；交付契約＝遷移段落沿用既有版本註記格式且與實際變更一致（驗證：內容review對照 What Changes 與實際 diff）。
- [x] 6.4 執行 Template release contract synchronization 的完整驗收：harness 內 tsc --noEmit、四支 check scripts、dev API 模擬器正負案例、SSR 冒煙渲染、選擇器純函式驗證全數通過；交付契約＝規格全部 Scenario 有對應通過的驗證證據（驗證：一次性執行 harness 驗證套件並記錄輸出）。
