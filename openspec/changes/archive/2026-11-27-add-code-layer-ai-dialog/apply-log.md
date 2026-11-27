# add-code-layer-ai-dialog：執行紀錄

日期：2026-11-26。試驗場：`cm-ds-extractor-lab/80sJP-Fable`（2026-11-25 起是 git repo，但測試仍以雜湊清單與 journal 為準）。

## 起因與範圍

使用者在 2026-11-25 決定順序 B → C → A。B（add-code-layer-layout-editing）封存後，使用者在 2026-11-26 要求繼續實作 C。提案在實作前已依 1.2.0 的介面改寫（入口在選取標籤與檢視器標題列、對話框開在檢視器旁、伺服器不回傳請求文字、匯入會跑套用後指令、匯入不提供反向套用）。

## 開始前的試驗場狀態

- 雜湊基準：`~/.claude/plans/ethereal-yawning-beacon.snapshots/S18-before-agent.sha256`（17 個檔）與 `S18-before-agent-specs-docs.sha256`（8 個檔）。S17 之後使用者自己在 08:48 還原了 `20261125-025327-apply-db1333`（ExampleCard.css），所以重新取了 S18。
- 還原堆疊：`20261124-094805-apply-ec805d`（使用者自己的），待同步文件 23 條都屬於它。測試不得還原它。
- 專案綁定 `code-layer.config.json` 的 sha256：`22fb4148032862efccc428d31833e016ef425b662b8a572ec4a5298c0fde94ef`。

## 做了什麼

伺服器（`template/code-layer/server/`）：

- `config.mjs`：選用鍵 `agent`（`enabled` 預設 false、`confirm`、`allowedGlobs`、`workcopy`、`timeoutMs`）與兩個限制 `maxAgentTextChars` 2000、`maxAgentReferenceBytes` 16384。
- `agent/runners.mjs`：本機 runner 檔的讀寫與驗證、claude 與 codex 的配方、只用 `--version` 與說明文字的檢查。
- `agent/confirm.mjs`、`agent/messages.confirm.mjs`：原生對話框（文字以檔案傳給 osascript）、終端機確認碼、`CODE_LAYER_TEST_CONFIRM` 測試替身；對話框文字的中英文訊息目錄。
- `agent/workcopy.mjs`、`agent/scope-gate.mjs`：工作副本（copy-on-write、上限、快照雜湊）與範圍關卡。
- `agent/request-file.mjs`、`agent/check-result.mjs`、`agent/contract.mjs`、`agent/launcher.mjs`：請求檔與結果檔、orchestrator 的契約檔與 verification、啟動與終止。
- `agent/runs.mjs`、`agent/routes.mjs`：執行狀態機、紀錄、清理、五條 `/agent/*` 路由。
- `transaction.mjs`、`journal.mjs`：`component-file` 角色、agent 模式的寫入 lock、`importAgentChanges`、`agent-import` 紀錄的還原；執行中其他寫入回 `agent-run-active`。
- `shared/api-contract.mjs`：9 個新拒絕碼。

檢視器與 preview：

- `manager/agent.ts`：狀態查詢、送出、輪詢、確認碼、取消、還原、接續、重新整理後接續；請求文字只存在這個分頁的 sessionStorage。
- `manager/components/AgentDialog.tsx`、`AgentRunReport.tsx`；`Inspector.tsx` 標題列的 ✦ 按鈕與對話框位置；執行中停用套用、還原、反向套用、略過、鏡像同步。
- `runtime/overlay.ts`、`runtime/index.ts`：選取標籤上的「AI」按鈕，只在就緒時出現，按下只通知 manager。
- 介面文字：中英文各 104 個新鍵（`agent.*` 93、`error.*` 9、`overlay.ai*` 2）。

腳本與文件：

- `scripts/enable_agent.mjs`（`--dry-run`、`--disable`、`--runners`、`--codex-model` 等）；`install_code_layer.mjs --check` 多一個 `agent` 欄位與「AI requests」一行（只看檔案、不啟動任何程序、不影響 complete 與否）。
- `SKILL.md`（第 6 節：啟用前必須向使用者說明的事與同意規則）、`README.md`（〈請 AI 修改〉）、repo 的 `README.md`、`docs/skills-usage.md`、`docs/skills-guide.html`、`scripts/skill-dependencies.json`（對 agent-automation-orchestrate 的 support 相依）。
- 使用說明 `docs/code-layer-guide.html` 1.3.0：模擬器加入選取標籤的「AI」與標題列的 ✦、對話框、模擬的系統確認視窗（標明「模擬」，預設按鈕是拒絕）、進度與結果、還原；新的旅程「請 AI 修改」（8 步）；常見問題 5 則（要花錢嗎、AI 會改到哪些檔、為什麼要在瀏覽器外按允許、看不到 AI 按鈕、AI 問我問題怎麼辦）；介面導覽多一張「請 AI 修改」。模擬器的介面文字與工具的訊息目錄逐字相同。已重新發布到同一個 artifact（Version 4）。
- 模板版本 1.3.0，清單 104 個檔（1.2.0 為 90），`KNOWN_MANIFESTS.json` 已記錄 1.3.0。

## 與提案、設計不同之處（設計文件已改成實作的樣子）

- 匯入寫在 `server/transaction.mjs` 的 `importAgentChanges`，沒有另開 `server/agent/import.mjs`。
- 結果檔的 `runId` 對的是請求檔標題的 Code Layer runId，不是 `AGENT_AUTOMATION_RUN_ID`：受限模式的 agent 讀不到環境變數。
- 接續的請求由伺服器組成：頁面只送回答與前一次的 runId，伺服器從前一次的 `request.txt` 與結果檔的問題組成新的 `request.txt`。
- runner 的命令照找到時的路徑記錄（不解析 symlink），runner 檔每次查詢都重新讀取，執行啟用腳本後不必重啟。
- 工作副本另外排除 `.claude`、`.cursor`、`.codex`、`.agents`。
- `cannot` 與「done 但沒有修改」都是 failed（`agent-cannot`、`no-changes`）；`checking` 階段不能取消。
- 物件參照的檢查只看 `CSS:` 開頭的行。
- 送出後文字留在該元素的輸入框，直到執行匯入或 agent 提問才清空（拒絕、取消、失敗時仍在，可以再送）；報告區在進行中也顯示經過時間與請求文字。這兩點是瀏覽器測試對照規格時補上的。
- 「這個元素有哪些屬性改變」以送出當下重新量測的結果為準（見下方第 3 項）。

## 驗證結果（目前）

| 檢查 | 結果 |
| --- | --- |
| 單元測試 `node --test 'test/*.test.mjs'` | 185/185（1.2.0 為 151；新增 scope gate 4、確認 7、執行 21、i18n 1、安裝器 1） |
| 瀏覽器 `run_agent_browser.mjs`（假的 runner、測試用確認替身） | 13/13 |
| `build_template_manifest.mjs --check` | current（104 個檔） |
| repo `install_agent_skills.mjs --skill storybook-code-layer --dry-run` | 正常 |
| `node --test scripts/test_install_agent_skills.mjs` | 35/35 |
| 所有測試期間啟動的 agent | 只有假的 runner；以 trap 腳本與程序參數確認沒有啟動 claude 或 codex |
| 使用說明（headless 瀏覽器） | 七段旅程都走到最後（新的「請 AI 修改」8 步）、沒有 script 錯誤、1280 與 400 寬沒有水平捲動；發佈內容同樣通過 |
| `spectra validate` | valid |
| `spectra analyze` | 沒有 Critical、沒有 Warning（27 個 SUGGEST，都是「情境可以加範例」） |

第一次瀏覽器測試是 6/13，之後依序修正：

1. 測試預期：物件參照的格式已是 v2；以 runtime 選取後，讀到的是新元素之前的 trace（改為等新的 trace）；Storybook 的 log 會把長行折行並加上「│」，讀確認碼時找不到整句（改為只找短的錨點）。
2. 產品：被拒絕後文字已被清空（規格要求仍在）→ 改為匯入或提問時才清空。報告區沒有經過時間與請求文字（規格要求重新整理後仍顯示）→ 補上。
3. 產品：匯入後「屬性改變」的列是空的。原因是選取的 trace 在預覽移除後不會重新量測：重新整理時帶著預覽量到的 8px，預覽捨棄後仍是 8px，匯入後的 8px 就被當成沒變。改為送出時請 preview 重新量測一次，以那份當作「之前」。
4. 測試時序：A9 在 A8 捨棄預覽之後立刻量，preview 還沒處理完同步。改為等頁面上沒有預覽、而且送出的規則是原本的樣子；A8 另外確認捨棄的預覽確實從頁面上消失（重新整理過、agent 執行中的情況也一樣）。

## 結束時的試驗場狀態

- 綁定檔恢復原本的位元組（sha256 同上），runner 檔與測試資料夾已移除，測試建立的 20 個執行資料夾已刪除。
- S18 的 17 個檔相同。8 個規格與文件檔中，兩個產生的文件（`docs/design-system/index.html`、`review.html`）與 S18 不同：使用者在 10:06 自己套用並還原了一次 ExampleCard 的字級（`20261126-020600-apply-690e40` 與它的還原），套用後指令重新產生了這兩個檔。那是使用者的操作，沒有去動。
- 還原堆疊：`20261124-094805-apply-ec805d`；待同步文件 23 條。
- 之後使用者在 10:07 又自己套用了一次 `20261126-020744-apply-9534ba`（Hero Title Lockup 的 headline 與 kicker 文字色），14:18 查看時仍在還原堆疊上（堆疊：ec805d、9534ba；待同步文件 23 條）。回歸測試不得還原它；開始前重新取雜湊基準，不沿用 S18。
- Storybook 在 6006 執行 1.3.0，AI 修改未啟用（`binding-disabled`）。

## 第一次真實執行（8.2 進行中）

14:27 準備：試驗場以 `--update` 更新到 1.3.0（只換 `shared/messages.zh-Hant.ts`）、綁定加入 `"agent": { "enabled": true }`（原始位元組另存）、執行啟用腳本、重啟 Storybook（以背景方式啟動），log 顯示「AI runs ready (Claude Code; confirmation: native-dialog)」。記錄試驗場 501 個檔的雜湊基準，啟動程序清單監看（以預備的需求文字為比對字串，正向對照通過）。

16:06 使用者自己從 Hero Title Lockup › headline 送出一個請求（不是預備的 Hanko 文字）：

- 原生對話框出現（`osascript` 的父程序是 dev server），使用者 4 秒後按允許。
- Claude Code 2.1.308 執行 33 秒。模型是 Opus 5.5：配方沒有指定模型，跟著使用者 Claude Code 的預設（`opus[1m]`）。工具使用 Read 4、Grep 2、Edit 2、Write 1。
- 兩個 token 檢查通過，匯入 `tokens/tokens-comp.css`（含鏡像）與 `design-system/components/hero-title-lockup.md`，套用後指令重新產生兩個文件。從送出到匯入 37 秒。
- Claude Code 自己記錄的費用 US$1.74（快取寫入 200,152、快取讀取 408,140、輸出 2,847 tokens）。
- agent 相關程序的參數只有固定句子（監看紀錄截到 400 字）。這次的需求文字不是預先知道的字串，逐字比對留給下一次。
- 16:08 使用者又用檢視器改了同一個 token（`20261126-080839-apply-f80a82`），所以 AI 的匯入已不在還原堆疊頂端，不去動它。

發現：

1. **已修正**：`--restricted` 仍會載入 MCP 伺服器。這次 agent 拿到 123 個 claude.ai 連接器工具的完整定義（Gmail、Google Drive、Google Calendar、Figma、Claude Docs、Claude Data；因為沒有 ToolSearch，Claude Code 直接給出定義），雖然沒有被使用，但違反「只有檔案工具」。配方加入 `--strict-mcp-config` 並列入 `--help` 必須出現的旗標；試驗場重跑啟用腳本（不必重啟），狀態仍是就緒；單元測試 185/185（含試驗場選用檢查）；1.3.0 重新記錄。下一次真實執行要確認：紀錄裡沒有 `mcp__` 工具、費用下降。
2. **待使用者決定**：Claude Code 把每次執行（含需求文字）存在 `~/.claude/projects/<複本路徑>/`，每個請求一個資料夾，不在保留 20 次的清理範圍內，和「請求文字只存在 request.txt」的說法不符。可以加 `--no-session-persistence`。
3. **待使用者決定**：模型跟著使用者 Claude Code 的預設，費用偏高。可以讓啟用腳本指定模型（例如 Sonnet），或用 `--max-budget-usd` 設每次請求的上限。
4. 尚未檢查：Codex 的配方可能同樣會載入使用者的 MCP 設定（目前沒有啟用 Codex）。

修正之後：

- 16:14:29 的請求在原生對話框等了 60 秒沒有回應，以逾時拒絕（`confirmation-timeout`），沒有啟動任何 agent 程序。
- 16:15:49 使用者送出預備的 Hanko 文字，1.7 秒後按允許。命令列含 `--strict-mcp-config`；紀錄裡沒有任何 `mcp__` 工具。Claude Code 執行 24.6 秒，從送出到匯入 27 秒。費用 US$0.16，同樣是 Opus 5.5（快取寫入 12,845、快取讀取 60,822、輸出 2,464 tokens）。
- 匯入 `BadgeSeal.css` 與 `badge-seal.md`：CSS 新增 `.md-badge-seal--hanko .md-badge-seal__content { writing-mode: vertical-rl; text-orientation: upright; }`，規格補一句直書。程序清單監看沒有任何程序的參數含預備文字的字串。
- 套用後指令產生的 `docs/design-system/index.html` 與 `review.html` 每次都寫入產生時間（各一行），同樣的來源產生兩次也不同。所以「還原後所有檔案逐位元組相同」對這兩個檔只能做到「除了產生時間那一行」，其他 499 個檔要逐位元組相同。預期狀態已在暫存副本上算好（`scratchpad/real-run/docs-check/`）。

## 第二次真實執行與收尾（2026-11-27，3.1 與 8.2 完成）

1.3.0 已於 11-26 提交並推上 main（fb12143）。

使用者的兩個決定：

- 第一次執行的「待使用者決定 2」：加上 `--no-session-persistence`，並刪除既有的 3 個 `~/.claude/projects/*code-layer-agent*` 資料夾（已刪）。1.3.0 已發布，所以不重新記錄 1.3.0，改升為 **1.3.1**（`KNOWN_MANIFESTS.json` 記錄 1.3.1）。舊 runner 檔的參數是啟用時寫入的，README 註明升級後要重跑啟用腳本。
- 「待使用者決定 3」（模型與費用）：這次不改，併入 `add-code-layer-runner-fallback`，讓啟用腳本可以指定每個工具的模型。

試驗場以 `--update` 更新到 1.3.1（`package.json`、`server/agent/runners.mjs`），重跑啟用腳本，runner 檔帶有 `--no-session-persistence`。單元測試 185 項中 182 通過、3 略過。

程序監看：每 0.2 秒記錄一次程序清單。以帶有比對字串的假程序做正向對照，確認抓得到。之後我自己的指令都不含比對字串。基準為試驗場 463 個檔的雜湊（兩個產生的文件遮掉產生時間那一行，其餘逐位元組比對）。

| 檢查 | 結果 |
| --- | --- |
| 背景啟動（`nohup`）下送出 Hanko 圓角請求、按允許 | 原生對話框出現，內容有專案、元素、需求文字、Runner、允許範圍，預設按鈕是「拒絕」（3.1 的人工確認）；Claude Code 執行 17.1 秒，匯入 `BadgeSeal.css`（corner-sm → corner-md）與 `badge-seal.md` |
| 程序參數 | claude 的命令列含 `--strict-mcp-config --no-session-persistence`；沒有任何程序的參數含需求文字 |
| 對話紀錄 | `~/.claude/projects/` 沒有新增資料夾 |
| 按還原 | 463 個檔與基準相同（0 個不同） |
| Cursor agent 啟動的 Storybook 下按拒絕 | `denied`（`confirmation-denied`）；只有 `osascript`，沒有 `claude -p`；沒有工作副本；檔案不變 |
| 從終端機前景啟動（`ttys036`、上層為 zsh）下按拒絕 | 原生對話框出現；`denied`；沒有 `claude -p`；檔案不變 |
| 回歸：`run_live_api.mjs` | 10/10 |
| 回歸：`run_core_loop_browser.mjs --stage all` | 77/79。14.3 與 16.8 失敗，原因是試驗場的 Hanko 內容框在 11-26 被使用者改成直書（`writing-mode: vertical-rl`）：`max-inline-size` 在直書是高度，column 容器的主軸由右到左，工具顯示「最大高」「靠右／靠左」是正確的，測試把橫書寫死了。改成依實際書寫方向決定預期值後，stage 14、16 重跑 17/17 |
| 回歸：`run_build_check.mjs` | 3/3（靜態建置不含任何 Code Layer 程式碼） |
| 回歸之後的試驗場 | 463 個檔與基準相同 |

另外：Cursor 的 agent 在 Storybook 被停掉後約一分鐘，自動重新執行了 `npm run storybook`。之後在試驗場停掉 Storybook 時，要先在 Cursor 停掉那個指令。

## verify 與 review 之後的修正（2026-11-27，併入 1.3.1）

`/spectra-verify` 沒有 Critical，6 個 Warning、5 個 Suggestion；`/spectra-review` 沒有 Critical，3 個 Warning、3 個 Suggestion。處理如下：

| 發現 | 處理 |
| --- | --- |
| verify W1 規格說沒結束都能取消，但 checking 不能 | 規格改為「除了正在檢查並匯入時」（design 本來就這樣寫） |
| verify W2 規格說每次匯入都跑檢查 | 規格改為「改到 token 真相檔時」（與一般套用相同） |
| verify W3 執行中對話框沒有 runner | 對話框狀態列在核准後到結束前顯示 runner；瀏覽器 A8 加斷言 |
| verify W4 design 寫摘要有 port 與 story | design 改成實際內容，說明為何不列 |
| verify W5 1.3.1 沒寫回文件 | design 的參數清單、遷移計畫、提案的版本補上 |
| verify W6 唯讀時 `/agent/*` 404、頁面一直顯示「正在檢查」；停用時查詢、確認碼、取消不回 disabled | 唯讀伺服器註冊只回報狀態的 agent 路由（原因 `read-only`），其他路由拒絕；停用時三條路由回 `agent-disabled` 附原因；兩個新測試 |
| verify S2 物件參照只寫檔名的 CSS 行不被檢查 | 正規式改為檔名後接空白或行尾；新增測試案例 |
| verify S4 提案的程式清單與任務 5.2 過時 | 改成實際的檔案 |
| review 1 舊 runner 檔升級後沒有提示 | `staticProblems` 檢查 runner 檔的參數含目前配方的每個旗標，缺少時 `runner-recipe-outdated`；SKILL.md 第 4 節補上重跑啟用腳本；新測試 |
| review 2 工具在 Storybook 執行期間自動更新不會重新檢查 | 探測快取以 runner 檔與每個指令解析後的實際檔案及修改時間為依據（`probeKey`）；新測試 |
| review 3 接續回答時確認摘要截掉回答 | 接續請求的摘要先列「你的回答」（600 字），原本的需求與 AI 的問題各截到 200 字；新測試 |
| review 5 啟用腳本另寫一份寫檔 | 改用 `writeRunnerFile` |
| review 6 使用說明仍是 1.3.0 | `GUIDE_VERSION` 1.3.1、更新紀錄、模擬器的進度也顯示 runner；headless 檢查七段旅程都走到最後、沒有 script 錯誤、1280 與 400 寬沒有水平捲動；重新發布到同一個 artifact（第 5 版） |

移到 `add-code-layer-runner-fallback`（之後以 `/spectra-ingest` 併入）：verify S1（Codex 可能把對話存在 `~/.codex/sessions`，和 Codex 試跑一起驗證）、verify S3（整體時限沒有測試；該 change 本來就要把時限計算抽出來測）、使用者決定的「啟用腳本可指定每個工具的模型」。

記為已知限制（README）：review 4（建立與比對副本是同步 I/O，工作區很大時 Storybook 會停住幾秒）、verify S5（以訊號強制結束 Storybook 時 AI 不會一起結束，下次啟動才標為中斷）。

驗證：單元測試 190 項中 187 通過、3 略過（多了 5 項）；瀏覽器 `run_agent_browser.mjs` 12/13，A6 失敗是因為試驗場綁定固定了 `"locale": "zh-Hant"`（綁定優先於瀏覽器語言），暫時拿掉後 A6 1/1；teardown 後綁定與 runner 檔恢復原狀。`build_template_manifest.mjs --check` current，`test_install_agent_skills.mjs` 35/35，`spectra validate` valid。

## 需要知道的事

- 使用說明的模擬器有一個 1.2.0 就存在的問題，已一併修正：在列的浮層搜尋框按 Esc，關閉浮層後連選取也被取消（重繪後畫布的鍵盤處理不再認得那個輸入框）。真正的工具沒有這個問題（檢視器與畫布在不同的文件裡）。
- 使用說明的「請 AI 修改」旅程請 AI「改成圓形」（4px → 999px），不是「圓角大一級」：選取外框會蓋住角落，4px 與 8px 在模擬器裡看起來一樣。自由操作時打「圓角大一級」仍是 4px → 8px。接續提問、終端機確認碼、逾時只在文字裡說明，模擬器沒有做。

- 已知、不在本 change 修正：選取元素的 trace 在 live 預覽移除時不會重新量測。帶著預覽重新整理後再捨棄，檢視器的列會顯示預覽時的值，直到重新選取該元素。AI 的「屬性改變」已改為送出時重新量測，不受影響。
- 確認碼模式下，Storybook 的終端機會印出請求文字（給人核對用，屬於設計）。
- 1.3.0 於 2026-11-26 提交（fb12143）並合併進 main；1.3.1 的變更在 main 的工作目錄裡，隨歸檔一起提交。
