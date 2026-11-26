## Why

Code Layer 的檢視器最上面是 Layout 區（display、方向、對齊、分佈、換行），1.1.0 把它整區標為「版面結構屬性，只供檢視」。使用者在 2026-11-25 試用後問這些鎖是不是功能還沒開發，並決定下一階段的順序是 B（開放版面結構）→ C（AI 對話框）→ A（寫死的數值換成 token），而且直接實作 B。

這一區相當於 Figma 的 Auto layout 面板，是設計師最常調整的東西。它的值是 CSS 關鍵字（`row`、`center`、`space-between`），選項是固定的幾個，所以可以和改綁 token 一樣由伺服器算出來並證明，不需要 AI。試驗場（80sJP-Fable）的實測：7 個元件樣式表裡有 35 個這類宣告（display 13、flex-direction 7、align-items 11、justify-content 4），目前全部只能看；另外有 9 個 flex 容器沒有寫 `flex-wrap`，多數沒有寫 `justify-content`，要調整就得新增一行宣告。

## What Changes

- **flex 容器的四列可以編輯**：選取的元素是 flex 容器（`display: flex` 或 `inline-flex`）時，方向（`flex-direction`）、對齊（`align-items`）、分佈（`justify-content`）、換行（`flex-wrap`）四列可以點開，從固定的選項裡挑。滑過即預覽，選了才暫存，按「套用到檔案」才寫入，可以還原。
- **選項是固定清單**：方向 4 個、換行 2 個、對齊 5 個、分佈 6 個（見規格）。不能輸入其他值。
- **已經有宣告就改那個宣告**：把那個關鍵字換成選的關鍵字，其餘位元組不動。`flex-flow: column wrap` 這種簡寫可以分別改方向與換行。
- **沒有宣告就新增一行**：加在宣告 `display` 的那條規則的最後，縮排與換行照該規則既有的寫法。檢視器會先說明要新增在哪條規則。
- **flex 容器的這四列一律顯示**，即使還沒有宣告（1.1.0 會把沒有宣告的列收起來）。
- **不是 flex 容器時維持唯讀**並說明原因；`display` 本身仍然只供檢視。
- **兩種新的寫入操作**：`set-keyword`（換掉一個關鍵字）與 `add-declaration`（新增一行版面宣告）。伺服器自己驗證屬性與關鍵字都在固定清單內、新增的那條規則確實宣告了 flex、而且還沒有這個屬性。請求不能提供清單以外的文字。
- **位元組證明擴大**：涵蓋「換掉一個分量」與「在規則最後插入一行」。插入的證明是新檔等於舊檔在一個位置多出預期的位元組，重新解析後只多出那一個宣告。
- **還原**：整檔還原不變。檔案被別人改過時的「只改回這一筆」，會把關鍵字換回當初記下的那一個，或把當初插入的那一行原樣移除。
- **待同步文件**：每一筆版面變更記一條「這個宣告沒有對應的規格表」，提醒更新元件規格。
- **版本與文件**：模板版本 1.2.0；`docs/code-layer-guide.html` 在同一個 change 更新。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-layer-style-tracing`: 版面結構的列不再一律唯讀；新增 flex 容器的版面列如何判定與定址，以及索引標示哪些規則可以新增宣告。
- `code-layer-write-back`: 操作由兩種變成四種；位元組證明涵蓋關鍵字替換與插入宣告；反向套用涵蓋這兩種操作。
- `code-layer-panel`: 版面列點開是選項而不是 token 選擇器；flex 容器的版面列不收起；變更清單的一行顯示舊值與新值。
- `code-layer-governance`: 版面操作也產生待同步文件。

## Impact

- Affected specs: `code-layer-style-tracing`、`code-layer-write-back`、`code-layer-panel`、`code-layer-governance`。
- 相依：add-storybook-code-layer 已於 2026-11-25 封存，四個 capability 的基底規格在 `openspec/specs/`。
- 與其他提案的關係：add-code-layer-tokenize-literals（A，尚未核可，排在 C 之後）修改同幾條需求（Operations、Byte-exact patching、Undo、Documents pending sync、Changes list、Property rows in the panel），它的 delta 以本 change 之前的文字為基底，實作前要改以本 change 封存後的文字為基底。add-code-layer-ai-dialog（C）不修改這些需求。
- Affected code（皆在 `storybook-code-layer/` 之下，另列者除外）:
  - New:
    - template/code-layer/shared/layout.mjs、layout.d.mts（版面屬性與各自的固定選項、flex 的判定、會設定這些屬性的簡寫）
    - template/code-layer/manager/components/LayoutOptions.tsx
    - test/test_layout.test.mjs
  - Modified:
    - template/code-layer/shared/api-contract.mjs、protocol.ts、properties.ts、sides.mjs、value-refs.mjs、value-refs.d.mts、labels.ts、reference.ts、brief.ts、messages.zh-Hant.ts、messages.en.ts
    - template/code-layer/server/operations.mjs、patcher.mjs、transaction.mjs、css-index.mjs、index-builder.mjs、pending-docs.mjs
    - template/code-layer/runtime/tracer.ts、livePreview.ts、verify.ts
    - template/code-layer/manager/drafts.ts、actions.ts、apply.ts、icons.tsx、components/Field.tsx、RowPopover.tsx、ChangesBar.tsx、Report.tsx
    - template/code-layer/package.json（版本 1.2.0）、template/TEMPLATE_MANIFEST.json、template/KNOWN_MANIFESTS.json
    - README.md、SKILL.md
    - test/run_core_loop_browser.mjs、run_live_api.mjs
    - （repo 根目錄）README.md、docs/code-layer-guide.html、docs/skills-usage.md、docs/skills-guide.html
  - Removed: (none)
- 與「只改綁既有 token」的關係：這是工具第一次寫入 token 以外的值。這些值是 CSS 關鍵字，沒有 token 可綁；工具仍然不能寫入數值、顏色或任何清單以外的文字。README 與說明文件要把這條界線寫清楚。
- 寫入端點的能力範圍：1.1.0 的端點只能把 `var()` 裡的 token 名稱換成另一個既有的 token。這個 change 之後，它還能在封閉可寫集合內把四個版面屬性的關鍵字換成固定清單中的另一個，以及在宣告了 flex 的規則裡新增一行這四個屬性之一。使用者在 2026-11-20 接受的風險（同源的程式碼也能呼叫寫入端點，損害限於封閉可寫集合而且可以還原）範圍因此擴大到這些版面變更；仍然不能寫入任意文字、不能新增檔案，每一筆都在還原堆疊上。
- 專案綁定（`code-layer.config.json`）沒有新增的鍵；1.1.0 的專案以安裝器 `--update` 升級即可。
- journal 的操作紀錄新增欄位。1.1.0 寫下的紀錄仍可照常還原與反向套用。
- 不呼叫任何外部服務，沒有用量成本。
