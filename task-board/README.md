# 自動化任務看板（Task Board）

團隊共用的 Trello 式 AI 任務看板：控制平面（web 看板 + 任務佇列 + 歷史資料庫）部署在雲端，
worker daemon 跑在每位設計師機器上，以 outbound HTTP 輪詢領卡並包裹
`agent-automation-orchestrate/scripts/run-task.mjs` 執行——用各自機器上登入的 AI 帳號。

```
瀏覽器（看板：五欄 = 待領取/執行中/需要處理/待確認/完成）
   ↕ HTTPS + SSE
控制平面 control-plane/（Next.js + PostgreSQL，部署於 Zeabur）
   ↑ 輪詢領卡（lease + heartbeat）
worker/（設計師機器上的零依賴 Node daemon）
   └─ spawn run-task.mjs → claude / codex / cursor-agent
```

核心原則：**看板是機器寫、人批准的**。卡片欄位由系統事件驅動（封閉狀態機）；
人只在「需要處理」「待確認」兩欄介入，拖曳或按鈕都是下指令（附說明重跑／批准結案），不是改狀態。

## 本機開發

```sh
cd task-board/control-plane
npm install
npm run dev-db        # embedded PostgreSQL（資料在 .devdb/，不需系統安裝），保持前景執行
npm run migrate       # 另開終端：套用 Prisma migrations
npm run dev           # 啟動控制平面（http://localhost:3000）
npm test              # 單元 + 整合測試（需要 dev-db 在跑）

cd ../worker
node --test test/*.test.mjs   # worker 測試（零依賴）
```

`.env` 必要變數見 `control-plane/.env.example`。

## 部署到 Zeabur

1. **建服務**：Zeabur 專案內新增 PostgreSQL 服務，再從 Git 部署 `task-board/control-plane`
   （Node.js 服務；build：`npm run build`，start：`npm run start`；首次部署前執行
   `npm run migrate:deploy` 或設為 predeploy command）。
2. **Google OAuth 憑證**：Google Cloud Console → APIs & Services → Credentials →
   OAuth client ID（Web application），Authorized redirect URI 填
   `https://<你的網域>/api/auth/callback/google`。
3. **環境變數**（Zeabur 服務設定）：

   | 變數 | 說明 |
   | --- | --- |
   | `DATABASE_URL` | Zeabur PostgreSQL 連線字串 |
   | `AUTH_SECRET` | 隨機長字串（`openssl rand -base64 32`） |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 上一步的 OAuth 憑證 |
   | `MEMBER_ALLOWLIST` | 允許登入的 email，逗號分隔。空清單 = 全部拒絕（fail closed） |
   | `LOG_RETENTION_DAYS` | log 保留天數（預設 30） |
   | `LEASE_TTL_SECONDS` | lease 心跳逾時秒數（預設 90） |

4. **驗收**：允許清單內帳號登入可見看板；非清單帳號拒絕；未登入 API 回 401。

## 設計師機器：安裝 worker

1. 在看板登入後呼叫 `POST /api/tokens`（或之後的 UI）簽發 worker token——**明文只出現一次**。
2. 建立設定檔 `worker.config.json`（放哪都行，同層會產生 `.worker-machine-id` 與 `.worker-state/`）：

   ```json
   {
     "controlPlaneUrl": "https://<你的網域>",
     "workerToken": "wtk_...",
     "projectRoots": ["/Users/me/works/app-alpha"],
     "runners": ["claude"],
     "machineLabel": "Harry 的 MacBook"
   }
   ```

   每個 project root 必須含 `.agent-automation/config.json`（用 `agent-automation-orchestrate`
   的 bootstrap/guide 建立）；無效的根會被排除並回報原因。

3. 啟動：`node <cm-skills>/task-board/worker/worker.mjs --config worker.config.json`。
   worker 只做 outbound 連線；領卡 → 心跳 → spawn run-task → 依 stateDir 的 run summary 回報。
   同一台機器同時最多執行一個任務。

## 導入既有專案

已經有自動化流程（`.agent-automation/config.json`）的專案，導入後看板第一天就能顯示現況：

1. **worker 設定**：把專案根加進 `worker.config.json` 的 `projectRoots`，啟動 worker——註冊
   成功後會立刻做一次「現況同步」。
2. **任務鏈設定**：`PUT /api/projects/<slug>/chain` 依 pipeline 順序排好 task id，之後建卡
   與接棒都以此為準。
3. **專案頁會顯示什麼**（看板卡片點專案名稱進入 `/projects/<slug>`）：
   - **磁碟現況**：worker 以子程序執行 `pipeline-board` 的 build 腳本產生證據快照——每個
     階段的「尚未開始／已產出／已驗證」來自檔案存在性與 audit 結果，不是看板推測。專案
     沒有 `.pipeline-board/pipeline.json` 時會明說「無定義」（加上定義即可，見
     `pipeline-board/references/pipeline-definition.md`）。
   - **外部執行**：worker 掃描專案 `stateDir` 的 run summary，看板以外發起的執行（含導入
     前的歷史）會出現在活動列表——**唯讀**，只帶 runId、taskId、phase、runner 與時間戳，
     不含任何指令內容；看板發起的執行自動去重不重複顯示。
4. **同步時機**：註冊後立即、每 `statusSyncIntervalMs`（預設 10 分鐘）、每次看板發起的執行
   結束後。注意快照產生會實際執行專案設定的 audit 指令，間隔勿設過短。

## 任務鏈（流水線接棒）

`PUT /api/projects/<slug>/chain` 設定有序任務清單（`requiresReview` 控制完成後是否進待確認）。
卡片完成進入「完成」欄時，鏈上的下一個任務會自動建卡（origin = pipeline-chain、auto-run）。
手動建卡與接棒卡預設自動執行；其他來源需在看板按「放行執行」。

## log 與隱私

- worker 端捕捉 run-task 子程序的合併輸出，**在本機遮罩後**分塊上傳：
  傳給子程序的環境變數值與 credential pattern（api key / token / secret / password /
  private key）一律替換為 `[redacted]`；未遮罩內容不落盤、不出機器。
- 控制平面依 `LOG_RETENTION_DAYS` 自動刪除過期 log。
- worker token 只存 sha256 雜湊；`.agent-automation` 契約與 orchestrate 腳本零修改。

## 端到端驗收（本機）

```sh
cd task-board/control-plane
npm run dev-db            # 終端 1
npm run migrate && npm run dev   # 終端 2
node scripts/e2e-local.mjs       # 終端 3：全流程驗收
```

`scripts/e2e-local.mjs` 會建 fixture 專案（stub runner，透過真實 run-task.mjs 執行）、
簽發 token、啟動真 worker，走完「建卡 → 自動領取 → 執行 → 驗證失敗進需要處理 →
附說明重跑（resume 指令）→ 完成進待確認 → 批准 → 完成 + 接棒建卡」，
並斷言卡片歷史、歸屬三元組與兩次 run 的關聯。瀏覽器端的 Google 登入流程需部署後以真帳號驗收（見上）。
