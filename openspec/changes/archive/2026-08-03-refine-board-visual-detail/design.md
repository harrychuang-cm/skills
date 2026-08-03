## Context

`pipeline-board` 與 `portfolio-dashboard` 各自產出一份單一自足的 HTML。前兩輪改造已經把它們從文件式排版換成 app shell（側欄／頂欄／面板），並加上水平流程圖與只表示方向的流動連線。骨架正確，但視覺細節仍是草稿：

- 兩支 `css()` 的間距用了 6/7/10/12/14/16/18/22px、圓角用了 7/10/12px，全是就地決定的數值，面板之間對不齊。
- 所有容器（面板、階段卡、交接卡、專案卡、執行紀錄區）都是「1px 邊框 + 純色底」，視覺重量一致，看不出主從。
- `.side-label`、面板標題、`.label` 三處是中文，卻套用拉丁小標慣例（`text-transform: uppercase` 對中文無效、`letter-spacing` 把中文撐鬆）。
- 快照時間、待決數、專案計數沒有等寬數字，切換狀態時橫向跳動。
- 狀態只能靠讀徽章文字辨識；流程節點一律灰卡，只有連線帶顏色。
- 側欄連結、流程節點、卡片連結沒有任何鍵盤焦點樣式。

兩支 checker 目前各有 7 個以中文命名的情境，全綠。它們用正則錨定了幾個 CSS 規則（`.flow-node {`、`.edge-line-satisfied {`、`.edge-line-stale {`、`.edge-line-blocked {`）與多個狀態字串，這些錨點是本次改動必須繞開的地雷，也是本次改動的護欄。

## Goals / Non-Goals

**Goals:**

- 兩份 HTML 的間距、圓角、層次、狀態色來自同一組具名 token，兩支 render 內嵌的 token 區塊逐位元組相同。
- 容器有三級可辨識的視覺層次，掃視時能立刻分辨主面板、次級卡片與內嵌區塊。
- 中文標籤依中文排版慣例呈現，層級改由字級、字重與顏色建立。
- 所有數字等寬，狀態切換時不左右跳動。
- 流程節點自己帶狀態色，不必讀字就能定位有問題的階段。
- 鍵盤操作有明確焦點回饋；捲軸、文字選取、連結色都經過設計，不再是瀏覽器預設。

**Non-Goals:**

- 不抽出共用樣式模組或共用檔案。兩個 skill 必須各自獨立安裝，跨 skill 的匯入會破壞這個性質。
- 不改任何狀態標籤文字、錯誤碼、注意事項文案。這一輪只處理視覺，不處理用字。
- 不新增互動：沒有 JavaScript、沒有摺疊、沒有主題切換、沒有篩選。
- 不動流程圖的幾何常數與座標推導，節點尺寸與欄距維持原值。
- 不引入任何外部資源、字型、圖示檔或資料 URI。
- 不新增任何動畫。流動連線的兩條規則維持原樣，節點、徽章、執行狀態依然永不動。

## Decisions

### 兩檔各自內嵌一組相同的設計 token

在兩支 `css()` 的 `:root` 內，以 `/* tokens:start */` 與 `/* tokens:end */` 包住一段共用 token 區塊，涵蓋間距階（`--s1` 到 `--s6`）、圓角階（`--r1`、`--r2`、`--r3`、`--rp`）、三段層次陰影（`--lift-1`、`--lift-2`、`--lift-3`）、焦點色 `--focus`、連結色 `--link`，以及四個狀態的低透明度邊框變體（`--ok-edge`、`--warn-edge`、`--stop-edge`、`--idle-edge`）。原有的顏色 token 名稱與數值不變。兩檔的這段區塊必須逐位元組相同。

替代方案是抽成共用檔案由兩支 render 匯入。否決：安裝器逐一發掘各 skill 目錄，跨目錄匯入會讓任一 skill 無法單獨安裝。刻意重複、以 checker 強制兩份相同，是比共用更符合這個專案結構的作法。

### 容器分為三級視覺層次

- 第一級（主面板）：`.panel`、`.section`、`.notice`、`.cards` 內的外框，用 `--surface` 底、`--border` 邊框、`--lift-2` 陰影、`--r3` 圓角。
- 第二級（次級卡片）：`.stage`、`.edge`、`.card`、`.flow-node`，用 `--surface-subtle` 底、`--r2` 圓角、`--lift-1` 內側高光，無外陰影。
- 第三級（內嵌區塊）：`.run`、`.paths` 所在區域，用 `--rail` 底、`--r1` 圓角、僅上緣一條 hairline，無陰影。

層次一律以 `box-shadow` 與底色達成，不使用任何背景圖。列印時三級陰影全部歸零，避免在紙上變成灰塊。

替代方案是用不同邊框顏色分級。否決：深色底上單靠邊框明度差異不足以分級，且會讓邊框顏色 token 失去單一語意。

### 中文標籤改用中文排版慣例

`.side-label`、`.panel h2`、`.section h2`、`.label` 四處移除 `text-transform`，字距歸零，改以 `font-size` 與 `font-weight` 建立層級；面板標題的分隔線改為貫穿面板寬度的分隔帶，不再內縮於 padding。純拉丁的 `.brand` 保留原本的大寫與字距處理，因為那一行本來就是拉丁字樣。

替代方案是全部保留字距只移除 `text-transform`。否決：中文的鬆散感主要來自字距而非大寫。

### 流程節點自己帶狀態色

`renderFlow` 產出的階段節點與來源節點，在既有的 `flow-node` class 之外附加 `flow-node-tone-<tone>`，tone 沿用 `flowStageTone` 既有的推導結果，不新增任何狀態判斷。該 class 在節點左緣畫一條狀態色軌條、並在標題前放一顆狀態圓點。節點尺寸不變（`box-sizing: border-box` 已全域生效），流程圖幾何常數不動。

`.flow-node` 這條基底規則必須保持獨立存在且不含 `animation`，因為 checker 以 `/\.flow-node \{[^}]*\}/` 錨定它。狀態變體寫成另外四條規則。

替代方案是把節點整片染成狀態底色。否決：四個節點並排時整片色塊會蓋過連線的狀態語意，而連線才是這張圖的主角。

### 焦點環、細捲軸與中性連結色

所有可聚焦元素統一 `:focus-visible` 焦點環（`--focus` 色、2px、外偏移 2px）。側欄與流程圖捲動區改用細捲軸配深色軌道。定義 `::selection`。`portfolio-dashboard` 的全域 `a` 顏色從 `--ok` 改為 `--link`，`--link` 與四個狀態色都不同值，避免連結被讀成「流程健康」。`pipeline-board` 同樣引入 `--link` 供卡片連結與內文連結使用。

替代方案是沿用 `--ok` 當連結色。否決：這個介面用顏色編碼狀態，連結不是狀態。

### 既有斷言錨點與凍結區維持原樣

以下內容一個字元都不改：`assertSelfContained` 的八個掃描模式與其函式、`sanitizeStatus`／`sanitizeRun`／`relativePath`、所有狀態標籤與錯誤碼字串、`@keyframes flow-dash` 與 `.edge-line-satisfied`／`.edge-line-stale`／`.edge-line-blocked` 三條規則的動畫繫結、`prefers-reduced-motion` 與列印的靜態退回、列印翻淺色並隱藏側欄。新樣式不得引入任何 `url(`，因此不得使用資料 URI、外部字型或 SVG marker。

## Implementation Contract

**行為**：設計師開啟任一份 HTML 時，看到的是層次分明的深色操作台——主面板浮起、次級卡片內縮、內嵌區塊下沉；中文標題緊湊不鬆散；所有數字對齊不跳動；流程圖上每個節點左緣有狀態色軌條與狀態圓點，不讀字就能看出哪一階段有問題；用鍵盤 Tab 時每一個可聚焦元素都有清楚焦點環；捲軸細而融入深色底。所有文字內容、狀態判讀與誠實標示與改動前完全相同。

**介面與資料形狀**：兩支 render 的匯出函式簽章、CLI 參數、輸出檔名、`status` 物件的讀取欄位全部不變。`renderFlow` 產出的節點多一個 `flow-node-tone-<tone>` class，tone 取值限於 `ok`、`warn`、`stop`、`idle`，來源節點沿用其既有的 tone 欄位。兩支 `css()` 的 `:root` 內新增一段以 `/* tokens:start */` 與 `/* tokens:end */` 為界的 token 區塊，兩檔逐位元組相同。

**失敗模式**：不新增任何失敗模式。既有的失敗與拒絕行為（`missing-project-root`、`project-build-failed`、`unreadable-status`、`unsupported-status-schema`、`project-render-failed`、`unsupported-schema-version`、`invalid-board-file`、`external-reference`）維持原碼、原訊息、原退出碼，失敗時一樣不留下檔案。若新樣式意外引入被禁模式，`assertSelfContained` 會以既有的 `external-reference` 拒絕整份輸出——這是預期的護欄，不是新行為。

**驗收條件**：

1. `node pipeline-board/scripts/check-pipeline-board.mjs` 輸出 `"ok":true` 且七個既有情境名稱（空專案、僅有來源、部分完成、全部完成、上游較新造成過期、失效的中止點引用、執行區塊逾期）一字不變。
2. `node portfolio-dashboard/scripts/check-portfolio-dashboard.mjs` 輸出 `"ok":true` 且七個既有情境名稱（健康專案、未成立連線、已過期連線、執行逾期、根目錄不存在、組合定義檔無效、schema 版本不符）一字不變。
3. pipeline-board checker 新增斷言：token 區塊存在；`html.includes("tabular-nums")`；`html.includes(":focus-visible")`；`.side-label` 規則不含 `text-transform`；markup 中至少一個節點帶 `flow-node-tone-` class；`.flow-node` 基底規則仍存在且不含 `animation`；`flow-dash` 的 `animation:` 宣告數量仍恰為 2。
4. portfolio-dashboard checker 新增斷言：從產生的專案流程板 HTML 與總覽 HTML 各自取出 tokens 區塊，兩者字串相等；總覽仍不含 `@keyframes`；總覽含 `:focus-visible` 與 `tabular-nums`；全域 `a` 規則使用 `var(--link)` 且不使用 `var(--ok)`。
5. 兩份輸出 HTML 對八個被禁模式（`https://`、`http://`、`src=`、`@import`、`fetch(`、`<script`、`<link`、`url(`、`<iframe`）掃描皆為零命中。
6. 以 `/Users/a04-0214-0320/Public/works/cm-chipK/ds-lab/project` 實跑既有的四道指令（兩次 build、兩次 render）全部退出碼 0。
7. `git status --porcelain` 顯示本次僅四支腳本被修改，無其他來源檔變動。

**範圍界線**：

- 在範圍內：`pipeline-board/scripts/render-pipeline-board.mjs` 的 `css()` 與 `renderFlow` 的節點 class 附加、`portfolio-dashboard/scripts/render-portfolio-dashboard.mjs` 的 `css()`、兩支 checker 的新增斷言。
- 在範圍外：兩支 build 腳本、`status` 物件 schema、兩份 SKILL.md、`assertSelfContained` 與其模式陣列、淨化函式、流程圖幾何常數、所有既有文案與錯誤碼、README。

## Risks / Trade-offs

- 正則錨定的 CSS 規則被改壞 → 四條被錨定的選擇器（`.flow-node`、`.edge-line-satisfied`、`.edge-line-stale`、`.edge-line-blocked`）維持獨立規則且選擇器與左大括號之間保持單一空格；新樣式一律寫成額外規則。
- 兩檔 token 區塊逐漸走樣 → 由 portfolio checker 直接比對兩份實際產出的 HTML 切片，走樣即紅燈，不依賴人工比對。
- 新增陰影在列印時變成灰塊 → 列印區塊統一把三段陰影歸零。
- 低透明度邊框在少數瀏覽器解析失敗 → 只使用 `rgb(R G B / A%)` 這一種現代語法，不混用 `color-mix` 等較新函式，且失敗時退回無邊框仍可讀。
- 視覺調整不慎更動狀態字串 → 本次不觸碰任何字串常數表，兩支 checker 的既有字串斷言即為守門。
