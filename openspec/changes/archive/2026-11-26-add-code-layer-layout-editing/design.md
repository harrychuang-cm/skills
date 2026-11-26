## Context

Code Layer 1.1.0 的寫入只有一種形狀：把 `var()` 裡的 token 名稱換成另一個既有的 token。檢視器的 Layout 區有五個群組（display、direction、alignItems、justifyContent、wrap），屬性表把它們標為 `editable: false`，追蹤結果一律是唯讀、原因 `structural`。

與這個 change 有關的現況（2026-11-25 讀碼與實測）：

- 追蹤已經把每個 slot 對到「哪個宣告的第幾個分量」。`flex-direction`、`flex-wrap`、`align-items`、`justify-content` 各自是一個 slot；`flex-flow` 簡寫已經能拆成方向與換行兩個分量（`shared/sides.mjs`）。`place-items`、`place-content` 不在表內，追蹤會當它們不存在。
- 索引把整個值都是關鍵字的宣告標為 `keyword`，分量也標為 `keyword`。
- 寫入的證明在 `server/patcher.mjs`：每筆編輯是一段位元組區間換成另一段文字，證明新檔等於舊檔把這些區間換掉，再重新解析比對節點序列。區間目前只會是 token 名稱，節點數必須相同。
- 即時預覽以索引給的原始值為基底，替換後整段 `rule.style.setProperty`。移除一張樣式表的所有預覽是把 `<style>` 的 textContent 設回自己。
- 沒有宣告也沒有繼承來源的列，檢視器預設收起（每區有一個「顯示其他」的控制項）。
- 反向套用由 journal 的操作紀錄建立反向操作，再走一般的 `runBatch`。
- 試驗場的實測數字見 proposal。量測只讀檔。

使用者已定案的方向：就地編輯、先暫存再套用、預設改元件本身、工具介面用 Storybook 的主題。本 change 是工具第一次寫入 token 以外的值，使用者在 2026-11-25 得知「這些值會直接寫進元件樣式」後決定實作。

## Goals / Non-Goals

**Goals:**

- flex 容器的方向、對齊、分佈、換行可以在檢視器上調整，手感與 Figma 的 Auto layout 面板相近：看得到目前的設定，點開、挑選、即時預覽、套用、還原。
- 還沒寫的屬性也能設定（新增一行宣告），而且看得到會寫在哪裡。
- 1.1.0 的安全性質全部保留：封閉可寫集合、位元組級最小差異、拒絕時零寫入、可還原、驗證不自我證明、請求不能提供清單以外的文字。
- 不能編輯的情況都說得出原因。

**Non-Goals:**

- 改變 `display`（把一般區塊變成 flex、flex 變成 grid、隱藏元素）。這會改變元素的盒模型與子元素的排版方式，影響面大，維持只供檢視。
- grid 容器的版面屬性。`align-items`、`justify-content` 在 grid 裡的意義不同，`flex-direction`、`flex-wrap` 不適用。
- 拖曳調整大小與位置、調整子元素的順序、`align-self`、`flex-grow`、`order`。
- 間距（gap）與內距（padding）：它們已經能用 token 調整，不在這個 change。
- 寫入清單以外的關鍵字（`start`、`safe center`、`wrap-reverse`）。已經寫著這些值的宣告可以改成清單內的值，但不能從清單內改成它們。
- 選擇把新宣告寫在哪一條規則（例如只寫在某個變體的規則）。這一版只有一個位置。
- 單一實例覆寫、強制狀態、Shadow DOM、行內樣式的編輯（與 1.1.0 相同）。

## Decisions

### 可以編輯的是 flex 容器的四個屬性，選項是固定清單

| 列 | 屬性 | 選項 |
| --- | --- | --- |
| 方向 | `flex-direction` | `row`、`column`、`row-reverse`、`column-reverse` |
| 換行 | `flex-wrap` | `nowrap`、`wrap` |
| 對齊 | `align-items` | `flex-start`、`center`、`flex-end`、`stretch`、`baseline` |
| 分佈 | `justify-content` | `flex-start`、`center`、`flex-end`、`space-between`、`space-around`、`space-evenly` |

這張表放在新的 `shared/layout.mjs`，伺服器與瀏覽器共用。

只有選取元素的計算後 `display` 是 `flex` 或 `inline-flex` 時，這四列才可以編輯。其他情況（block、grid、inline…）這些屬性沒有作用或意義不同，列維持唯讀，原因是 `not-flex-container`。

清單只收常用而且各瀏覽器行為一致的值。`start`／`end`、`safe`／`unsafe`、`first baseline`、`wrap-reverse` 不收：多一個選項就多一個設計師要理解的差別，而且 `start` 與 `flex-start` 在 flex 容器裡結果相同。

### 有宣告就改那個分量，沒有宣告就新增在宣告 display 的規則

一列的寫入目標只有一個，依情況決定：

1. **有勝出的宣告**（在通過身分檢查而且可寫的元件樣式表內）：目標是那個宣告裡設定這一列的分量。條件與改綁相同（不是 `!important`、規則內不重複、沒有被同規則後面的宣告蓋掉），另外該分量必須是單一關鍵字。操作是 `set-keyword`。
2. **沒有任何宣告設定這一列**：目標是「該元素勝出的 `display` 宣告所在的那條規則」，在它最後新增一行。條件是那條規則在可寫的元件樣式表內，而且索引標示它可以新增宣告。操作是 `add-declaration`。

新增的位置選「宣告 display 的規則」，理由是 Auto layout 的設定屬於「讓它成為 flex 容器的那條規則」，開發者也會把方向與對齊寫在 `display: flex` 旁邊。這條規則一定套用在選取的元素上，而且沒有任何規則宣告這個屬性，所以新增的宣告一定生效（仍由 probe 確認）。

替代方案「加在該元素優先權最高的規則（通常是變體的規則）」影響範圍較小，但同一個元件的方向會散在不同規則裡；而且已有宣告的情況本來就是改勝出的那個宣告，位置可能就是基底規則，兩種情況的行為會不一致。讓使用者選規則則留到之後。

檢視器會顯示目標規則的選擇器與影響的宣告數，新增時明說「會在這條規則新增一行」。

唯讀的原因：`not-flex-container`；勝出的宣告含有 `var()` 或不只一個關鍵字為 `layout-not-keyword`；由 `place-items`／`place-content` 簡寫設定為 `unsupported-shorthand`；宣告或 display 所在的樣式表不可寫、不是元件樣式表，沿用既有的原因；規則不能新增宣告為 `rule-not-appendable`。

### place-items 與 place-content 列為會設定版面屬性的簡寫

`shared/sides.mjs` 新增這兩個簡寫：`place-items` 影響 `align-items`，`place-content` 影響 `justify-content`，但不拆分量（它們的第一個值分別對應 `align-items` 與 `align-content`，規則不直觀）。追蹤結果是該列由簡寫設定、唯讀、原因 `unsupported-shorthand`。

不這樣做的話，寫了 `place-items: center` 的規則會被當成沒有設定對齊，工具會再新增一行 `align-items`。

### 索引標示哪些規則可以新增宣告

`server/css-index.mjs` 為每條規則加上 `append: { ok, reason }`。可以新增的條件：

- 規則至少有一個宣告，而且最後一個節點是宣告或註解。
- 最後一個宣告以分號結束。
- 規則內沒有巢狀規則、沒有巢狀 at-rule。

不符合時該規則不能新增宣告，原因分別是 `empty-rule`、`no-trailing-semicolon`、`nested-content`。這些情況要安全地插入都得多改別的位元組（補分號、決定縮排、處理巢狀規則之後的宣告順序），維持唯讀比較誠實。試驗場 82 條規則沒有巢狀，格式一致。

### 操作 set-keyword 與 add-declaration 由伺服器驗證屬性、關鍵字與規則

```jsonc
{ "id": "op-1", "type": "set-keyword",
  "file": "src/components/badge-seal/BadgeSeal.css",
  "rule": { "ordinal": 0, "selector": ".md-badge-seal", "atRules": [], "occurrence": 0 },
  "declaration": { "property": "justify-content" },
  "component": 0,
  "fromKeyword": "center", "toKeyword": "flex-start",
  "before": { "value": "center" }, "after": { "value": "flex-start" } }

{ "id": "op-2", "type": "add-declaration",
  "file": "src/components/badge-seal/BadgeSeal.css",
  "rule": { "ordinal": 0, "selector": ".md-badge-seal", "atRules": [], "occurrence": 0 },
  "declaration": { "property": "flex-wrap" },
  "toKeyword": "wrap",
  "after": { "value": "wrap" } }
```

`set-keyword` 的檢查：

- 檔案、規則、宣告的定位，以及 `!important`、規則內重複、被蓋掉，與 `rebind-declaration` 相同。
- 宣告的屬性是四個版面屬性之一，或 `flex-flow`；第 `component` 個分量是單一關鍵字、文字等於 `fromKeyword`，宣告的值等於 `before.value`（否則 `stale-before`）。
- 這個分量設定的屬性（`flex-flow` 由伺服器以 `sidesOf` 判斷是方向還是換行）的清單包含 `toKeyword`（否則 `keyword-not-allowed`）。
- 新值由伺服器算出，必須等於 `after.value`。

`add-declaration` 的檢查：

- 檔案與規則的定位同上；屬性是四個版面屬性之一，`toKeyword` 在它的清單內。
- 該規則自己宣告了 `display`，值是 `flex` 或 `inline-flex`，而且不是 `!important`（否則 `rule-not-eligible`）。這是伺服器端的防線：請求不能把版面宣告加進任意規則。
- 該規則沒有宣告這個屬性，也沒有宣告會設定它的簡寫（`flex-flow`、`place-items`、`place-content`）；索引標示它可以新增宣告（否則 `rule-not-eligible`，details 說明是哪一項）。
- 同一批不能對同一條規則的同一個屬性新增兩次（`duplicate-target`）。

請求能影響的寫入文字只有兩種：索引中的 token 名稱，或固定清單裡的關鍵字。屬性名稱也來自固定清單。

新增兩個拒絕碼：`keyword-not-allowed`、`rule-not-eligible`。

### 位元組證明涵蓋換掉一個分量與插入一行

`patcher.mjs` 的編輯一般化為三種，共用同一套區間與證明：

- **名稱編輯**（既有）：`var()` 裡的 token 名稱。
- **分量編輯**：宣告原始值中第 n 個最上層分量的起訖位置（`splitTopLevel` 在遮掉註解與字串後計算），換成新的關鍵字。
- **插入**：長度為零的區間，位置是該規則最後一個節點（宣告的分號，或其後的註解）結束之處；插入的文字是「該規則最後一個宣告之前的空白（`raws.before`，含換行與縮排）＋ `屬性: 關鍵字;`」。PostCSS 把註解當成獨立的節點，所以這段空白正常情況下只有空白字元；萬一含有其他字元，改用「換行＋最後一個宣告的縮排」。換行沿用檔案既有的形式（CRLF 的檔仍是 CRLF）。屬性名稱與關鍵字在產生任何位元組之前先以識別字的樣式檢查，不合就拒絕。

兩道證明：

1. 位元組：新檔等於舊檔把已知區間換成預期位元組，其餘各段逐位元組相同。插入與移除只是區間一端長度為零。
2. 重新解析：除了預期新增或移除的宣告之外，節點序列相同；未被定址的宣告原始值不變；被定址的宣告等於預期的新值；新增的宣告必須是它所在規則的最後一個宣告，屬性與值等於預期。

分量編輯之後 add-code-layer-tokenize-literals 也用得到，所以以「第 n 個分量」而不是「關鍵字」為單位實作。

### 反向套用換回記下的關鍵字或移除插入的那一行

整檔還原（備份寫回）不變。journal 的操作紀錄多記：`set-keyword` 的分量位置與新舊關鍵字；`add-declaration` 實際插入的文字。

- `set-keyword` 的反向是把同一個分量由新關鍵字換回舊關鍵字。舊關鍵字可能不在清單內（例如原本寫的是 `start`），所以反向操作允許清單以外的目標，但它必須等於 journal 記下的舊值，而且是單一識別字。該分量現在不是當初寫入的關鍵字時，以 `stale-before` 拒絕。
- `add-declaration` 的反向是內部操作 `remove-declaration`：該規則裡那個屬性的宣告必須仍然是當初寫入的關鍵字，而且它前後的位元組仍然等於 journal 記下的插入文字，才整段移除；否則以 `stale-before` 拒絕。
- 這兩種反向形式只由伺服器的 `reverse` 建立；來自 HTTP 的批次含有 `remove-declaration`、或 `set-keyword` 的目標不在清單內時，一律拒絕。

### 預覽、probe 與驗證

- **預覽**：`set-keyword` 以索引的原始值為基底，替換分量後整段 `setProperty`；`add-declaration` 對目標規則 `setProperty(屬性, 關鍵字)`。移除預覽沿用「把 `<style>` 的 textContent 設回自己」，新增的屬性會一起消失。
- **草稿的分類**不讀 CSSOM：頁面樣式表文字的雜湊先要等於索引的雜湊，再看索引。`set-keyword`：該分量仍是舊關鍵字為尚未寫入，已是新關鍵字為已寫入，其他為衝突。`add-declaration`：規則沒有這個屬性為尚未寫入，有而且值是新關鍵字為已寫入，其他為衝突。
- **probe**：哨兵值是該列清單中與目前計算值不同的一個關鍵字。`set-keyword` 把它放到分量的位置；`add-declaration` 暫時加上屬性再移除。量到計算值改變而且復原才算確認。既有的「規則文字前後相同，否則由樣式表自己的文字重建」保護照用。
- **驗證**不需要新的結果種類：版面屬性的計算值就是關鍵字，預覽開與關的值不同，既有的四種結果已經涵蓋。見證屬性是該列的屬性。

### 檢視器上的呈現

- flex 容器的四個版面列一律顯示，即使沒有宣告。每列是圖示、短標籤與目前的值（以該選項的圖示加名稱顯示）。沒有宣告時顯示計算值，並以較淡的樣式表示是預設值。
- 點開是選項浮層（新元件 `LayoutOptions.tsx`），不是 token 選擇器：每個選項一個圖示加名稱，目前的值有標記。滑過即預覽、選了才暫存並關閉、關閉不選則移除預覽，與 token 選擇器相同。probe 確認前選項不能選。
- 浮層下方一行說明寫入位置：改既有的宣告時是「改 `<選擇器>` 的 `<屬性>`」，新增時是「會在 `<選擇器>` 新增一行」。開發者資訊開啟時另外顯示檔案與行號。
- 這些列沒有範圍切換，也沒有逐級調整。
- 新增宣告的變更暫存後，再打開同一列的浮層會多一個「取消這個變更」，因為這種列沒有「原本的值」可以選回去。
- 圖示與選項的名稱依元素的書寫方向與目前的 flex 方向決定（`flex-start` 在橫排的分佈是「靠左」、在直排是「靠上」），避免設計師需要理解主軸與交叉軸。選項右邊同時顯示 CSS 的關鍵字。
- 變更清單的一行是「舊值 → 新值」，新增時舊值顯示為「未設定」。
- `display` 列維持鎖頭，tooltip 是「display 只供檢視」。非 flex 容器的版面列維持鎖頭並說明原因。
- 所有新字串加進 `messages.zh-Hant.ts` 與 `messages.en.ts`。

### 文件待同步只記宣告本身

每筆 `set-keyword` 與 `add-declaration` 產生一條 `declaration-not-documented`（元件樣式表的宣告沒有對應的規格表），同一行有註解時另記一條。元件規格若以文字描述版面，工具無法判斷哪一句過期，所以由這一條提醒人或 AI 去看。

不搜尋文件中提到舊值的地方：`row`、`center` 這類字在文件裡到處都是。不動 token 檔，所以不重寫 Token Contract 的列，也不跑 token 檢查。

## Risks / Trade-offs

- **改的是共用的規則，會影響所有套用那條規則的元素（包含其他變體）** → 列與變更清單顯示目標規則與影響數；暫存期間只是預覽；套用後可以還原。讓使用者選擇規則留到之後。
- **工具開始寫入 token 以外的值** → 只限四個屬性與固定的關鍵字清單，伺服器驗證；README、SKILL.md 與說明文件把界線寫清楚：數值、顏色、字級仍然只能用 token。
- **寫入端點的能力範圍擴大**（見 proposal 的 Impact）→ 新增宣告只能加進自己宣告了 flex 的規則，而且只能是這四個屬性；每一筆可還原。
- **元件規格用文字描述版面時會過期** → 每筆變更產生待同步文件。
- **新增的一行在格式特殊的檔案裡可能與周圍風格不同**（例如屬性依字母排序）→ 一律加在規則最後；規則不符合可新增的條件時維持唯讀。
- **關鍵字清單以外的既有值**（`start`、`normal`）顯示為目前的值但不在選項裡 → 可以改成清單內的值；還原會換回原本的值。
- **1.1.0 的 journal 沒有新欄位** → 既有紀錄只會是兩種改綁操作，反向套用的邏輯不變。

## Migration Plan

1. 模板版本 1.2.0，`KNOWN_MANIFESTS.json` 加入 1.2.0。
2. 既有專案以 `install_code_layer.mjs --update` 升級；專案綁定不需要修改。
3. 試驗場升級前先記錄新的雜湊基準與還原堆疊（試驗場有使用者自己的兩筆套用，測試不得還原它們），升級時由我停掉並重啟 6006 上的 Storybook。
4. 回復方式：以安裝器裝回 1.1.0 的模板。已經用 1.2.0 套用的版面變更仍可用整檔還原（備份）取消；1.1.0 不認得這兩種操作的反向套用。

## Open Questions

(none)
