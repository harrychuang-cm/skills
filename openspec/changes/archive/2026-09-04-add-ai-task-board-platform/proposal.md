## Why

團隊目前的自動化操作面分散且不直覺：pipeline-board 與 portfolio-dashboard 是刻意唯讀的靜態 HTML 快照，觸發任務只能靠各自機器上的 CLI 指令，而 design-automation-hub 的互動入口藏在 Figma Plugin 裡。團隊缺少一個共用的即時介面來回答三個問題：每個 AI 正在執行什麼任務、哪些任務需要人介入、以及如何直接在介面上批准或重跑。

## What Changes

- 新增 Trello 式任務看板 web 平台（控制平面）：看板 UI、任務佇列、歷史資料庫，可部署到 Zeabur 等 PaaS，團隊成員以 Google 帳號登入（email 允許清單）。
- 看板欄位對應任務生命週期：待領取、執行中、需要處理、待確認、完成。卡片移動由系統事件自動驅動；pipeline 階段以卡片內進度指示呈現，不作為欄位。
- 人只在「需要處理」與「待確認」兩欄介入；把卡拖回工作流是下指令（批准、附調整說明重跑），不是直接編輯狀態。
- 新增 worker daemon：跑在每位設計師機器上，以 outbound HTTP 輪詢控制平面領取任務（lease + heartbeat），領到後 spawn 現有 agent-automation-orchestrate 的 run-task.mjs 執行，使用該機器上登入的 AI 帳號。
- 任務歸屬以 member + machine + runner 三元組記錄於卡片與歷史，回答「這張卡由誰的哪台機器上的哪個 AI 執行」。
- Worker 捕捉 run-task.mjs 子程序的合併輸出並經遮罩後上傳，看板卡片可即時查看執行 log；agent-automation-orchestrate 本身的腳本與契約不修改。
- 卡片支援 auto-run 旗標：流水線接棒等信任來源預設自動執行，其他來源需人工在看板放行；每台機器同時最多執行一個任務。
- 上一階段任務完成且驗證通過時，依專案的任務鏈設定自動建立下一階段卡片（流水線接棒）。

## Capabilities

### New Capabilities

- `task-board-control-plane`: 團隊共用的任務看板 web 服務——任務佇列與 lease/heartbeat/回報 API、生命週期欄位與事件驅動的卡片狀態機、拖曳即指令的人工介入、成員登入與歸屬記錄、log 檢視、auto-run 放行與流水線接棒建卡。
- `task-board-worker`: 設計師機器上的 worker daemon——註冊機器與可執行專案、輪詢領取、心跳維持 lease、包裹 run-task.mjs 執行並回報結果、log 捕捉與遮罩上傳、單機單任務併發限制。

### Modified Capabilities

（無——agent-automation-orchestrate、pipeline-board、portfolio-dashboard 的既有需求不變；worker 以子程序包裹方式重用 run-task.mjs，不動其 schema 與腳本。）

## Impact

- Affected specs: 新增 `task-board-control-plane`、`task-board-worker`
- Affected code:
  - New: task-board/control-plane/（Next.js 應用：看板 UI、API routes、資料庫 schema）、task-board/worker/worker.mjs（daemon 進入點）、task-board/worker/lib/（輪詢、lease、log 遮罩模組）、task-board/README.md
  - Modified: README.md（登錄新子系統與使用方式）
  - Removed: 無
- Dependencies: 控制平面引入 Next.js 與資料庫（部署於 Zeabur 時使用其託管 PostgreSQL）；worker 維持零依賴的純 Node .mjs，與 repo 既有腳本慣例一致
- 外部系統: Zeabur（部署目標）、Google OAuth（登入）
