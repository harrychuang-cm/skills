## Why

ToastEnglish 工作區已有 `toastenglish-platform-parity-handoff`：iOS 切片合入 develop 後從合併 diff 產出九章交接包，Android 端用一份報告做對齊審計。但它的字串存取方式、資源目錄、mapping 欄位、輸出路徑與路由連結都綁定該專案。需要一個可跨專案重用、能安裝到 Cursor、Codex、Claude Code 的通用版，讓其他「先做一端、再同步另一端」的產品沿用同一套交接包與審計。

## What Changes

- 新增 `platform-parity-handoff` skill：export 從整合分支的合併 diff 產出九章 manifest、媒體索引與 inventory；audit 在次端做實作前定位與實作後對齊，輸出單一報告。SKILL.md 不含任何專案路徑或專案文件連結。
- 專案差異集中在 project profile：`assets/profile.example.json` 以 ToastEnglish 的實際值為範例，`references/project-profile.md` 說明每個欄位與如何從原始碼確認；五支唯讀腳本加 `--profile`，未給時退回範例 profile 並在 stderr 提示。
- references 與 templates 改為通用寫法：決策回寫「專案的需求／設計系統」而非特定流程，媒體留本機、索引進 repo。
- 提供 `agents/openai.yaml`、README 小節與安裝命令；`scripts/skill-dependencies.json` 宣告 `ui-pixel-align-report`、`ui-compare-to-reference` 為 support（可選的視覺比對）。
- 與 ToastEnglish 專案版並存：專案版保留為綁定實例，兩邊 SKILL.md 互相註明來源關係；不修改安裝器。

## Capabilities

### New Capabilities

- `platform-parity-handoff-skill`: 以 project profile 參數化的跨平台（先端→次端）交接包產出與對齊審計 skill，可安裝到三種 agent。

### Modified Capabilities

無。

## Impact

- Affected specs: platform-parity-handoff-skill（新增）。
- Affected code:
  - New: `platform-parity-handoff/SKILL.md`、`platform-parity-handoff/agents/openai.yaml`、`platform-parity-handoff/assets/profile.example.json`、`platform-parity-handoff/references/`（project-profile.md、manifest-chapters.md、audit-checklist.md、scripts.md）、`platform-parity-handoff/templates/`（handoff-manifest.md、media-index.json、audit-report.md）、`platform-parity-handoff/scripts/`（_common.py 與五支腳本）
  - Modified: `README.md`（skill 小節、安裝命令、目錄樹）、`scripts/skill-dependencies.json`
- 不修改其他 skills、共用安裝器或既有規格；不執行 Git commit 或 push。安裝到使用者目錄依使用者 2026-09-17 指示以 `scripts/install_agent_skills.mjs` 執行。
