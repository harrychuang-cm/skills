## Context

storybook-code-layer 0.1.0（核心迴路驗證版，2026-11-20 提交於分支 feat/storybook-code-layer）是安裝到 `<專案>/.storybook/code-layer/` 的 local preset addon，只在 `storybook dev` 啟用，分三部分：

- **dev server（Vite plugin）**：從專案綁定設定列舉的來源建立索引（token 三層、唯讀來源、元件 CSS 的規則與宣告）；接受兩種操作（`rebind-token`、`rebind-declaration`）；以 PostCSS 定位、只替換 token 名稱的位元組；含 token 的批次先在狀態目錄的候選樹上跑檢查；寫入前備份並寫 journal；真相檔與鏡像一起寫；可還原、可當機復原。
- **preview runtime**：計算有效狀態、畫 hover 與選取外框、追蹤每個屬性的勝出宣告與 token 鏈、以 CSSOM 即時預覽、寫入後分兩層驗證。
- **manager**：工具列開關與「設計」面板（Storybook 自帶的 React 18）。

驗證階段的限制（本 change 要解除的）：面板 9 列中只有填色與圓角可編輯；只接受「整個值就是一個 `var()`」；沒有直接宣告的屬性一律唯讀；選取只有「點選最外層元件」與 Esc；只有 comp 層可寫；介面字串寫死為繁體中文；安裝器只有 install／`--dry-run`／`--check`，設定要手寫；沒有 SKILL.md。

決定設計的實測事實（皆來自 2026-11-20 對 80sJP-Fable 試驗場的查核與驗證紀錄）：

- 244 個元件 CSS 宣告中 177 個屬於本 change 的屬性範圍：單一 `var()` 142 個（comp 105、sys 37）、多個 `var()` 的簡寫 4 個、`calc()` 3 個、`min()` 1 個、`var()` 加字面值 2 個、字面值 14 個、關鍵字 11 個。沒有任何 `var()` 帶 fallback。
- 尺寸與間距全部使用邏輯屬性（沒有任何 `width`／`height`），兩個元件會切換成直書（`writing-mode: vertical-rl`）。背景只用 `background` 簡寫。
- 7 個元件有 6 個的文字屬性宣告在祖先規則上；其中 4 個案例會爬出元件邊界，落在外層元件、story 包裝元素或 `storybook.css` 的 `:root`。
- 所有 story 包裝元素都沒有 `data-component`；figma-export 會插入 `display: contents` 的包裝。扇形印章的 SVG 外框是 `pointer-events: none`。
- 平台限制沿用驗證階段的結論：manager 不熱更新、preview annotation 會重新求值、`.storybook/` 下檔名以 `preview` 開頭的檔會讓 story index 失效、Vite 對既有 `<style>` 只換文字（CSSOM 修改會消失）、chokidar 同一路徑 50ms 節流、manager 的版面 API 一定會持久化。
- 驗證階段修掉、必須保持的兩個行為：草稿要立即寫入儲存（延遲寫入在套用後立刻重新整理時會遺失）；即時預覽的每一輪對帳要各自隔離錯誤。

Figma 的操作慣例以官方說明為準（2026-11-24 查閱）：雙擊或 Enter 選取下一層、Shift+Enter 選取父層、Tab／Shift+Tab 選取同層的下一個／上一個、Cmd／Ctrl+click 深層選取（help.figma.com「Select layers and objects」「Frames in Figma Design」）；變數在右側面板各區段以選擇器套用（「Apply variables to designs」）。

使用者已定案的方向（2026-11-19 至 11-24）：就地編輯、面板在 Storybook 原生面板區並停靠右側（2026-11-24 試用後改為浮在畫布上、可拖移的檢視器，見「檢視器浮在畫布上」）、能算的直接改檔其餘交給 agent、預設改元件本身而不做單一實例覆寫、先暫存再套用、以改綁既有 token 為主、Auto layout 結構唯讀、AI 對話框另案（add-code-layer-ai-dialog）。

限制：目標專案可能不是 git repo（試驗場就不是），journal 與備份是唯一的復原手段；工具介面沿用 Storybook manager 的主題，不套用被檢視專案的 design token。

## Goals / Non-Goals

**Goals:**

- 設計師能在面板上調整版面間距、尺寸、外觀、填色、筆畫、文字的 token 綁定，並清楚知道改的是哪一層、影響多大。
- 選取與導覽的手感與 Figma 一致，不需要重新學習。
- 每一個唯讀的值都說得出原因；每一個可編輯的值都經過 probe 證明。
- 寫入後 design-system 套件（token、鏡像、元件規格文件）仍然一致，嚴格稽核仍然通過。
- 驗證階段的安全性質全部保留：封閉可寫集合、位元組級最小差異、拒絕時零寫入、候選樹上先檢查、可還原、當機可復原、驗證不自我證明。
- 任何 React + Vite 的 Storybook 專案能以安裝器裝上、升級、移除；0.1.0 的專案能直接升級。
- 成為 repo 中可安裝的正式 skill。

**Non-Goals:**

- AI 對話框與任何啟動 agent 的端點。另案 add-code-layer-ai-dialog；本 change 只提供它需要的物件參照與紀錄。
- 編輯原始值：把字面值換成 token、改 reference 層的數值、新增 token。這些需要 Token Gate 的人為決定，交給 agent lane（複製物件參照）。
- 單一實例覆寫（只改這一個使用處）。
- 版面結構的編輯（display、flex 方向、對齊、換行）與拖曳調整大小、位置。
- 運算式（`calc()`、`min()` 等）、帶 fallback 的引用、逗號清單（字體堆疊）、橢圓圓角的編輯；這些值唯讀並顯示鏈。
- 強制狀態（`:hover`、`:focus-visible`）與偽元素的檢視。啟用時 shield 會讓 story 不進入 hover，這些規則不會出現在追蹤結果。
- Shadow DOM 內的元素、行內樣式與 SVG presentation attribute 的編輯。
- `@layer`、`!important`、容器查詢內宣告的編輯。
- CSF factories（`defineMain`／`definePreview`）專案與非 Vite builder。
- Safari 與 Firefox 的正式支援：以能力檢查決定是否啟用，但只在 Chromium 驗證。
- 多人同時編輯同一個專案、跨機器同步草稿。

## Decisions

### 屬性表以邏輯邊定義，簡寫依分量對應到邊

面板的屬性表（`shared/properties.ts`）改為以「邊」為單位描述：每一列群組列出它涵蓋的邏輯 longhand（例如 padding 的 `padding-block-start`、`padding-inline-end`、`padding-block-end`、`padding-inline-start`；圓角的 `border-start-start-radius` 等四角），以及能設定這些邊的所有作者屬性（實體 longhand、邏輯 longhand、各級簡寫）。新增共用模組 `shared/sides.mjs`（Node 與瀏覽器共用，附型別宣告）提供兩個純函式：

- `sidesOf(property, componentCount, writingMode, direction)`：回傳這個宣告的第 n 個分量設定哪些邏輯邊。涵蓋 `padding`／`margin`（1–4 個分量）、`padding-block`／`padding-inline`／`margin-block`／`margin-inline`（1–2 個）、`gap`（1–2 個）、`border-radius`（1–4 個，含斜線即不支援）、`border-width`／`border-color`（1–4 個）、`border`／`outline` 與各邊的 `border-*`（寬、樣式、色，依分量的型別辨識而不是位置）、`inset` 不在範圍內。
- `physicalToLogical(property, writingMode, direction)`：把實體屬性（`padding-left`、`border-top-left-radius`、`width`）換成邏輯邊。

追蹤時，同一個元素上所有命中規則的宣告先各自換成「邊 → 分量」的集合，再對每一條邊取串接順序最後的那個宣告分量。同一個宣告分量勝出的邊合併成一列；不同的拆成多列。computed 值一律以邏輯 longhand 讀取。伺服器索引為每個宣告新增 `components`（頂層以空白切開的分量，各自的形狀與引用），由 `shared/value-refs.mjs` 新增的 `splitTopLevel` 產生，兩端共用同一份切法。

理由：試驗場的尺寸與間距全部是邏輯屬性，而且有直書元件；以實體屬性名查宣告會查不到，或在直書時對錯邊。替代方案「面板以實體邊顯示、只在查宣告時轉換」在直書元件上會讓「上方內距」對到 `padding-inline-start`，使用者看到的列名與原始碼的屬性名對不起來，所以面板的列名用「區塊起點／行內起點」的在地化說法並附上目前對應的實體邊。

### 值的形狀以每個分量是否恰好一個引用決定可否改綁

宣告的值分成四種形狀，由伺服器索引判定、瀏覽器不自行判斷：

- `single-var`：整個值是一個沒有 fallback 的 `var()`。
- `var-list`：以空白分隔的頂層分量中，每個分量不是「恰好一個沒有 fallback 的 `var()`」就是「不含任何 `var()` 的值」，而且至少有一個引用。每個引用以它在整個值中的序號（`refIndex`）定址。
- `expression`：其餘含 `var()` 的值（函式內的引用、帶 fallback、逗號清單、含斜線的圓角）。
- `raw`／`keyword`：不含 `var()`。

`single-var` 與 `var-list` 中的引用可以改綁；`var-list` 中不含引用的分量所設定的邊顯示為唯讀字面值。操作格式不變：`replacements` 仍是陣列，本 change 仍限制每筆操作恰好一個 replacement，但 `refIndex` 不再限定為 0。同一個宣告的兩個引用是兩筆操作，草稿識別碼加上 `refIndex`。伺服器以同一個宣告為單位合併修補（由後往前套用位移），並檢查同一批次不重複指向同一個引用。

理由：`border: var(--w) solid var(--c)` 與 `margin: 0 0 var(--gap)` 在其他專案很常見，只支援單一 `var()` 會讓整個「筆畫」區塊幾乎不可用。替代方案「一筆操作帶多個 replacements」讓一筆草稿對應多個面板列，還原與驗證的對應關係變複雜，收益只是少幾筆操作。

### 繼承追蹤往祖先找宣告，來源分四類

對會繼承的屬性（文字色、字體、字級、字重、行高、字距），選取的元素沒有勝出宣告、勝出值是 `inherit`、或文字色是 `currentcolor` 時，追蹤器沿 `parentElement` 往上，在每個祖先上做完整的串接比較（含 `@media` 是否命中），直到找到提供值的宣告或到達文件根。新模組 `runtime/inherit.ts` 負責這段走訪與分類：

1. **同元件的祖先**：宣告所在的規則屬於「選取元素所屬元件」的樣式表（以最近的 `[data-component]` 祖先與索引的元件歸屬判定）。可編輯；草稿的見證元素仍是選取的元素，面板標示「繼承自〈祖先標籤〉，這個祖先之下的所有文字都會改變」。
2. **外層的另一個元件**：唯讀，提供「選取該元素」。
3. **元件之外**：story 包裝元素的行內樣式、`html`／`body`、唯讀來源或未納入索引的樣式表。唯讀，標示來源。
4. **找不到宣告**：瀏覽器預設值。唯讀。

理由：試驗場 7 個元件有 6 個需要，其中 4 個案例跨出元件。替代方案「繼承的列一律唯讀」會讓使用者選到任何子元素時整個文字區塊都不能改，必須先自己猜出該選哪個祖先。

### 選取模型沿用 Figma 的層級操作

- 「可選取的元素」是 story 根之內、會產生盒子的元素；`display: contents` 的包裝視為透明（它的子元素算作它父層的子元素）；本工具與其他工具的外框、`sbfx-` 前綴元素、`.prototype-inspector` 不可選取。
- 目前層級 = 目前選取元素的可選取父層。一般點選：點到的位置若在目前層級之內，選取該層級底下包含落點的那個子元素；否則選取包含落點的最外層元件根（沒有元件根時選取落點元素）。
- 雙擊：選取目前選取元素底下包含落點的子元素。Enter：第一個可選取子元素。Shift+Enter：可選取父層（到 story 根為止）。Tab／Shift+Tab：同層下一個／上一個並循環。Esc：清除。Cmd（macOS）／Ctrl（其他）+click：落點最深的可選取元素。
- 這些鍵由既有的 `window` capture 守衛處理，守衛原有的規則不變（不含 Ctrl／Meta／Alt 的鍵不會到達 story 與 Storybook 的單鍵快捷鍵）。雙擊以 click 事件的 `detail` 判定，不另設計時器。
- 新模組 `runtime/navigate.ts` 提供 `selectableChildren`、`selectableParent`、`siblingOf`、`childAt(point)`；`runtime/hitTest.ts` 保留落點命中。
- 面板標題顯示 breadcrumb（可選取祖先，標出元件邊界）與子元素清單；指到項目時經 channel 的 `highlight` 讓 preview 畫外框，點擊時送 `select`。

理由：使用者要求與 Figma 接近以降低學習成本，而這組鍵位是 Figma 官方說明的行為。Esc 維持「清除選取」是因為 Figma 以 Shift+Enter 回父層、Esc 取消選取。替代方案「每次點選都選最深的元素」會讓選到元件本身變得困難，而改元件本身正是預設的編輯目標。

### 深層命中測試暫時解除 pointer-events 限制

`elementsFromPoint` 不回傳 `pointer-events: none` 的元素。深層選取與雙擊時，命中測試在 `document.adoptedStyleSheets` 暫時加入一張 constructed sheet（所有元素 `pointer-events: auto !important`），同步呼叫 `elementsFromPoint` 後立即移除，整段包在 `try/finally`。這與凍結量測使用同一種手法，瀏覽器不會在兩者之間繪製。SVG 元素沿用 `auto` 的語意（只有畫得到的部分算命中）。

替代方案「自行以 bounding box 走訪 DOM 判斷落點」不知道繪製順序、裁切與 SVG 的實際形狀，會選到看不見的元素。

### 編輯範圍分宣告、元件 token、system token 三層

每個可改綁的列由追蹤器列出可用的範圍（`scopes`），取代 0.1.0 的單一裁決：

- `declaration`：改元件 CSS 的那個引用（`rebind-declaration`）。目標可以是 sys token 或同元件的 comp token。
- `component-token`：宣告引用的是可寫的 comp token 且它是單一 alias 時，改這個 comp token 指向的 sys token（`rebind-token`）。
- `system-token`：鏈上的 sys token 是單一 alias、而且專案綁定把 sys 層標為可寫時，改它指向的 ref token（`rebind-token`，目標必須是 ref 層）。

預設範圍是「數值來源的那一層」：有 `component-token` 就預設它，否則 `declaration`。某個範圍不可用（token 重複宣告、不是單一 alias、被主題覆寫、檔案不可寫）時列為不可用並附原因；預設範圍不可用時該列沒有預設值，不會悄悄改成別的範圍（避免讓元件脫離它的 comp token）。每個範圍附寫入位置與影響：宣告數取自索引的引用關係，元件數是這些宣告所屬的元件數；`system-token` 另註明不含 story 行內樣式的引用。面板上選 `system-token` 暫存時要再確認一次並顯示受影響的元件數。

專案綁定的 tier 設定放寬為 comp 與 sys 可以標 `writable: true`，ref 永遠不可寫；未標示時行為與 0.1.0 相同。伺服器的層級規則：comp → sys、sys → ref、元件 CSS → sys 或同元件的 comp。sys token 被唯讀來源在目前主題覆寫時，`system-token` 範圍不可用（改了也看不到）。

理由：使用者定案「預設改元件本身，面板標示影響範圍」，同時列出「範圍切換與全域 token 編輯」為 v1 內容。把全域編輯做成需要專案明確開放的範圍，可以讓不想開放的專案完全不受影響。替代方案「另做一個全域 token 編輯頁」會多一套介面，而且失去「從畫面上的元素出發」的脈絡。

### 刻度步進在同類 token 上依解析值移動

某一列的刻度 = 該列目前範圍的選擇器候選中，與目前 token 同類別（token 名稱中 tier 之後的類別段，例如 `spacing`、`shape`、`typescale`）而且解析值可以比較的 token，依解析值由小到大排列。可以比較指：同一個單位的長度、無單位數字、百分比；顏色與字體沒有刻度。解析值使用 preview 回報的目前作用域的值，不用索引的靜態值。聚焦的列按上下鍵移動一級，拖曳列的標籤每移動固定像素移動一級；移動時送暫時預覽，Enter 或放開時暫存，Esc 取消。刻度少於兩個 token 的列不提供步進。

理由：使用者要的是 Figma 式的數值微調，但本工具只改綁既有 token，所以「加一」的意思是「刻度上的下一個 token」。替代方案「步進改原始數值」違反以 token 為主的決定，屬於 Non-Goal。

### 反向套用作為整檔還原衝突時的第二條路

整檔還原的條件不變：每個被改的檔目前的雜湊都等於 journal 記的寫入後雜湊。不符時回 `undo-conflict`、不寫任何檔，面板提供兩個選擇：略過（既有行為），或反向套用。反向套用由伺服器從 journal 的 pending 紀錄讀出該次套用的操作，交換每筆的來源與目標 token，組成新的批次走完整的套用流程（定位、before 比對、候選樹檢查、備份、journal）。成功後原紀錄標為已還原並移出還原堆疊；反向套用本身記為還原，不進入還原堆疊。任何一筆操作的現值不等於當初寫入的值時，整批以 `stale-before` 拒絕。新增路由 `POST /undo/reverse`，body 為 `{ applyId }`。

理由：沒有 git 的專案裡，「套用之後又手動改了同一個檔的另一行」很常見，這時整檔還原必須拒絕，但只改回那一行是安全而且可證明的。替代方案「三方合併備份與現況」需要合併演算法，而且合併結果無法像單行替換那樣證明。

### 鏡像同步端點與面板提示

`GET /state` 已回報真相與鏡像的同步狀態；面板在有差異時顯示每個檔的差異行數與修改時間，並停用套用。新增路由 `POST /sync-mirror`（body `{ dryRun }`），行為與既有的 `cli sync-mirror` 相同：方向固定為真相覆蓋鏡像、先對真相跑檢查、備份被覆蓋的鏡像、寫 journal、補發 change。面板的同步動作先以 dry run 取得將被覆蓋的檔案清單，使用者確認後才送出實際同步。

### 檢視器浮在畫布上，預設畫面只有圖示、數值與 token

使用者試用 1.0.0 後的回饋（2026-11-24）：不像 Figma 那樣好上手，文字太多；放不進側邊面板的話可以改放在畫布上並能拖移。因此面板改為浮動檢視器：

- **容器**：manager 以 Storybook 的畫布包裝元件（`types.PREVIEW`）掛載，內容以 portal 畫在 `document.body`，位置依畫布的矩形計算。包裝元件必須在模組求值時就以 `addons.add` 登記（Storybook 只保留第一次渲染時拿到的包裝函式）；畫布沒有承接時由工具列按鈕代為掛載。工具不再呼叫任何會改變 Storybook 版面的 API。
- **位置**：由標題列拖移，可收合成標題列；位置（相對於畫布右上角）、收合與「開發者資訊」依專案存在 `localStorage`。還沒被拖過之前，preview 回報元件所在的矩形（`code-layer/layout` 事件），檢視器停在不擋住元件的一側；拖過之後不再自動移動。專案的工作階段回應之前不顯示檢視器，避免先出現在預設位置再跳到記住的位置。
- **呈現**：每一列是圖示、數值、token 標籤。唯讀原因、繼承來源、寫入位置與影響改為提示（tooltip）或浮層內容；檔案行號、token 鏈與寫入位置只在「開發者資訊」開啟時顯示。沒有宣告也沒有繼承來源的列預設收起，每區有「＋n」。沒有選取時是三行操作提示。
- **編輯**：點一列在檢視器旁開浮層（有空間的一側），內含範圍的分段選擇、步進按鈕與搜尋清單；清單變短時浮層不往下滑。
- **變更與報告**：一筆一行；有暫存變更時固定一行「預覽中 · n 項變更尚未寫入檔案」，套用按鈕標為「套用到檔案」——預覽與寫入是兩件事，介面要自己說清楚。報告一行結果加還原，其餘為可展開的區塊，需要注意的預設展開；後到的結果不得移動按鈕。
- **工作階段**：寫入需要每次啟動隨機產生的 session。dev server 重啟後，開著的頁面拿著舊值會被拒絕（`session-required`，伺服器在讀取請求內容之前就拒絕），頁面改為自己重新讀 `GET /session` 再送一次，只重送一次。`GET /session` 與 `GET /state` 多回報 `instance`（每次啟動隨機、不是秘密），`GET /session` 另回報 `build`（manager 與 shared 原始檔的雜湊）；頁面發現伺服器的 `build` 與自己載入時不同，就提示重新整理（manager 的程式只在啟動時打包，不會熱更新）。這不改變防護：能讀 `GET /session` 的本來就只有通過同源檢查的頁面。

理由：問題主要在內容而不是容器，但 addon 面板的自動停靠本身也脆弱（要改 Storybook 的版面狀態再還原）。替代方案「保留面板、只刪文字」無法做到拖移，也保留了停靠的脆弱性；「把檢視器畫在 preview iframe 裡」會讓工具的 DOM 進入 story 的文件，違反不干擾 story 的要求。

### 介面字串集中於訊息目錄

新增 `shared/i18n.ts` 與兩份目錄 `shared/messages.zh-Hant.ts`、`shared/messages.en.ts`（鍵相同，型別由其中一份推導，缺鍵時型別檢查失敗）。manager、preview 外框、物件參照的標籤、伺服器錯誤碼的說明都經由 `t(key, params)` 取得。語言依序取：專案綁定的 `locale`（`zh-Hant` 或 `en`）、瀏覽器語言（`zh` 開頭為 `zh-Hant`）、`en`。伺服器的回應只帶錯誤碼與結構化細節，不帶給人看的句子；專案檢查指令的輸出原樣顯示。

理由：0.1.0 的字串散在十幾個檔。替代方案「引入 i18n 套件」會增加 manager bundle 的相依；兩種語言、沒有複數規則的需求用一個函式就夠。

### 瀏覽器能力檢查決定是否啟用

preview 在第一次要進入 active 前檢查 `HTMLElement.prototype.showPopover`、`document.adoptedStyleSheets`、`CSSStyleSheet` 建構式與 `replaceSync`、`crypto.subtle.digest`、`document.elementsFromPoint`、`Element.getAnimations`。任一缺少時有效狀態為 suspended，原因列出缺少的功能，不掛任何監聽。新模組 `runtime/capabilities.ts`。

理由：0.1.0 只在 Chrome 實測。與其宣稱支援其他瀏覽器，不如保證「不支援時不會半套執行」。

### 協定、索引與草稿格式升到第 2 版

裁決由單一 `verdict` 改為 `scopes`，草稿識別碼加上引用序號，索引的宣告多了 `components`。因此 channel payload 的 `v`、索引的 `schemaVersion`、草稿儲存的 `schema` 都升為 2。manager 載入時遇到 schema 1 的草稿一律捨棄並在面板提示一次（草稿只是尚未套用的暫存，沒有需要保留的資料）。journal 的紀錄格式只增不改，0.1.0 寫下的紀錄仍可讀取與還原。

### Token Contract 列與 token 同一筆交易改寫，只做精確比對

專案綁定新增 `governance.componentSpecsDir`（元件規格文件目錄，相對於 Storybook 根目錄）。有設定時，`rebind-token`（comp 層）在同一筆交易多寫一個檔：

- 檔案：`<componentSpecsDir>/<元件 id>.md`，元件 id 取自 token 名稱（`--<prefix>-comp-<元件 id>-…`，以目錄中實際存在的檔名做最長前綴比對）。
- 定位：檔案中恰好一個 `## Token Contract` 標題（區分大小寫，避開 Fingerprint 表中的「Token contract summary」）；其下的表格中恰好一列的第一格完全等於這個 comp token。
- 前置條件：該列第二格完全等於舊的 sys token 名稱。
- 動作：只替換第二格的位元組；行數不變。
- 任何一項不成立就不改這個檔，並產生一筆「文件待同步」，原因寫明是哪一項（沒有規格檔、標題不唯一、找不到列、列不唯一、第二格不是舊 token）。

新模組 `server/spec-rows.mjs` 負責解析與修補，沿用 Patcher 的位元組證明（新內容等於舊內容把一個已知區間換掉）。規格檔在啟動時列入封閉可寫集合，套用時比照 token 檔備份與記入 journal。寫入順序改為：不被 dev server 監看的檔在前（真相 token 檔、規格檔），會觸發熱更新的檔在後（鏡像、元件 CSS），所以畫面不會先於文件變動。`system-token` 範圍與 `rebind-declaration` 沒有可確定改寫的文件目標，一律走待同步。

依據（試驗場查核）：6 份規格的 Token Contract 表欄位一致（Component token｜Maps to system token｜Purpose｜State / mode），102 個 comp token 有 97 個各有唯一的一列且第二格目前都等於 CSS 的 alias；5 個 festival token 共用一列範圍寫法（`…-1..5`）；18 個 sys token 名稱是其他名稱的前綴（`color-primary` 與 `color-primary-warm`），所以絕不能用子字串比對。三支 strict audit 與 check-token-inheritance 都不比對規格與 CSS，規格列過期時全部通過。

替代方案「套用後交給 agent 同步文件」會讓 token 與文件在一段時間內不一致，而這段不一致沒有任何稽核會發現。替代方案「以較寬鬆的比對多改一些列」在範圍列上會寫出 `--md-sys-color-secondary..5` 這種錯誤內容。

### 文件待同步以紀錄檔保存並可交給 AI

每次套用後，新模組 `server/pending-docs.mjs` 產生這次寫入「讓哪些地方過期、但無法確定改寫」的清單，每筆含檔案、行號、原因，並綁定 applyId：

- Token Contract 列不符合精確比對條件的 token。
- 每一筆 `rebind-declaration`（元件 CSS 的宣告沒有任何表格記載）。
- 被改寫的宣告同一行上的註解（例如 `/* cyan pop */`）。
- 元件範圍內仍提到舊 token 短名的行：該元件的規格檔（已改寫的儲存格除外）、樣式表註解、元件原始碼與 stories。短名是 token 名稱去掉 `--<prefix>-<tier>-<類別>-` 之後的部分（`primary`、`corner-sm`），以完整字詞比對，避免 `primary` 命中 `primary-warm`。

清單存在狀態目錄的 `pending-docs.json`（每次變更整檔以 rename 重寫），由 `GET /state` 回報。還原或反向套用某次套用時，移除它產生的項目。面板把項目顯示在造成它的變更旁邊，可以逐筆標示完成（`POST /pending-docs/resolve`，body `{ ids }`），也可以把某次套用的項目複製成一段給 AI 的說明文字（物件參照加上逐筆的檔案、行號、原因、舊值與新值）。伺服器另外在啟動時與每次寫入後比對所有規格列與 token 檔，回報不一致的列數與沒有對應列的 comp token 數；既有的不一致不阻擋套用。

理由：規格的敘述、可及性說明、CSS 註解都以文字提到角色名稱（例如「primary-red square」），這些無法由程式正確改寫，但可以確定地找出來。讓它們留在一份看得到的清單，比宣稱「文件已同步」誠實。

### 配對檢查以名稱找內容色、以解析值算對比

新模組 `server/pairing.mjs`。`rebind-token` 把 comp token C 由 sys 角色 A 改成 B 時：

1. A 是 `--<prefix>-sys-color-<a>` 而且 `--<prefix>-sys-color-on-<a>` 存在才檢查。
2. C 以 `-container-color` 結尾時，找同前段、以 `-text-color` 結尾的 comp token S。兩個後綴可在綁定的 `governance.pairing` 覆寫（預設 `containerSuffix: "-container-color"`、`contentSuffix: "-text-color"`）。
3. S 的 alias 正好是 `on-<a>` 時提出警示，註明 `on-<a>` 與 `on-<b>` 的解析值是否相同；`on-<b>` 存在時提供「一起改綁」，在變更清單加入第二筆草稿。
4. 一律顯示容器色與內容色解析值的 WCAG 對比值（由 token 檔的解析值計算，不讀瀏覽器，避免受 Storybook 深色檢視模式的覆寫影響）。

警示不阻擋套用。規則不涵蓋的情況只顯示對比值：沒有 `on-` 夥伴的角色（ink-strong／knockout）、內容色在後代選擇器的另一條規則、`currentcolor` 繼承、`on-surface` 與 `on-surface-strong` 這類變體。

理由：試驗場 9 個容器 token 中 6 個遵循 X／on-X；把 hanko 由 primary 改成 secondary 時兩者的 on- 色同為白色，但對比由 3.99 降到 2.94，名稱規則抓不到、對比值看得到。專案自己的風格規則（紅色配額、額外圓角等）屬於需要人判斷的設計決定，本工具不嘗試以規則判定。

### 套用後指令在提交後執行，失敗不回滾

專案綁定新增 `postApply`：`[{ id, command, args, cwd, timeoutMs, writes }]`。提交（含還原、反向套用、鏡像同步）之後由新模組 `server/post-apply.mjs` 依序執行一次，沿用檢查指令的執行方式（不經 shell、`node` 換成 `process.execPath`、env 白名單、逾時後終止整個 process group）。結果（exit code 與輸出尾段）附在套用報告，不寫入 journal 以外的地方。失敗不回滾，報告標示「衍生文件未更新」。`writes` 是該指令會寫入的路徑清單；啟動時任何一項落在 Storybook 專案根目錄內就拒絕這個指令並在狀態中說明（Vite 對 root 內沒有模組的 `.html` 變動會整頁重載）。同一時間只跑一輪；執行中又有新的提交時，結束後再跑一輪。

試驗場的設定會列出 design-system-extractor 的 `generate_docs_html.mjs` 與 `generate_review_html.mjs`（輸出在 `80sJP-Fable/docs/design-system/`，位於 Storybook 根目錄之外；除了一行時間戳以外輸出是確定的）。strict audits 已經是寫入前的檢查，不重複列為套用後指令。

替代方案「把重新產生文件放進交易」會讓一個與原始碼正確性無關的產生器失敗時擋下寫入，也會把產生器的輸出時間戳帶進備份與還原。

### 安裝器的更新與移除以 receipt 做三方比對

沿用 design-automation-hub 安裝器的判定方式（repo 內唯一有 receipt 的先例），本 repo 沒有任何 uninstall 先例，移除規則為新訂：

- 每個受管檔案以三個雜湊決定動作：新模板 T、receipt 記錄 R、現況 C。C 不存在 → 安裝；C = T → 不動；C = R ≠ T → 更新；C ≠ R 且 C ≠ T → 衝突 `locally-modified-managed-file`；沒有 R 且 C ≠ T → 衝突 `managed-target-collision`；模板已移除而 C = R → 刪除，C ≠ R → 衝突；不在任何清單的檔 → 保留並警告。
- 有任何衝突就完全不寫。`--force-managed` 只能與 `--update` 或 `--uninstall` 併用，只影響受管檔案。
- 有 receipt、計畫中有寫入、卻沒帶 `--update` → 衝突 `update-required`（避免把升級誤當成安裝）。
- 沒有 receipt 但檔案全等於某個已知模板版本（0.1.0 由 dev_sync 裝的試驗場）→ 視為受管並寫 receipt。為此 skill 保留歷來版本的清單雜湊（`template/KNOWN_MANIFESTS.json`，只記版本與各檔雜湊）。
- receipt 版本比模板新 → 拒絕（不降版）。
- 專案綁定永遠不由安裝器改寫；更新前先以新模板的 `resolveConfig` 驗證，不通過就零寫入並說明缺什麼。綁定的雜湊不再列入 `--check` 的判定。
- receipt 第 2 版記錄安裝器實際做了什麼：`wiring.main.addedElement`、`wiring.main.addedResolveImport`、`wiring.tsconfig`（`added`／`present`／`not-needed`／`manual`）。第 1 版 receipt（0.1.0）仍可讀；它沒有這些欄位，移除時只移除 preset 元素、不動 import 與 tsconfig，並在輸出中說明。
- 移除順序：preset 元素（由 `array_literal.mjs` 新增的 `removeElement`）→ 安裝器加的 import（僅在檔案中沒有其他地方使用 `resolve` 時）→ 安裝器加的 tsconfig exclude → C = R 的受管檔案 → receipt → 空目錄。專案綁定與狀態目錄保留。
- 寫入先放到安裝目錄旁的暫存目錄，逐檔備份後替換；任何一步失敗就把動過的檔還原、把新建的檔刪除（`scripts/lib/staging.mjs`）。刪除只限安裝目錄之內，安裝目錄是 symlink 時拒絕。
- `--update` 與 `--uninstall` 在 Code Layer 的寫入 lock 被持有、或 journal 有未完成紀錄時拒絕。
- 命令列：拒絕不認得的旗標與不相容的組合；`--project-root` 為正式名稱、`--project` 為別名；`--json` 輸出單一物件（`result`、`actions`、`issues`，代碼固定）；結束碼只有在沒有衝突與失敗時為 0。

### 綁定推導只提出草稿，寫入需要確認

新腳本 `scripts/derive_binding.mjs`（唯讀）檢視 Storybook 專案並輸出建議的設定與每個值的證據（`--json` 供 agent 讀取）：

- token 前綴：token 檔中 `--<prefix>-(ref|sys|comp)-` 的出現次數，與 `.storybook/project.config.*` 的 `tokenPrefix`（有的話）交叉確認。
- tier 檔：entry 檔 `@import` 的順序與檔名。
- 元件根目錄與 class 前綴：`main` 的 stories glob、含 `data-component` 的元件目錄、`project.config` 的 `componentClassPrefixes`。
- 檢查指令候選：專案 `package.json` 中名稱或內容與 token 有關的 script（例如 `check:tokens`）。
- 元件規格目錄：token 真相目錄旁的 `design-system/components/`（只在其中的檔名對得上元件 id 時提出；Storybook 根目錄內的同名目錄列為疑似樣板殘留，不採用）。
- 套用後指令候選：專案說明文件中列出的產生指令，只列出、不自動採用。

無法由證據決定的值列在 `needsConfirmation`：哪一份 token 是真相、哪一份是鏡像（兩處內容相同時）、`workspaceRoot`、`stateDir`（預設建議為 workspaceRoot 下的 `.code-layer`，並檢查它在 Storybook 根目錄之外且與可寫檔同一個 volume）、專案之外的檢查腳本與其雜湊。`--write <確認後的設定檔>` 驗證後寫入，已有設定時拒絕。SKILL.md 規定 agent 把草稿與待確認項目逐項給使用者看，取得確認後才執行 `--write`。

理由：repo 的先例（storybook-tools-install 的元件目錄、hub 的專案綁定、orchestrator 的 bootstrap）都是「腳本蒐集證據、agent 呈現、人確認、驗證器把關、不覆寫專案擁有的檔」。真相與鏡像的方向一旦猜錯，每次套用都會把錯的那份當真相。

### skill 封裝與登錄

- `storybook-code-layer/SKILL.md`（英文，frontmatter 為 `name` 與 `description: >-`）：安裝後的系統長什麼樣、檔案歸屬（受管模板、專案擁有的綁定、receipt）、安全邊界（先讀目標專案的說明檔、先 dry run、Storybook 持有 lock 時不動、未經要求不 commit、不啟動任何付費 agent 程序）、前置條件、推導綁定、安裝、更新、移除、驗證、回報、守則。
- `storybook-code-layer/agents/openai.yaml`：`default_prompt` 以 `$storybook-code-layer` 呼叫。
- `storybook-code-layer/README.md`（繁中使用說明）更新為 v1。
- repo 根目錄 `README.md`：Skills 區新增一節（放在 storybook-tools-install 旁）、Repository Structure 的目錄樹、Per-skill installers 的指令區塊。
- `docs/skills-usage.md`：快速選擇表一列、`$storybook-code-layer` 一節。
- `docs/skills-guide.html`：`skills` 陣列一筆，使用既有的分類「工具與自動化」。
- `scripts/skill-dependencies.json`：`storybook-code-layer` 對 `design-system-extractor` 的 `support` 相依（綁定可以指向它的稽核與產生腳本；沒有時檢查清單為空、token 類套用不受稽核保護，SKILL.md 會說明）。
- 封存前的舊安裝器名稱不得出現在任何新檔案（storybook-tools-installer 規格的既有要求）。

## Implementation Contract

**行為（使用者看得到的）**

- 開啟工具後，選取、導覽、面板分區、可編輯與唯讀的判定、即時預覽、套用報告、還原，符合六份規格的每一個 Scenario。
- 0.1.0 已有而本 change 不改變的行為（請求防護、位元組級修補、候選樹檢查、交易與當機復原、寫入後驗證的四種結果）維持原狀，既有測試不得放寬。0.1.0 的「停靠與復原」由浮動檢視器取代：工具不再改動 Storybook 的版面狀態，對應的測試改為確認 Storybook 自己的面板不受影響。

**介面與資料形狀**

- 專案綁定 `code-layer.config.json`（`schemaVersion` 仍為 1，只新增選用鍵；不認得的鍵仍然是錯誤）：
  - `locale`: `"zh-Hant"` 或 `"en"`。
  - `tokens.tiers[].writable`: `comp` 與 `sys` 可為 true，`ref` 為 true 時設定無效。
  - `governance`: `{ componentSpecsDir?: string, pairing?: { containerSuffix: string, contentSuffix: string }, proseScan?: boolean }`。
  - `postApply`: `[{ id, command, args, cwd?, timeoutMs?, writes: string[] }]`。
- 索引（`GET /index`，`schemaVersion` 2）：每個宣告新增 `components: [{ text, shape, refIndex | null }]` 與 `shape` 的新值 `var-list`；token 項目新增 `scale`（類別與可比較的解析值）；新增 `governance` 摘要（規格目錄、漂移列數）。
- 操作（`POST /validate`、`POST /apply`，`schemaVersion` 仍為 1）：`rebind-declaration` 的 `replacements[0].refIndex` 可為任意非負整數；`rebind-token` 的 `token` 可為可寫的 sys token。回應新增 `documents`（被改寫的規格檔與行號）、`pending`（文件待同步項目）、`pairing`（配對警示）、`postApply`（各指令的結果，於指令結束後由 `GET /applies/:id` 取得）。
- 新路由：`POST /undo/reverse`（`{ applyId }`）、`POST /sync-mirror`（`{ dryRun }`）、`POST /pending-docs/resolve`（`{ ids }`）、`GET /applies/:id`。全部套用既有的請求防護；POST 需要 session header。
- 新拒絕碼：`reverse-not-applicable`（journal 沒有可反向的操作紀錄）。`tier-not-writable`、`tier-rule` 的語意擴及 sys 層。
- channel（payload `v` 為 2）：`selection` 的 trace 中每列以 `scopes`、`defaultScope` 取代 `verdict`，新增 `inheritedFrom`、`sides`；新增事件 `navigate`（manager → preview：parent、first-child、next、previous、或指定描述子）與 `children`（preview → manager：breadcrumb 與子元素清單）。
- 安裝器命令列：`install_code_layer.mjs --project-root <dir> [--config <file>] [--check | --update | --uninstall] [--dry-run] [--force-managed] [--json]`；`derive_binding.mjs --project-root <dir> [--json] [--write <file>]`。
- receipt `INSTALL_RECEIPT.json` 第 2 版：`{ schemaVersion: 2, name, version, manifestSha256, files, wiring: { main: { file, addedElement, addedResolveImport }, tsconfig }, installedAt }`。
- 狀態目錄新增 `pending-docs.json`。

**失敗模式**

- 任何拒絕（請求防護、schema、語意、檢查、鏡像不一致、唯讀模式）都不建立、修改或更名專案內的任何檔。
- 規格列不符合精確比對條件：不視為錯誤，token 照常寫入，產生待同步項目。
- 套用後指令失敗：不回滾，報告標示衍生文件未更新。
- 瀏覽器缺少必要功能：有效狀態為 suspended，不掛監聽。
- 安裝器任何衝突或前置條件不符：零寫入，結束碼非 0；寫入途中失敗：還原所有動過的檔。
- 靜默略過的只有一種：schema 1 的舊草稿在載入時捨棄（面板提示一次）。

**驗收方式**

- `node --test 'storybook-code-layer/test/*.test.mjs'` 全數通過（含新增的 sides、形狀、繼承分類、範圍、治理、反向套用、安裝器更新與移除、綁定推導）。
- `node storybook-code-layer/test/run_live_api.mjs` 與 `node storybook-code-layer/test/run_core_loop_browser.mjs --stage all` 在安裝了 v1 的試驗場全數通過；瀏覽器腳本以 CDP 真實輸入驗證選取導覽、各區段的改綁、繼承、範圍、步進、文件同步與還原，每次結束時試驗場檔案與開始前逐位元組相同。
- `node storybook-code-layer/scripts/build_template_manifest.mjs --check`、`node scripts/install_agent_skills.mjs --agent all --scope user --skill storybook-code-layer --dry-run`、`node --test scripts/test_install_agent_skills.mjs`、`spectra validate add-storybook-code-layer` 通過。
- `storybook build` 的產物除了 Storybook 自己的 addon 名稱清單外，不含本工具的任何程式或字串。

**範圍邊界**

- 範圍內：`storybook-code-layer/` 之下的模板、腳本、測試、文件；repo 根目錄的四個登錄檔；試驗場以安裝器升級。
- 範圍外：design-system-extractor、design-system-to-storybook、agent-automation-orchestrate 的任何檔案；`/agent/*` 端點與 AI 對話框；被檢視專案的元件程式碼（測試中的暫時修改都要還原）。

## Risks / Trade-offs

- [規格列改寫寫錯位置] → 只接受「唯一標題、唯一列、第一格全等、第二格全等」；位元組證明；與 token 同交易備份，可還原；fixture 涵蓋範圍列與前綴相同的名稱。
- [system token 的全域改動影響面大] → 預設關閉，需專案綁定開放；暫存前二次確認並顯示受影響元件數；被主題覆寫時不可用；仍經候選樹檢查。
- [繼承追蹤判錯來源，讓使用者改到非預期的祖先] → 每個可編輯列仍須通過 probe（以哨兵值證明該宣告驅動選取元素的計算值）；面板明示繼承來源與影響範圍。
- [邏輯屬性對應在罕見書寫模式出錯] → `sides.mjs` 以表列涵蓋 horizontal-tb、vertical-rl、vertical-lr 與 ltr／rtl，其餘（sideways-*）整列唯讀；probe 是最後防線。
- [面板列數變多，追蹤變慢] → 追蹤只在選取變更與樣式更新後執行一次；probe 仍在打開某一列時才做；以瀏覽器測試量測單次追蹤時間並記錄。
- [套用後指令執行時間長或卡住] → 逾時終止整個 process group；不阻擋下一次套用；結果非同步回報。
- [0.1.0 專案升級時 manager 快取或草稿格式不相容] → 草稿 schema 升版並捨棄舊草稿；更新後提示重啟 Storybook。
- [只在 Chromium 驗證] → 能力檢查避免半套執行；README 與 SKILL.md 明寫支援範圍。
- [開發機目前沒有 Node] → 實作第一步是確認 Node 24 可用並重跑 0.1.0 的全部測試作為基準；否則不開始。
- [安裝器刪除檔案的風險（移除為新功能、沒有先例）] → 只刪 receipt 記錄且雜湊相符的檔；限制在安裝目錄內；先 dry run；可回滾。

## Migration Plan

1. 確認開發機有 Node 24，重跑 0.1.0 的單元、API、瀏覽器測試作為基準。
2. 依 tasks 的順序實作；每一組完成後以 `dev_sync.mjs` 同步到試驗場並跑對應的瀏覽器階段。
3. 模板版本改為 1.0.0，重建清單，把 0.1.0 的清單雜湊寫入 `KNOWN_MANIFESTS.json`。
4. 試驗場以 `install_code_layer.mjs --project-root … --update --dry-run` 確認計畫，再實際更新；在綁定加入 `governance.componentSpecsDir`（`../design-system/components`）與 `postApply`。
5. 回復方式：試驗場以 `--uninstall` 移除後，用分支 feat/storybook-code-layer 上 0.1.0 的安裝器重新安裝；journal 與備份不受影響。repo 端以 git 回復。

## Open Questions

- `system-token` 範圍在試驗場是否開放：技術上支援，是否把 80sJP-Fable 的 sys 層標為可寫由使用者決定（預設不開）。
- 試驗場的 `postApply` 是否也要跑三支 strict audit（它們已是寫入前的檢查；專案的 CLAUDE.md 要求在文件或 token 變更後執行）。目前規劃只跑兩個產生器。
- Safari 與 Firefox：能力檢查通過時是否值得各做一次手動驗證並列入支援範圍，留待 v1 完成後依需求決定。
