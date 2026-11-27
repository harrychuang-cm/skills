# Storybook Code Layer

在 Storybook 上像用 Figma 一樣選取畫面上的元件，在浮在畫布上的檢視器裡點一下數值，把它換成另一個 token，或調整 flex 容器的排列（方向、對齊、分布、換行），即時看到結果；按「套用到檔案」後寫進真實的 token 檔、元件樣式表與元件規格表，寫完自動驗證畫面與檔案一致，也可以還原。檢視器做不到的修改，可以在旁邊的對話框請 AI 做（1.3.0 起，預設關閉）：每次都要你在瀏覽器外按允許，AI 在專案的複本上工作，結果通過檢查才寫進專案，而且可以還原。

這份文件給使用檢視器的人與維護專案的人。安裝、更新、移除的操作規則（給 AI agent）在 `SKILL.md`。

## 它做什麼、不做什麼

- 數值、顏色、字級這些設計決定：只把樣式裡 `var(--…)` 引用的 token **換成另一個已經存在、型別相同的 token**。不新增 token、不寫入任意數值。
- 排列方式（1.2.0 起）：flex 容器的方向、對齊、分布、換行可以從**固定的幾個選項**裡挑。這些值是 CSS 關鍵字，沒有 token 可綁，所以會直接寫進元件樣式表。`display` 本身、grid、拖曳調整大小不在範圍內。
- 請 AI 修改（1.3.0 起，選用）：用文字描述想要的修改，由你電腦上的 AI 命令列工具（預設 Claude Code）在專案的複本上完成。只接受「修改既有檔案、而且在允許範圍內」的結果，整筆匯入、可以還原；其他結果一律不進專案。見下方〈請 AI 修改〉。
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

從 1.2.0 升級到 1.3.0 也只需要 `--update` 與重新啟動。不做任何其他設定時 AI 修改不會啟用，檢視器的行為與 1.2.0 相同（標題列多一個停用中的 AI 按鈕，滑鼠停上去會說明原因）。

從 1.3.0 升級到 1.3.1：`--update` 與重新啟動之後，已經啟用 AI 修改的電腦要再跑一次啟用腳本。1.3.1 讓 Claude Code 不再把每次的對話（含需求文字）存到 `~/.claude/projects/`，而這個參數是在啟用時寫進 runner 檔的，舊的 runner 檔不會自動更新：重跑之前，對話框會顯示「Claude Code 的設定是舊版產生的」，AI 修改暫時不能用。

## 使用

互動版的說明在 [`docs/code-layer-guide.html`](../docs/code-layer-guide.html)（用瀏覽器開啟）：可以操作的模擬檢視器、七段使用者旅程（含請 AI 修改）、每個按鈕的說明、常見問題與更新紀錄。下面是文字版的摘要。

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
9. **請 AI 修改**（已啟用時）：選取框標籤上的「AI」，或檢視器標題列的 ✦ 按鈕。對話框開在檢視器旁（取代列的浮層），寫出你選的元素。
   - 打字描述想要的修改。Enter 送出，Shift+Enter 換行，Esc 關閉（文字會留著）；每個元素的文字分開保留。「一併送出的物件參照」可以展開看 AI 會收到什麼。
   - 送出後要在**瀏覽器外**允許：macOS 會跳出系統對話框（預設按鈕是拒絕）；無法顯示對話框時，改到執行 Storybook 的終端機看六位數確認碼，輸入在對話框裡。
   - 進行中，檢視器底部顯示狀態、經過時間與你的請求，可以取消；重新整理頁面後仍在。這段時間不能套用、還原或同步鏡像。
   - 結束時只有兩種結果：「AI 已修改專案」（列出 AI 的說明、改了哪些檔與幾行、這個元素有哪些屬性改變，旁邊是「還原」），或「專案沒有任何改變」加上每個原因（可以改用「複製物件參照」自己交給 AI）。被拒絕、取消或失敗時，你打的文字還在輸入框裡，可以修改後再送。
   - AI 需要你決定時，對話框顯示它的問題；回答後會成為新的請求，一樣要你允許。

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

## 請 AI 修改（選用）

要同時滿足兩個條件才會啟用：

1. 專案綁定 `code-layer.config.json` 有 `"agent": { "enabled": true }`。這是專案的決定，改完要重新啟動 Storybook。
2. 這台電腦執行過啟用腳本（寫入狀態目錄的 `agent-runners.json`）。這是這台電腦的決定，之後重跑不必重啟。這個檔記錄的是這台電腦上的絕對路徑，請先確認狀態目錄已經加進 `.gitignore`，否則它會跟著專案一起被提交、分享出去。

```sh
node scripts/enable_agent.mjs --project-root <storybook 根目錄> --dry-run   # 先看會找到什麼、寫什麼
node scripts/enable_agent.mjs --project-root <storybook 根目錄>
node scripts/enable_agent.mjs --project-root <storybook 根目錄> --disable   # 停用
```

啟用腳本會找到 Node、`agent-automation-orchestrate` skill 與 Claude Code，只用 `--version` 與說明文字檢查它們，不會啟動 AI。要加入 Codex 作為第二順位：`--runners claude,codex --codex-model <模型>`。`install_code_layer.mjs --check` 會多一行「AI requests」說明目前是否就緒。

Claude Code 或 Codex 自動更新版本之後，對話框會顯示「版本變了，需要重新設定」，AI 修改暫時不能用；重跑一次啟用腳本就會恢復，不必重啟 Storybook。

**你需要知道的事**

- **費用**：每次請求都會使用你自己帳號的額度，也需要一些時間（依工具與請求而定）。不會自動重試；第一個工具失敗時才會換下一個。
- **每次都要你允許**：頁面上的程式（包括 story 裡的程式碼）也能送出請求，所以允許這一步一定在瀏覽器外。系統對話框會顯示專案、元素、要用的工具、AI 可以改的檔案範圍與請求文字；60 秒沒有回應視為拒絕。確認碼只對它那一筆請求有效、只能用一次，打錯三次就作廢，3 分鐘後失效。綁定可以設 `"confirm": "off"` 跳過確認，但檢視器會在每次送出前標示「不需確認」，不建議使用。
- **AI 在複本上工作**：Storybook 把工作區（不含 `node_modules`、`.git`、建置輸出、狀態目錄與各 AI 工具的設定資料夾）複製一份給 AI。Claude Code 只拿到讀寫檔案的工具，沒有 shell，不載入任何 MCP 伺服器（你在 claude.ai 連接的 Gmail、Google Drive、Figma 等都不會出現），讀不到環境變數，也不會在 `~/.claude/projects/` 留下這次的對話紀錄；Codex 有 shell，寫入限制在它的 sandbox 與複本裡；但它會啟動你自己 Codex 設定（`~/.codex/config.toml`）裡列出的 MCP 伺服器，這些伺服器在 sandbox 之外執行。所以預設不使用 Codex；你的 Codex 設定裡有 MCP 伺服器時，加入 Codex 之前請先想清楚。
- **範圍關卡**：AI 結束後，只有「修改既有檔案、而且每個檔都在允許範圍內」的結果會被接受。允許範圍是可寫的 token 真相檔、元件根目錄下的檔案、元件規格檔（綁定的 `agent.allowedGlobs` 可以再縮小）。下列任何一項都會讓整個結果被拒絕、專案完全不變：新增或刪除檔案、改到範圍外的檔案、直接改 token 鏡像、新增或刪除 token、改完不是有效的 CSS、AI 工作期間你自己也改了同一個檔。
- **匯入是一筆可還原的套用**：通過關卡的結果和你按「套用到檔案」一樣寫入（token 真相檔與鏡像一起寫、先跑綁定的檢查、寫入前備份），可以從報告或還原堆疊還原，逐位元組放回去。AI 的修改沒有「只改回這次的變更」，套用後檔案又被改過時只能略過。
- **紀錄**：請求文字只存在狀態目錄的 `agent/<代號>/request.txt`（只有你能讀）與 AI 的複本裡（結束即刪除）；紀錄、狀態與所有回應都不含它，頁面自己在這個分頁裡記住你送出的文字。用確認碼時，終端機會印出請求文字（那是給你核對的）。最近 20 次執行的資料夾會保留。

## 安全

- 寫入入口只接受本機、同源、帶有每次啟動隨機產生的 session 的請求；區網與其他網站呼叫不到。Storybook 重新啟動後，已經開著的頁面會自己換成新的 session，不必重新整理；只有在檢視器本身的程式更新過時，才會出現「請重新整理頁面」的提示。
- 同一台機器上的程式（story 裡的程式碼、瀏覽器擴充套件、其他本機程式）能做檢視器能做的事：在封閉的可寫檔案集合內，把 `var()` 裡的 token 換成另一個既有 token；把方向、對齊、分布、換行的關鍵字換成固定清單裡的另一個；在已經宣告 flex 的規則裡新增一行這四個屬性之一；或還原你最近的套用。不能建立檔案、不能寫任意文字：請求只能指名一個既有的 token，或固定清單裡的屬性與關鍵字。
- 開著 ngrok、port 轉送等通道時不要啟用 Code Layer：拿到網址的人等同於本機。
- 寫入前先在候選樹上跑綁定設定的檢查；檢查失敗時任何檔都不會被動到。每次寫入都有紀錄與備份（在狀態目錄），當機後重啟會自動復原。
- 啟用 AI 修改後，同一台機器上的程式也能送出 AI 請求，但每一筆都要你在瀏覽器外允許；就算被允許，結果仍受範圍關卡限制、可以還原。允許之前請看清楚對話框裡的請求文字。

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
- AI 修改一次只能有一筆在進行；進行中其他寫入會等它結束。
- AI 的結果在匯入前只跑綁定的 token 檢查與 CSS 解析，不跑型別檢查或建置（複本沒有 `node_modules`）。改壞元件程式碼時，畫面會立刻反映，請用「還原」。
- AI 不能新增 token 或檔案；需要新 token 時，請先由人新增，再請它改綁。
- 原生確認對話框在某些啟動方式下可能不出現；這時會自動改用終端機確認碼，不會變成不需確認。
- 按「允許」後建立工作副本、AI 結束後比對副本，都在 Storybook 的伺服器上同步進行。工作區很大時（例如上萬個檔、數百 MB 的圖片與字型），這段期間 Storybook 會停住幾秒。
- 直接以訊號強制結束 Storybook（例如 `kill -9`）時，正在工作的 AI 不會被一起結束，會跑到它自己的時限為止；下次啟動 Storybook 時，這筆執行會標為中斷並清掉副本，不會寫入專案。

## 量測（試驗場 80sJP-Fable，Chrome，Apple Silicon）

| 項目 | 結果 |
|---|---|
| 選取一個元素的樣式追蹤（29 列） | 12–35 ms（7 個元件根、多次執行的範圍） |
| 按下「套用到檔案」到報告顯示「已寫入並驗證」（兩筆變更：一個 token 檔＋鏡像＋規格檔） | 約 0.5 秒（515–532 ms）；套用後指令（兩個文件產生器）另需約 0.1 秒，在背景執行 |
| 請 AI 修改：按「允許」到匯入完成（Claude Code 2.1.308，小修改，改 1～2 個檔） | 17–37 秒（2026-11-26、27 共三次真實執行；Claude Code 本身 17–33 秒，其餘是建立副本、範圍關卡與寫入） |
| 請 AI 修改：每次的費用（Claude Code 的預設模型 Opus 5.5） | US$0.16（不載入 MCP 之後）；載入 claude.ai 連接器的那一次是 US$1.74。1.3.1 起不保存對話紀錄，費用改由 Claude 帳號的用量頁查看 |

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

# AI 對話框（假的 AI 執行工具與測試用確認替身，不花費額度）：先 --setup，依它印出的變數重啟 Storybook；測完 --teardown，再正常重啟
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_agent_browser.mjs --setup
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_agent_browser.mjs --log <Storybook 的 log 檔>
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_agent_browser.mjs --teardown

# build 產物不含 Code Layer（執行前先停掉 dev server）
CODE_LAYER_TEST_PROJECT=<storybook 根目錄> node test/run_build_check.mjs
```

瀏覽器測試會對真實專案套用並還原變更；每一項結束時、以及整個腳本結束時都會確認沒有留下未還原的套用。發行新版時把 `template/code-layer/package.json` 的版本號、`template/TEMPLATE_MANIFEST.json` 與 `template/KNOWN_MANIFESTS.json`（歷來版本的檔案雜湊，供升級時辨認舊版檔案）一起更新。

**使用者看得到的功能或介面文字有變動時，同一次修改要更新 `docs/code-layer-guide.html`**（repo 根目錄的 `docs/`）。它是這個工具唯一的使用說明，不另開新文件。檔案開頭的註解列出要改的地方：版本與日期、更新紀錄、使用者旅程（`JOURNEYS`）、介面導覽（`FIGURES`）、模擬器的介面文字（`L.zh`／`L.en`，要與 `shared/messages.*.ts` 一致）。它是可以直接開啟的完整 HTML；註解中的兩個標記之間是發佈成網頁時使用的內容。
