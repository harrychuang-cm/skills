## Context

任務看板（add-ai-task-board-platform，已實作完成、未歸檔）的狀態完全來自 worker 對「看板發起的執行」的回報。既有專案的磁碟證據（產物、audit 結果）與外部發起的 run summary 對看板不可見。倉庫裡已有兩個現成零件：pipeline-board 的 build-pipeline-status.mjs（規格化的證據推導，輸出 schemaVersion 1 的 status JSON）與 orchestrate 的 run summary 格式（.agent-automation/runs/*.json，sanitized）。worker 跑在有專案磁碟的機器上，是唯一能讀到這些證據的元件。

## Goals / Non-Goals

**Goals:**

- 既有專案導入第一天，看板就能回答「這個專案走到哪、最近在跑什麼」
- 外部（CLI 直接發起）的執行在看板上可見
- 完全複用既有推導與格式，不產生第二套真相

**Non-Goals:**

- 不做導入精靈／回填歷史卡（依磁碟證據自動生成標記完成的卡留待後續，見 proposal 討論脈絡）
- 不修改 pipeline-board、agent-automation-orchestrate 的任何腳本、schema 或規格
- 不對外部執行提供任何操作（重跑、批准、復原一律不開放——外部執行不是看板的卡）
- 卡片上既有的任務鏈進度點不改為快照推導（兩者並存：卡片看鏈、專案頁看磁碟證據）
- 不做快照歷史版本（每專案只留最新一份）

## Decisions

### 快照由 worker 端產生並上傳

worker 以子程序執行 skillsRoot 下的 pipeline-board/scripts/build-pipeline-status.mjs --project-root <root>，讀取產出的 .pipeline-board/status.json 上傳。替代方案（把專案磁碟掛給控制平面讀）不可行——控制平面在雲端。替代方案（worker 自己重算階段狀態）被否決：pipeline-board 規格明文禁止聚合端重新實作推導，本 change 遵守同一原則。注意 build 腳本會實際執行專案設定的 audit 指令（120 秒 timeout），所以同步不是零成本——這是「已驗證」三態的必要代價，靠同步時機控制頻率。專案沒有 .pipeline-board/pipeline.json 時跳過快照、以 hasDefinition=false 上報，不視為錯誤。

### 外部執行的偵測與去重

worker 掃描專案 config 的 stateDir 下全部 run summary（格式同 orchestrate：runId、taskId、phase、selectedRunner、時間戳），全量上報 sanitized 欄位；**去重在控制平面做**：runId 已存在於看板 Run 表（看板發起）→ 忽略；否則 upsert 進 external_runs（runId 唯一鍵）。worker 不維護「哪些是看板發起的」狀態——無狀態上報 + 伺服器端冪等，重開 worker 不會產生重複。

### 同步時機

三個觸發點：註冊成功後立即（導入第一天就有畫面）、固定間隔（config 的 statusSyncIntervalMs，預設 10 分鐘）、每次看板發起的執行結束後（階段最可能剛變化）。同步任何一步失敗只記 log、不中斷輪詢與執行；失敗的快照留待下一輪，不做重試佇列（與 log 上傳的 best-effort 一致，外部執行上報本身冪等）。

### 資料模型與 SSE watermark

新增兩張表：project_snapshots（projectId 唯一——只留最新，欄位：generatedAt、hasDefinition、payload Json 存整包 status JSON）與 external_runs（runId 唯一，欄位：projectId、taskId、phase、runnerId、startedAt、finishedAt、reportedByMachineId、updatedAt）。boardWatermark 加入兩表的最新時間戳，沿用既有 SSE refresh 機制，專案頁與看板即時更新、不加新推播通道。

### 專案頁 UI

新增 /projects/[slug] 頁：上半部是快照的階段總覽（水平排列，沿用 not-started／produced／verified 三態與 idle／warn／ok 色彙，顯示快照產生時間與「無定義」空態），下半部是外部執行列表（新到舊：taskId、phase、runner、時間，唯讀無任何按鈕）。看板卡片的專案名稱改為連到專案頁。Airbnb 明亮風格沿用 globals.css 既有 token，不新增視覺體系。

## Implementation Contract

**Worker API（worker token 認證，新增兩端點）**：

- POST /api/worker/project-status — body: { projectSlug, hasDefinition, generatedAt?, snapshot? }；snapshot 為 pipeline-board status JSON 原文（schemaVersion 1）；伺服器以 projectSlug 找專案、upsert 唯一快照；未知專案回 409 unknown-project
- POST /api/worker/external-runs — body: { projectSlug, runs: [{ runId, taskId, phase, runnerId?, startedAt?, finishedAt? }] }；伺服器逐筆處理：runId 存在於 Run 表 → 略過；否則 upsert external_runs；回 { ingested, ignored }

**Worker 端（task-board/worker/lib/status-sync.mjs）**：syncProjectStatus({config, api, project}) 行為——有定義：spawn build 腳本（繼承環境、cwd 任意、逾時 180 秒）→ 讀 status.json → 上傳；無定義：直接上傳 hasDefinition=false。scanExternalRuns 讀 stateDir 全部 *.json、略過無法解析者、上報 sanitized 欄位。兩者由 loop 在三個觸發點呼叫，任何錯誤吞下並印一行 log。

**驗收條件**：

1. 控制平面測試：同 runId 已存在於 Run 表時 external-runs 回報 ignored、不建 external_runs；同一外部 runId 上報兩次（第二次 phase 更新）只有一筆記錄且 phase 為新值
2. worker 測試：以 stub build 腳本 fixture 驗證快照上傳 payload；以含二筆 summary（一筆對應看板已知 runId、一筆外部）的 stateDir fixture 驗證上報內容；無 pipeline.json 專案上報 hasDefinition=false
3. 專案頁：手動驗收——上傳快照與外部執行後，頁面不重新整理即顯示階段三態與活動列表；外部執行條目無任何操作按鈕
4. 同步失敗（stub 腳本 exit 1）不影響 worker 後續輪詢（測試斷言 tick 繼續）
5. task-board/README.md 新增「導入既有專案」章節，涵蓋：worker 設定、任務鏈設定、專案頁會顯示什麼、外部執行的語意

**範圍邊界**：in scope——上述兩端點、兩張表、worker 同步模組、專案頁、README；out of scope——回填歷史卡、快照歷史、外部執行操作、pipeline-board／orchestrate 修改、卡片階段點改源。

## Risks / Trade-offs

- [快照 build 會執行專案 audit 指令，同步過頻造成負載] → 預設 10 分鐘間隔 + 註冊/執行後兩個事件點；間隔可調；無定義的專案零成本
- [外部執行的 taskId 不在看板任務鏈上，專案頁對不上階段] → 外部執行列表獨立呈現、不強行對映階段；只顯示 taskId 原文
- [快照 payload 較大（整包 status JSON）] → 每專案唯一列覆蓋、不留歷史；payload 上限 512KB，超過拒收（413）
- [多台 worker advertise 同一專案，快照互相覆蓋] → 以 generatedAt 較新者為準（舊快照上報被忽略），external_runs 本身冪等

## Migration Plan

新增功能，無資料遷移。部署順序：控制平面先上（新表 migration + 端點），worker 後更新（舊 worker 不呼叫新端點，完全相容）。回滾：移除端點與頁面即可，兩張表資料可留。

## Open Questions

- 回填歷史卡（依磁碟證據把已驗證階段生成 DONE 卡）要不要做，等 chipK 實際導入後看痛感決定
