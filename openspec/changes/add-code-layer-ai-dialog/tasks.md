## 1. 前置與測試替身

- [x] 1.1 確認相依已就緒並建立不耗額度的測試基礎：add-storybook-code-layer 與 add-code-layer-layout-editing 已封存（`openspec/changes/archive/` 有兩者、`node --test 'storybook-code-layer/test/*.test.mjs'` 通過），並新增假的 runner storybook-code-layer/test/fixtures/fake-runner.mjs——它讀取請求檔，依環境變數指定的劇本在工作目錄做出修改（改既有檔、新增檔、刪檔、改鏡像、加 token、寫壞 CSS、不寫結果檔、寫 needs-decision、延遲不結束）並寫出結果檔。驗證：新增 storybook-code-layer/test/test_agent_runs.test.mjs 的第一組測試，斷言每個劇本在暫存目錄產生預期的檔案差異；測試過程不執行 claude、codex 或任何真實 CLI（以 PATH 清空的子程序環境斷言）。

## 2. 啟用與就緒狀態

- [x] 2.1 [after: 1.1] agent 功能預設關閉，啟用要專案與本機兩個條件：依 design「啟用需要專案綁定與本機 runner 檔兩者」，server/config.mjs 接受選用鍵 `agent`，新增 scripts/enable_agent.mjs 產生狀態目錄的 agent-runners.json（node、orchestrator、各 CLI 的絕對路徑與版本，以及 design「runner 配方不給 shell，檔案存取限制在工作副本」所列的配方），伺服器提供 `GET /agent/status`。完成時成立 spec「Agent runs need two enablements」。驗證：test_agent_runs.test.mjs 新增並通過：只有綁定開啟而沒有 runner 檔時請求被拒為 disabled 且原因點名 runner 檔；runner 檔指向不存在的執行檔時狀態為未就緒並點名該工具；`enable_agent.mjs --dry-run` 零寫入；啟用腳本、安裝、更新、檢查、推導綁定的執行過程都沒有啟動任何 agent CLI（以包裝 `child_process` 的測試替身斷言只出現 `--version` 與 `--help` 呼叫）；沒有 `agent` 鍵的 v1 綁定解析結果不變。
- [x] 2.2 [after: 2.1] agent 路由套用同一套請求防護與大小限制：新增 server/agent/routes.mjs。完成時成立 spec「Request guard for agent routes」。驗證：test_agent_runs.test.mjs 新增並通過：其他 localhost port 的 Origin、缺 session header、超過 2000 字的文字、超過 16 KiB 的物件參照、指向索引中不存在的樣式表的物件，各自在顯示任何確認之前被拒。

## 3. 瀏覽器外的確認

- [ ] 3.1 [after: 2.2] 每次請求都先經過頁面程式碰不到的確認：依 design「瀏覽器外的確認以原生對話框為主、終端機一次性代碼為輔」新增 server/agent/confirm.mjs（原生對話框以檔案傳入文字、終端機代碼綁定請求雜湊、逾時視為拒絕、同時最多一個等待中的請求），測試以注入的確認替身取代真實對話框。完成時成立 spec「Out-of-browser confirmation」。驗證：新增 storybook-code-layer/test/test_agent_confirm.test.mjs 並通過：拒絕後沒有建立副本、沒有啟動程序；為請求 A 發出的代碼用於請求 B 不被接受；代碼只能用一次、三次錯誤後作廢；需求文字含引號、反斜線與換行時，傳給 osascript 的參數中不含該文字（只含檔案路徑）；`confirm: "off"` 時狀態回報未經確認。另在 macOS 手動確認一次真實對話框顯示專案、物件、需求文字、runner 與允許範圍，預設按鈕為拒絕。

## 4. 工作副本與啟動

- [x] 4.1 [after: 3.1] agent 只在副本上工作：依 design「agent 在工作副本上執行，通過關卡後才匯入專案」新增 server/agent/workcopy.mjs（排除清單、優先 copy-on-write、檔案數與大小上限、快照雜湊、結束後移除）。完成時成立 spec「Isolated working copy」。驗證：test_agent_runs.test.mjs 新增並通過：副本不含 `node_modules`、`.git`、建置輸出與狀態目錄；超過上限時在複製前拒絕並回報數字；假 runner 執行期間與結束後，真實工作區每個檔的雜湊與開始時相同；每種終態之後副本目錄都不存在。
- [x] 4.2 [after: 4.1] 經由既有的 runner 啟動，需求文字不進 argv：依 design「經由 agent-automation-orchestrate 啟動，契約檔寫在工作副本內」與「請求檔與結果檔協定」新增 server/agent/launcher.mjs、contract.mjs、request-file.mjs、check-result.mjs。完成時成立 spec「Runner launch」與「Request and result files」。驗證：test_agent_runs.test.mjs 新增並通過：產生的契約檔通過 orchestrator 的 `validate-project-config.mjs`；啟動的程序參數中找不到需求文字裡的特徵字串；真實工作區沒有出現任何 agent-automation 檔案；沒有結果檔、兩份結果檔、`runId` 不符、格式錯誤各自使執行為 failed；needs-decision 的結果不匯入任何變更；orchestrator 的 scripts 目錄在測試前後雜湊相同（未被修改）。

## 5. 範圍關卡與匯入

- [x] 5.1 [after: 4.2] 不合規的結果完全不進專案：依 design「範圍關卡只接受允許清單內既有檔案的修改」新增 server/agent/scope-gate.mjs。完成時成立 spec「Scope gate」。驗證：新增 storybook-code-layer/test/test_agent_scope_gate.test.mjs 並通過該規格範例表的七列，每個被拒的案例都列出違規路徑與原因代碼，且真實工作區零寫入；`agent.allowedGlobs` 縮小範圍後，原本允許的元件原始碼修改被拒。
- [x] 5.2 [after: 5.1] 合規的結果成為一筆可還原的套用：依 design「匯入是一筆可還原的套用」新增 server/agent/import.mjs，交易支援 `agent-import` 紀錄與 agent 模式的 lock。完成時成立 spec「Import as one undoable apply」。驗證：test_agent_runs.test.mjs 新增並通過：兩個樣式表的修改匯入後還原，位元組與之前相同；修改 token 真相檔時鏡像在同一筆交易更新且兩者相同；執行期間真實檔案被改過時為 stale 並零寫入；檢查在副本上失敗時零寫入；執行中送出的 apply、undo、反向套用、鏡像同步都以 `agent-run-active` 被拒，執行結束後成功；匯入途中注入失敗時由既有的回滾還原。

## 6. 生命週期與紀錄

- [x] 6.1 [after: 5.2] 執行可以查詢、取消，而且不會留下孤兒：依 design「執行狀態、取消與逾時」新增 server/agent/runs.mjs（狀態機、state.json、總時限、取消、dev server 關閉時終止、啟動時把未完成的執行標為 interrupted）。完成時成立 spec「Run lifecycle」。驗證：test_agent_runs.test.mjs 新增並通過：每個狀態轉換各有一個案例；取消後假 runner 的 process group 不存在、副本移除、專案不變；延遲不結束的 runner 在逾時後被終止且執行為 failed；執行中再送請求被拒並點名進行中的執行；以子程序模擬 dev server 被 kill 後重啟，該執行為 interrupted 且副本已移除。
- [x] 6.2 [after: 6.1] 紀錄中沒有需求文字與 agent 輸出：依 design「紀錄不含請求文字與 agent 輸出」，journal 新增 `agent-run` 紀錄，需求文字只存在執行目錄的 request.txt（權限 0600），輸出只留在記憶體。完成時成立 spec「Run records」。驗證：test_agent_runs.test.mjs 新增並通過：以含特徵字串的需求完成一次執行後，在整個狀態目錄中該字串只出現在該執行的 request.txt；journal 與 `GET /state` 的內容不含該字串、不含假 runner 印出的特徵輸出、不含環境變數值；request.txt 的權限為 0600；超過 20 次的舊執行目錄在啟動時被清除而 journal 紀錄仍在。

## 7. 對話框與結果檢視

- [x] 7.1 [after: 6.1] 選取標籤與檢視器標題列有 AI 入口，對話框可以輸入與送出：依 design「對話框在檢視器旁，入口在選取標籤與檢視器標題列」，runtime/overlay.ts 的選取標籤與 manager/Inspector.tsx 的標題列加入 AI 按鈕（選取標籤的按鈕只經 channel 通知 manager），新增 manager/components/AgentDialog.tsx，新增的字串加入兩份訊息目錄。完成時成立 spec「AI entry points」、「Prompt dialog」與「Dialog strings come from the message catalog」。驗證：新增 storybook-code-layer/test/run_agent_browser.mjs 並通過（CDP 真實輸入、假 runner、測試用確認替身）：就緒時點選取標籤上的 AI 按鈕，對話框在檢視器旁開啟並寫出該元件，原本開著的列浮層被取代；從標題列開啟結果相同；Esc 關閉後再開仍保留文字，換選另一個元素時文字依元素分開保留；在輸入框打 M 不切換 Storybook 的 measure、story 收不到按鍵；空白內容不能送出；未就緒時選取標籤沒有 AI 按鈕、標題列的按鈕停用並以 tooltip 說明原因；英文介面下對話框為英文；test_i18n.test.mjs 的鍵集合檢查仍通過。
- [x] 7.2 [after: 7.1] 送出後看得到確認、進度，並可取消：manager 新增 agent.ts 負責呼叫路由與輪詢、把送出的文字以 runId 存在 sessionStorage；檢視器在執行中停用「套用到檔案」、還原與同步。完成時成立 spec「Confirmation prompt」與「Progress and cancellation」。驗證：run_agent_browser.mjs 新增並通過：送出後對話框說明要到頁面外確認；替身拒絕後顯示已拒絕且文字仍在；終端機代碼模式才出現代碼欄；執行中重新整理分頁，檢視器仍顯示執行中、經過時間、當時的需求文字與取消，而且整個過程中所有 `/__code-layer/agent/` 回應都不含那段文字（以 CDP 的 Network 事件檢查）；按取消後狀態為已取消；執行中「套用到檔案」停用並顯示原因。
- [x] 7.3 [after: 7.2] 結束時不是可還原的結果就是「專案未變更」：新增 manager/components/AgentRunReport.tsx，放在檢視器底部的報告區。完成時成立 spec「Result review」。驗證：run_agent_browser.mjs 新增並通過：假 runner 修改 BadgeSeal 樣式表的一個宣告後，報告區顯示 agent 的摘要（純文字）、被改的檔與行數、執行過的檢查、選取元素中計算值改變的列；按還原後檔案位元組與畫面都回到執行前；匯入的報告不出現「只改回這次的變更」；假 runner 新增檔案時報告區列出該檔、說明專案未變更並提供複製物件參照；摘要含 HTML 標籤時以文字顯示而不產生元素。
- [x] 7.4 [after: 7.3] 需要決定時可以回答並接續：依 design「需要決定時以新的請求接續」。完成時成立 spec「Decision follow-up」。驗證：run_agent_browser.mjs 新增並通過：假 runner 回報 needs-decision 時對話框與報告區以純文字顯示問題；回答後建立新的執行並再次等待確認；新執行的請求檔依序含原始需求、問題與回答；回答「可以新增 token」後假 runner 新增 token，仍被範圍關卡拒絕。

## 8. 文件、登錄與端對端

- [x] 8.1 [after: 7.4] 使用者與 agent 都知道如何安全地啟用：更新 storybook-code-layer/SKILL.md（啟用前必須向使用者說明的內容、`enable_agent.mjs` 的用法、不得代替使用者同意）、README.md（威脅模型摘要、兩種確認方式、範圍關卡會拒絕什麼、成本提示、停用方式）、repo 的 README.md、docs/skills-usage.md、docs/skills-guide.html、scripts/skill-dependencies.json（對 agent-automation-orchestrate 的 support 相依），以及 docs/code-layer-guide.html（`GUIDE_VERSION` 1.3.0、更新紀錄、新增「請 AI 改」旅程並說明確認與還原、常見問題「要花錢嗎」「AI 會改到哪些檔」、模擬器加入 AI 按鈕與對話框，維持亮色、簡潔，重新發布到同一個 artifact）；`install_code_layer.mjs --check` 列出 agent 的就緒狀態；模板版本 1.3.0，重建清單並在 KNOWN_MANIFESTS.json 記錄 1.3.0。驗證：`node storybook-code-layer/scripts/build_template_manifest.mjs --check`、`node scripts/install_agent_skills.mjs --agent all --scope user --skill storybook-code-layer --dry-run`、`node --test scripts/test_install_agent_skills.mjs` 通過；說明文件以 headless 瀏覽器檢查通過（每段旅程走到最後、沒有 script 錯誤、1280 與 400 寬沒有水平捲動）；內容審閱 SKILL.md 與 README 中每個指令可照抄執行；`spectra validate add-code-layer-ai-dialog` 通過。
- [ ] 8.2 [after: 8.1] 以真實 CLI 在試驗場走一次（需要使用者在場，會產生一次請求的用量）：在 80sJP-Fable 啟用 agent，從 Hanko story 的對話框送出一個現有寫入做不到的小修改（例如把某個字面值的 `max-inline-size` 改綁到既有的 token），在原生對話框按允許。開始前記錄試驗場的雜湊基準與還原堆疊（使用者自己的套用不得被還原）。驗證：執行結束為已匯入，面板列出被改的檔；程序清單中找不到需求文字；按還原後試驗場所有檔案與執行前逐位元組相同；再送一次並在原生對話框按拒絕，沒有啟動任何程序；從終端機啟動與以背景方式啟動 Storybook 兩種情況下原生對話框都會出現（不出現時記錄並確認自動改用終端機代碼）；把觀察到的耗時與用量記入 README。
