## 1. 基礎建設

- [x] 1.1 [P] 依 design「Next.js 與 PostgreSQL 技術選型」建立 task-board/control-plane 應用骨架與資料庫 schema（members、machines、projects、task chains、cards、leases、runs、log_chunks），行為：本機對 PostgreSQL 完成 migration 後 dev server 可啟動並回應首頁。驗證：執行 migration 與 npm run dev 成功，手動開啟首頁確認回應
- [x] 1.2 [P] 建立 task-board/worker/worker.mjs 零依賴 daemon 骨架：載入設定檔（控制平面 URL、worker token、專案根列表）、產生穩定 machineId，行為：缺少必要設定時以非零退出並印出可讀錯誤。驗證：以缺漏設定與完整設定各執行一次，確認退出碼與輸出

## 2. 控制平面核心

- [x] 2.1 依 design「Google OAuth 允許清單登入」實作 Authenticated access：所有頁面與 API 需登入、非允許清單帳號拒絕且不外洩資料、可為 member 簽發 worker token。驗證：整合測試涵蓋未登入、非清單帳號、合法帳號三情境
- [x] 2.2 實作 Lifecycle board columns 的卡片狀態機：封閉的事件轉移表（lease granted、completed 有無 review gate、verification-failed、exhausted、lease 逾時、人工指令）與卡片歷史記錄。驗證：單元測試涵蓋轉移表全部合法轉移與至少三種非法轉移（含自動欄之間拖曳）被拒
- [x] 2.3 依 design「CAS lease 與 heartbeat」實作 Worker API（register、claim、heartbeat、report、logs）與 Exclusive lease with attribution：claim 走原子 CAS、記錄 member + machine + runner 三元組、report 以 runId 冪等。驗證：整合測試兩個模擬 worker 併發 claim 同一卡恰一成功、敗者收 409；重複 report 不產生重複轉移
- [x] 2.4 實作 Heartbeat expiry：排程掃描逾時 lease，卡片移入需要處理、原因 possibly-stopped、保留最後歸屬，且未經人工指令不再被領取。驗證：整合測試模擬心跳停止超過 TTL 後的掃描結果
- [x] 2.5 依 design「auto-run 放行與流水線接棒」實作 Card origins：member 手動建卡、卡完成時依任務鏈自動建後繼卡（origin = pipeline-chain）、auto-run 未放行的卡不出現在 claim 回應。驗證：整合測試涵蓋手動建卡、接棒建卡、未放行卡不被領取三情境

## 3. 看板 UI

- [x] 3.1 [P] 依 design「欄位命名與拖曳指令」實作五欄看板：待領取／執行中／需要處理／待確認／完成，需要處理與待確認以視覺分組標示為人的收件匣，執行中卡片顯示歸屬三元組與階段進度指示，SSE 即時更新。驗證：手動驗收——worker 回報事件後看板不重新整理即更新
- [x] 3.2 [P] 實作卡片詳情與 Run log visibility：run 歷史（runId、phase、驗證計數、歸屬）與 log chunk 依序即時追加顯示，log 依保留期限刪除。驗證：整合測試上傳多個 chunk 後詳情頁順序正確；保留期限清理有測試涵蓋
- [x] 3.3 實作 Human intervention as commands：從需要處理／待確認拖出建立帶調整說明的 run 指令並使卡回到待領取，其他欄間拖曳一律拒絕，操作記錄 member 身分與說明。驗證：整合測試涵蓋合法拖曳產生 resume 指令與非法拖曳被拒

## 4. Worker daemon

- [x] 4.1 實作 Worker registration：以 worker token 註冊 machineId、runners、本機專案根，僅 advertise 含合法 .agent-automation/config.json 的專案根，無效根回報為排除。驗證：以一合法一無效的 fixture 專案根執行，確認 advertise 與排除清單
- [x] 4.2 實作 Poll and claim within capacity：outbound 輪詢、只領 advertise 過的專案的卡、單機同時最多一個任務，執行中不再 claim。驗證：單元測試模擬執行中收到可領卡時不發出 claim
- [x] 4.3 依 design「worker 包裹 run-task.mjs」實作 Execution wraps run-task：spawn run-task.mjs 傳 task id 與 resume 指令（前次 runId + 調整說明），結果權威取 stateDir 最新 run summary 的 phase 與驗證計數。驗證：整合測試以 stub 版 run-task fixture 產生 verification-failed summary，確認回報內容以 summary 為準
- [x] 4.4 實作 Heartbeats during execution 與 Log capture and masking（依 design「log 捕捉與遮罩」）：執行期間定期心跳；捕捉子程序合併輸出，遮罩所有傳入環境變數值與 credential pattern 字串為 [redacted] 後分塊上傳，未遮罩內容不落盤。驗證：遮罩單元測試涵蓋環境變數值與 api_key=sk-... 樣式；心跳間隔測試確認長時執行 lease 不逾時
- [x] 4.5 實作 Resilient reporting：控制平面不可達時心跳、log、結果回報以退避重試，結果以 runId 冪等、本機快取直到被確認。驗證：整合測試模擬伺服器中斷後恢復，結果恰送達一次且卡片正確轉移

## 5. 部署與驗收

- [x] 5.1 依 design「Zeabur 部署與 pull 模型」撰寫 task-board/README.md（Zeabur 服務與 PostgreSQL 建置、OAuth 憑證與允許清單設定、worker 安裝步驟、log 保留期限環境變數）並在 README.md 登錄新子系統。驗證：內容審閱——照文件從零可完成部署與 worker 啟動
- [x] 5.2 端到端驗收：本機起控制平面 + 一個 worker，跑通「建卡 → 自動領取 → 執行 → 待確認 → 附說明拖回 → 重跑 → 完成」，卡片歷史完整呈現歸屬三元組與兩次 run，操作步驟記錄於 task-board/README.md。驗證：手動驗收並比對 design Implementation Contract 的六項驗收條件全數通過
