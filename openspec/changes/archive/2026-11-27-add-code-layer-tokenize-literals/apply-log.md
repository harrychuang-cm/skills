# add-code-layer-tokenize-literals：執行紀錄

日期：2026-11-27。試驗場：`cm-ds-extractor-lab/80sJP-Fable`（Storybook 在 6006）。

## 起因與範圍

使用者在 2026-11-27 同意依序實作 ai-dialog（已封存為 1.3.1）→ 本 change → add-code-layer-language-toggle → add-code-layer-runner-fallback。本 change 的 delta 原本以版面編輯之前的規格為基底，實作前已用 `/spectra-ingest` 改以現行 `openspec/specs/` 為基底重新合併（功能範圍與已定案的決定不變），模板版本改為 1.4.0、升級來源 1.3.1。

## 開始前的試驗場狀態

- 雜湊基準：試驗場 467 個檔（token、鏡像、元件樣式表、規格文件、衍生文件與 Code Layer 安裝目錄），存在本次工作階段的暫存目錄。
- 還原堆疊 17 筆，全部是使用者自己的套用，測試不得還原：`20261124-094805-apply-ec805d`、`20261126-020744-apply-9534ba`、`20261126-061928-apply-bbdfd4`、`20261126-061949-apply-fd06d1`、`20261126-080656-agent-ec1d93`、`20261126-080839-apply-f80a82`、`20261126-081616-agent-7da52b`、`20261126-082752-apply-e212f5`、`20261126-082846-agent-a2f12b`、`20261126-084604-apply-8434ec`、`20261126-091324-apply-bdf307`、`20261126-091346-apply-a0d68e`、`20261127-092625-apply-37ea52`、`20261127-092919-apply-ab75be`、`20261127-093033-apply-214fc9`、`20261127-093058-apply-dc3a00`、`20261127-094945-agent-d1f69d`。
- 綁定固定 `"locale": "zh-Hant"`、AI 修改已啟用；測試沒有改動它們。
- 升級方式：`dev_sync.mjs` 同步模板後，以 `install_code_layer.mjs --update` 寫入 1.4.0 的安裝收據，再重啟 6006 的 Storybook。

## 做了什麼

共用（`template/code-layer/shared/`）：

- `property-table.mjs`（+ `.d.mts`）：檢視器的屬性表從 `properties.ts` 移出成純資料，`kindsOfSlot(slot)` 給伺服器與瀏覽器共用；`properties.ts` 改為匯入後加型別再匯出，slot 清單與 1.3.1 相同（有測試逐一比對）。
- `literals.mjs`（+ `.d.mts`）：`literalVerdict`（可換或五種不能換的原因）、`tokenizeComponent`／`restoreComponent`（包裝 `value-refs.mjs` 的 `replaceComponent`）、`sameValue`、候選三組排序（`tokenCategoryOf`、`categoryUsage`、`homeCategories`、`orderLiteralCandidates`）。
- `api-contract.mjs`：操作多一種 `tokenize-literal`；內部操作是 `remove-declaration` 與 `restore-literal`，請求送出一律 `schema-invalid`。

伺服器（`template/code-layer/server/`）：

- `operations.mjs`：`tokenize-literal` 的驗證（形狀、分量文字、型別依 `sidesOf` 與屬性表、tier、重複目標、不能換的原因碼）與 `restore-literal`（只從反向套用產生）。
- `patcher.mjs`：分量編輯寫入 `var(` + 索引中的 token 名稱 + `)`；反向寫回 journal 記錄的字面值。兩種證明照舊。
- `transaction.mjs`：摘要記錄分量位置與字面值；`reverse()` 產生 `restore-literal`；`rebind-declaration` 也記錄分量位置，反向時以它找回同一個引用。
- `pending-docs.mjs`：`tokenize-literal` 產生一條「元件樣式表的宣告沒有任何表格記載」，帶舊值與新值，不搜尋文字。

preview 與檢視器：

- `runtime/tracer.ts`：寫死值的列（`literal: { text, kind }`），只有宣告一個範圍；probe 以原始碼的值替換分量。
- `runtime/livePreview.ts`：換 token 的預覽最後套用；`runtime/verify.ts`：第五種結果 `verified-same`，整批都是時報告才寫「外觀不變」。
- `manager/drafts.ts`：候選依三組排序（類別用量快取）；`RowPopover.tsx`：字面值標題、分組標題、「數值相同」標示、沒有範圍切換與步進；`Field.tsx`：「未綁定」記號與暫存後的「字面值 →」。
- 中英文訊息各新增：`readonly.literal-expression`／`literal-list`／`no-token-of-kind`、`picker.literalHead`、`picker.group1-3`、`picker.sameValue`、`row.unbound`、`row.literalHint`、`report.apply/undo.verified-same`、`verify.item.verified-same`、`reference.literal`。

版本與文件：

- 模板 1.4.0，清單 108 個檔（1.3.1 為 104，多了 `literals` 與 `property-table` 各兩個檔），`KNOWN_MANIFESTS.json` 已記錄 1.4.0。
- `README.md`、`SKILL.md`、repo 的 `docs/skills-usage.md`。
- 使用說明 `docs/code-layer-guide.html` 1.4.0：模擬器的「最小寬」改成寫死的 `88px`（「未綁定」，候選三組），新增仍然鎖著的「最大寬 `calc(100% - 16px)`」；旅程「遇到鎖頭」改寫為「換掉寫死的值」（7 步：換成數值相同的 token、套用後外觀不變、再打開是一般 token 列、鎖著的例子交給 AI）；介面導覽多一張「換掉寫死的值」，檢視器那張多一個「未綁定」；鎖頭表格、記號、結果表、常見問題（新增「寫死的值換成 token，畫面會變嗎？」、改寫「有哪些事還不能做」）、更新紀錄 1.4.0。已重新發布到同一個 artifact（Version 6）。

## 與提案、設計不同之處（設計文件已改成實作的樣子）

- 預覽替換分量用的是 `value-refs.mjs` 的 `replaceComponent`（設計原寫 `literals.mjs`）；`literals.mjs` 的 `tokenizeComponent` 包裝它。
- 同一個宣告上，一個分量已暫存換 token、另一個 `var()` 又要改綁：改綁的 probe 也以原始碼的值為基底（`replaceReference`），否則 probe 會讀到已被預覽改過的文字而無法確認。設計已補上這一段。
- `rebind-declaration` 的 journal 摘要多記錄分量位置，反向時優先以它找回引用；舊紀錄沒有這個欄位時照舊以引用順序找。

## verify 與 review 之後的修正

`/spectra-verify` 沒有 Critical，3 個警告；`/spectra-review` 有 1 個 Critical、1 個警告。全部處理如下：

- verify 警告 1（任務 3.3 承諾的「改綁到數值相同的 token 仍是此頁看不到效果」沒有測試）：新增瀏覽器檢查 17.8，把 hanko 的文字色改綁到另一個同樣解析成白色的 token 並套用，結果是 `written-not-observable`、不含「外觀不變」，還原後雜湊與套用前相同。
- verify 警告 2（任務 3.1 承諾的 `calc()` 與字體清單唯讀檢查沒有做）：17.1 用 `withFileEdit` 暫時在 Ribbon Banner 的根規則加入 `max-block-size: calc(100% - 16px)` 與 `font-family: "Noto Sans", sans-serif`，檢查兩列唯讀、原因與面板上的說明。這項檢查抓到一個真的錯誤：字體清單的列被標成 `unsupported-value`（`sidesOf` 遇到逗號就失敗），不是規格要求的 `literal-list`。已在 `runtime/tracer.ts` 修正（新增 `shared/literals.mjs` 的 `isLiteralList`，有單元測試）。原本任務寫的 `new CSSStyleSheet()` 做法行不通（`adoptedStyleSheets` 不納入追蹤），改用暫時修改試驗場檔案、結束後放回原本的位元組。
- verify 警告 3（README「安全」段沒提到新的寫入能力）：已補上「把元件樣式表某條宣告裡的一個寫死數值換成 `var(--既有 token)`」以及寫入與還原時實際寫的位元組。
- verify 建議 6（proposal 的受影響檔案與實際不符）：已修正 Impact 清單（加 `labels.ts`、`test_installer_update.test.mjs`；註明 `actions.ts`、`test_i18n.test.mjs` 不必改）。其餘建議（另設「型別不被接受」的原因碼、兩個分支補測試）未處理，不影響封存。
- review Critical（模板清單沒有隨最後的修改重建）：重建 `TEMPLATE_MANIFEST.json` 並以 `--record-release` 取代 `KNOWN_MANIFESTS.json` 的 1.4.0 紀錄；試驗場重新同步並以 `--update` 更新安裝收據。
- review 警告（`border: 1px solid var(--…)` 這類簡寫，畫面可選、套用卻被 `unsupported-value-shape` 拒絕）：伺服器呼叫 `sidesOf` 前讓每個 `var()` 分量帶上 token 的型別（和 preview 一致），`layoutSlotOf` 與 `slotsOfComponent` 合用一份 `slotSetOf`；候選排序的 `categoryUsage` 也一樣帶型別。新增交易測試與單元測試各一個，兩者都先在舊程式上確認失敗。

## 驗證結果（verify 與 review 的修正之後重跑）

| 檢查 | 結果 |
| --- | --- |
| 單元測試 `node --test 'storybook-code-layer/test/*.test.mjs'` | 211 個：208 通過、3 個選用的試驗場測試略過（需要 `CODE_LAYER_LAB_CONFIG` 等環境變數，與本 change 無關）、0 失敗 |
| 瀏覽器 `run_core_loop_browser.mjs --stage all` | 88/88（新增 stage 17 共 9 項，含 verify 之後補的 17.8 與 17.1 的運算式／清單檢查；12.3、14.1、14.7、15.1 改為依試驗場現況判斷，見下） |
| `run_live_api.mjs` | 11/11（新增 10.11：validate 不寫入、三種拒絕不寫入、apply 只改一行、undo 位元組完全還原） |
| `run_build_check.mjs` | 3/3（158 個產物檔，8 個標記 0 次出現；狀態目錄與 storybook-static 不變） |
| `build_template_manifest.mjs --check` | current（108 個檔；1.4.0 的 `KNOWN_MANIFESTS` 紀錄已隨最後的修改重新記錄） |
| 1.3.1 → 1.4.0 升級測試 | 通過（綁定不變、使用者改過的檔擋下更新） |
| 試驗場 `install_code_layer.mjs --check` | complete，installed 1.4.0 |
| 使用說明 headless 檢查 | 7 段旅程都以「幫我做這一步」走到最後；沒有 script 錯誤；1280 與 400 寬都沒有水平捲動 |
| README 與 SKILL.md 的指令 | 腳本路徑與參數都存在；唯讀的指令實際執行過（`--update --dry-run` 在 Storybook 開著時照 README 所說被 lock 擋下） |
| `spectra validate` | valid |
| `spectra analyze` | 0 Critical、0 Warning、26 Suggestion |

既有的瀏覽器檢查調整（試驗場被使用者自己的套用改過，不是本 change 的回歸）：

- 12.3：`70%` 的最大寬原本預期唯讀（`raw-value`），1.4.0 起是可以換 token 的寫死值，改為預期 `readOnly` 為 null、`literal` 為 `70%`。
- 14.1：英文面板的內距與圓角改為只比對標籤加任意 px 值（使用者 11-27 的套用把它們從 12px／4px 改了）。
- 14.7：寫死值那一行改為預期「寫死的數值 70%：可以在 …:22 換成既有的 token（只改這條宣告）」，而且不含「唯讀」。
- 15.1：字級 token 依試驗場現況挑選：目前已是 title-size（使用者 11-27 的套用）時改挑 label-size（13px），否則照舊挑 title-size（20px）；還原後預期回到開始時量到的值。

## 結束時的試驗場狀態

- 還原堆疊與開始時完全相同（17 筆，都是使用者自己的）。
- 467 個檔中 460 個雜湊與基準相同；不同的 7 個：`docs/design-system/index.html` 與 `review.html`（每次套用與還原後由專案的套用後指令重新產生；產生它們的 token 檔與規格文件雜湊都和基準相同）；`storybook/.storybook/code-layer/INSTALL_RECEIPT.json`（`--update` 寫入的 1.4.0 收據）；以及 verify 與 review 之後同步進去的修正版模板 `runtime/tracer.ts`、`server/operations.mjs`、`shared/literals.mjs`、`shared/literals.d.mts`（和 repo 模板逐位元組相同）。
- Storybook 仍在 6006 執行 1.4.0。
