## 1. 共用基礎與索引

- [x] 1.1 版面屬性與選項有單一定義：依 design「可以編輯的是 flex 容器的四個屬性，選項是固定清單」新增 storybook-code-layer/template/code-layer/shared/layout.mjs（附 `.d.mts`），提供四個屬性的固定清單、flex 的判定、會設定各屬性的簡寫；`shared/properties.ts` 的四個版面群組標為以關鍵字編輯。驗證：新增 storybook-code-layer/test/test_layout.test.mjs，斷言清單內容與 code-layer-style-tracing 規格「Layout rows of a flex container」的 keywords 表完全相同、`display` 不在可編輯之列；既有的 `node --test 'storybook-code-layer/test/*.test.mjs'` 全數通過。
- [x] 1.2 [after: 1.1] 由簡寫設定的對齊與分佈不會被當成沒有設定：依 design「place-items 與 place-content 列為會設定版面屬性的簡寫」修改 shared/sides.mjs。驗證：test_layout.test.mjs 的「sides」測試通過：`place-items` 回報影響 `align-items`、`place-content` 回報影響 `justify-content`，兩者都是不可拆分的簡寫；`flex-flow: column wrap` 仍拆成方向與換行兩個分量。
- [x] 1.3 [after: 1.1] 索引標示每條規則能不能新增宣告：依 design「索引標示哪些規則可以新增宣告」修改 server/css-index.mjs 與 index-builder.mjs（索引 JSON 帶出這個欄位）。完成時成立 spec「Rules that can take a new declaration」。驗證：test_layout.test.mjs 通過該規格範例表的五列，以及一個樣式表每條規則的標示；試驗場的索引 82 條規則的標示數量記入 apply-log。

## 2. 伺服器寫入

- [x] 2.1 [after: 1.3] 伺服器接受兩種版面操作並自己驗證：依 design「操作 set-keyword 與 add-declaration 由伺服器驗證屬性、關鍵字與規則」修改 shared/api-contract.mjs 與 server/operations.mjs。完成時成立 spec「Operations」。驗證：test_layout.test.mjs 通過（全部在暫存目錄的 fixture 專案）：規格中 `justify-content: center`、`flex-flow: column wrap`、新增 `flex-wrap: wrap` 三個情境的結果與檔案位元組；拒絕碼表中與版面有關的每一列各有案例（關鍵字不在清單、屬性不是版面屬性、分量不是單一關鍵字、規則沒有宣告 flex、規則已經有該屬性、規則已經有 `flex-flow` 或 `place-items`、規則不能新增宣告、同一批重複、`fromKeyword` 與檔案不同、新舊相同、`after` 不符、定位不符、`remove-declaration`），每個被拒的案例檔案雜湊、mtime 與 inode 都不變；run_live_api.mjs 的 10.9 在執行中的伺服器上重現其中五種拒絕。
- [x] 2.2 [after: 2.1] 寫入前證明只有預期的位元組改變：依 design「位元組證明涵蓋換掉一個分量與插入一行」修改 server/patcher.mjs。完成時成立 spec「Byte-exact patching」。驗證：test_layout.test.mjs 通過：關鍵字緊鄰註解、BOM、CRLF 加 tab 縮排的插入、單行規則的插入、規則最後是註解的插入（同一行與獨立一行）、同一條規則同批新增兩個屬性、同一個檔同時有名稱編輯、關鍵字編輯與插入；每個案例以獨立算出的完整文字比對結果；不是單一識別字的關鍵字或屬性名稱、沒有結尾分號或空的規則，在產生任何位元組之前就被拒絕；對試驗場 7 個元件樣式表中每個版面關鍵字換成清單內另一個再換回、每條宣告了 flex 的規則新增再移除，位元組都與原檔相同（唯讀，不寫入試驗場）。
- [x] 2.3 [after: 2.2] 還原與反向套用涵蓋版面操作：依 design「反向套用換回記下的關鍵字或移除插入的那一行」修改 server/transaction.mjs。完成時成立 spec「Undo」。驗證：test_layout.test.mjs 通過：套用後直接還原，檔案位元組與套用前相同；套用後改同檔另一行，整檔還原以 `undo-conflict` 被拒，反向套用把 `align-items: center` 換回清單外的 `start`、把兩行新增的宣告移除，並保留另一行的修改；新增的宣告被手動改成 `nowrap`、被重新縮排，或關鍵字被改成別的值之後，反向套用以 `stale-before` 被拒且檔案不變；既有的改綁反向套用測試（紀錄欄位與 1.1.0 相同）照常通過。
- [x] 2.4 [after: 2.1] 版面變更留下待同步文件，不搜尋關鍵字：依 design「文件待同步只記宣告本身」修改 server/pending-docs.mjs 與 shared/brief.ts。完成時成立 spec「Documents pending sync」。驗證：test_layout.test.mjs 通過：`justify-content: center` 改成 `space-between`、同目錄的元件原始碼多處出現 `center` 時，該操作恰好一條待同步文件，帶有屬性、舊值與新值；新增宣告也是一條（沒有舊值）；還原後條目消失。

## 3. 追蹤、預覽與驗證（preview 端）

- [x] 3.1 [after: 1.3] flex 容器的四個版面列被判為可以編輯，並有唯一的寫入目標：依 design「有宣告就改那個分量，沒有宣告就新增在宣告 display 的規則」修改 runtime/tracer.ts 與 shared/protocol.ts。完成時成立 spec「Property rows」與「Layout rows of a flex container」。驗證：storybook-code-layer/test/run_core_loop_browser.mjs 新增階段 16 並通過（CDP 真實輸入，試驗場）：16.1 Badge Seal 根元素的 display 列唯讀，對齊與分佈列可以編輯且目標是既有的宣告，方向與換行列可以編輯且目標是在宣告 display 的規則新增；不是 flex 容器的元素四列沒有目標；16.2 暫時把樣式表改成 `flex-flow`、`place-items`、`start` 後逐列對照規格「Targets and verdicts」（結束時樣式表逐位元組復原）。
- [x] 3.2 [after: 3.1] 預覽、probe 與驗證涵蓋關鍵字與新增的宣告：依 design「預覽、probe 與驗證」修改 runtime/tracer.ts、livePreview.ts 與 verify.ts。驗證：run_core_loop_browser.mjs 通過：16.3、16.4 打開版面列的浮層後 probe 為已確認，probe 前後該規則的 `cssText` 相同、`document.getAnimations().length` 不變（含新增宣告的 probe）；滑過選項時計算值改變而磁碟上的檔案雜湊不變；16.6 按住對照會暫時還原、原樣重存樣式表觸發熱更新後預覽仍在、外部改掉那個關鍵字時草稿顯示「來源已變更」；16.5 套用後結果為已驗證，還原後計算值與檔案都回到套用前，預覽沒有被帶回來。

## 4. 檢視器

- [x] 4.1 [after: 3.1] 版面列在 flex 容器上一律顯示並看得出能不能改：依 design「檢視器上的呈現」修改 manager/components/Field.tsx 與 icons.tsx。完成時成立 spec「Low-text presentation」與「Property rows in the panel」。驗證：run_core_loop_browser.mjs 的 16.1 通過：選取只宣告對齊與分佈的 flex 容器時，Layout 區在預設設定下列出四列，未宣告的兩列顯示計算值並標示為預設；display 列唯讀並說明「display 只供檢視」；可以編輯的版面列沒有 token 膠囊，顯示目前關鍵字的圖示與名稱。
- [x] 4.2 [after: 4.1] 版面列點開是選項浮層：新增 manager/components/LayoutOptions.tsx，並修改 RowPopover.tsx、drafts.ts、actions.ts。完成時成立 spec「Layout options」。驗證：run_core_loop_browser.mjs 的 16.3、16.4 通過該規格的四個情境（滑過預覽後按 Esc 不留變更、選取後暫存並關閉、未宣告的列說明新增在哪條規則、選回原值會取消暫存）；浮層沒有範圍切換也沒有步進鈕；鍵盤方向鍵可以移動、Enter 選取；16.8 直向排列的容器把分佈的起點稱為「靠上」、對齊的起點稱為「靠左」。
- [x] 4.3 [after: 4.2] 變更清單、報告與物件參照涵蓋版面變更：修改 manager/apply.ts、components/ChangesBar.tsx、Report.tsx 與 shared/reference.ts、labels.ts。完成時成立 spec「Changes list」。驗證：run_core_loop_browser.mjs 的 16.5 通過：同時暫存「分佈 center → space-between」「換行（未設定）→ wrap」與一筆改綁 token 後變更清單各一行，磁碟上的檔案不變；重新整理後草稿與預覽仍在；套用後三筆都是已驗證，樣式表改了一個關鍵字、在規則最後多一行 `flex-wrap: wrap;`、換了一個 token 名稱；兩筆版面變更各有一條待同步文件；還原後樣式表與套用前逐位元組相同。16.8 複製物件參照的文字包含版面列的值、選項與寫入位置。
- [x] 4.4 [after: 4.3] 新增的介面文字兩種語言都有：新字串加入 shared/messages.zh-Hant.ts 與 messages.en.ts（選項的名稱、四個方位、「未設定」、「預設值」、寫入位置的兩種說明、新的唯讀原因四種、兩個新的拒絕碼）。驗證：test_i18n.test.mjs 的鍵集合檢查通過；run_core_loop_browser.mjs 的 16.7 在英文介面下列與浮層都是英文，浮層上沒有中文字。

## 5. 試驗場端對端

- [x] 5.1 [after: 4.4] 在試驗場走完整流程而且不留痕跡：以開始前記錄的雜湊基準（S17）與還原堆疊為準，以安裝器 `--update` 升級試驗場並重啟 6006 上的 Storybook。驗證：`node storybook-code-layer/test/run_core_loop_browser.mjs --stage all` 全數通過（含新增的階段 16）；`node storybook-code-layer/test/run_live_api.mjs` 通過新增的 10.9、10.10（`set-keyword` 與 `add-declaration` 的 validate、apply、undo）；結束時還原堆疊與開始時相同（使用者自己的兩筆套用仍在），token、鏡像、元件樣式表、規格文件的雜湊與基準相同；`run_build_check.mjs` 通過。

## 6. 版本與文件

- [x] 6.1 [after: 5.1] 1.1.0 的專案可以直接升級到 1.2.0：模板版本改為 1.2.0，重建 TEMPLATE_MANIFEST.json 並把 1.2.0 加入 KNOWN_MANIFESTS.json。驗證：`node storybook-code-layer/scripts/build_template_manifest.mjs --check` 通過；test_installer_update.test.mjs 既有的「已記錄版本的雜湊必須等於目前清單」與三方比對各列照常通過；試驗場實際由 1.1.0 以 `--update` 升級（29 個檔更新、3 個新增，專案綁定未變），`install_code_layer.mjs --check` 回報完整。
- [x] 6.2 [after: 6.1] 使用者與 agent 從文件知道版面編輯與它的界線：更新 storybook-code-layer/README.md（能改的四個屬性與選項、新增宣告寫在哪裡、仍然只供檢視的項目、寫入端點能力範圍的變動、「數值與顏色仍然只能用 token」）、SKILL.md、repo 的 README.md、docs/skills-usage.md 與 docs/skills-guide.html 的說明文字，以及 docs/code-layer-guide.html（`GUIDE_VERSION` 1.2.0、更新紀錄、新增「調整排列」旅程、「認識介面」加入選項浮層、記號一節、常見問題三題、模擬器加入可操作的版面列，「遇到鎖頭」旅程改為寫死的數值），維持亮色、簡潔的版面，並重新發布到同一個 artifact。驗證：說明文件以 headless 瀏覽器檢查通過（六段旅程以「幫我做這一步」走到最後、沒有 script 錯誤、1280 與 400 寬都沒有水平捲動）；新增與修改的檔案中搜尋不到舊的 tools installer skill 名稱。
- [x] 6.3 [after: 6.2] 提案與實作一致：驗證：`spectra validate add-code-layer-layout-editing` 通過；`spectra analyze add-code-layer-layout-editing` 沒有 Critical；`node --test 'storybook-code-layer/test/*.test.mjs'` 全數通過；在 apply-log.md 記下各項檢查的實際結果與試驗場的最終狀態。
