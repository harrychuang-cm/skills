# 執行紀錄：add-storybook-code-layer

每個任務完成時在這裡記下實際執行的驗證與結果。指令都在 `storybook-code-layer/` 下執行，前置 `CODE_LAYER_TEST_PROJECT=<試驗場 storybook 根目錄>`。

## 環境（2026-11-24）

- Node：`/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node`（v24.22.1）。這台機器原本的 `/usr/local/bin/node` 與 Homebrew 都不在了，也沒有 npm；Cursor 內建的這一份是目前唯一的 Node 24。
- Storybook 啟動時找不到套件管理器會直接結束。啟動 dev server 與 build 時以環境變數 `npm_config_user_agent=npm/… node/…` 指名 npm（Storybook 只需要名稱，dev 與 build 都不會真的執行它）。`run_build_check.mjs` 在偵測不到 npm／pnpm／yarn 時會自動帶上這個變數。
- 試驗場：`cm-ds-extractor-lab/80sJP-Fable/storybook`，安裝的是 0.1.0（與模板逐位元組相同）。

## 1.1 基準（2026-11-24）

| 指令 | 結果 |
| --- | --- |
| `node --test 'test/*.test.mjs'` | 48 項：47 通過、1 略過（需要 `CODE_LAYER_LAB_CONFIG` 的試驗場數字檢查） |
| `node test/run_live_api.mjs --log <storybook log>` | 8/8 |
| `node test/run_core_loop_browser.mjs --stage 6,7,11` | 42/42（補上 6.19 之前）；加上 6.19 後為 43 項 |
| `node test/run_build_check.mjs` | 3/3，結束碼 0（158 個產物檔、8 個標記字串 0 命中） |

第一次跑瀏覽器測試時行程在 11.5 之後被外部中斷（結束碼 137），留下一筆未還原的測試套用；已用 `POST /undo` 還原並以雜湊確認試驗場回到原狀，再完整重跑一次得到上表的 42/42。

對照任務列出的需求時發現兩處在 0.1.0 沒有自動化檢查，已補上：「Effective state」的暫停原因（Docs 頁、Figma export、Prototype Inspector）新增瀏覽器 6.19；「Command-line access」新增 `test_cli.test.mjs`。補上後單元測試為 51 項（50 通過、1 略過），瀏覽器階段 6、7、11 為 43 項。

### 既有需求與對應的檢查

| 需求 | 檢查 |
| --- | --- |
| Development-only activation | `run_build_check.mjs` 三項；瀏覽器 6.2（開關寫入網址的 global）、7.8（重新整理後仍開啟） |
| Effective state | 瀏覽器 6.16、6.17（直接開 iframe、被其他來源 frame 時不啟動）、6.18（關閉後移除外框）、6.19（三種暫停原因顯示在開關與面板，回到 active 後重新選取）、7.9（切換 story 後預覽仍在） |
| Hover and selection overlay | 瀏覽器 6.2（top layer）、6.3（story DOM 不變）、6.4、6.5、6.6（旋轉）、6.13、6.14（捲動）、11.9（複製物件參照） |
| Story isolation while active | 瀏覽器 6.8（單鍵不到 story 與 Storybook、Alt 組合鍵放行）、6.15（連結不被觸發）、6.18 |
| Shared rule ordinal | `test_index.test.mjs`「ordinal walk: keyframes skipped, every grouping rule entered, nested parent first」；瀏覽器 6.11 |
| Byte-exact patching | `test_patcher.test.mjs` 的七項 patch／decode 測試與「real files: patch every var() name and patch it back, byte-exact」 |
| Checks run on a candidate tree before any write | `test_transaction.test.mjs`「apply rebind-token: … checks saw the candidate …」、「a failing check writes nothing (mtime and inode unchanged)」、「baseline failing or script missing: …」；API 10.1 |
| Transaction, journal and crash recovery | `test_transaction.test.mjs`「kill -9 between two writes: …」、「a file edited by hand after a crash is never overwritten; …」、「a live lock owner makes a second engine read-only」、「the undo stack survives a restart …」；API 10.6、10.8 |
| Hot update delivery | `test_transaction.test.mjs`「re-announce: notifyChanged receives only files inside the project root」；API 10.7；瀏覽器 11.1、11.2 |
| Request guard | `test_http.test.mjs` 全部七項；`test_write_routes.test.mjs`「write routes refuse bad requests before reading or writing anything」；API 10.3、10.4、10.5 |
| Command-line access | 新增 `test_cli.test.mjs` 三項：「cli index and status print the summary and the state without Storybook」、「cli sync-mirror: a dry run lists the file and writes nothing; --apply copies the source of truth」、「cli undo restores the latest apply; while a dev server holds the lock it writes nothing and says so」（0.1.0 的 CLI 原本沒有獨立測試） |
| Docked design panel | 瀏覽器 7.1、7.10、7.11、7.12 |

## 1.2 v1 夾具（2026-11-24）

- 夾具在 `test/fixtures/v1/workspace/`（前綴 `fx`）：三層 token 檔（29／33／21）、兩個元件樣式表（Seal、Title，12 條規則、44 個宣告、43 個引用）、元件原始碼與 stories（Title 的 story 內嵌 Seal）、唯讀來源 `chrome.css`、兩份元件規格、專案設定檔與檢查腳本。鏡像由 `makeWorkspace({ fixture: "v1" })` 在建立暫存工作區時從真相檔複製。
- 預期數字手算後寫在 `test/fixtures/v1/EXPECTED.json`；`test_fixture_v1.test.mjs` 兩項通過，第一次執行就與 0.1.0 伺服器的索引結果相同。形狀的預期值分成 `schema1`（0.1.0）與 `schema2`（任務 2.1 之後），測試依索引的 `schemaVersion` 取用。
- 全部單元測試：53 項，52 通過、1 略過。

## 2.1 索引第 2 版（2026-11-24）

- `shared/value-refs.mjs` 新增 `splitTopLevel`；`classifyValue` 多了形狀 `var-list`，運算式附 `detail`（function／fallback／list／slash），每種形狀都帶 `components`。索引 `schemaVersion` 為 2，宣告多了 `components` 與 `shapeDetail`，token 多了 `scale`。
- 引用序號改為「在整個值的所有 `var()` 中的位置」，與 `replaceVarName` 的定址一致（0.1.0 是「有名稱的引用中的位置」，兩者只在值含有格式錯誤的 `var(` 時不同）。
- 不含引用的值若全由關鍵字識別字組成（`inline-flex`、`row wrap`），索引回報為 `keyword`，其餘為 `raw`。這是規格範例表「`fit-content` → read-only: keyword」所需要的；0.1.0 只把 CSS 全域關鍵字與 `currentcolor` 算作 keyword。
- **刻度比設計多一個條件**：design 把刻度定義為「同類別而且解析值可以比較」。試驗場的 `typescale` 類別同時有字級（px）、字距（em）、行高與字重（都是無單位數字），只比類別與單位會把行高與字重排在同一條刻度上。所以 `scale` 另外記錄 `family`：token 的 alias 鏈最後落在哪一組 reference token（`--<prefix>-ref-<family>-<step>` 去掉最後一段）。同一條刻度 = 類別相同、family 相同、單位相同（0 可配任何單位）。
- 原有的追蹤器遇到 `var-list` 時先比照運算式顯示為唯讀，等任務 5.1 改成以邊為單位的追蹤後才開放。
- **修正任務文字**：任務 2.1 原本寫「244 個宣告重新分類後 single-var 仍為 142」。142 是查核紀錄中「面板屬性範圍內 177 個宣告」的數字；以全部 244 個計，0.1.0 的索引就是 143（多出的 1 個是範圍外的 `box-shadow`）。已把任務文字改成 143 並註明來源，沒有更動其他內容。

試驗場 244 個宣告的形狀（0.1.0 → 第 2 版）：single-var 143 → 143；expression 15 → 9；var-list 0 → 6；raw 84 → 28；keyword 2 → 58（raw 與 keyword 合計仍為 86，只是依新規則重新劃分）。

改歸 `var-list` 的 6 個宣告（每個頂層分量都是「恰好一個沒有 fallback 的 `var()`」或「不含 `var()`」）：

| 宣告 | 查核紀錄的分類 | 可改綁的引用 |
| --- | --- | --- |
| `CornerBrandPlate.css` `outline: var(--md-sys-border-seal) solid var(--md-sys-color-ink)` | multi-var | 0（寬度）、1（顏色） |
| `ExampleCard.css` `border: var(--md-sys-spacing-hairline) solid var(--md-sys-color-outline)` | multi-var | 0（寬度）、1（顏色） |
| `ExampleCard.css` `padding: var(--md-sys-spacing-xxs) var(--md-sys-spacing-xs)` | multi-var | 0（區塊兩邊）、1（行內兩邊） |
| `FootnoteLegalBlock.css` `border-block-start: var(…rule-width) solid var(…rule-color)` | multi-var | 0（寬度）、1（顏色） |
| `HeroTitleLockup.css` `margin: 0 0 var(…kicker-gap)` | var 加字面值 | 0（區塊終點）；其餘邊是字面值 |
| `HeroTitleLockup.css` `margin: var(…subhead-gap) 0 0` | var 加字面值 | 0（區塊起點）；其餘邊是字面值 |

仍為 `expression` 的 9 個都是函式內的引用：3 個 `calc()`、1 個 `min()`、5 個 `rotate(calc())` 的 transform。

驗證：`test_index.test.mjs` 新增「splitTopLevel: …」、「value shapes: the examples of the specification get their shape and reference positions」、「keyword literals, scalars and scales」、「index schema 2: …」，並擴充試驗場數字檢查（設定 `CODE_LAYER_LAB_CONFIG` 時執行）；全部單元測試 57 項通過。

## 2.2 邏輯與實體屬性對應到同一條邊（2026-11-24）

- 新增 `shared/sides.mjs` 與 `sides.d.mts`：`sidesOf`、`physicalToLogical`，另有 `affectedSlots`（屬性會設定哪些邏輯 longhand）、`physicalSideOf`（邏輯邊目前在哪個實體邊，供面板標示）、`mayOverlap`。
- `sidesOf` 的第二個參數是分量清單（文字與型別），不只是分量數：`border`／`outline` 要靠每個分量的型別分辨寬度、樣式、顏色，`var()` 分量的型別由呼叫端從 token 索引帶入。只給數字時視為 N 個型別未知的分量，足夠用在只看位置的簡寫（`padding`、`border-radius`、`gap`）。
- 簡寫把某一邊重設為初始值而沒有對應分量時（`border: 1px solid` 的顏色），該邊的分量為 `null`。
- 索引的「同規則後面的宣告覆寫」改以邊計算：伺服器不知道元素的書寫模式，所以只有在六種支援的書寫模式與方向下「這個分量設定的每一邊都被後面的宣告再設定一次」時才標為被覆寫（`components[].overridden`、`overriddenInRule`）。`margin: 0 0 var(--gap)` 後面接 `margin-block-start` 不再讓整個 `margin` 宣告唯讀。
- 驗證：新增 `test_sides.test.mjs` 9 項（規格的 block-start 範例表、六種書寫模式與方向、`padding`／`margin` 一到四個分量、`padding-block`／`padding-inline`／`gap`、`border-radius` 與斜線、`border`／`outline` 依型別辨識、尺寸與其他簡寫、sideways-* 回報不支援、規則內覆寫）。全部單元測試 66 項通過。

## 2.3 專案綁定的 v1 選用鍵與封閉可寫集合（2026-11-24）

- `server/config.mjs` 接受 `locale`、`governance`（`componentSpecsDir`、`pairing`、`proseScan`）、`postApply`（`writes` 必填）；`sys` 層可標為可寫，`ref` 層標為可寫時設定無效；不認得的鍵仍是錯誤。0.1.0 的設定解析出的既有欄位逐一比對相同，新欄位預設為關閉（`locale: null`、沒有規格目錄、`postApply: []`）。
- 規格目錄下的 `.md` 檔在 dev server 啟動時列入封閉可寫集合（新增 `server/spec-rows.mjs` 的 `listSpecFiles`、`specFileForToken`；列的解析與改寫在任務 4.1）。`GET /state` 多了 `writableSet`：集合的檔案數與目前不能寫的檔及原因。
- 改綁元件 token 時，若它的規格檔在集合內卻不能安全寫入（symlink、硬連結、路徑改變），整批以 `read-only` 拒絕。理由：規格要求 token 與它的規格列一起改，不能留下只改了一邊的狀態。規格檔根本不存在的情況不在此列，會在任務 4.1 產生「文件待同步」。
- 索引多了 `governance` 摘要（規格目錄、規格檔清單、配對後綴；漂移列數留待任務 4.2）與 `locale`。
- 新增 `shared/candidates.mjs`（`isRebindTarget`、`rebindTargets`）：伺服器驗證與面板選擇器共用同一個「可以當改綁目標」的定義。
- 與任務文字不同的兩處觀察（行為符合規格，只是拒絕碼不同）：啟動時就是 symlink 的規格檔，回報的原因是 `symlink` 與 `not-a-regular-file`；樣式表在啟動後被換成 symlink 時，因為索引本來就不收 symlink，該檔不再是已知目標，批次以 `locator-mismatch` 拒絕，`writableSet` 同時把它列為不可寫。兩種情況都零寫入。
- 驗證：`test_index.test.mjs` 新增「binding: a proof-phase configuration resolves as before; the v1 keys are optional and validated」、「index: the governance summary lists the bound specifications; names outside the binding never become tokens」；`test_transaction.test.mjs` 新增「closed writable set: specifications are enumerated; …」、「closed writable set: a path-like key, a stylesheet replaced by a symlink and one created after start are refused」、「names alone do not make a re-bind target」。全部單元測試 71 項通過。

## 3.1 任意引用序號與可寫的 system 層（2026-11-24）

- `rebind-declaration` 的 `refIndex` 可為 0 到 63 的整數，定址的是 `single-var` 或 `var-list` 宣告中「自成一個分量」的引用；函式內的引用、帶 fallback、含斜線或逗號的值、`!important`、同規則重複宣告、整個分量被後面的宣告覆寫，都以 `unsupported-value-shape` 拒絕。重複目標的鍵加上引用序號，同一宣告的兩個引用可以在同一批次各改一次。
- `rebind-token` 依 token 所在層決定目標層：comp → sys、sys → ref；層未標為可寫（含 ref 層）時 `tier-not-writable`，目標層不對時 `tier-rule`。寫入的檔案與鏡像依該 token 所在的層取得，不再假設只有 comp。
- journal 的操作摘要多了 `tier`、`fromToken`、`toToken`、`rule`、`property`、`refIndex`（只增不改），供任務 3.2 的反向套用使用。
- 驗證：`test_transaction.test.mjs` 新增「a reference at a later position: only the second reference of a border changes」、「two operations on one declaration: one batch equals two batches; the same reference twice is refused」、「the system tier: re-bound to a reference token only when the binding opens it」、「every rejection code of the specification: nothing is created, modified or renamed」（規格表的 17 個拒絕碼各至少一個案例，逐檔比對內容雜湊、修改時間與 inode）。全部單元測試 75 項通過。

## 3.2 反向套用（2026-11-24）

- 新增 `POST /undo/reverse`（`{ applyId }`）與 `engine.reverse`。伺服器從 journal 讀出那次套用的操作，對照目前的檔案內容逐筆組出反向操作，再走完整的寫入流程（鏡像前置條件、定位、位元組證明、候選樹檢查、備份、journal）。成功後原紀錄標為已還原（`undone`，`mode: "reverse"`），反向套用本身以 `kind: "reverse"` 記錄，不進還原堆疊。
- 判定「現值不是當初寫入的值」看的是那個引用目前指向的 token，不是整個宣告的文字：同一宣告的其他引用被人改過時，這個引用仍可反向；引用本身被改過（或位置變了）就以 `stale-before` 整批拒絕。
- 0.1.0 寫下的紀錄沒有兩端 token 名稱與規則定位，反向套用回 `reverse-not-applicable`（新拒絕碼），整檔還原與略過照常可用。`undo-conflict` 的回應多了 `canReverse`，面板據此決定要不要提供反向套用。
- 驗證：`test_transaction.test.mjs` 新增「reverse apply after an unrelated edit: …」、「reverse apply is refused when the target itself changed; skipping still works」、「records written by template 0.1.0 can still be undone exactly; they cannot be reversed」、「the undo stack is the same after a restart, with reversed and skipped entries left out」；`test_write_routes.test.mjs` 新增「POST /undo/reverse: guarded like every write route; …」。全部單元測試 80 項通過。

## 3.3 鏡像同步端點（2026-11-24）

- 新增 `POST /sync-mirror`（`{ dryRun: boolean }`，鍵必須完全相符），走與命令列相同的 `engine.syncMirror`：方向固定為真相覆蓋鏡像、先跑基準檢查、備份被覆蓋的鏡像、寫 journal、補發 change。回應多了 `files`（鏡像、對應的真相檔、差異行數）。
- `GET /state` 與 `mirror-drift` 的 `mirrors` 每筆都帶 `diffLines`、`sourceModified`、`mirrorModified`，面板可以在套用前就顯示差異。
- 驗證：`test_write_routes.test.mjs` 新增「POST /sync-mirror: a dry run lists what would be overwritten; the real one copies the source of truth, backs up the mirror and journals it」（鏡像落後一行；沒有 session header 為 401；dry run 零寫入、journal 無紀錄；實際同步後鏡像等於真相、舊鏡像在備份、journal 有 pending 與 committed、之後的批次被接受）。全部單元測試 81 項通過。

## 4.1 Token Contract 列與 token 同一筆交易改寫（2026-11-24）

- `server/spec-rows.mjs` 新增 `parseTokenContract`、`locateRowEdit`、`planSpecEdits`、`patchSpec`。只在「唯一的 `## Token Contract` 標題、唯一一列第一格等於該 token、第二格等於舊 token」時改寫，而且只換第二格中 token 名稱的位元組；沿用 Patcher 的位元組證明並檢查行數不變。不符合時不改檔，原因列在回應的 `specRowsSkipped`（`no-spec-file`、`spec-unreadable`、`no-contract-heading`、`contract-heading-not-unique`、`row-not-found`、`row-not-unique`、`second-cell-mismatch`），任務 4.2 會把它們轉成「文件待同步」。
- 比設計多處理一種寫法：儲存格以一對反引號包住 token（`` `--token` ``）時視同該 token，改寫的仍只有名稱本身。圍欄程式碼區塊內的標題與列不算；表格到下一個標題為止。
- 寫入順序改為真相 token 檔、規格檔、鏡像、元件樣式表（`ROLE_ORDER`）。規格檔以角色 `spec` 記入 journal，所以整檔還原、當機復原都不需要另外處理；反向套用走一般的寫入流程，會把該列再改回去。回應與 journal 多了 `documents`（被改寫的規格檔與行號）。
- 驗證：新增 `test_governance.test.mjs` 六項——「token contract row: the documented alias changes with the token; only the second cell's bytes change」、「rows that must not be edited: range row, drifting second cell, duplicated row, missing file or heading」（規格範例表的四種列）、「matching is exact: a cell is never matched by substring」（`color-primary` 不命中 `color-primary-warm`、token 名稱的前綴不命中任何列、CRLF 與 BOM）、「the specification belongs to the transaction: a failed check leaves it alone; undo and reverse apply restore the row」、「write order: source of truth, specification, mirror, component stylesheet」、「lab copy (optional): re-binding the hanko fill rewrites line 54 of badge-seal.md and nothing else in it」（設定 `CODE_LAYER_LAB_CONFIG` 時執行，對試驗場的暫存複本）。全部單元測試 87 項通過。

## 4.2 文件待同步與契約漂移報告（2026-11-24）

- 新增 `server/pending-docs.mjs`：`PendingDocs`（狀態目錄的 `pending-docs.json`，每次變更整檔以 rename 重寫）、`collectPending`、`contractDrift`。每次套用提交後產生項目並在回應的 `pending` 回傳；`GET /state` 的 `pendingDocs` 列出尚未處理的全部項目；整檔還原與反向套用會移除該次套用產生的項目（反向套用本身不產生項目，因為它回到原本有文件記載的狀態）；`POST /pending-docs/resolve`（`{ ids }`）逐筆標示完成。
- 項目種類：`spec-row`（規格列不符合精確比對，原因即 4.1 的那幾種）、`declaration`（每筆 `rebind-declaration`）、`comment`（被改寫的宣告同一行有註解，token 檔與元件樣式表都算）、`mention`（仍提到舊名稱的行）、`system-token`（改綁 system token：影響所有使用該角色的元件，無法指名單一文件）。每筆都有檔案（相對於工作區根目錄）、行號、原因、摘錄、舊與新 token。單次套用超過 200 筆時，最後一筆改為說明還有幾筆。
- **「完整字詞」的判定比設計細**：設計寫「以完整字詞比對，避免 primary 命中 primary-warm」。若把連字號當成字詞的一部分，試驗場最需要被找出來的兩行（`badge-seal.md` 的「primary-red square」與 `BadgeSeal.css` 的同一句註解）都不會命中。實作改為：找到短名後往兩側擴張成整個連字號複合詞；複合詞是自訂屬性名稱（`--…`）或另一個 token 的短名（`primary-warm`、`on-primary`）時不算，其餘（`primary-red`、`ink-strong/primary/iris` 裡的 `primary`）都算。短名少於 3 個字元或純數字時不搜尋。可用綁定的 `governance.proseScan: false` 關閉。
- 搜尋範圍：該元件的規格檔、該元件樣式表的註解、與樣式表同目錄的原始碼與 stories（副檔名白名單，單檔上限 512 KiB）。不跨元件。
- 契約漂移：`GET /state` 的 `governance.drift` 回報規格列與 token 檔 alias 不一致的列數、沒有任何列記載的 comp token 數，以及不一致的列（最多 50 筆）；索引的 `governance.drift` 只帶兩個數字。規格檔列入索引快取的指紋，改了規格檔索引會重建。dev server 啟動時有漂移會在終端機提示一行。既有的漂移不阻擋任何批次。
- 驗證：`test_governance.test.mjs` 新增「pending: a token whose row is not eligible, every declaration re-bind and a comment beside a rewritten line each leave an entry」、「pending: lines that still name the old role, …」、「mentions: a word of its own, or a compound that names nothing else」、「pending entries are stored, listed by the state, removed by undo and by reverse apply, and can be marked done」、「contract drift: rows that disagree and component tokens without a row are reported, and never block a batch」；`test_write_routes.test.mjs` 新增「POST /pending-docs/resolve: guarded; …」。全部單元測試 93 項通過。

## 4.3 配對的內容色與對比值（2026-11-24）

- 新增 `server/pairing.mjs`（`pairingReport`）與共用的 `shared/contrast.mjs`（`parseColor`、`luminance`、`contrastRatio`、`sameColor`）。`/validate` 與 `/apply` 的回應多了 `pairing`：每個被改綁、且有同前段夥伴的容器（或內容）token 一筆，含警示 `content-follows-old-role`、舊與新 `on-` 色解析值是否相同、可一鍵加入的第二筆變更（`offer`），以及容器色與內容色的對比值（改綁後 `contrast.ratio`、改綁前 `previousRatio`）。
- 對比值與解析值都以「這批寫入之後」的 alias 計算：容器與內容在同一批一起改綁時不會有警示，對比值是新的一對。只改內容色時也回報這一對的對比值（沒有警示）。
- 對比由 token 檔的解析值計算，支援十六進位、`rgb()`／`rgba()` 與少數顏色名稱；半透明的內容色先疊在容器色上再算；其餘寫法（`hsl()`、`color-mix()` 等）或半透明的容器色回報 `null`，不猜測。
- 驗證：`test_governance.test.mjs` 新增「contrast: WCAG ratios of known color pairs」（白對 #FE0B05 為 3.99、白對 #10A0E2 為 2.94，容許 0.01）、「paired content tokens: the five rows of the specification table」、「paired content tokens: a warning never rejects; re-binding both together clears it」。全部單元測試 96 項通過。

## 4.4 套用後指令（2026-11-24）

- 新增 `server/post-apply.mjs`（`createPostApply`）與 `GET /applies/:id`（`engine.applyReport`）。套用、反向套用、整檔還原、鏡像同步提交之後排入一輪；指令依設定順序全部執行（前一個失敗不影響後面的），沿用檢查指令的執行方式（不經 shell、`node` 換成 dev server 自己的 Node、環境變數白名單、逾時後終止整個 process group）。
- 回應的 `postApply` 只說明「已排入」與指令清單；結果在該輪結束後由 `GET /applies/:id` 取得（`status`、每個指令的結束碼與輸出尾段、`stale`）。結果另以 `post-apply` 紀錄寫入 journal，dev server 重啟後仍查得到。失敗不回滾，`stale: true` 表示衍生文件未更新。
- 同一時間只跑一輪；執行中到達的提交合併成下一輪（三次提交共兩輪）。
- `writes` 有任何一項落在 Storybook 專案根目錄內的指令在啟動時拒絕，列在 `GET /state` 的 `postApply.refused` 並在終端機提示。
- `GET /state` 多了 `postApply`（可執行的指令、被拒的指令、是否執行中、最近一輪的結果）。
- 驗證：`test_governance.test.mjs` 新增五項「post-apply: …」（套用與還原後各一輪且順序固定；失敗的指令不改變已寫入的檔、報告標示過期；寫入位置在 Storybook 根目錄內的指令被拒且不曾執行；逾時的指令與它啟動的子程序都被終止；執行中到達的提交共用下一輪）；`test_write_routes.test.mjs` 新增「GET /applies/:id reports a transaction, including its post-apply round once it has finished」。全部單元測試 102 項通過。

## 5.1–5.4 樣式追蹤（2026-11-24）

- `shared/properties.ts` 改為 v1 屬性表（`GROUPS`、`SECTIONS`，29 個屬性群組、7 個分區），列以「邊」描述：一個宣告同時設定多邊時合併成一列（`padding`），分開設定時拆列（列的識別碼如 `padding/block-start+block-end`）。`runtime/tracer.ts` 重寫：先求每一邊的勝出宣告分量，再依來源合併。
- 繼承：新增 `runtime/inherit.ts`，來源分四類（同元件祖先可編輯；外層元件唯讀並附可選取的描述子；元件之外的樣式表唯讀；沒有宣告）。見證仍是被選取的元素。`currentcolor` 跟著文字色的來源走。
- 範圍：每列回報 `scopes`（宣告、元件 token、system token）與 `defaultScope`，各自帶寫入檔案、行號、影響的宣告數與元件數。預設範圍不可用時 `defaultScope` 為 `null`，不會悄悄改用別的範圍。
- probe 依範圍取得目標（宣告的某個引用、comp token、sys token），哨兵值依列的型別選擇。
- 設計以外的決定：
  - 填色列在 SVG 元素上追蹤 `fill`（而不是 `background-color`）；SVG 的 `fill`、`stroke`、`stroke-width` 視為會繼承的屬性。
  - 版面結構的五列（顯示方式、方向、兩種對齊、換行）永遠只供檢視，沒有範圍。
  - 追蹤結果的 `componentId`／`variant` 改為「所屬元件」（最近的元件根），巢狀元素不再顯示成「非元件」。這是階段 14 發現的錯誤：0.1.0 只選得到元件根，所以當時看不出來。
  - 宣告資訊多了 `ruleLine`（規則起始行），物件參照的「規則 #N，第 L 行」改用它；先前誤用宣告所在行。
- 已知限制：`document.adoptedStyleSheets` 裡的樣式表不在 `document.styleSheets`，追蹤看不到它們；被這類規則蓋過的列由 probe 判為「無法確認」（階段 12.6、14.3 以此驗證）。
- **修正一個 0.1.0 就存在的缺陷**：瀏覽器端從 `<style>` 文字掃描宣告（`shared/value-refs.mjs` 的 `scanDeclarations`）時，屬性名稱取自未遮罩的文字，所以緊接在註解後面的宣告（區段標題註解的下一行，或上一行行尾有註解）會被整筆略過。試驗場 304 個 token 宣告只掃到 227 個（ref 34／82、sys 98／120、comp 95／102）；被略過的 token 在預覽時會顯示「頁面上的 token 檔找不到唯一的宣告」，套用後的第一層驗證也讀不到。0.1.0 示範用的 hanko 填色 token 剛好不在註解之後，所以沒被發現；這次是 system token 範圍的預覽（階段 14.4）暴露出來。修正後三個檔 304 個宣告全部掃到；`test_patcher.test.mjs` 新增「value-refs: a declaration right after a comment is still found」。
- 驗證：`run_core_loop_browser.mjs` 階段 12 共 6 項全部通過（對試驗場、CDP）：
  - 12.1 七個元件根都有屬性表的全部群組且順序固定；追蹤耗時 14.5–32.6 ms。
  - 12.2 `padding: var(--x)` 一列四邊；RibbonBanner 直書條的左右內距來自第 34 行的 `padding-block`、上下內距來自第 35 行的 `padding-inline`，同一條規則；橫書變體相反。
  - 12.3 行內樣式、未納入索引的 `<style>`、執行中的動畫、`!important`、`@layer`（暫時改 `BadgeSeal.css`，結束後雜湊相同）、SVG 的 `fill` 屬性、字面值、運算式，各顯示規格範例表的原因且仍有計算值；7 個元件樣式表的身分檢查全部通過。
  - 12.4 `.md-badge-seal__content` 的字體繼承自 Badge Seal 根且可編輯；徽章內 PriceLockup 的文字色追到外層 Badge Seal、唯讀、帶可選取的描述子；ExampleCard 標題的字體來自元件之外；HeroTitleLockup 字符的字級在視窗寬度 400px 時改追到 `@media` 內第 40 行的規則。
  - 12.5 sys 層開放時（以 CDP 改寫送到頁面的索引，不動試驗場的綁定）hanko 填色有三個範圍、預設為元件 token，system 範圍影響 6 處宣告、6 個元件；重複宣告的 comp token 使元件 token 範圍不可用且沒有預設範圍；深色模式下被 `storybook.css` 覆寫的 `--md-sys-color-outline` 在鏈上標示覆寫來源，其 system 範圍不可用（`token-shadowed`）。sys 層未開放時只有兩個範圍（階段 6.5）。
  - 12.6 注入一秒 transition 後，顏色、圓角、內距、最小尺寸、繼承列、`var()` 清單的第 0 與第 1 個引用、SVG 筆畫的 probe 都回報已確認，前後 `document.getAnimations().length` 相同、規則文字不變；以更高優先的規則蓋過後回報無法確認。

## 6.1–6.4 選取與導覽（2026-11-24）

- `runtime/capabilities.ts`：啟用前檢查 popover、adopted／constructable stylesheets、Web Crypto、`elementsFromPoint`、`getAnimations`。缺任何一項時有效狀態為 `suspended`（原因 `unsupported-browser`，`detail` 列出功能），不建立外框、不掛守衛、不跑即時預覽。
- `runtime/navigate.ts` 與 `runtime/hitTest.ts`：點選依目前層級決定目標；雙擊或 Enter 進入下一層；Shift+Enter 回上一層；Tab／Shift+Tab 在同層循環；主修飾鍵＋點選直接選最深的元素。深層命中測試在同步呼叫期間加一張 constructed sheet 解除 `pointer-events` 限制，呼叫結束即移除。
- 設計以外的決定：
  - 點到已選取的元素不重新選取（不重新追蹤、不重跑 probe）。
  - 雙擊的層級基準：`pointer-events: none` 的元素收不到一般點擊，雙擊的第一下會把選取移到它下方的元素；第二下因此以「第一下之前的選取」為基準往下一層（落點不在其中時才用目前的選取）。否則在 SVG 外框上連續雙擊會在元件根與 `<svg>` 之間來回，到不了 `<path>`。
  - 規格說選取找不到時「回報遺失並清除」。除了 preview 送出 `lost` 事件，面板新增一行提示「先前選取的元素（…）已不在畫面上，選取已清除。」（`data-code-layer-notice="selection-lost"`），下一次選取時消失。每個 story 記住的描述子不因遺失而刪除：元素回來後重新整理仍會恢復。
  - 試驗場的 story 外面有一層 decorator 的 `div`（有盒子）與 figma-export 的 `div.sbfx-story-scope`（`display: contents`）。前者可以被選取（元件根的上一層），後者永遠不會被 hover、選取或列為父子。
- 驗證：階段 13 共 4 項全部通過（CDP 真實輸入）：
  - 13.1 以注入腳本在頁面載入前刪除 `Document.prototype.adoptedStyleSheets`：有效狀態 `suspended`、原因點名 adopted stylesheets、頁面上沒有外框節點、`DOMDebugger.getEventListeners` 在 preview 視窗上找不到守衛的 capture 監聽、story 收得到點擊與按鍵；工具列與面板都顯示原因。對照組（功能存在）守衛在、story 收不到輸入；關閉工具後同樣沒有監聽。
  - 13.2 第一次點選得到元件根；雙擊得到落點下的直書條；點同層另一條得到該條；Enter、Tab、Tab、Tab、Shift+Tab、Shift+Enter 依序為第 1、2、3、1、3 條與元件根；葉節點上 Enter 與雙擊不變；最上層 Shift+Enter 與 Tab 不變；`sbfx-story-scope` 不出現在選取、breadcrumb 或子元素清單；Esc 與點空白處清除；前後 story 根的 `innerHTML` 相同，story 的 click 與 keydown 監聽都沒被觸發。
  - 13.3 扇形印章外框的 `<path>`（`pointer-events: none`）：一般點選得到元件根，Cmd+點選得到該 path，前後 `adoptedStyleSheets` 長度相同；沒有修飾鍵時兩次雙擊依序到 `<svg>`、`<path>`。
  - 13.4 選取元件根下第二層的「円」後：原樣重存樣式表（熱更新）仍選取同一元素並重新追蹤；重新整理分頁後恢復；切到另一個 story（各自選取）再切回，兩邊都恢復自己的選取；改 args 但元素還在時維持選取；`currency: "yen-prefix"` 讓元素消失時選取清除、面板顯示遺失提示。

## 7.1–7.8 面板（2026-11-24）

- 7.1：所有介面字串來自 `shared/messages.zh-Hant.ts` 與 `shared/messages.en.ts`（鍵集合由型別強制相同），伺服器訊息改為英文、面板依錯誤碼翻譯。語言依綁定的 `locale`，沒有設定時依瀏覽器語言。`test_i18n.test.mjs` 5 項通過；瀏覽器階段 14.1（面板、分頁標題、工具列、外框標籤、物件參照）與 15.5（套用與還原報告）在 `locale: "en"` 下確認為英文。試驗場的綁定沒有設定 `locale`，測試以 CDP 改寫送到頁面的索引。報告裡引用的專案檔摘錄維持原文，不算介面字串。
- 7.2：標題顯示標籤、所屬元件與變體、尺寸、breadcrumb（元件邊界以 ◆ 標示）、子元素清單、直接命中該元素的規則（檔案、選擇器、行號）。指到 breadcrumb 或子元素時 preview 畫虛線外框。
- 7.3：七個分區的列都顯示；字面值的列說明沒有綁定 token；繼承的列顯示來源並可選取該元素；選擇器只列目前範圍可用、型別相容的 token。設計以外的決定：probe 回報無法確認時，該列在該範圍視為不可編輯（顯示原因、不提供選擇器、不能步進），仍可改選其他範圍；選擇器關閉時焦點回到該列，方向鍵可以直接步進。
- 7.4：範圍切換會把已暫存的變更搬到新範圍（宣告與元件 token 之間沿用同一個 sys token；到 system 範圍時換成該 sys token 的 ref token），搬不過去就移除。選 system token 範圍前先顯示受影響的元件數與宣告數，確認後才切換。
- 7.5：刻度是「同類別、同 ref 家族、單位可比較」的候選 token 依解析值排序。試驗場的圓角刻度為 none(0)、sm(4px)、md(8px)、full(999px) 四級。**修正**：可拖曳的標籤原本把樣式屬性取名為 `draggable`，它是 HTML 屬性，會被轉送到 DOM，瀏覽器的原生拖放在移動幾個像素後接手、指標事件被取消，拖曳最多只能走一級。改名為 `stepper`。
- 7.6：草稿 schema 2（含 `refIndex`、`scope`、`group`、`parts`）；同一宣告上的多筆草稿合成後一次預覽；舊版（v1 鍵）草稿捨棄並提示一次。
- 7.7：套用報告依序顯示每筆變更的驗證結果、被改寫的規格列、配對警示與對比值、文件待同步項目（可逐筆標示完成、可複製給 AI）、套用後指令的結果；整檔還原被拒時提供「只改回這次的變更」與「略過」；鏡像不一致時在套用前顯示並可同步。面板每 3 秒向伺服器詢問一次狀態（鏡像、待同步、漂移可能在頁面之外改變）。配對警示在暫存階段就由面板以共用規則計算，不需要先送出 dry run。
  - 為了在真實專案上驗證，試驗場的綁定在這個任務就加入 `governance.componentSpecsDir`（`../design-system/components`）與 `postApply`（design-system-extractor 的 `generate_docs_html.mjs` 與 `generate_review_html.mjs`，寫入 `docs/design-system/`）。原訂在 9.1 才加；改動前的綁定存於 `~/.claude/plans/ethereal-yawning-beacon.snapshots/S15/`。兩個產生器除了一行時間戳以外輸出固定（在暫存複本上確認），而且只寫那兩個 HTML。
  - 三筆變更分屬兩個 story，所以分兩次套用：15.1（hanko 的填色與繼承的字級）與 15.2（FootnoteLegalBlock 分隔線顏色）。逾時與「此頁看不到效果」沿用階段 11.6、11.7（同一套流程、同一版程式），沒有在階段 15 重複。
- 7.8：物件參照 v2 每個追蹤到的列一行（屬性、宣告位置、token 鏈、解析值、繼承來源、唯讀原因或可修改範圍），標籤依介面語言。
- 已知行為：宣告範圍的選擇器會列出同元件所有型別相容的 comp token，所以分隔線寬度的候選裡有該元件的間距 token（排序上同刻度的在前）。v1 不另外過濾。
- 驗證：
  - 階段 14 共 8 項全部通過。14.2 breadcrumb 為「div › ◆ Ribbon Banner / vertical-flat › Ribbon Banner › strip」，指到祖先與子元素時外框位置與該元素相符；14.3 填色選擇器列出 62 個 sys 顏色 token（等於索引中全部可改綁的 sys 顏色），圓角的宣告範圍列出 33 個非顏色 token，Esc 回到暫存狀態且清單不變；14.4 草稿由 `token:--md-comp-badge-seal-hanko-container-color` 變成 `decl:src/components/badge-seal/BadgeSeal.css#7#background#0`，system 範圍的確認顯示「6 個元件、6 處宣告」，取消後沒有暫存；14.5 方向鍵與拖曳都得到 4px → 8px → 999px，顏色列沒有步進；14.6 `border-block-start` 的第二個引用預覽成功且第一個不變，同一宣告的兩筆草稿一起預覽，外部改動後兩筆都標為衝突且預覽移除，按住對照時按鈕位置不變，舊版草稿提示一次；14.7 參照的每個檔案行號存在、每個選擇器在所指的行、每個 token 有宣告，中英文逐行結構相同。
  - 階段 15 共 7 項全部通過。15.1 套用後 `tokens-comp.css` 與鏡像只改第 54、68 行，`badge-seal.md` 只改第 54、68 行，兩筆皆已驗證，報告列出兩個規格列、配對警示（對比 3.99 → 2.94）、待同步項目與兩個指令的結果；還原後逐位元組相同。15.2 只有第二個 `var()` 的 token 名稱改變，報告列出 `FootnoteLegalBlock.css:23` 的待同步項目，複製的說明含套用代號、新舊 token 與物件參照，逐筆標示完成後清單清空。15.3 鏡像被改動時套用鈕停用並顯示原因，同步前先列出會被覆蓋的檔案，同步後恢復。15.4 套用後檔案被外部改動：還原回報 `undo-conflict` 且不寫入，反向套用只把該引用改回、保留外部修改，規格列也改回。15.6 十個受管檔案與階段開始前逐位元組相同；兩個產生的 HTML 只差時間戳，測試結束時放回原位元組。
  - 階段 11.5 補一項斷言：驗證中重新整理分頁後變更清單為空。階段 11.8c（token 被外部改動時伺服器以 `stale-before` 拒絕）的修正一併確認。
- 測試腳本的保護：階段 15 的每一項結束時、以及整個腳本結束時，若還原堆疊還有測試留下的套用，經由 API 還原（先整檔，被拒則反向套用）並在輸出標示。起因是一次斷言寫錯（把報告引用的專案檔日文摘錄當成介面字串）讓一筆測試套用留在試驗場；已還原並以雜湊確認。
- 收尾時的整體結果（2026-11-24）：瀏覽器階段 6、7、11 以同一版程式重跑 43 項全部通過（19、12、12）；階段 12–15 共 25 項全部通過；單元測試 108 項全部通過。試驗場的 token 檔、鏡像、元件樣式表、規格檔與兩個產生的 HTML 與快照（`S11-start.sha256`、`S15-specs-docs.sha256`）逐位元組相同，還原堆疊與待同步清單為空。

## 8.1–8.6 安裝器與 skill（2026-11-24）

- 8.1 命令列：`scripts/lib/cli_args.mjs`。不認得的旗標、缺值、重複、不相容的組合（`--check` 與 `--dry-run`、兩個模式、`--force-managed` 沒有搭配 `--update`／`--uninstall`、`--config` 用在安裝以外的模式）都在做任何事之前拒絕，結束碼 2。`--project-root` 為正式名稱，`--project` 為別名。`--json` 輸出單一物件（`ok`、`result`、`actions`、`issues`、`written`、`restartRequired`），文字輸出逐行列出同樣的動作與代碼。結束碼只有 `ok` 為真時是 0。
- 8.2 安裝、檢查與原子性：`scripts/lib/plan.mjs`（只讀不寫的規劃：專案定位、平台前置條件、綁定驗證、lock 與 journal、接手已知版本、三方比對）、`receipt.mjs`（第 2 版 receipt；第 1 版仍可讀）、`staging.mjs`（`runStaged`）。寫入順序：模板檔 → 綁定（僅在來自 `--config` 且專案沒有綁定時）→ tsconfig → main 的 preset → receipt。
  - 回滾保留修改時間的做法：替換前為原檔建立 hard link（同一個 inode），新內容以 rename 蓋上去；失敗時把那個 link rename 回來，內容與時間戳都是原本的。hard link 不可用時退回「複製並設回時間」。先前以複製還原只能精確到毫秒，測試（比對 `mtimeMs`）會看出差異。
- 8.3 更新：三方比對表的每一列；任一衝突零寫入；`--force-managed` 只覆蓋 receipt 認得的檔，不覆蓋「沒有 receipt 紀錄卻擋在路上」的檔。有 receipt 而計畫包含更新或刪除、卻沒帶 `--update` → `update-required`。沒有 receipt 但檔案等於 `template/KNOWN_MANIFESTS.json` 某個版本 → 接手（`adopted-without-receipt`）。receipt 版本較新 → `newer-installation`。寫入 lock 被活著的程序持有 → `write-lock-held`；journal 有未完成的交易 → `journal-needs-recovery`；過期的 lock 不阻擋。
- 8.4 移除：一律移除 preset 元素；`resolve` 的 import 只在 receipt 記錄為安裝器加入、且檔案沒有其他地方使用時移除；tsconfig 排除項只在 receipt 記錄為 `added` 時移除；未修改的受管檔案刪除、修改過的為衝突；receipt 最後刪；綁定與狀態目錄保留。第 1 版 receipt 只移除 preset 元素並以 `receipt-v1` 說明。
  - **修正**：`unwireTsconfig` 比對排除項時的正規式會把 `.storybook` 開頭的點一起去掉，所以永遠找不到要移除的項目（這段在本任務之前已寫好但沒有測試）。由「移除後 tsconfig 與安裝前逐位元組相同」的測試發現。
- 8.5 綁定推導：`scripts/derive_binding.mjs`。輸出草稿（已通過 `resolveConfig`）、每個值的證據、待確認項目、只列出不採用的候選指令。`--write` 驗證後建立綁定檔，已有綁定時拒絕。腳本與它載入的模組不匯入任何程序或網路模組。
  - 比設計多一項待確認：找到多個含 `data-component` 標記的目錄時，`components.roots` 列為待確認（試驗場的 `src/pages/prototypes` 裡有範例原型頁；它要不要開放編輯是人的決定）。
  - 對試驗場唯讀執行的結果：草稿與現有手寫綁定在 `projectId`、`tokens`（前綴、入口、三層、真相與鏡像方向、唯讀來源）、`components.classPrefixes`、`governance.componentSpecsDir`、`workspaceRoot`、`stateDir` 完全相同；不同的只有 `components.roots`（草稿多了 `src/pages/prototypes`）、`checks`、`postApply`，三者都在待確認清單裡。試驗場 Storybook 根目錄內的 `design-system/components`（72 個檔、沒有一個對得上元件）被標為疑似樣板殘留，未採用。
- 8.6 skill 封裝與登錄：新增 `SKILL.md`（英文）、`agents/openai.yaml`；`README.md` 改寫為 v1 的使用說明；repo 的 `README.md`（Skills 一節、目錄樹、Per-skill installers）、`docs/skills-usage.md`（快速選擇表一列、`$storybook-code-layer` 一節）、`docs/skills-guide.html`（`skills` 陣列一筆，分類「工具與自動化」，不掛 journey）、`scripts/skill-dependencies.json`（對 design-system-extractor 的 support 相依）。
  - 安裝器、推導腳本與接線工具的訊息改為英文（代碼固定，供 agent 判讀；repo 其他安裝器也是英文）。
- 驗證：
  - `test_installer.test.mjs` 15 項：四項接線純函式；命令列（10 種錯誤用法各自結束碼 2 且零寫入；`--json` 與文字輸出的結果、動作、代碼一致）；清單過期或不存在時五種模式都以 `manifest-stale` 拒絕（在 skill 的暫存複本上改模板）；清單具決定性；前置條件 8 種各自拒絕且零寫入（非 Vite、main 與 preview 的 CSF factories、狀態目錄在專案內、綁定指到不存在的路徑、不存在的規格目錄、不認得的鍵、ref 層可寫）；沒有綁定時拒絕並指向推導腳本；乾淨專案安裝（main 只多一個陣列元素、動作順序、receipt 內容、第二次零寫入、`--check` 為 complete）；receipt 區分 `added`／`present`／`not-needed`；在第 0、1、17、倒數第 3、2、1 個動作後注入失敗，整棵樹的內容與修改時間都回到執行前；改綁定後 `--check` 仍通過、缺檔／改檔／缺接線／無 receipt 各有代碼；既有綁定不被 `--config` 取代；安裝目錄是 symlink 時四種模式都拒絕。
  - `test_installer_update.test.mjs` 11 項：三方比對不衝突的各列（dry run 與實際執行的動作完全相同、dry run 不改任何內容與時間）；三種衝突列零寫入、`--force-managed` 的範圍；四十個過期加一個被改過的檔 → 四十一個都不變；沒有 receipt 而檔案等於已知版本 → 接手、更新、寫出 receipt（接線不是安裝器加的，receipt 如實記錄）；不屬於任何已知版本的檔 → 拒絕；綁定不符合新模板 → 零寫入並指出鍵名；較新的安裝不降版；lock 與 journal；更新中途失敗全部還原；移除後 main 與 tsconfig 逐位元組回到安裝前、綁定與狀態目錄不變、不是安裝器的檔留下；原本就有的排除項與仍被使用的 import 保留；修改過的受管檔為衝突、移除中途失敗全部還原；第 1 版 receipt。
  - `test_derive_binding.test.mjs` 8 項：v1 夾具的草稿等於預期並通過 `resolveConfig`，每個值都有證據或提問；兩處 token 內容相同時點名兩個目錄並列出兩個方向、內容不同時另有警示、只有一處時不問；Storybook 根目錄內的規格目錄不採用；候選指令只列出；多個元件根目錄與沒有專案設定時列為待確認；`--write` 的三種無效設定零寫入、有效時寫入原樣位元組、已有綁定時拒絕，之後安裝器不需要 `--config`；以替身取代 `child_process` 的 7 個函式、`fetch` 與 `net.Socket.prototype.connect` 後執行推導與寫入，零呼叫，且匯入圖不含程序或網路模組；命令列；對試驗場的唯讀比對（設定 `CODE_LAYER_LAB_CONFIG` 時）。
  - 全部單元測試 134 項通過。
  - `node scripts/install_agent_skills.mjs --agent all --scope user --skill storybook-code-layer --dry-run` 列出 claude、codex、cursor 三個目的地，結束碼 0；`node --test scripts/test_install_agent_skills.mjs` 35 項通過。
  - 把 skill 資料夾複製到暫存目錄後對試驗場執行 `--check --json`，輸出與從 repo 執行逐位元組相同（此時試驗場尚未升級，兩者都是 `incomplete`／`receipt-mismatch`）。
  - `docs/skills-guide.html` 的內嵌 script 以 `node --check` 通過；14 個 journey，沒有懸空的 `journey` 或 `related` 參照。
  - 舊安裝器名稱：本 change 新增或修改的檔案中沒有。repo 在 `openspec/changes/archive` 之外仍有一處，是既有的 `openspec/specs/storybook-tools-installer/spec.md`（規定這條規則的規格本身必須寫出該字串），不是本 change 造成，未更動。

## 9.1 試驗場升級到 1.0.0 與端對端驗證（2026-11-24）

- 模板版本改為 1.0.0（`template/code-layer/package.json`），重建 `TEMPLATE_MANIFEST.json`（90 個檔）。`build_template_manifest.mjs` 新增 `--record-release`，把目前版本的檔案雜湊記入 `KNOWN_MANIFESTS.json`（現有 0.1.0 的 67 個檔與 1.0.0 的 90 個檔）；單元測試會檢查「清單裡若有目前版本，雜湊必須等於模板」，模板改了沒重記會失敗。
- 試驗場的升級走真正的 0.1.0 → 1.0.0：
  1. Storybook 執行中先試 `--update --dry-run`：以 `write-lock-held` 拒絕（指出持有 lock 的 pid），零寫入。
  2. 備份安裝目錄（`~/.claude/plans/ethereal-yawning-beacon.snapshots/S9-before-update/`），停掉 Storybook。
  3. 開發期間安裝目錄一直由 `dev_sync` 覆寫成進行中的模板，已不是 0.1.0。為了讓升級是真的，從 commit `84b384a` 取出 0.1.0 的 67 個模板檔放回安裝目錄（綁定與 receipt 不動），逐檔核對等於 0.1.0 receipt 記錄的雜湊（67／67）。這一步是直接改安裝副本，僅此一次，目的是還原成已發行版本的狀態。
  4. `--check`：`incomplete`（45 個檔與模板不同、23 個檔不存在、receipt 為第 1 版）。不帶 `--update` 的安裝：`update-required`，零寫入。
  5. `--update --dry-run`：更新 45、新增 23、寫 receipt 1，沒有刪除；執行前後安裝目錄與 `tsconfig.json` 的檔名、修改時間、大小不變。
  6. `--update`：`updated`，動作與 dry run 完全相同；`--check` 為 `complete`；receipt 為第 2 版、1.0.0、90 個檔，接線記為 `addedElement: true`、`addedResolveImport: false`、tsconfig `present`（0.1.0 的 receipt 沒有記錄誰加的，依規則視為專案的）；綁定檔雜湊不變；再跑一次 `--update` 為 `current`。
- 之後模板又改了三個檔（見下一點），試驗場同樣以 `--update` 更新（更新 3 個檔），沒有再用 `dev_sync`。
- 端對端驗證期間發現並處理的三件事：
  - `run_live_api.mjs` 原本假設專案沒有治理設定。試驗場加入 `governance` 後，dry run 的計畫多了規格檔（順序為真相、規格、鏡像、元件樣式表），測試改為依 `/state` 判斷並把規格檔與兩個產生的 HTML 納入還原比對。
  - 瀏覽器測試的兩個順序相依：(a) 上一項把工具關掉後，下一頁開啟時面板才停靠到右側，預覽區變窄，置中的元件位移，而點擊座標是位移前量的——`loadActive` 改為等面板停靠且預覽框尺寸連續三次不變；(b) 同一分頁先前的階段會記住該 story 的選取，下一個「第一次點選得到元件根」的檢查因此從已選取子元素的狀態開始——相關檢查開始前清掉分頁的選取記憶。兩者都是測試的前提沒有建立好，不是產品行為錯誤；(b) 正是 6.4 的「每個 story 記住最後的選取」在作用。
  - **產品修正**：套用報告中「套用後指令」的結果晚於報告本身出現，報告位於貼齊面板底部的區塊，結果列插入時上方的內容整個往上移約 54px；測試在量好「標示完成」按鈕的位置後點到了別處（四次重現三次）。使用者正要按按鈕時也會遇到同樣的位移。改為每個指令從一開始就有一列「執行中…」，結果到達時原地替換；階段 15.2 新增斷言「結果到達前後按鈕位置不變」，之後連續三次通過。
- 最終結果（全部針對 1.0.0 的安裝）：
  - `node --test 'storybook-code-layer/test/*.test.mjs'`：134 項全部通過。
  - `run_live_api.mjs`：8 項全部通過。
  - `run_core_loop_browser.mjs --stage all`（單一指令，一個 Chrome 工作階段）：68 項全部通過（階段 6：19、7：12、11：12、12：6、13：4、14：8、15：7）。
  - `run_build_check.mjs`（dev server 停止時）：3 項全部通過——產物 158 個檔，8 個標記字串 0 次命中；狀態目錄與 `storybook-static` 不變。
  - `install_code_layer.mjs --project-root <試驗場> --check`：`complete`。
  - 全部測試結束後，試驗場的 token 檔與鏡像、元件樣式表、`main.ts`、`tsconfig.json`（`S11-start.sha256`，17 個檔）以及 6 個元件規格檔與 2 個產生的 HTML（`S15-specs-docs.sha256`）逐位元組相同；還原堆疊為空；`pending-docs.json` 沒有殘留項目。
  - `spectra validate add-storybook-code-layer`：valid。`spectra analyze add-storybook-code-layer`：Coverage、Consistency、Gaps、Localization 皆無發現；Ambiguity 有 50 則 SUGGEST 等級的建議（情境缺少具體範例），沒有 Critical。
- 與任務文字的差異：任務寫「在綁定加入 `governance.componentSpecsDir` 與 `postApply`」於本任務進行；實際在 7.7 就加入（階段 15 需要），已在該節記錄。

## 9.2 量測與說明（2026-11-24）

- `storybook-code-layer/README.md` 改寫為 v1：需求（含支援的瀏覽器與能力檢查）、安裝（推導 → 確認 → 寫入綁定 → dry run → 安裝 → 檢查）、待確認項目表、更新與移除、從 0.1.0 升級的步驟、使用方式、哪些列可以改、安全、已知限制、量測、紀錄與命令列、開發。
- 量測（試驗場，Chrome，Apple Silicon）：單次樣式追蹤 12–35 ms（29 列，7 個元件根，多次執行的範圍）；按下「套用」到報告顯示「已寫入並驗證」約 0.5 秒（525–532 ms，兩筆變更，寫入 token 真相檔、鏡像與規格檔）；兩個套用後指令另需約 0.1 秒，在背景執行。
- 內容審閱：
  - README 與 SKILL.md 的指令逐一對照實際執行：`derive_binding.mjs`（唯讀與 `--write`）、`install_code_layer.mjs` 的安裝、`--dry-run`、`--check`、`--update`、`--uninstall`、`--json`（單元測試與試驗場）；`server/cli.mjs` 的 `status` 在試驗場執行過；`sync-mirror --dry-run` 在 Storybook 執行中會回報 `locked` 而不做事（已照實寫進 README：`sync-mirror`、`undo`、`recover` 要在 Storybook 停止時執行），並補上必要的 `--project`、`--apply-id`（初稿漏了 `--project`）；開發一節的 `run_live_api.mjs` 補上必要的環境變數。
  - README「哪些列可以改」各項對應的通過案例：單一 `var()` 與 `var()` 清單中的引用（12.6、14.6、15.2）；繼承自同元件祖先（12.4、14.3、15.1）；字面值、關鍵字、運算式、版面結構只供檢視（12.1、12.3、14.3）；繼承自外層元件或元件之外（12.4、14.3）；行內樣式、SVG 屬性、`!important`、`@layer`、未納入索引、動畫（12.3）；無法確認（12.6、14.3）；修改範圍三層與確認（12.5、14.4）；刻度步進與拖曳（14.5）；規格列同步、文件待同步、配對、套用後指令、還原與反向套用、鏡像同步（15.1–15.4）。

## 10. 檢視器重新設計（2026-11-24）

- 起因：任務 1–9 完成後，使用者試用後的回饋（原文）：「目前的工具不太符合 Figma 工具那樣好用，我希望設計師可以很快上手，而不是一堆文字，如果放在 side panel 無法實現，也可以把工具重新設計放在 canvas 上，並且可以拖移到適合的位置」。
- 判斷：問題主要在內容而不是容器——每一列下面都有說明句子（唯讀原因、寫入的檔案與行號、影響範圍），標題區有樣式檔路徑與元素路徑，還有一則與設計師無關的規格漂移提示。同時 addon 面板的自動停靠本身就脆弱（要改 Storybook 的版面狀態再還原，還造成測試的時序問題）。因此兩件事一起做：改成畫布上的浮動檢視器（不再碰 Storybook 的版面），並把預設畫面精簡為「圖示、數值、token」。
- 規格與任務的變更（公開修改，不是悄悄改）：`specs/code-layer-panel/spec.md` 的「Docked design panel」由「Floating inspector on the canvas」取代；新增「Low-text presentation」與「First-use guidance」；「Selection header and navigation」、「Property rows in the panel」、「Scale stepping」、「Scope switch」、「Changes list」、「Apply and report」改寫（行為不變的部分保留原文）。`tasks.md` 新增第 10 節共 5 項。設計決定記在本節。

### 10.1 浮動檢視器（2026-11-24 至 11-25）

- 新增 `manager/Inspector.tsx`：以 Storybook 的畫布包裝元件（`types.PREVIEW`）掛載，內容以 portal 畫在 `document.body`，位置依畫布矩形計算（ResizeObserver 加 400 ms 輪詢）。標題列可拖移（pointer capture）、可收合；位置（相對畫布右上角）、收合與「開發者資訊」存 `localStorage` 的 `code-layer/v2/<projectId>/inspector`。
- 刪除 `manager/Panel.tsx`、`PanelHost.tsx`、`layout.ts`；`Tool.tsx` 只剩開關，不再呼叫任何改變 Storybook 版面的 API。
- 實作時才確定的事：
  - 包裝元件必須在模組求值時就 `addons.add`（Storybook 的 ManagerConsumer 只保留第一次渲染拿到的函式，那時 `addons.register` 的 callback 還沒跑）。畫布沒有承接時，由工具列按鈕在 800 ms 後代為掛載（`FallbackInspector`）。
  - 靠右對齊的元件（Ribbon Banner）會被預設在右上角的檢視器蓋住：preview 新增 `code-layer/layout` 事件回報元件矩形，檢視器在還沒被拖過之前停在不擋住元件的一側（`clearSide`），拖過之後（`placed`）不再自動移動。
  - 重新整理後檢視器會先出現在預設位置、再跳到記住的位置（位置以專案為鍵，專案要等 `GET /session` 回應才知道）。這是 11-25 重跑階段 7 時由 7.8 抓到的：改為工作階段回應前不顯示（store 的 `booted`），並在第一次繪製前讀入位置（`useLayoutEffect`）。
- 驗證：階段 7 改寫為 13 項，全數通過——7.1（Storybook 自己的面板位置、可見與分頁不變）、7.8（拖移 −300／+90 後位於新位置、收合後只剩標題列、重新整理後一出現就在原位且仍收合、視窗縮小後標題列仍在畫布內、浮層開在有空間的一側）、7.11（沒有 global 的第二個分頁沒有檢視器）、7.12（關閉移除、再開在原位）、7.13（Ribbon 在左、Hanko 在右；拖過之後不再自動移動）。

### 10.2 預設畫面沒有說明句子

- `components/Field.tsx` 取代 `PropertyRow.tsx`：一列是圖示、數值、token 標籤；唯讀原因與繼承來源是 `title` 提示（鎖頭、↑ 圖示）。`hasSource(row)` 為否的列預設收起，分區標題右邊的「＋n」展開。尺寸列依書寫模式標為寬或高（`shared/labels.ts` 的 `physicalSize`）。
- 標題列的 `</>` 開關「開發者資訊」（預設關、會記住）：開啟後浮層顯示宣告位置、token 鏈與每個範圍的寫入位置，導覽區顯示自己的規則與元素路徑。沒有選取時是三行提示（點一下／雙擊／點數值）。規格漂移提示只在有漂移列或開發者資訊開啟時出現。
- 訊息目錄移除 14 個不再使用的鍵，新增 `inspector.*`、`guide.*`、`section.more*`、`field.*`、`reach.*`、`pop.*` 等。
- 驗證：7.1（三行提示的文字）、7.2（29 列中預設顯示 12 列；任何一列不含句子或路徑；原因在提示裡；「＋n」列出其餘；開啟開發者資訊後浮層顯示鏈與宣告位置，重新整理後仍開啟）、14.2（標題、breadcrumb、內層元素的導覽與標示）、14.3（各分區的列）。

### 10.3 點數值就換 token

- `components/RowPopover.tsx` 取代 `TokenPicker.tsx` 與 `ScopeSwitch.tsx`（任務初稿寫的檔名 `TokenPopover.tsx` 已在 tasks.md 更正）：範圍的分段選擇（只有這裡／這個元件／整個系統，附影響數與系統範圍的確認）、有刻度的值多一組 −／＋、搜尋清單。
- 實作時才確定的事：浮層量測時用 `opacity` 而不是 `visibility: hidden`（後者讓搜尋框拿不到焦點，Esc 關不掉）；同一列開著時浮層只往上移不往下移（清單隨輸入變短時不會從游標下滑走）；Esc 關閉後焦點回到該列。
- 驗證：14.3（清單只列型別相容的 token：填色 62 個 system 顏色、圓角宣告 33 個；滑過即預覽）、14.4（同一筆變更改到另一個範圍；系統範圍先確認並說明影響 5 個元件、5 處宣告）、14.5（方向鍵、拖曳名稱與步進按鈕沿刻度移動：4px → 8px → 999px；顏色沒有刻度）。

### 10.4 變更與報告各一行；預覽與寫入分清楚；工作階段自己更新

- `components/ChangesBar.tsx` 取代 `ChangesList.tsx`：一筆一行（列名、舊 → 新、狀態點），元素、寫入位置與影響在提示裡；清單可捲動、按鈕列固定不被擠掉；配對提示一行（對比變化＋「一起改內容色」）。`components/Report.tsx` 取代 `VerifyReport.tsx`：一行結果加還原，其餘是帶計數的可展開區塊（逐項、規格列、配對、文件待同步、套用後指令），需要注意的預設展開；套用後指令的結果先佔位，後到時按鈕不位移。
- 使用者試用時的三個問題與處理（2026-11-24）：
  - 「為什麼點擊 apply 無法 work?」「Not applied: The session is missing; reload the page.」——原因是我在使用者開著分頁時多次重啟 Storybook，頁面拿著上一次啟動的 session，寫入被 401 拒絕。這不該由使用者處理：`manager/api.ts` 的 `postJson` 在收到 `session-required` 時重新讀 `GET /session` 再送一次（只一次，且新舊值相同就不重送）；`GET /session` 與 `GET /state` 回報 `instance`，3 秒一次的狀態輪詢發現換了一次啟動就先更新；`GET /session` 另回報 `build`（manager 與 shared 原始檔的雜湊），與頁面載入時不同就顯示「請重新整理頁面」的提示與按鈕。錯誤訊息改為中文說明原因。防護不變：伺服器在讀取請求內容之前就拒絕，能讀 `GET /session` 的仍只有同源頁面。
  - 「現在即時在 panel 上改的就是真的改了嗎? 還是只是 preview ?」——介面沒有說清楚。變更清單下方固定一行「預覽中 · n 項變更尚未寫入檔案」（提示：只改了這個瀏覽器裡的畫面，檔案還沒動），套用按鈕改為「套用到檔案」。
  - 這兩項也寫進規格（Changes list、Apply and report 各加一段與情境）與 design.md（「檢視器浮在畫布上」一節）。
- 驗證：7.3、7.4（一行的文字、提示內的寫入位置與影響、按鈕在短畫布上仍完整、「預覽中 · 2 項變更尚未寫入檔案」與「套用到檔案」）、11.1–11.10、15.1–15.6（含 15.2「套用後指令的結果到達時沒有任何控制項移動」）、11.8d（頁面持有已不存在的 session：套用被拒一次、自己更新後重送、只套用一次；再換一次啟動且 build 不同：頁面在送出前就已更新並提示重新整理，還原沒有被拒）、`test_write_routes` 新增 `instance`／`build` 的案例。
- 11.8d 的初版用「在線路上竄改寫入請求的 session 標頭」模擬過期，這與真實情況不同（頁面自己拿到的值其實是對的，更新後新舊值相同，程式正確地不重送），測試因此失敗並留下暫存變更，連帶讓 12.3、12.6、13.1 失敗。改為讓頁面在載入時就拿到一個已不存在的 session 後通過；產品程式沒有因此修改。

### 10.5 文件、試驗場與使用者自己的變更

- README（使用方式改為檢視器、預覽與寫入的說明、session 自動更新）、SKILL.md、repo 的 README、`docs/skills-usage.md`、`docs/skills-guide.html` 已更新。proposal.md 的能力說明與受影響檔案清單、design.md 的決策、tasks.md 第 10 節的檔名與驗證位置都改為與實際一致。
- 模板版本 1.1.0（87 個檔），以 `install_code_layer.mjs --update` 更新試驗場；1.0.0 的面板檔由安裝器移除。
- **試驗場現在有使用者自己套用的變更**（2026-11-24，`20261124-094805-apply-ec805d`，仍在還原堆疊上，23 筆文件待同步）：hero-title-lockup 的 kicker 色與 headline 色、corner-brand-plate 的 logotype 色與字級，連同兩份規格的 4 列。因此：
  - 舊的雜湊清單（S11／S15）不再是「必須相等」的依據；新基準記為 `S16-user-baseline*.sha256`。
  - `run_core_loop_browser.mjs` 改為：執行開始時記下還原堆疊上已有的套用並保護它們；以 CDP 的網路事件記錄「本次執行的頁面」做的每一筆套用，清理只還原這些；堆疊頂端若是別人的套用就停下並說明。斷言一律與執行開始時相比（`serverState()` 不計入受保護的套用與其待同步文件）。`run_live_api.mjs` 的最後一項改為「還原堆疊等於執行前」。

### 第 10 節的最終結果（2026-11-25）

| 檢查 | 結果 |
|---|---|
| `node --test 'storybook-code-layer/test/*.test.mjs'` | 135/135 |
| `run_core_loop_browser.mjs --stage all`（試驗場，Chrome） | 70/70（階段 7：13 項；11.8d 為新增） |
| `run_live_api.mjs`（真實伺服器，套用後還原） | 8/8 |
| `run_build_check.mjs`（dev server 停止時） | 3/3：158 個產物檔中 0 個含 Code Layer 的程式、API 路徑或 session 標頭名稱 |
| 試驗場 `install_code_layer.mjs --check` | complete，沒有問題項目 |
| `build_template_manifest.mjs --check`／`--record-release` | 清單為最新（87 個檔）；1.1.0 已記入 `KNOWN_MANIFESTS.json`（0.1.0：67、1.0.0：90、1.1.0：87） |
| `spectra validate add-storybook-code-layer` | valid；`spectra analyze` 沒有 Critical（只有「情境缺具體例子」等建議） |
| 試驗場檔案 | 與 `S16-user-baseline*.sha256` 逐位元組相同（token 真相與鏡像、元件樣式表、規格、產生的文件）；還原堆疊只有使用者的 `20261124-094805-apply-ec805d`，23 筆文件待同步原樣保留；鏡像同步、基準檢查通過、不在唯讀模式 |

- 量測（本次執行）：樣式追蹤 13.9–29.2 ms；按下「套用到檔案」到「已寫入並驗證」515 ms。README 的範圍改為 515–532 ms。
- 過程中兩次不完整的執行都沒有留下測試套用：第一次（66/70 之前的那次）在 7.8 失敗後連鎖失敗，由我中止，中止後雜湊與還原堆疊核對無誤；第二次 66/70 的 4 個失敗是 11.8d 的測試模擬問題與它的連鎖（見 10.4）。
- 6006 的 Storybook 由我在同一個 port 重啟後繼續執行。使用者開著的分頁需要重新整理一次才會載入新的檢視器；之後再重啟，頁面會自己更新 session。
- 尚未 commit（依約定，使用者要求時才 commit）。

## 使用者說明文件（2026-11-25，使用者要求）

- 要求（原文）：「幫我寫一份工具的說明文件，用 html 來撰寫，未來有更新功能也要補充到同一份文件，我希望簡單好理解，可以有互動的方式呈現，讓使用者更好理解每一個工具怎麼使用，然後附帶使用者旅程來進行說明」。
- 產出：`docs/code-layer-guide.html`（repo 根目錄，與既有的 `designer-guide-storybook-to-production.html` 同一處、同一套字體）。單一檔案、不需要建置，可直接用瀏覽器開啟；淺色與深色主題、手機寬度都可用。
- 內容：
  - 可以操作的模擬檢視器（不碰任何真實檔案）：選取、進入內層、點列開浮層、範圍、−／＋、搜尋、滑過預覽、暫存、對比提示、對照、捨棄、套用、報告、還原、複製參照、開發者資訊、拖移與收合、中英文介面。下方的「檔案（模擬）」面板即時顯示哪些行只是預覽、哪些行已寫入，直接回答「改了就是真的改了嗎」。
  - 五段使用者旅程，每一步有「做什麼／會看到什麼」，模擬器會標出下一個要按的地方，也可以按「幫我做這一步」：換一個顏色、圓角和內距各調一級（含文件待同步）、改內層的文字（繼承）、遇到鎖頭（複製參照交給 AI）、改了又不想要（對照、移除、捨棄）。
  - 介面導覽（檢視器、浮層、變更清單、結果報告，共 29 個編號說明）、修改範圍的互動示意、鎖頭與記號、結果的五種情況、滑鼠與鍵盤速查、常見問題 10 則、更新紀錄（0.1.0、1.0.0、1.1.0）。
- 模擬器的介面文字取自 `shared/messages.zh-Hant.ts` 與 `messages.en.ts`；範例元件與 token 是通用的假資料，不含任何專案內容。
- 維護方式寫在三處：檔案開頭的註解、`storybook-code-layer/README.md` 的開發一節、`SKILL.md`——功能或介面文字變動時在同一次修改更新這一份，不另開新文件。
- 檢查（headless Chrome）：五段旅程以「幫我做這一步」各自走到結束（7、7、5、3、3 步，每一步都有被標出的目標）；另以頁面自己的事件處理手動操作一輪（步進、搜尋時輸入框不失焦、對比提示與一起改內容色、切換英文、套用後 5 行標為已寫入）；沒有腳本錯誤；1280 與 400 寬都沒有橫向捲動；淺色、深色與手機畫面逐張看過。
- 視覺改版（同日，使用者回饋原文：「用亮色系，我希望和 apple design 一樣簡潔，不要太雜」）：改為只有亮色；白色與淺灰區塊交替、單一藍色強調、系統字體；模擬器裡的檢視器改為 Storybook 亮色主題的樣子；一次只顯示一個重點（介面導覽四張圖改為分段切換、旅程在窄畫面只顯示目前步驟）；「目前還不能做的事」併入常見問題，鎖頭、結果、快捷鍵改為無框線的清單。內容、旅程與模擬器行為不變；同樣的檢查重跑通過（五段旅程走完、無腳本錯誤、1280 與 400 寬無橫向捲動）。
