## Context

pipeline-board 與 portfolio-dashboard 兩個 capability 已歸檔上線。現行兩個渲染腳本產出的 HTML 為文件流排版:標題、段落、清單、表格由上而下,視覺上是「報告」而非「平台」。設計師實測後回饋希望更接近軟體介面、有 Dashboard 平台感、且流程要畫成 flow 圖。已與使用者確認方向:深色操作台視覺 + 水平流程圖。

兩個渲染器都有寫死於程式的自足性守衛:完成的標記逐位元組掃描,禁止 http(s) URL、src 屬性、@import、fetch、script 元素、link 元素、CSS url() 引用與 iframe。兩個檢查器以真實腳本跑暫存裝置,並斷言多個狀態標籤字串(尚未開始、還沒有任何來源、沒有任何執行紀錄、已驗證、已銜接、可能已停止、未執行 2 項、流程健康・全部已驗證、卡在未銜接的交接、有一段交接已過期、需要人工確認、missing-project-root 等)。

## Goals / Non-Goals

**Goals:**

- 兩個 HTML 從文件流改為 app shell:左側欄 + 頂欄 + 主面板,固定深色操作台視覺,讓工具讀起來是軟體不是網頁文件。
- 單專案流程板的主畫布是一張水平流程圖:來源 → 階段由左至右,連線依狀態上色,一眼看出流程走到哪、斷在哪。
- 所有既有保證原封不動:單一自足檔案、無外部資源、無 script、淨化 allowlist、無執行入口、無進度動畫、快照誠實標示。
- 兩個檢查器既有斷言全數維持綠燈,各加一條新版面標記斷言。

**Non-Goals:**

- 不引入任何 JavaScript;互動僅用純 HTML/CSS(錨點與 :target)。
- 不做淺色主題或主題切換;螢幕上固定深色,僅列印媒體轉淺色。
- 不做拖拉、縮放、平移或任何編排能力;流程圖是靜態呈現。
- 不用 @keyframes 與 transition;不新增任何暗示進行中的動態元素。
- 不引入外部字型、圖示集或圖片;圖形一律內嵌 SVG 或純 CSS。
- 不修改建置腳本、狀態物件 schema、SKILL.md、references 文件與 portfolio 聚合邏輯。
- 不更動任何既有狀態標籤字串與淨化 allowlist 欄位集合。

## Decisions

### 固定深色操作台主題，列印媒體轉淺色

螢幕上只有一種主題:深色操作台(深色底、高密度面板、狀態燈以既有四色調 ok/warn/stop/idle 提亮)。移除現行「淺色預設 + prefers-color-scheme 深色覆寫」的雙主題,因為操作台的產品識別要求單一視覺;@media print 轉淺色以保紙本可讀。替代方案是保留雙主題,拒絕:兩套密度與對比調校成本加倍,且與「軟體介面」的定位衝突。

### App shell 佈局：側欄、頂欄、主面板

兩個 HTML 共用同一佈局骨架:根容器 class 為 app-shell,含固定左側欄(sidebar)、頂欄(topbar)與可捲動主面板區(main panels)。流程板側欄放區塊導覽(流程圖、來源、各階段 inspector 錨點)與狀態圖例;頂欄放專案名與快照時間。儀表板側欄放專案清單(名稱 + 依注意事項 tone 的狀態點,錨點跳至對應卡片)與圖例;頂欄放組合名、快照時間、可讀與失敗計數。窄螢幕(max-width 900px)側欄收合為頂部區塊。

### 水平流程圖以欄位網格排節點、內嵌 SVG 疊層畫連線

流程圖容器 class 為 flow-canvas。節點以 CSS grid 依欄位排列:第 0 欄是來源(僅證據成立者,含全部不成立時的空狀態節點),之後每個階段一欄。連線畫在一個內嵌 SVG 疊層上,座標由欄/列索引與固定格寬高在渲染時算出(viewBox 對應網格邏輯尺寸,隨容器縮放),不需量測 DOM。連線顏色與線型依狀態:已銜接=綠實線、未銜接=紅虛線、已過期=橘虛線;跨欄連線(如萃取直達元件)走下方偏移車道避免與相鄰連線重疊。箭頭以明確的 polygon 頂點繪製,不使用 SVG marker,因為 marker 引用語法是 url(#id),會誤觸自足性掃描既有的 CSS url() 禁令,而掃描規則凍結不改。

### 節點詳情以錨點與 :target 高亮的 inspector 面板呈現

流程圖節點本體是錨點連結,指向下方 inspector 區的對應階段面板;面板永遠渲染(內容與現行版本等價:已產出的檔案、還沒有的檔案、待決數、執行紀錄),被 :target 命中時以邊框高亮。不採 details/summary 摺疊,因為展開會推擠流程圖版面;不採 JavaScript,因為 script 元素被自足性掃描禁止且該守衛不改。

### 狀態標籤字串凍結以保檢查器綠燈

兩個渲染器的所有標籤常數表(階段狀態、連線狀態、執行階段、注意事項、healthy 變體、錯誤卡字樣)逐字保留。重新排版只改結構與樣式,不改語意字串;既有檢查器的全部字串斷言因此不需修改即維持綠燈。

### 檢查器新增 app shell 與流程圖標記斷言

pipeline-board 檢查器新增斷言:渲染輸出包含 app-shell 標記與 flow-canvas 內的內嵌 svg 元素。portfolio-dashboard 檢查器新增斷言:渲染輸出包含 app-shell 標記與側欄專案清單標記。

一條既有斷言需要重新定界:現行「錯誤卡片不得含連結」是以整頁 a 元素總數等於成功專案數實作的;側欄專案清單的頁內錨點會使總數改變。斷言意圖不變,但實作改為只計數指向板檔(.html 結尾 href)的連結等於成功專案數,並確認錯誤卡片容器內不含任何 a 元素。頁內錨點(#開頭 href)不屬於「連結到板檔」,不受該 requirement 約束。其餘斷言逐字不動。

## Implementation Contract

### 行為

流程板開啟後,首屏是深色操作台:左側欄有導覽與圖例,頂欄有專案名與快照時間,主畫布是一張由左至右的流程圖——來源節點、階段節點(顯示標題、狀態徽章、待決數)、依狀態上色的連線;點節點跳至下方 inspector 面板看該階段的檔案與執行紀錄,被跳至的面板有高亮。儀表板開啟後同為深色操作台:側欄是帶狀態點的專案清單,主面板是專案卡片格,卡片內容與連結語意與現行版本一致。兩頁皆無任何執行入口與動態進度元素,並保留唯讀快照說明與重新產生指令名稱。

### 介面與資料形狀

兩個渲染腳本的 CLI 參數、輸入(狀態物件 schema)與失敗模式完全不變;變更僅在 HTML/CSS 產生函式。輸出 HTML 含以下結構標記供檢查器斷言:根容器 class 包含 app-shell;流程板流程圖容器 class 包含 flow-canvas 且其中含 svg 元素;儀表板側欄含專案清單容器。自足性掃描函式與其模式清單逐字不變;淨化函式與 allowlist 欄位集合逐字不變。

### 失敗模式

與現行版本相同:狀態檔缺失、無法解析、schema 不符、絕對路徑、被竄改的板檔連結等情形維持既有錯誤碼與非零退出,不產生輸出檔;渲染結果若含任何被禁模式,assertSelfContained 照舊拒絕寫檔。本變更不新增錯誤碼。

### 驗收標準

- 執行 `pipeline-board/scripts/check-pipeline-board.mjs` 與 `portfolio-dashboard/scripts/check-portfolio-dashboard.mjs` 皆零退出,輸出包含各自全部既有情境名稱,新標記斷言通過,且重新定界後的「錯誤卡無板檔連結」斷言通過(板檔連結數等於成功專案數、錯誤卡容器內無 a 元素)。
- 對一個真實專案重新建置與渲染流程板與儀表板,兩份 HTML 以字串掃描確認:無 http(s) URL、無 src 屬性、無 @import、無 fetch、無 script 元素、無 link 元素、無 CSS url() 引用、無 iframe、無 button 元素、無 onclick、無 @keyframes、無 transition。
- 兩份 HTML 包含 app-shell 標記;流程板 HTML 的 flow-canvas 內含 svg,且連線三態(已銜接/未銜接/已過期)在檢查器暫存裝置中各至少出現一次對應的線色 class。
- 既有狀態標籤字串在兩份 HTML 中原字保留(以檢查器既有斷言為準)。
- git diff --check、spectra analyze restyle-boards-app-shell --json 與 spectra validate restyle-boards-app-shell 全部通過。

### 範圍邊界

**在範圍內**:pipeline-board/scripts/render-pipeline-board.mjs 與 portfolio-dashboard/scripts/render-portfolio-dashboard.mjs 的 HTML/CSS 產生邏輯,pipeline-board/scripts/check-pipeline-board.mjs 與 portfolio-dashboard/scripts/check-portfolio-dashboard.mjs 的新增標記斷言。

**在範圍外**:兩個 build 腳本、狀態物件 schema、SKILL.md 與 references 文件、agent-automation-orchestrate、design-system-extractor、自足性掃描模式清單、淨化 allowlist、狀態標籤字串、README。

## Risks / Trade-offs

- [SVG 連線座標寫死於網格假設,節點尺寸改動會錯位] → 座標一律由欄/列索引與單一組格尺寸常數推導,尺寸常數同時餵給 CSS 與 SVG viewBox,單點修改。
- [深色固定主題在列印時浪費碳粉且難讀] → @media print 轉淺色並隱藏側欄。
- [重新排版不小心動到標籤字串,檢查器紅燈] → 標籤常數表逐字凍結;驗收以兩個檢查器全綠為硬條件。
- [SVG 內容誤觸自足性掃描(url()、src=)] → 明文禁用 SVG marker 與 image 元素,箭頭用 polygon 畫;驗收含全模式字串掃描。
- [:target 高亮在無 JS 下無法「收合」] → 面板永遠渲染、高亮只是視覺強調,不依賴展開收合,行為可預期。

## Migration Plan

1. 流程板:先落 app shell 骨架與深色主題,保持現有內容區塊全數存在。
2. 流程板:實作 flow-canvas 網格與 SVG 連線層,節點錨點接 inspector。
3. 儀表板:套同一 app shell 骨架與卡片格、側欄專案清單。
4. 兩個檢查器加標記斷言,跑全套驗收。

回滾方式為還原兩個渲染腳本與兩個檢查器的變更;無資料、無 schema、無安裝面影響。

## Open Questions

無。視覺方向、flow 佈局、互動方式與凍結面均已與使用者確認或由既有守衛固定。
