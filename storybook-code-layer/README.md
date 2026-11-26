# Storybook Code Layer

在 Storybook 上像用 Figma 一樣選取畫面上的元件，在浮在畫布上的檢視器裡點一下數值，把它換成另一個 token，或調整 flex 容器的排列（方向、對齊、分布、換行），即時看到結果；按「套用到檔案」後寫進真實的 token 檔、元件樣式表與元件規格表，寫完自動驗證畫面與檔案一致，也可以還原。

這份文件給使用檢視器的人與維護專案的人。安裝、更新、移除的操作規則（給 AI agent）在 `SKILL.md`。

## 它做什麼、不做什麼

- 數值、顏色、字級這些設計決定：只把樣式裡 `var(--…)` 引用的 token **換成另一個已經存在、型別相同的 token**。不新增 token、不寫入任意數值。
- 排列方式（1.2.0 起）：flex 容器的方向、對齊、分布、換行可以從**固定的幾個選項**裡挑。這些值是 CSS 關鍵字，沒有 token 可綁，所以會直接寫進元件樣式表。`display` 本身、grid、拖曳調整大小不在範圍內。
- 只在 `storybook dev` 存在。`storybook build` 的產物裡沒有它的任何程式。
- 介面語言依瀏覽器（中文或英文），也可以在專案綁定用 `locale` 固定。

## 需求

- Storybook 10，Vite 版的 framework（`@storybook/*-vite`），不使用 CSF factories（`defineMain`／`definePreview`）。
- 設計 token 是 CSS 自訂屬性，分三層 `--<前綴>-ref-*`、`--<前綴>-sys-*`、`--<前綴>-comp-*`，每層一個檔，由一個入口樣式表依序 `@import`，而且 Storybook 的 preview 有載入它。
- 元件樣式表以 `var(--…)` 引用 token；元件的根元素有 `data-component`。
- 瀏覽器：Chromium 系（Chrome、Edge、Arc）。其他瀏覽器由啟動時的能力檢查決定：缺少必要功能（top-layer popover、adopted／constructable stylesheets、Web Crypto 等）時工具會停在「暫停」並說明缺哪一項，不會半套執行。Safari 與 Firefox 沒有驗證過。
- 腳本需要 Node.js 20.19 以上（以 24 驗證）。

## 安裝

請 AI 用 `$storybook-code-layer` 安裝是最簡單的方式；它會照下面的步驟做，並把需要你決定的事逐項問你。自己操作的話：

```sh
cd <cm-skills>/storybook-code-layer

# 1. 產生專案綁定的草稿（唯讀，不寫任何檔）
node scripts/derive_binding.mjs --project-root <storybook 根目錄>

# 2. 逐項確認「Needs your confirmation」之後，把確認過的設定存成檔案，再寫入專案
node scripts/derive_binding.mjs --project-root <storybook 根目錄> --write <確認後的設定.json>

# 3. 先看計畫，再安裝
node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --dry-run
node scripts/install_code_layer.mjs --project-root <storybook 根目錄>

# 4. 檢查，然後重新啟動 Storybook
node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --check
```

安裝器做的事：把模板複製到 `.storybook/code-layer/`、在 `.storybook/main` 的 `addons` 陣列末尾加一個元素、必要時在 `tsconfig.json` 的 `exclude` 加 `.storybook/code-layer/**`，最後寫 `INSTALL_RECEIPT.json`。任何前置條件不符或有衝突時，一個檔都不寫；寫到一半失敗會把動過的檔全部放回去。

### 綁定推導時要你確認的事

推導腳本會列出每個值的證據。證據無法決定的項目不會自己猜：

| 項目 | 你要決定的事 |
|---|---|
| `tokens.sourceOfTruth` | token 檔同時存在兩個目錄時，哪一份是大家編輯的真相、哪一份是 dev server 提供的鏡像。方向錯了，每次套用都會把複本當成真相。 |
| `workspaceRoot`、`stateDir` | 紀錄與備份放哪裡。必須在 Storybook 根目錄之外（否則會被 dev server 提供出去），而且與被寫入的檔在同一個磁碟。建議加進 `.gitignore`。 |
| `checks` | 哪個指令在寫入前把關 token 變更。沒有檢查時，token 變更不經稽核就寫入。 |
| `postApply` | 每次套用後要不要重新產生衍生文件（例如設計系統的 HTML 文件）。 |
| `components.roots` | 找到多個含元件標記的目錄時，哪些要開放編輯。 |

綁定檔 `code-layer.config.json` 歸專案所有：安裝器、更新、移除都不會改它。常用的選用鍵：

- `locale`：`"zh-Hant"` 或 `"en"`。
- `tokens.tiers` 裡 sys 層的 `writable: true`：開放「全域 system token」範圍。預設關閉，因為改一個 system token 會影響所有用到該角色的元件。ref 層永遠不可寫。
- `governance.componentSpecsDir`：元件規格（`<元件 id>.md`，內含 `## Token Contract` 表）所在目錄。設定後，改綁 comp token 時表中對應的列會在同一筆交易裡改寫。
- `governance.proseScan: false`：關閉「仍提到舊角色名稱的文字」的搜尋。
- `postApply`：`[{ id, command, args, cwd, writes }]`，`writes` 必須在 Storybook 根目錄之外。

## 更新與移除

```sh
node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --update --dry-run
node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --update

node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --uninstall --dry-run
node scripts/install_code_layer.mjs --project-root <storybook 根目錄> --uninstall
```

- 執行前先停掉該專案的 Storybook。Code Layer 的寫入 lock 還被持有時，更新與移除都會拒絕。
- 更新以 receipt 做三方比對：你沒動過的檔才會被更新；你改過的檔是衝突，整個更新不寫任何檔（`--force-managed` 會丟棄你對那些檔的修改，請先看清楚清單）。
- 移除只拿走安裝器放進去的東西：preset 元素、它加的 import 與 tsconfig 排除項、沒被改過的模板檔。綁定檔與紀錄、備份都保留。
- 更新或移除成功後要重新啟動 Storybook。

### 從 0.1.0（驗證版）升級

1. 停掉 Storybook。
2. `--update --dry-run` 看計畫；沒有 receipt、但檔案等於 0.1.0 的安裝會被接手。
3. `--update`。0.1.0 的 receipt 會換成新格式。
4. 視需要在綁定加入 `governance` 與 `postApply`（0.1.0 的綁定不需要修改就能用）。
5. 重新啟動 Storybook。之前暫存、尚未套用的變更是舊格式，檢視器會提示一次並捨棄（它們沒有寫入任何檔）。

從 1.0.0 升級到 1.1.0 只需要 `--update` 與重新啟動。1.0.0 的「設計」分頁（Storybook 面板區）由畫布上的檢視器取代，Storybook 的面板不再被自動停靠到右側。

從 1.1.0 升級到 1.2.0 同樣只需要 `--update` 與重新啟動，專案綁定不必修改。1.2.0 新增版面編輯；原本鎖住的方向、對齊、分布、換行四列，在 flex 容器上變成可以編輯。

## 使用

互動版的說明在 [`docs/code-layer-guide.html`](../docs/code-layer-guide.html)（用瀏覽器開啟）：可以操作的模擬檢視器、六段使用者旅程、每個按鈕的說明、常見問題與更新紀錄。下面是文字版的摘要。

1. 開啟任一個元件的 story，按工具列的 **Code Layer**。游標變成選取工具，畫布上出現**檢視器**。
   - 拖曳檢視器的標題列可以移到任何位置；右上角的箭頭可以收合。位置與收合狀態會記住。
   - 還沒拖過之前，它會自動停在不擋住元件的那一側。
   - Storybook 自己的面板（Controls 等）不會被移動或切換。
2. **選取**
   - 點一下：選到最外層的元件。
   - 雙擊，或按 Enter：進入下一層。之後在同一層點別的元素會留在這一層。
   - Shift+Enter：回上一層。Tab／Shift+Tab：同層的下一個／上一個。Esc：取消選取。
   - 按住 Cmd（Windows 為 Ctrl）點一下：直接選到最深的元素，包含收不到滑鼠事件的裝飾（例如 SVG 外框）。
   - 檢視器上方的路徑（◆ 是元件的根）與「↳」後面的內層元素也可以點；指上去時畫面會先標出那個元素。
3. **看**：檢視器分七區（版面、間距、尺寸、外觀、填色、筆畫、文字）。每一列只有圖示、數值與 token 標籤。
   - 沒有設定的屬性預設不顯示；分區標題右邊的「＋n」可以展開。
   - 鎖頭代表只供檢視，↑ 代表繼承自上層。滑鼠停在列上會說明原因。
4. **改**：點一列，旁邊會開一個浮層。
   - 最上面選套用到哪裡：**只有這裡**、**這個元件**（預設），或**整個系統**（專案有開放時；選它之前會先告訴你影響多少元件）。
   - 下面搜尋並挑另一個 token。滑過選項時畫面即時預覽，點下去才暫存。
   - 有刻度的值（圓角、間距、字級…）多一組 −／＋，一次移動一級。也可以選取該列後按 ↑／↓（Enter 暫存、Esc 取消），或左右拖曳該列的名稱。
   - **排列**（選到 flex 容器時）：版面區的方向、對齊、分布、換行四列一律顯示，還沒寫在樣式表裡的會以較淡的樣子顯示預設值。點開是幾個固定的選項，每個選項畫的是它在這個元素上的結果（例如「靠左」或「靠上」），滑過即預覽，點下去才暫存。浮層最下面一行說明會改哪條規則；還沒有宣告的屬性，會在宣告 `display` 的那條規則最後新增一行。
5. **套用**：有暫存的變更時，檢視器底部會列出它們，一筆一行。
   - 這時看到的只是預覽：只有這個瀏覽器的畫面變了，檔案還沒動。清單下方會一直顯示「預覽中 · n 項變更尚未寫入檔案」，直到你按「套用到檔案」或「捨棄」。
   - 「對照」：按住時暫時顯示原本的樣子。「捨棄」：全部取消。
   - 改了容器色而內容色沒跟著改時，該筆下方會提示對比的變化，並可以按「一起改內容色」。
   - 按「套用到檔案」後寫入 token 真相檔與鏡像、元件樣式表；規格表中對應的 Token Contract 列一併改寫。
6. **結果**：一行告訴你結果（例如「已寫入並驗證」），旁邊是「還原」。其餘可以展開：
   - 逐項結果、已同步改寫的規格列、內容色配對與對比值、套用後指令的結果。
   - **文件待同步**：工具無法確定如何改寫的地方（仍提到舊角色名稱的敘述、同一行的註解、沒有表格記載的宣告）。可以逐筆標示完成，或按「複製給 AI」把清單交給 AI 處理。
   - 「還原」把這次套用寫過的檔逐位元組放回去。套用之後檔案又被改過時不會整檔覆蓋，改為提供「只改回這次的變更」（保留其他修改）或「略過」。
7. **開發者資訊**：標題列的 `</>` 按鈕。打開後會顯示每個值來自哪個檔案的哪一行、整條 token 鏈，以及每個範圍會寫入哪裡。預設關閉，會記住。
8. **複製物件參照**：標題列的複製按鈕，或選取框標籤上的「複製參照」。貼到任何 AI 對話裡，AI 就知道你指的是哪個元素、哪些宣告與 token。

### 哪些列可以改

| 情況 | 檢視器怎麼顯示 |
|---|---|
| 值是單一 `var(--token)`，或 `var()` 清單（例如 `border: var(--寬) solid var(--色)`）中的一個引用 | 可以改綁 |
| 繼承自同一個元件的祖先 | 可以改綁；改的是祖先的宣告，浮層會說明 |
| 寫死的數值、關鍵字、`calc()` 等運算式、帶 fallback 的 `var()` | 只供檢視，並說明原因 |
| flex 容器（`display: flex` 或 `inline-flex`）的方向、對齊、分布、換行 | 可以從固定選項裡挑；已有宣告就改那個關鍵字，沒有就新增一行 |
| 顯示方式（`display`）；不是 flex 容器的元素的方向、對齊、分布、換行 | 只供檢視 |
| 由 `place-items`／`place-content` 簡寫設定的對齊與分布；值不是單一關鍵字（例如 `var()`、`safe center`） | 只供檢視，並說明原因 |
| 繼承自外層的另一個元件、或元件之外的樣式表 | 只供檢視；可以跳到來源 |
| 行內樣式、SVG 屬性、`!important`、`@layer`、未納入索引的樣式表、執行中的動畫 | 只供檢視，並說明原因 |
| 工具無法確認這條宣告真的驅動這個元素（例如被別的規則蓋過） | 該範圍不提供修改 |

改綁的目標：宣告可以改綁到 system token 或自己元件的 comp token；comp token 改綁到 system token；system token 改綁到 ref token。型別必須相容（顏色對顏色、尺寸對尺寸）。

排列的選項是固定的，不能輸入其他值：

| 列 | CSS 屬性 | 選項 |
|---|---|---|
| 方向 | `flex-direction` | `row`、`column`、`row-reverse`、`column-reverse` |
| 對齊 | `align-items` | `flex-start`、`center`、`flex-end`、`stretch`、`baseline` |
| 分布 | `justify-content` | `flex-start`、`center`、`flex-end`、`space-between`、`space-around`、`space-evenly` |
| 換行 | `flex-wrap` | `nowrap`、`wrap` |

- `flex-flow: column wrap` 這種簡寫可以分別改方向與換行。
- 樣式表裡原本寫的是選項以外的值（例如 `align-items: start`）時，列上照實顯示，可以改成選項裡的任何一個；還原會換回原本的值。
- 新增的那一行加在規則的最後，縮排與換行照該規則既有的寫法。規則是空的、最後一個宣告沒有分號，或裡面有巢狀規則時，不新增，該列只供檢視。
- 改的是共用的規則：同一個元件的其他變體如果沒有自己覆寫，也會跟著變。浮層會寫出是哪條規則。
- 排列的變更沒有對應的規格表，每一筆都會列進「文件待同步」，提醒更新元件規格裡描述版面的文字。

## 安全

- 寫入入口只接受本機、同源、帶有每次啟動隨機產生的 session 的請求；區網與其他網站呼叫不到。Storybook 重新啟動後，已經開著的頁面會自己換成新的 session，不必重新整理；只有在檢視器本身的程式更新過時，才會出現「請重新整理頁面」的提示。
- 同一台機器上的程式（story 裡的程式碼、瀏覽器擴充套件、其他本機程式）能做檢視器能做的事：在封閉的可寫檔案集合內，把 `var()` 裡的 token 換成另一個既有 token；把方向、對齊、分布、換行的關鍵字換成固定清單裡的另一個；在已經宣告 flex 的規則裡新增一行這四個屬性之一；或還原你最近的套用。不能建立檔案、不能寫任意文字：請求只能指名一個既有的 token，或固定清單裡的屬性與關鍵字。
- 開著 ngrok、port 轉送等通道時不要啟用 Code Layer：拿到網址的人等同於本機。
- 寫入前先在候選樹上跑綁定設定的檢查；檢查失敗時任何檔都不會被動到。每次寫入都有紀錄與備份（在狀態目錄），當機後重啟會自動復原。

## 已知限制

- 只處理 CSS 自訂屬性形式的 token。Sass 變數、CSS-in-JS、Tailwind 類別不在範圍內。
- 支援的書寫模式：`horizontal-tb`、`vertical-rl`、`vertical-lr`（`sideways-*` 的元素整個只供檢視）。
- 追蹤看得到的樣式表是 `document.styleSheets` 裡、而且內容與原始檔一致的那些。以 `adoptedStyleSheets` 掛上的樣式、含 `@import` 或 `url()` 的元件樣式表不納入；被這類規則蓋過的列會被判為無法確認。
- 偽元素（`::before`、`::after`）與互動狀態（`:hover`、`:focus`）的樣式不能選取或編輯。
- 一次套用只在目前這個 story 上驗證畫面；其他 story 用到同一個 token 的地方不會逐一檢查（報告會列出影響的宣告數與元件數）。
- 宣告範圍的 token 清單會列出同元件所有型別相容的 comp token，包含語意不相關的（例如線寬的候選裡有間距 token）；同一刻度的排在前面。
- 規格表只在精確比對成立時改寫（唯一的 `## Token Contract` 標題、唯一一列、第二格等於舊 token）。其他情況不猜，列為文件待同步。
- 沒有驗證過：story 的 play function、loader、story 開啟的 dialog／portal、Safari、Firefox。
- 同一個專案同時只能跑一個 Storybook。
- 檢視器浮在畫布上，會蓋住一部分畫面：拖到別處，或收合成標題列。
- 排列只支援 flex 容器的四個屬性。不能改 `display`（把一般區塊變成 flex、改成 grid、隱藏）、不能調整子元素的順序或個別對齊、不能拖曳調整大小與位置。
- 新增的排列宣告只有一個位置：宣告 `display` 的那條規則。要只對某個變體設定，目前要請 AI 或手動在該變體的規則裡寫。
- 寫死的數值不能在檢視器裡改，也不能換成 token；請用「複製物件參照」交給 AI（改數值，或新增 token 後換上去）。
- AI 對話框（在檢視器裡直接請 AI 修改）不在這一版；目前以「複製物件參照」與「複製給 AI」交接。

## 量測（試驗場 80sJP-Fable，Chrome，Apple Silicon）

| 項目 | 結果 |
|---|---|
| 選取一個元素的樣式追蹤（29 列） | 12–35 ms（7 個元件根、多次執行的範圍） |
| 按下「套用到檔案」到報告顯示「已寫入並驗證」（兩筆變更：一個 token 檔＋鏡像＋規格檔） | 約 0.5 秒（515–532 ms）；套用後指令（兩個文件產生器）另需約 0.1 秒，在背景執行 |

## 紀錄與命令列

狀態目錄（綁定的 `stateDir`）裡有 `journal.jsonl`（每次套用、還原的紀錄）、`backups/`（每次寫入前的備份，保留到你清除為止）、`pending-docs.json`（尚未處理的文件待同步項目）。不需要 Storybook 也能查：

```sh
cd <storybook 根目錄>
node .storybook/code-layer/server/cli.mjs status --project .
node .storybook/code-layer/server/cli.mjs sync-mirror --project . --dry-run     # 改成 --apply 才會寫入
node .storybook/code-layer/server/cli.mjs undo --project . --apply-id <套用代號>   # 代號在報告與 status 的還原堆疊裡
node .storybook/code-layer/server/cli.mjs recover --project .
```

`sync-mirror`（含 `--dry-run`）、`undo`、`recover` 與 dev server 用同一把 lock：Storybook 執行中它們會回報「locked」而不做事，請用檢視器，或先停掉 Storybook。`status` 隨時可以執行。

## 開發（維護這個 skill 的人）

```sh
# 模板 → 已安裝副本（單向；目的地被人改過時拒絕）。不要直接改 .storybook/code-layer/
node scripts/dev_sync.mjs --project <storybook 根目錄>

# 模板有任何變動後都要重建清單，否則安裝器的每個模式都會拒絕
node scripts/build_template_manifest.mjs

# 單元測試（CODE_LAYER_TEST_PROJECT 用來解析 Vite 與 PostCSS；CODE_LAYER_LAB_CONFIG 為選用，會多跑對真實專案的唯讀檢查）
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node --test 'test/*.test.mjs'

# 對執行中的 Storybook（預設 http://localhost:6006）：API 與瀏覽器（Chrome DevTools Protocol，真實輸入）
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_live_api.mjs
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_core_loop_browser.mjs --stage all

# build 產物不含 Code Layer（執行前先停掉 dev server）
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_build_check.mjs
```

瀏覽器測試會對真實專案套用並還原變更；每一項結束時、以及整個腳本結束時都會確認沒有留下未還原的套用。發行新版時把 `template/code-layer/package.json` 的版本號、`template/TEMPLATE_MANIFEST.json` 與 `template/KNOWN_MANIFESTS.json`（歷來版本的檔案雜湊，供升級時辨認舊版檔案）一起更新。

**使用者看得到的功能或介面文字有變動時，同一次修改要更新 `docs/code-layer-guide.html`**（repo 根目錄的 `docs/`）。它是這個工具唯一的使用說明，不另開新文件。檔案開頭的註解列出要改的地方：版本與日期、更新紀錄、使用者旅程（`JOURNEYS`）、介面導覽（`FIGURES`）、模擬器的介面文字（`L.zh`／`L.en`，要與 `shared/messages.*.ts` 一致）。它是可以直接開啟的完整 HTML；註解中的兩個標記之間是發佈成網頁時使用的內容。
