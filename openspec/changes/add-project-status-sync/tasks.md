## 1. 控制平面：資料模型與接收 API

- [x] 1.1 依 design「資料模型與 SSE watermark」新增 project_snapshots（projectId 唯一、generatedAt、hasDefinition、payload Json）與 external_runs（runId 唯一、projectId、taskId、phase、runnerId、startedAt、finishedAt、reportedByMachineId）兩張表並完成 migration，行為：migration 套用後 Prisma Client 可存取兩模型。驗證：npx prisma migrate dev 成功且 npx tsc --noEmit 通過
- [x] 1.2 實作 POST /api/worker/project-status（Worker produces evidence snapshots 的接收端）：worker token 認證、以 projectSlug upsert 唯一快照、未知專案回 409 unknown-project、payload 超過 512KB 回 413、較舊 generatedAt 的上報被忽略。驗證：整合測試涵蓋正常 upsert、hasDefinition=false、未知專案、舊快照忽略四情境
- [x] 1.3 依 design「外部執行的偵測與去重」實作 POST /api/worker/external-runs 與 Control plane deduplicates reported runs：runId 已存在於 Run 表則略過並計入 ignored，其餘以 runId 冪等 upsert，回 { ingested, ignored }。驗證：整合測試涵蓋「看板已知 runId 被忽略」與「同一外部 runId 上報兩次（第二次 phase 更新）僅一筆且 phase 為新值」
- [x] 1.4 依 design「資料模型與 SSE watermark」把兩張新表的最新時間戳納入 boardWatermark，行為：快照或外部執行更新後 SSE 推播 refresh。驗證：整合測試斷言寫入 external_runs 後 watermark 改變

## 2. 專案頁 UI

- [x] 2.1 依 design「專案頁 UI」實作 Project status page：/projects/[slug] 顯示快照階段總覽（not-started／produced／verified 三態、快照時間、無定義空態）與外部執行列表（新到舊、唯讀、無任何操作按鈕），SSE refresh 不重新整理即更新。驗證：手動驗收——以 API 上傳快照與外部執行後頁面即時顯示；外部執行條目確認無按鈕
- [x] 2.2 看板卡片的專案名稱改為連到 /projects/[slug]，行為：點擊卡片上的專案名稱開啟該專案頁。驗證：手動驗收點擊導頁

## 3. Worker：同步模組

- [x] 3.1 依 design「快照由 worker 端產生並上傳」實作 task-board/worker/lib/status-sync.mjs 的快照流程：有 .pipeline-board/pipeline.json 時以子程序執行 skillsRoot 的 pipeline-board/scripts/build-pipeline-status.mjs（逾時 180 秒）、讀取 status.json 上傳；無定義時上傳 hasDefinition=false；任何失敗只印一行 log 不丟例外。驗證：以 stub build 腳本 fixture 測試上傳 payload 與無定義情境；stub exit 1 時函式正常返回
- [x] 3.2 實作 Worker reports external runs：掃描專案 stateDir 全部 run summary、略過無法解析的檔案、只上報 sanitized 欄位（runId、taskId、phase、selectedRunner.id、startedAt、finishedAt）。驗證：以含一筆看板已知 runId 與一筆外部 runId 的 stateDir fixture 測試上報內容不含 instruction 或 prompt 欄位
- [x] 3.3 依 design「同步時機」把同步接進 loop：註冊成功後立即、statusSyncIntervalMs 間隔（config.mjs 新增設定，預設 600000）、每次看板發起的執行結束後各觸發一次；同步失敗不中斷輪詢。驗證：單元測試以 fake api 斷言三個觸發點各發生一次同步，且同步丟例外時 tick 繼續運作

## 4. 文件與端到端

- [x] 4.1 task-board/README.md 新增「導入既有專案」章節：worker 設定與註冊、任務鏈設定、專案頁會顯示的內容（Onboarding an existing project shows its state immediately 的使用者版描述）、外部執行的語意與唯讀性、同步時機與 Sync cadence 間隔調整。驗證：內容審閱——照章節步驟可把一個既有專案導入並在專案頁看到現況
- [x] 4.2 擴充 scripts/e2e-local.mjs：fixture 專案預先放入一筆外部 run summary 與 .pipeline-board/pipeline.json 最小定義，斷言 worker 註冊後控制平面出現該外部執行與快照（hasDefinition=true、階段狀態非空）。驗證：node scripts/e2e-local.mjs 通過含新斷言的全流程
