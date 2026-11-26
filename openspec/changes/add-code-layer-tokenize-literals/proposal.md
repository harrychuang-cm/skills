## Why

Code Layer 1.1.0 能改的只有「已經綁了 token 的值」。元件樣式表裡直接寫死的數值（`margin: 0`、`max-inline-size: 70%`、`line-height: 1`、`8px`、`#FE0B05`）在檢視器上是鎖住的一列，原因寫著「寫死的數值，沒有綁定 token」，唯一的出口是複製物件參照交給 AI。使用者在 2026-11-25 試用後問這些鎖是不是功能還沒開發，並決定下一階段先做這一項。

這種修改和改綁一樣可以由伺服器算出來並證明：把宣告值裡那一個寫死的分量換成 `var(--既有的 token)`，其餘位元組不動。它不需要 AI，也不需要新增任何 token。

試驗場（80sJP-Fable）的實測，2026-11-25：7 個元件樣式表共 244 個宣告，其中 17 個寫死的分量落在檢視器的列上，目前全部鎖住。

| 寫死的值 | 個數 | 這個 change 之後 |
| --- | --- | --- |
| `margin: 0`（含簡寫中的 `0`） | 9 | 可以換成 token；候選以 spacing token 為先（8 個） |
| 百分比尺寸：`100%`、`70%` | 7 | 可以換成 token；候選以 size token 為先（2 個） |
| `line-height: 1` | 1 | 可以換成 token；候選以 typescale token 為先（29 個） |

這 17 個當中沒有任何一個有「數值相同」的 token。所以在試驗場，這項功能做的是設計變更（給寫死的值一個 token，外觀會跟著變）；在寫死的數值剛好重複了 token 數值的專案（尚未整理或由 AI 產生的程式碼很常見），它做的是外觀不變的整理。兩種情況用同一條路。

## What Changes

- **寫死的值可以換成 token**：檢視器上值是寫死的那一列不再鎖住，改成「還沒綁 token」的樣子，點開就是 token 選擇器。選了之後即時預覽，按「套用到檔案」才寫入。
- **只換成既有的 token**：候選是這個宣告本來就可以引用的 token（system token，或同一個元件的 component token），而且型別必須是這個屬性接受的型別。不新增 token，也不能把數值改成另一個寫死的數值。
- **候選依三組排序**：先是數值相同的（換了外觀不變，標示「數值相同」），再是這個屬性在專案裡已經用過的類別（依數值由近到遠），最後才是其他類別。這樣 `margin: 0` 不會被建議換成數值同為 0 的圓角 token。
- **新的寫入操作 `tokenize-literal`**：以宣告加上「值裡的第幾個分量」定址。伺服器自己判斷這個分量設定哪些邊、目標 token 的型別合不合，並自己算出新值。請求不能提供任何要寫入的文字。
- **位元組證明擴大到一個分量**：寫入前證明新檔等於舊檔把那個分量的位元組換成 `var(--名稱)`，其餘逐位元組相同，重新解析後節點序列不變。
- **還原**：整檔還原不變。檔案被別人改過時的「只改回這一筆」會把當初伺服器自己記下的那個字面值寫回原位。
- **驗證多一種結果**：換成數值相同的 token 時，外觀本來就不該變。這種情況回報「已驗證，外觀不變」，不再歸到「此頁看不到效果」。
- **同一個宣告上的改綁與換 token 可以同一批套用**，例如 `margin: 0 var(--gap)` 同時把 `0` 換成 token、把 `--gap` 改綁。
- **待同步文件**：每一筆換 token 記一條「這個宣告沒有對應的規格表」，不會拿字面值（例如 `0`、`8px`）去搜尋文件。
- **仍然鎖住並說明原因的值**：關鍵字（`auto`、`bold`）、運算式（`calc()`）、以逗號或斜線分隔的值（字體清單、橢圓圓角），以及專案裡沒有任何型別相符的 token 的情況。
- **版本與文件**：模板版本 1.2.0；`docs/code-layer-guide.html` 在同一個 change 更新（旅程、常見問題、模擬器、更新紀錄）。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-layer-style-tracing`: 寫死的分量從「一律唯讀」改為在符合條件時可以換成 token；這種列只有「宣告」一個範圍。
- `code-layer-write-back`: 操作由兩種變成三種；位元組證明涵蓋分量替換並限定可寫入的位元組；反向套用可以寫回記錄下來的字面值；驗證結果由四種變成五種。
- `code-layer-panel`: 寫死值的列的呈現、選擇器在這種列上的候選與排序、變更清單的一行、這種列不提供逐級調整。
- `code-layer-governance`: 換 token 的操作也產生待同步文件，但不搜尋字面值。

## Impact

- Affected specs: `code-layer-style-tracing`、`code-layer-write-back`、`code-layer-panel`、`code-layer-governance`（皆為修改既有需求）。
- 相依與封存順序：這四個 capability 由 add-storybook-code-layer 建立，它已完成（41/41）但尚未封存。本 change 的 MODIFIED 需求以它的規格為基底，所以 add-storybook-code-layer 必須先封存，本 change 才能封存。實作不受影響。
- 與 add-code-layer-ai-dialog 無相依。該提案寫在 1.1.0 之前，它引用的版本號與已移除的面板檔名需要在核可前另行更新。
- Affected code（皆在 `storybook-code-layer/` 之下，另列者除外）:
  - New:
    - template/code-layer/shared/property-table.mjs、property-table.d.mts（檢視器的屬性表，伺服器與瀏覽器共用同一份）
    - template/code-layer/shared/literals.mjs、literals.d.mts（寫死分量的判定、替換、數值比較、候選排序）
    - test/test_literals.test.mjs
  - Modified:
    - template/code-layer/shared/properties.ts（改為讀共用的屬性表）、api-contract.mjs、protocol.ts、reference.ts、messages.zh-Hant.ts、messages.en.ts
    - template/code-layer/server/operations.mjs、patcher.mjs、transaction.mjs、pending-docs.mjs
    - template/code-layer/runtime/tracer.ts、livePreview.ts、verify.ts
    - template/code-layer/manager/drafts.ts、actions.ts、apply.ts、components/Field.tsx、RowPopover.tsx、ChangesBar.tsx、Report.tsx
    - template/code-layer/package.json（版本 1.2.0）、template/TEMPLATE_MANIFEST.json、template/KNOWN_MANIFESTS.json
    - README.md、SKILL.md
    - test/test_patcher.test.mjs、test_transaction.test.mjs、test_write_routes.test.mjs、test_governance.test.mjs、test_i18n.test.mjs、run_core_loop_browser.mjs、run_live_api.mjs
    - （repo 根目錄）docs/code-layer-guide.html、docs/skills-usage.md
  - Removed: (none)
- 寫入端點的能力範圍：1.1.0 的端點只能把 `var()` 裡的 token 名稱換成另一個既有的 token。這個 change 之後，它還能把封閉可寫集合內某個宣告的一個寫死分量換成 `var(--既有的 token)`。使用者在 2026-11-20 接受的風險（同源的程式碼也能呼叫寫入端點，損害限於封閉可寫集合而且可以還原）範圍因此略為擴大：同源的程式碼也能觸發這種替換。它仍然不能寫入任意文字、不能新增檔案，每一筆都在還原堆疊上。
- 專案綁定（`code-layer.config.json`）沒有新增的鍵；1.1.0 的專案以安裝器 `--update` 升級即可。
- journal 的操作紀錄新增欄位（分量位置、字面值）。1.1.0 寫下的紀錄仍可照常還原與反向套用。
- 不呼叫任何外部服務，沒有用量成本。
