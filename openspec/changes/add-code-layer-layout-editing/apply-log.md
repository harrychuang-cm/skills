# add-code-layer-layout-editing：執行紀錄

日期：2026-11-25。試驗場：`cm-ds-extractor-lab/80sJP-Fable`（不是 git repo，以雜湊清單與 journal 為準）。

## 起因與範圍

使用者在 2026-11-25 決定下一階段的順序是 B（開放版面結構）→ C（AI 對話框）→ A（寫死的數值換成 token），並要求直接實作 B。提案與實作在同一個工作階段完成，沒有另外的核可步驟；範圍取保守的預設：只開放 flex 容器的方向、對齊、分佈、換行四個屬性，`display`、grid、拖曳調整大小不在內。

開始前先封存了 add-storybook-code-layer（41/41），四個 capability 的基底規格才在 `openspec/specs/`。封存工具把當時工作目錄裡不相干的未追蹤資料夾記成規格的程式碼來源（每條需求一個 `@trace` 區塊，共 61 個），已改為指向 `storybook-code-layer/`。

## 開始前的試驗場狀態

- 雜湊基準：`~/.claude/plans/ethereal-yawning-beacon.snapshots/S17-before-layout.sha256`（17 個檔）與 `S17-before-layout-specs-docs.sha256`（8 個檔）。
- 還原堆疊：`20261124-094805-apply-ec805d`、`20261125-025327-apply-db1333`，都是使用者自己的套用。測試不得還原它們，結束時必須仍在。
- 使用者的套用留下 24 條待同步文件（ec805d 23 條、db1333 1 條），不屬於這次工作。

## 試驗場的量測（唯讀）

- 7 個元件樣式表、82 條規則，全部可以新增宣告（沒有空規則、沒有缺分號、沒有巢狀）。
- 宣告了 flex（`flex` 或 `inline-flex`）的規則 9 條。
- 可以改關鍵字的既有宣告 22 個：`flex-direction` 7、`align-items` 11、`justify-content` 4、`flex-wrap` 0。
- flex 規則上還沒有設定、可以新增的屬性共 21 處：`flex-direction` 5、`flex-wrap` 9、`align-items` 1、`justify-content` 6。
- `display` 的 13 個宣告維持只供檢視。

## 做了什麼

- `shared/layout.mjs`：四個屬性的固定選項、flex 的判定、會設定這些屬性的簡寫。
- `shared/sides.mjs`：`place-items`、`place-content` 列為不可拆分的簡寫。
- `server/css-index.mjs`：每條規則標示能不能新增宣告。
- `server/operations.mjs`：`set-keyword`、`add-declaration` 兩種操作的驗證與解析；只有伺服器自己能建立的 `remove-declaration`。兩個新的拒絕碼 `keyword-not-allowed`、`rule-not-eligible`。
- `server/patcher.mjs`：編輯一般化為名稱、分量、插入、移除四種；位元組證明與重新解析的證明涵蓋新增與移除的宣告。
- `server/transaction.mjs`：journal 多記分量位置、新舊關鍵字與插入的文字；反向套用涵蓋兩種版面操作。
- `server/pending-docs.mjs`、`shared/brief.ts`：版面操作各留一條待同步文件，帶舊值與新值；不搜尋關鍵字。
- `runtime/tracer.ts`：flex 容器的四個版面列有唯一的寫入目標；版面列的 probe。
- `runtime/livePreview.ts`、`verify.ts`：關鍵字與新增宣告的預覽、草稿分類與驗證。
- 檢視器：`LayoutOptions.tsx`（選項浮層）、依排列方向畫的圖示與方位名稱、版面列的顯示、變更清單與報告、物件參照。
- 介面文字：中英文各 33 個新鍵，另改寫 6 個既有的字串（`display 只供檢視`、通用的「值相同」「請重新選擇」等）。
- 模板版本 1.2.0，`KNOWN_MANIFESTS.json` 記錄 1.2.0（90 個檔）。

## 與提案不同之處

- 版面相關的單元測試集中在新的 `test/test_layout.test.mjs`（16 個測試），沒有分散到既有的測試檔。
- 規格「Targets and verdicts」的 `flex-flow`、`place-items`、`start` 三種情況，在瀏覽器測試裡是暫時修改試驗場的樣式表來驗證（結束時逐位元組復原），不是用 `new CSSStyleSheet()`：追蹤只認索引中的樣式表。
- 沒有新增「由 1.1.0 升級」的專屬單元測試；升級路徑以試驗場的實際升級為證（`--update`：29 個檔更新、3 個新增，專案綁定未變）。
- 新增宣告的變更暫存後，浮層多一個「取消這個變更」。設計文件已補上。

## 驗證結果（最終的 1.2.0）

| 檢查 | 結果 |
| --- | --- |
| 單元測試 `node --test 'test/*.test.mjs'` | 151/151（原有 135，新增 16） |
| 瀏覽器 `run_core_loop_browser.mjs --stage all` | 79/79（原有 70，新增階段 16 共 9 項） |
| 16.6 加上「按住對照」之後單獨重跑 | 通過 |
| Live API `run_live_api.mjs` | 10/10（新增 10.9、10.10） |
| Build 檢查 `run_build_check.mjs`（dev server 停止時） | 3/3，產物 158 個檔，0 個含有 Code Layer |
| 試驗場 `install_code_layer.mjs --check` | complete，版本 1.2.0 |
| `build_template_manifest.mjs --check` | current（90 個檔） |
| `spectra validate` | valid |
| `spectra analyze` | 沒有 Critical、沒有 Warning（20 個 SUGGEST，都是「情境可以加範例」） |
| 使用說明 `docs/code-layer-guide.html` | 六段旅程都走到最後、沒有 script 錯誤、1280 與 400 寬都沒有水平捲動；已重新發布到同一個 artifact（Version 3） |

第一次完整的瀏覽器測試是 73/79。六項失敗的原因與處理：

- 14.1、14.2、14.7：舊的檢查假設版面列一律鎖住（英文的唯讀說明、預設顯示的列、物件參照的行數）。改成新的預期。
- 16.3、16.4、16.5：前面的階段把「開發者資訊」留在開啟狀態，變更清單每一行多了一段位置說明。讀取草稿文字的輔助函式改為只讀主要那一行。

兩者都是測試的預期，產品程式沒有因此修改。

## 結束時的試驗場狀態

- S17 的 17 個檔與 8 個檔雜湊全部相同。
- 還原堆疊仍是使用者自己的兩筆：`20261124-094805-apply-ec805d`、`20261125-025327-apply-db1333`。
- 待同步文件 24 條，全部屬於那兩筆。
- 真相與鏡像同步，工具不在唯讀模式。
- Storybook 在 6006 執行中，已安裝 1.2.0。

## 沒有做、需要知道的事

- 沒有提交：cm-skills 的變更都在分支 `feat/storybook-code-layer` 的工作目錄裡，等使用者指示。
- add-code-layer-tokenize-literals（A）的 delta 以本 change 之前的文字為基底，實作前要改以本 change 封存後的文字為基底。
- 沒有驗證過 Safari、Firefox，以及直書（`vertical-rl`／`vertical-lr`）與右到左（`rtl`）版面下的圖示與方位名稱：程式有處理，但試驗場沒有這種 flex 容器可以實測。
