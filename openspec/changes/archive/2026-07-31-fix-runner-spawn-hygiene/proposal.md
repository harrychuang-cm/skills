## Why

`run-task.mjs` 以繼承的 stdio 啟動 agent 子程序，並在逾時只終止直接子程序。這在開發者終端可運作，但在任何非終端啟動者（背景服務、sequencer、排程器）下，實測 `codex exec` 會在繼承的 stdin 上永久阻塞，直到耗盡 `timeoutMs`（範例設定為 1,800,000 毫秒）。逾時終止後亦留下存活的孫程序。這兩項缺陷讓無人值守執行在今天不可行，並且是後續串鏈 sequencer 的前置條件。

## What Changes

- `executeProcess` 強制子程序 stdin 為 `ignore`，不再繼承呼叫者的 stdin；stdout 與 stderr 維持現行行為不變。
- 逾時終止改為終止整個 process group，使 agent 啟動的孫程序一併結束，不再外洩。
- `runner-contract.md` 新增三支 CLI 的已驗證 runner 配方（codex、claude、cursor-agent），其中明確記載 `cursor-agent status` 在未登入時仍以 0 退出、因此不可作為 preflight，正確的 preflight 為 `cursor-agent models`。
- `runner-contract.md` 記載 claude 的 `--add-dir` 為變參，因此 `args` 順序具有語意，並記載 codex 在非 git 儲存庫需 `--skip-git-repo-check`。

## Non-Goals

- 不改變 runner fallback 的分類語意、summary 形狀、status 查詢或 project-contract schema。逾時仍歸類為 `timeout`，preflight 失敗仍歸類為 `unavailable`。
- 不改變 stdout 與 stderr 的處理方式。將輸出改導向記錄檔會影響既有的終端可見性，屬於後續 sequencer 變更的範圍。
- 不新增驗證規則去拒絕 `inheritEnv` 中的 provider 金鑰名稱。已實測 `inheritEnv: ["ANTHROPIC_API_KEY"]` 目前通過驗證；是否禁止是一項政策決定，會使既有合法設定失效，需獨立提案處理。
- 不代使用者執行 `cursor-agent login`，也不宣稱三路 fallback 已具備能力。本變更只記載已驗證的配方。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-automation-orchestration-skill`: 新增子程序 stdin 隔離與 process group 終止的規範行為。

## Impact

- Affected specs: agent-automation-orchestration-skill
- Affected code:
  - Modified:
    - agent-automation-orchestrate/scripts/run-task.mjs
    - agent-automation-orchestrate/references/runner-contract.md
    - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - New: (none)
  - Removed: (none)
