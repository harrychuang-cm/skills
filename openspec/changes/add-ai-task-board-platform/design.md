## Context

團隊的自動化系統目前分三層：內容層（12 個 skill）、執行層（agent-automation-orchestrate 的 run-task.mjs，含 runner fallback、驗證、durable run summary）、觀測層（pipeline-board / portfolio-dashboard 的唯讀靜態 HTML）。缺少的是互動層：一個團隊共用、即時、可操作的看板。既有的互動前例是 design-automation-hub 的本機 Coordinator（127.0.0.1 HTTP + JsonTaskStore 的 revision CAS），但它綁在單機與 Figma Plugin 上。

本 change 引入兩個新元件：部署在雲端的控制平面（看板 + 佇列 + 歷史）與跑在每位設計師機器上的 worker daemon。核心約束：AI 執行必須發生在有專案 working tree 與 CLI 憑證的機器上；雲端只做協調，絕不執行 AI。

## Goals / Non-Goals

**Goals:**

- 團隊成員在瀏覽器看到所有任務卡的即時狀態：誰的 AI 在跑什麼、哪些卡需要人處理
- 在看板上完成所有操作：建卡、放行、批准、附調整說明重跑
- 任務歸屬明確：member + machine + runner 三元組
- 沿用既有執行層與其五項獨立完成判定，不重寫、不分叉

**Non-Goals:**

- 不做 Figma 事件觸發建卡（Ready-for-dev 掃描留待後續 change，先以人工建卡與流水線接棒涵蓋）
- 不做留言、指派、通知等協作功能（v2）
- 不做 vendor session 續接——重跑語意維持 orchestrate 既有的 resume（新 run + 調整說明）
- 不修改 agent-automation-orchestrate、pipeline-board、portfolio-dashboard 的任何腳本、schema 或規格
- 不支援單機多任務並行（working tree 同時只能一個 agent 動）
- 不做手動拖曳改狀態——除規格定義的兩欄介入外，看板永不提供直接編輯生命週期

## Decisions

### Zeabur 部署與 pull 模型

控制平面部署於 Zeabur（Node app + 託管 PostgreSQL），worker 以 outbound HTTPS 輪詢領任務。替代方案：(a) 單一執行主機——被否決，共用 AI 帳號導致歸屬與額度不清，且成為單點；(b) 對設計師機器建 inbound 連線（tunnel/push）——被否決，NAT、換網路、闔蓋都會斷，pull + heartbeat 天然容忍這些。Zeabur 只持有佇列與歷史；所有磁碟證據與執行都留在設計師機器，雲端故障時 worker 空轉等待、不遺失任何已落地成果。

### Next.js 與 PostgreSQL 技術選型

控制平面用 Next.js（App Router、API routes）+ PostgreSQL（Zeabur 託管）+ Server-Sent Events 推播看板更新與 log 串流。SSE 而非 WebSocket：看板是單向推播（伺服器到瀏覽器），操作走一般 POST，SSE 在 PaaS 上部署最省事、斷線自動重連。worker 端維持零依賴純 Node .mjs，與 repo 既有腳本慣例一致。

### CAS lease 與 heartbeat

佇列以資料庫列實作：每張卡帶 revision，claim 走原子 compare-and-swap（單一 UPDATE ... WHERE revision = ? 語意），概念沿用 design-automation-hub JsonTaskStore 已驗證的模式。lease 帶 TTL，worker 執行中定期心跳；控制平面排程掃描逾時 lease，逾時卡移入需要處理欄、原因 possibly-stopped——與 pipeline-board 既有的逾時判定詞彙一致。報告以 runId 為冪等鍵，重送不產生重複轉移。

### worker 包裹 run-task.mjs

worker 對 claimed 卡的執行方式是 spawn 既有的 run-task.mjs 子程序（傳 task id；重跑時傳前次 runId 與調整說明作為 resume request），完成後以 stateDir 中最新 run summary 為結果權威，而非只看 exit code。這使 runner fallback、timeout、process group 清理、驗證、artifact 檢查全部免費繼承，且 orchestrate 的規格與腳本零修改。替代方案（在 worker 內直接呼叫各家 SDK）被否決：會分叉出第二套執行語意與第二套真相。

### log 捕捉與遮罩

「看到 AI 正在做什麼」需要執行輸出上雲，而 orchestrate 契約刻意讓 run-task 本身不落地輸出。解法：run-task 的 stdio 繼承給 worker，worker 捕捉合併輸出、在本機遮罩後分塊上傳——orchestrate 契約不變，落地政策由本 change 的 worker 規格獨立承擔。遮罩規則：傳給子程序的所有環境變數值、符合 credential pattern（api key / token / secret / password / private key）的字串，一律替換為 [redacted]；未遮罩內容不落盤。控制平面按保留期限（預設 30 天）刪除 log chunk。

### Google OAuth 允許清單登入

看板網際網路可達，必須真登入。選 Google OAuth + email 允許清單而非 magic link：不需要自建郵件寄送設施，團隊已有 Google 帳號。worker 以 member 簽發的 worker token 認證，所有變更動作歸屬到 member。

### 欄位命名與拖曳指令

五欄定名：待領取（等機器）、執行中、需要處理（等人排障）、待確認（等人 review）、完成。「待領取」與「需要處理」受眾相反（機器 vs 人），命名刻意區分，UI 上需要處理與待確認以視覺分組標示為「人的收件匣」。拖曳語意：只有從需要處理／待確認拖出是合法操作，且語意是建立新的 run 指令（含調整說明），不是改狀態；其他欄間拖曳一律拒絕。卡片階段進度指示沿用 pipeline 六階段詞彙與看板既有的 ok/warn/stop/idle 四色系統。

### auto-run 放行與流水線接棒

卡片帶 auto-run 旗標：member 手動建的卡與流水線接棒卡預設 auto-run；未來事件觸發來源預設需人工放行，防止外部訊號一次生成大量卡導致全隊 AI 額度被瞬間燒掉。流水線接棒：專案在控制平面上設定任務鏈（有序 task id 列表）；卡完成時若鏈上有後繼任務，自動建後繼卡（origin = pipeline-chain）。任務鏈是控制平面自己的設定，不寫入 .agent-automation/config.json（該 schema 是封閉欄位集，不可擴充）。

## Implementation Contract

**目錄佈局**：task-board/control-plane/（Next.js 應用）、task-board/worker/worker.mjs（daemon 進入點）、task-board/worker/lib/（輪詢、lease、遮罩模組）、task-board/README.md（安裝與部署說明）。

**Worker API（控制平面提供，worker token 認證）**：

- POST /api/worker/register — body: { machineId, runners[], projects[{root, taskIds[]}] } → { accepted[], excluded[] }
- POST /api/worker/claim — body: { machineId } → 200 { cardId, project, taskId, resume?: { previousRunId, note } } 或 204 無工作；同卡併發 claim 恰一成功，敗者收 409
- POST /api/worker/heartbeat — body: { cardId, leaseId }
- POST /api/worker/report — body: { cardId, leaseId, runId, phase, verification?, finishedAt }；以 runId 冪等
- POST /api/worker/logs — body: { cardId, runId, seq, chunk }；chunk 已遮罩，seq 保序

**卡片狀態機（事件 → 欄位）**：lease granted → 執行中；completed 且有 review gate → 待確認；completed 無 gate → 完成；verification-failed / exhausted / lease 逾時 → 需要處理；人工拖出需要處理／待確認（重跑）→ 待領取（帶 resume 指令）；人工批准待確認 → 完成；人工復原誤拖的重跑（限復原寬限期內，UNDO_GRACE_SECONDS 預設 10 秒；期間 claim 不發放該卡、看板顯示倒數，走 revision CAS 防撞車）→ 回重跑前的欄位並清掉 resume 指令。所有轉移寫入卡片歷史（事件、時間戳、觸發者）。此表為封閉集合，未列事件不得移動卡片。

**驗收條件**：

1. 狀態機單元測試涵蓋上表全部合法轉移與至少三種非法轉移（含自動欄之間的拖曳）被拒
2. 整合測試：兩個模擬 worker 併發 claim 同一卡，恰一成功、敗者 409
3. 整合測試：heartbeat 停止超過 TTL 後，掃描將卡移入需要處理且原因為 possibly-stopped
4. worker 遮罩單元測試：含環境變數值與 api_key=sk-... 樣式的輸入，上傳內容全部為 [redacted] 替換
5. 端到端手動驗收（記錄於 task-board/README.md）：本機起控制平面 + 一個 worker，跑通「建卡 → 自動領取 → 執行 → 待確認 → 附說明拖回 → 重跑 → 完成」，且卡片歷史完整呈現歸屬三元組與兩次 run
6. 未登入或非允許清單帳號存取任何頁面與 API 一律拒絕

**範圍邊界**：in scope——上述控制平面、worker、部署文件；out of scope——Figma 事件觸發、協作功能、orchestrate 及兩個 board skill 的任何修改、多機任務分片策略（同專案多 worker 時先到先得即可）。

## Risks / Trade-offs

- [外部觸發或誤設任務鏈導致大量卡自動執行、燒掉團隊 AI 額度] → auto-run 旗標分級 + 單機單任務上限；事件觸發來源在本 change 直接排除
- [筆電闔蓋造成 lease 懸置] → heartbeat TTL + 掃描移入需要處理，最後歸屬保留，人工重新放行
- [log 遮罩不完備導致敏感內容上雲] → 白名單式環境變數值遮罩 + credential pattern 雙保險；允許清單登入限制讀者；保留期限自動刪除；遮罩發生在 worker 端，未遮罩內容不出機器
- [控制平面的卡片狀態與磁碟真相漂移] → 結果權威一律取 run summary；卡片不提供直接狀態編輯；漂移發生時以 worker 回報覆蓋看板狀態
- [Zeabur 不可用] → worker 退避重試、空轉等待；執行成果與 run summary 都在本機，不遺失；恢復後冪等補報
- [同專案多人同時領卡造成 working tree 衝突] → claim 以卡為單位互斥；同專案同時間多卡執行的衝突留給任務鏈順序設計（一次只有一張後繼卡）緩解，殘餘風險記錄於 README

## Migration Plan

新增子系統，無既有資料遷移。部署順序：先在 Zeabur 建 PostgreSQL 與 Node 服務、設定 OAuth 憑證與允許清單，再由各設計師安裝 worker（npm 不需 install，node task-board/worker/worker.mjs 加設定檔即可）。回滾：停用 Zeabur 服務即可，設計師機器上的專案與執行紀錄不受影響。

## Open Questions

- log 保留期限預設 30 天，是否符合團隊資料政策待確認（可由環境變數調整）
- Figma Ready-for-dev 掃描建卡的後續 change 是否複用 design-automation-hub 的既有掃描實作，屆時另行討論
