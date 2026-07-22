## Why

目前各專案若要讓 Claude Code、Codex 或 Cursor 自動執行工程任務，必須重複設計 runner、任務契約、驗證與續跑流程，容易造成能力漂移與無法追蹤的完成宣稱。需要一個可安裝、可偵測專案並以專案設定承接差異的共用 Skill，讓新專案只補上專屬 adapter 與完成條件。

## What Changes

- 新增 `agent-automation-orchestrate` Skill，定義 bootstrap、run、resume、status 四種工作模式。
- 新增可重複執行的專案偵測與設定驗證腳本，產生機器可讀的專案事實並驗證 runner、task、verification 與 completion-proof 契約。
- 新增無 shell runner 執行器與狀態查詢腳本，依優先序啟動外部 CLI、執行驗證並保存不含 prompt、原始輸出或憑證的 durable run summary。
- 新增 project contract、runner adapter 與任務完成證明參考文件，將共用 orchestration 與專案差異分層。
- 新增安裝後可複製至目標 repo 的設定範本，支援 CLI runner 並保留 SDK wrapper 擴充點。
- 讓既有 `scripts/install_agent_skills.mjs` 自動發現並安裝新 Skill，不修改 installer 介面。

## Capabilities

### New Capabilities

- `agent-automation-orchestration-skill`: 跨專案 Skill 的偵測、設定、runner 選擇、任務執行、續跑與完成證明契約。

### Modified Capabilities

(none)

## Impact

- Affected specs: `agent-automation-orchestration-skill`
- Affected code:
  - New: `agent-automation-orchestrate/SKILL.md`
  - New: `agent-automation-orchestrate/agents/openai.yaml`
  - New: `agent-automation-orchestrate/scripts/inspect-project.mjs`
  - New: `agent-automation-orchestrate/scripts/validate-project-config.mjs`
  - New: `agent-automation-orchestrate/scripts/run-task.mjs`
  - New: `agent-automation-orchestrate/scripts/status.mjs`
  - New: `agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs`
  - New: `agent-automation-orchestrate/references/project-contract.md`
  - New: `agent-automation-orchestrate/references/runner-contract.md`
  - New: `agent-automation-orchestrate/assets/agent-automation.config.example.json`
  - Modified: none
  - Removed: none
