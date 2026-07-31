## 1. 子程序 stdio 與終止行為

- [x] 1.1 依 design「子程序 stdin 一律隔離，stdout 與 stderr 維持繼承」及 Implementation Contract「介面與資料形狀」完成 requirement「Child processes never inherit the caller's standard input」：`executeProcess` 的 `stdio` 參數改接受陣列形式，預設標準輸入為 `ignore` 而標準輸出與標準錯誤維持 `inherit`，既有以 `ignore` 呼叫的路徑維持整組隔離。完成後由非終端父程序啟動、且會讀取標準輸入至結尾的 runner 必須以自身退出狀態收斂而非 `timeout`，且 summary 仍不含 prompt、argv、stdout、stderr 或環境值；以新增的 checker 案例 `stdin-not-inherited` 驗證。
- [x] 1.2 依 design「逾時終止整個 process group，並轉送終端中斷訊號」及 Implementation Contract「失敗模式」完成 requirement「Timed-out and interrupted runs terminate the entire process group」：子程序以 process group 領導者方式啟動，逾時後對整個 group 送出既有的兩段式 SIGTERM 與一秒後 SIGKILL，父程序收到 SIGINT 或 SIGTERM 時先轉送同一訊號給該 group 再結束，對已結束子程序送訊號失敗一律忽略且不改變結果分類。完成後 runner 啟動的後代程序在逾時收斂後必須不存在，且 `outcome` 仍為 `timeout`、`phase` 取值集合不變；以新增的 checker 案例 `timeout-kills-process-group` 驗證。

## 2. 確定性檢查案例

- [x] 2.1 依 design「以確定性 fake runner 驗證程序衛生，不呼叫付費 CLI」在 `check-agent-automation-skill.mjs` 新增 `stdin-not-inherited`、`timeout-kills-process-group` 與 `preflight-zero-exit-when-unauthenticated` 三個案例，全部以 `node -e` 內嵌腳本作為 fake runner，不呼叫任何真實 CLI、網路或付費服務，並使用短逾時上限。完成後執行 `node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs` 必須以零退出，輸出的 `checks` 陣列同時包含這三個新名稱與全部既有案例名稱。

## 3. Runner 配方與 preflight 判準

- [x] 3.1 依 design「runner 配方以實測退出碼為準記入 contract」完成 requirement「Documented runner recipes declare a preflight that fails when unauthenticated」：`runner-contract.md` 新增 codex、claude 與 cursor-agent 三份完整 runner 配方與一條 preflight 選擇判準，明確記載 `cursor-agent status` 在未登入時以 0 退出因此不可作為 preflight、正確選擇為 `cursor-agent models`，記載 claude 的 `--add-dir` 為變參因此 `args` 陣列順序具有語意且佔位符計數無法偵測順序錯誤，並記載 codex 在非 git 儲存庫下需要 `--skip-git-repo-check`。以人工審閱確認三份配方各自恰好包含一個 `{prompt}` 與一個 `{workspace}` 佔位符，並以案例 `preflight-zero-exit-when-unauthenticated` 固定「preflight 零退出的 runner 會通過預檢後才失敗」這個可觀察結果。同時完成 requirement「Runner recipes record how each preflight claim was established」：配方一節附一張 evidence 表，逐列標示該退出碼是 directly observed 或 unconfirmed，未在未認證帳號上觀察過的 preflight 一律標為 unconfirmed 而不得呈現為已驗證；以人工審閱確認表中每一列都帶有 evidence 標示。

## 4. 驗收與範圍確認

- [x] 4.1 依 Implementation Contract「行為」與「驗收標準」執行完整驗收：分別以非終端父程序與互動終端各執行一次，確認前者不再阻塞至逾時、後者按 Ctrl+C 仍會中止執行中的 agent 且診斷輸出仍顯示於終端；接著依序執行 `node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs`、`git diff --check`、`spectra analyze fix-runner-spawn-hygiene --json` 與 `spectra validate fix-runner-spawn-hygiene`，全部通過才視為完成。
- [x] 4.2 依 Implementation Contract「範圍邊界」確認實作未逸出範圍：確認 stdout 與 stderr 的去向未改為記錄檔、未新增 `inheritEnv` 的 provider 金鑰驗證規則、未執行 cursor-agent 登入、未新增 sequencer，且 Design Automation Hub 的 Coordinator 與 Plugin 未被修改；以 `git diff --stat` 確認本變更涉及的程式與文件僅有 `agent-automation-orchestrate/scripts/run-task.mjs`、`agent-automation-orchestrate/references/runner-contract.md` 與 `agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs`。
