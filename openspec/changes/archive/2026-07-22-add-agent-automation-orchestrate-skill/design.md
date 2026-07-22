## Context

`cm-skills` 目前以獨立 Skill 目錄搭配 `scripts/install_agent_skills.mjs` 安裝到 Claude、Codex 與 Cursor。既有產品專案的自動化已證明 queue、runner fallback、durable state 與 completion proof 有價值，但這些實作與單一專案綁定。新 Skill 必須在不假設框架、不假設每家 Agent 都有相同 SDK、也不接管專案領域邏輯的前提下提供可移植起點。

## Goals / Non-Goals

**Goals:**

- 提供一個可被既有 multi-agent installer 自動發現的 `agent-automation-orchestrate` Skill。
- 以讀取式專案偵測建立可重複的 repository facts。
- 以 schema-versioned project contract 表達 runner、task、verification 與 completion proof 差異。
- 以 `shell: false` 的通用 CLI runner 執行器依序 fallback，並留下可查詢且不含敏感內容的 durable run summary。
- 讓專案 adapter 與專案專屬 Skill 保留領域決策權。

**Non-Goals:**

- 不把既有 Figma Coordinator 搬入共用 Skill。
- 不提供常駐 daemon、遠端排程服務、Web UI、帳號代管或 SDK 專屬 session bridge。
- 不自動修改目標專案的 `AGENTS.md`、CI、依賴或產品原始碼。
- 不保證不同供應商的訂閱、額度、sandbox 或事件格式等價。

## Decisions

### Keep orchestration policy in the Skill and deterministic behavior in scripts

`SKILL.md` 只保留 bootstrap、run、resume、status 的決策流程與安全 gate；專案偵測、設定驗證、runner spawn、驗證與狀態讀取由 Node scripts 執行。這比在每次 Agent context 內重新產生 shell 流程更可測試，也符合 progressive disclosure。

Alternatives considered: 把所有流程寫入 `SKILL.md` 會增加 context 與行為漂移；建立 npm service 會導入本次不需要的發佈與依賴管理。

### Use one project contract with layered project-specific adapters

目標 repo 使用 `.agent-automation/config.json`。根層包含 `schemaVersion`、`stateDir`、ordered `runners` 與 keyed `tasks`。Runner 只描述 command、args、preflight、timeout 與允許繼承的環境變數；Task 描述 instruction、verification command arrays、required artifacts 與可選 project skill。Figma、Storybook、iOS 等差異留在 task 與 project skill，不進入 core script。

Alternatives considered: 依框架建立多份設定格式會使 validator 與使用方式分裂；自由格式 Markdown 無法安全驅動 process。

### Execute commands without a shell and minimize inherited environment

Runner、preflight 與 verification 都使用 command 加 args array，透過 Node `spawn` 並固定 `shell: false`。Runner args 必須各包含一次 `{prompt}` 與 `{workspace}`；verification 不允許 placeholder。子程序只收到基本 OS environment、project contract 允許的名稱與 launcher 注入的 run metadata。設定不得包含 credential values。

Alternatives considered: shell command string 雖較方便，但引入 quoting、command injection 與跨平台差異；繼承完整 environment 會放大 secret exposure。

### Treat run summaries as state, not raw transcripts

每次執行將 summary 寫到 project contract 指定的 state directory，包含 run ID、task ID、runner ID、phase、attempts、timestamps、exit outcome、verification 結果與 artifact checks。不得寫入 prompt、argv 展開值、原始 stdout/stderr、token 或完整 environment。`status.mjs` 只讀取這些 summaries。

Alternatives considered: 保存完整輸出有利除錯但會提高 secret 與專案內容外洩風險；完全不保存則無法 resume 或判斷主要 runner。

### Bootstrap remains explicit and non-destructive

`inspect-project.mjs` 只輸出 JSON，不寫檔。Skill 在 config 缺失時先顯示偵測結果與範本差異，再經使用者已授權的建立任務將範本複製並客製化。Validator 不會修正設定；所有錯誤以非零退出與具體 field path 回報。

Alternatives considered: 自動猜測並直接寫入 runner 與驗證命令容易選錯 app root 或執行具有副作用的命令。

## Implementation Contract

### Observable behavior

- 安裝後，Claude、Codex 或 Cursor 能觸發 `$agent-automation-orchestrate` 的 bootstrap、run、resume 或 status 流程。
- `inspect-project.mjs --project-root <path>` 輸出單一 JSON object，列出 resolved root、manifest、package manager、available scripts、instruction files、installed project skills 與偵測警告，且不修改目標 repo。
- `validate-project-config.mjs --project-root <path> [--config <path>]` 驗證 schema version 1 contract；成功輸出 `{ "valid": true, ... }` 並 exit 0，失敗輸出 `{ "valid": false, "errors": [...] }` 並非零退出。
- `run-task.mjs --project-root <path> --task <id> [--config <path>] [--dry-run]` 先驗證 contract；dry-run 僅回報 runner order、task、verification 與 artifact plan。正式執行依 runner priority 進行 preflight 與 spawn，runner 非零、timeout 或無法啟動時記錄 attempt 並切換下一個；runner 成功後執行 verification 與 artifact checks，全部通過才將 run phase 設為 `completed`。
- `status.mjs --project-root <path> [--run-id <id>] [--config <path>]` 回報最新或指定 summary，不讀取 raw agent transcript。

### Project contract shape

- `schemaVersion` 必須為 `1`。
- `stateDir` 必須是 project-relative path，且解析後不得離開 project root。
- `runners` 必須有 1 到 3 個 unique IDs；每個 runner 必須含 label、command、args、positive timeout、optional preflight 與 `inheritEnv`。Runner args 必須各包含一次 `{prompt}` 與 `{workspace}`。
- `tasks` 必須至少有一項；每個 task 必須包含非空 instruction、verification command arrays、required artifact project-relative paths，並可選 project skill name。
- Contract、summary 與錯誤不得保存 credential value。

### Failure modes

- 缺檔、JSON syntax、unknown field shape、duplicate runner、unsafe path、錯誤 placeholder 或 invalid command array：validator 回報具 field path 的 errors，runner 不啟動，state 不寫入。
- Runner preflight 失敗：將 runner 標示 unavailable 並嘗試下一個。
- Runner timeout、spawn error 或 non-zero exit：記錄 sanitized attempt outcome 並嘗試下一個。
- 所有 runner 失敗：phase 為 `exhausted`，exit 非零。
- Runner 成功但 verification 或 artifact check 失敗：phase 為 `verification-failed`，不得 fallback 到另一 AI runner 以掩蓋同一份工作結果。

### Acceptance criteria

- Skill Creator `quick_validate.py` 通過新 Skill。
- `scripts/check-agent-automation-skill.mjs` 使用 temporary fixture 驗證 inspect、valid/invalid config、dry-run、successful fake runner、fallback、verification failure 與 sanitized summary。
- `scripts/install_agent_skills.mjs --agent all --scope project --project-root <temporary-root> --skill agent-automation-orchestrate --dry-run` 能列出三個安裝目標。
- 新檔案不修改或覆寫 repo 既有 dirty changes。

### Scope boundaries

In scope: Skill source、OpenAI metadata、兩份 references、config example、四個 deterministic scripts 與單一 self-check script。

Out of scope: 將 Skill 安裝到使用者 home、修改其他產品 repo、啟動付費 Agent 任務、提交或推送 Git、建立遠端服務。

## Risks / Trade-offs

- [不同 CLI 的參數與登入方式會變動] → 以 project contract 與 preflight 隔離，不在 core hardcode vendor flags。
- [通用 runner 可能執行高權限命令] → 固定 `shell: false`、限制 environment、要求 config 驗證並保留 project approvals。
- [只存 summary 會降低除錯細節] → 子程序仍可即時串流到目前 terminal，但 durable state 只保存 sanitized metadata。
- [第一版沒有 daemon] → 以單次 run 與 durable summary 建立穩定基礎，排程與 UI 後續另案處理。
