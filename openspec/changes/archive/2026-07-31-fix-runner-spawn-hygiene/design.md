## Context

`agent-automation-orchestrate` 以 `executeProcess` 啟動 preflight、agent 與 verification 三種子程序。目前 agent 與 verification 使用字串形式的 `stdio: "inherit"`，逾時處理則對子程序控制代碼呼叫 `kill("SIGTERM")`，一秒後再呼叫 `kill("SIGKILL")`。

在開發者互動終端下這組行為可運作。但本次研究以實測確認兩項在非終端啟動者下的缺陷：`codex exec` 在繼承而來且保持開啟的 stdin 管道上不會結束，實測四十五秒無退出；逾時終止只送訊號給直接子程序，agent 自己啟動的孫程序在父程序被終止後仍存活並被 PPID 1 接管。

後續的設計師串鏈 sequencer 會以非終端方式逐步呼叫 `run-task.mjs`，因此會完整繼承這兩項缺陷：每一步靜默卡死至逾時上限，且每次逾時外洩一批程序。本變更是該 sequencer 的前置條件。

另已實測確認 `cursor-agent status` 在未登入時印出 `Not logged in` 卻以 0 退出，而 `cursor-agent models` 在同一狀態下以 1 退出並印出 `Authentication required`。skill 目前只出貨 codex 一份具體 runner 配方。

## Goals / Non-Goals

**Goals:**

- 讓 `run-task.mjs` 在沒有終端的父程序下具備與互動終端相同的結束行為。
- 讓逾時終止不留下存活的後代程序。
- 讓 contract 記載的 runner 配方以實測退出碼為依據，而非推測。
- 以不呼叫付費 CLI 的確定性檢查證明上述行為。

**Non-Goals:**

- 不改變 runner fallback 分類、summary 形狀、status 查詢或 project-contract schema。
- 不改變 stdout 與 stderr 的去向。`runner-contract.md` 要求診斷輸出寫到當前終端而非持久摘要，本變更維持該行為。
- 不新增驗證規則拒絕 `inheritEnv` 中的 provider 金鑰名稱。實測顯示該設定目前通過驗證，是否禁止屬政策決定且會使既有合法設定失效。
- 不執行 `cursor-agent login`，不宣稱三路 fallback 已具備能力。

## Decisions

### 子程序 stdin 一律隔離，stdout 與 stderr 維持繼承

`executeProcess` 改以陣列形式指定 stdio，第一個位置固定為 `ignore`，第二與第三個位置沿用呼叫端既有語意。子程序因此取得一個立即結束的 stdin，等待輸入的 CLI 會直接讀到結尾而非無限期阻塞。

選擇隔離 stdin 而非整組改為 `ignore`，是因為 contract 明文要求診斷輸出留在終端；整組隔離會讓使用者在互動執行時看不到 agent 進度。

替代方案是保留 `inherit` 並依賴 `timeoutMs` 兜底。實測顯示該路徑會讓每次嘗試耗盡完整逾時上限，範例設定為三十分鐘，且逾時本身又觸發孫程序外洩，因此拒絕。

### 逾時終止整個 process group，並轉送終端中斷訊號

子程序以 `detached` 方式啟動使其成為 process group 領導者，逾時後對負的 group 識別碼送出訊號，使 agent 啟動的所有後代一併結束。既有的先 SIGTERM、一秒後 SIGKILL 兩段式節奏維持不變。

`detached` 會使子程序脫離父程序的前景 process group，因此終端的 Ctrl+C 不再自動傳達給子程序。為維持既有互動行為，父程序註冊 SIGINT 與 SIGTERM 處理器，收到訊號時先對子程序 group 轉送同一訊號再結束自己。

替代方案是維持附著並在逾時時走訪程序樹逐一終止。該作法需要平台相關的程序列舉、存在 PID 重用競態，且在子程序快速衍生時不完整，因此拒絕。

### runner 配方以實測退出碼為準記入 contract

`runner-contract.md` 新增一節，列出 codex、claude 與 cursor-agent 三份配方，每份標註其 preflight 指令與該指令在未登入狀態下的實測退出碼。

該節明確記載三件事：`cursor-agent status` 未登入時以 0 退出因此不可作為 preflight，正確選擇為 `cursor-agent models`；claude 的 `--add-dir` 為變參，因此 `args` 陣列順序具有語意而現行佔位符計數檢查無法偵測順序錯誤；codex 在非 git 儲存庫下需要 `--skip-git-repo-check`。

同時記載一條判準：preflight 指令必須在未認證時以非零退出，否則該 runner 永遠不會被判定為 `unavailable`，會通過 preflight 後才失敗並佔用一個 fallback 名額。

### 以確定性 fake runner 驗證程序衛生，不呼叫付費 CLI

`check-agent-automation-skill.mjs` 新增三個案例，全部以 `node -e` 內嵌腳本作為 fake runner，不呼叫任何真實 CLI，因此不產生推論費用且結果確定。

三個案例分別為：讀取 stdin 至結尾的 fake runner 必須在遠短於逾時上限內結束；衍生長時間存活孫程序的 fake runner 在逾時後該孫程序必須不存在；宣告未認證時以零退出之 preflight 的設定，其 runner 被記錄為通過 preflight 而後失敗，用以固定該情境的可觀察結果。

## Implementation Contract

### 行為

在沒有終端的父程序下執行 `run-task.mjs`，等待標準輸入的 agent CLI 立即取得輸入結尾並依其自身邏輯結束，不再阻塞至逾時。逾時發生後，該次執行啟動的所有後代程序皆已結束。互動終端下按 Ctrl+C 仍會中止正在執行的 agent。

### 介面與資料形狀

`executeProcess` 的 `stdio` 參數改接受陣列形式，預設值為標準輸入 `ignore`、標準輸出與標準錯誤 `inherit`。既有以 `ignore` 呼叫的路徑維持整組隔離。

summary 的欄位、`outcome` 取值集合與 `phase` 取值集合皆不變。逾時仍記錄為 `timeout`，preflight 非零仍記錄為 `unavailable`。

`runner-contract.md` 新增一節，內含三份 runner 配方物件與一條 preflight 選擇判準。

### 失敗模式

逾時流程維持兩段式：先送 SIGTERM，一秒後送 SIGKILL 並以 `timeout` 結果收斂。若 group 訊號因子程序已結束而失敗，該錯誤被忽略且不改變結果分類。

父程序收到 SIGINT 或 SIGTERM 時轉送同一訊號給子程序 group，然後結束。此路徑不寫入新的 summary。

### 驗收標準

- `node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs` 通過，且輸出的 `checks` 陣列包含 `stdin-not-inherited`、`timeout-kills-process-group` 與 `preflight-zero-exit-when-unauthenticated` 三個新案例名稱。
- 既有案例名稱與數量除新增外不變，證明 fallback、verification 與 status 語意未受影響。
- `runner-contract.md` 中三份配方的 `args` 各自恰好包含一個 `{prompt}` 與一個 `{workspace}` 佔位符。
- `spectra validate fix-runner-spawn-hygiene` 通過。

### 範圍邊界

**在範圍內**：`executeProcess` 的 stdio 與逾時終止行為、父程序訊號轉送、`runner-contract.md` 的配方與 preflight 判準、上述三個檢查案例。

**在範圍外**：stdout 與 stderr 改導向記錄檔、`inheritEnv` 的 provider 金鑰政策與其驗證、`cursor-agent` 登入、串鏈 sequencer、流程視覺化、Design Automation Hub 的 Coordinator 與 Plugin。

## Risks / Trade-offs

- [`detached` 使子程序脫離前景 group，終端 Ctrl+C 不再自動傳達] → 父程序註冊 SIGINT 與 SIGTERM 處理器主動轉送，並以互動情境手動確認一次。
- [父程序被 SIGKILL 時無法轉送訊號，子程序 group 會存活] → 屬 SIGKILL 本質限制，在 contract 中明確記載此情形需人工清理，不以未經驗證的機制掩蓋。
- [隔離 stdin 可能使某些 CLI 在偵測到非互動時改變行為] → 已對 codex 與 claude 實測其非互動模式；配方一節記載此前提，未實測的 CLI 不列入配方。
- [新增檢查案例延長 checker 執行時間] → 三個案例皆使用內嵌 node 腳本與短逾時上限，不呼叫網路或付費服務。

## Migration Plan

1. 先改 `executeProcess` 的 stdio 與逾時終止，並新增父程序訊號轉送。
2. 新增三個 checker 案例並確認全部既有案例仍通過。
3. 更新 `runner-contract.md` 的配方與 preflight 判準。

主 spec 的規範語句由本變更的 delta spec 在歸檔時套用，實作期間不得手動編輯 `openspec/specs/` 底下的檔案。

回滾方式為還原 `run-task.mjs` 的 stdio 與終止段落；該檔案無持久狀態格式變更，既有 summary 與 state 目錄不受影響，因此回滾不需資料遷移。

## Open Questions

無。stdout 與 stderr 的去向、`inheritEnv` 政策與 cursor-agent 登入皆已明確列為範圍外。
