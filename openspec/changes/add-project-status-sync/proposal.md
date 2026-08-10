## Why

已有自動化流程的既有專案導入任務看板時，看板只看得到「經過看板」的執行：導入前的歷史、繞過看板直接以 CLI 發起的 run、以及專案磁碟上實際的階段進度（哪些產物已存在、已驗證）全部不可見。卡片上的階段進度目前由任務鏈位置推測，對既有專案會低估實況，導入第一天的看板是一片空白，說服力和實用性都打折。

## What Changes

- worker 兼任「專案現況回報員」：對每個 advertise 的專案，執行 pipeline-board 既有的 build-pipeline-status.mjs 產生磁碟證據快照（stage 的 not-started／produced／verified、來源、交棒邊）並上傳控制平面；專案沒有 .pipeline-board/pipeline.json 定義時回報「無定義」而非失敗。
- worker 掃描專案 stateDir 的 run summary，將看板不知道的 runId 回報為「外部執行」（只帶 sanitized 欄位：runId、taskId、phase、時間戳、selectedRunner）；控制平面以 runId 對照自己的 Run 記錄去重。
- 同步時機：worker 註冊時、每隔固定間隔（預設 10 分鐘）、以及每次看板發起的執行結束後。
- 控制平面新增快照與外部執行的接收 API（worker token 認證）、儲存模型（每專案保留最新快照；外部執行逐筆保存），並納入 SSE watermark 使畫面即時更新。
- 看板新增專案頁：磁碟證據的階段總覽（水平流程、三態顏色）+ 外部執行活動列表（唯讀）；看板卡片的專案名稱連到專案頁。
- pipeline-board 與 agent-automation-orchestrate 的腳本、schema、規格一律不修改——快照推導與 run summary 格式都是唯讀複用。

## Capabilities

### New Capabilities

- `project-status-sync`: 既有專案的現況同步——worker 端的快照產生與外部執行掃描、控制平面的接收／去重／保存、專案頁的階段總覽與外部活動顯示。

### Modified Capabilities

（無——task-board-control-plane 與 task-board-worker 的規格尚在 add-ai-task-board-platform change 內未歸檔，本 change 以獨立 capability 承載，不與其既有需求衝突；pipeline-board 與 agent-automation-orchestration-skill 僅唯讀消費。）

## Impact

- Affected specs: 新增 `project-status-sync`
- Affected code:
  - New: task-board/control-plane/src/app/api/worker/project-status/route.ts、task-board/control-plane/src/app/api/worker/external-runs/route.ts、task-board/control-plane/src/lib/project-status.ts、task-board/control-plane/src/app/projects/[slug]/page.tsx、task-board/control-plane/src/components/ProjectStatus.tsx、task-board/worker/lib/status-sync.mjs、task-board/control-plane/test/project-status.test.ts、task-board/worker/test/status-sync.test.mjs
  - Modified: task-board/control-plane/prisma/schema.prisma（新增 project_snapshots、external_runs）、task-board/control-plane/src/lib/board.ts（watermark 納入快照與外部執行）、task-board/control-plane/src/components/Board.tsx（專案名稱連結）、task-board/worker/lib/loop.mjs（同步時機接線）、task-board/worker/lib/config.mjs（同步間隔設定）、task-board/README.md（導入既有專案章節）
  - Removed: 無
- 依賴：無新增套件；快照推導以子程序呼叫 cm-skills checkout 內的 pipeline-board 腳本（worker 設定已有 skillsRoot）
