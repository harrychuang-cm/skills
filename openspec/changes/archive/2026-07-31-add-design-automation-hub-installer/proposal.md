## Why

目前 project-neutral Figma Plugin、Coordinator integration 與 Figma cleanup domain rules 只存在於單一產品 change，其他專案開發者無法用一個可驗證、可更新且不覆蓋既有設定的流程安裝。需要把經產品端驗證的 runtime 封裝進 `cm-skills`，並明確重用現有 `agent-automation-orchestrate`，讓不同專案取得相同的 Plugin 觸發面、durable task service 與 AI 執行契約。

## What Changes

- 新增 top-level `design-automation-hub-install` skill，提供 inspect、dry-run、install、update 與 check 流程，將 Design Automation Hub Plugin、portable Coordinator runtime、project profile、agent-automation task fragment、domain companion skill、文件與檢查腳本安裝到明確的 target project root。
- 在 installer template 內新增獨立的 `figma-design-automation` companion skill。它只定義 Figma snapshot input、cleanup result、允許／禁止操作、task-scoped artifact 與零畫布寫入規則，不負責 runner priority、provider fallback、timeout、run summary 或通用 verification。
- 將既有 top-level `agent-automation-orchestrate` 視為必要 dependency 與唯一通用執行層。Installer 從同一個 `cm-skills` source tree 安裝／驗證該 canonical skill，不在 template 內維護第二份 source，也不新增 `figma-automation-orchestrate`。
- Installer 可從自身所在的完整 checkout 或明確 `--skills-source-root` 解析 canonical dependency；找不到或找到多個候選時在零寫入前失敗，不從網路下載或猜測版本。
- 新增 versioned `TEMPLATE_MANIFEST.json`，列出每個 managed template file、target path、ownership mode 與 SHA-256；installer 與 checker 拒絕 unlisted file、hash drift、project-root escape、未知 schema 與缺少 dependency。
- Installer 以 merge-aware contract 寫入 project profile 與 `.agent-automation/config.json`：project id、display name 與 Figma file keys 必須由明確 CLI/profile input 提供，不從資料夾或 Figma 檔名猜測；既有 runners、tasks 與不相干欄位保持不變，只新增 `figma-cleanup` task。Receipt 同時記錄 managed file hash 與 normalized managed-fragment hash；同名且不等價的 task 或 locally modified managed file 會回報 conflict，不在沒有明確 `--force-managed`／update 授權時覆寫。
- `figma-cleanup` task 固定載入 `figma-design-automation`，使用 task-scoped input/result artifacts，並以 project-local deterministic checker驗證 result 的 automation task id、snapshot hash、`AGENT_AUTOMATION_RUN_ID`、schema 與 operation allowlist；Coordinator 只在 generic run summary 與 result 都通過後公開 plan。
- Bundled Plugin 保持 `Design Automation Hub` 的 project-neutral identity、簡單三入口與輕微動漫感 helper copy。Portable standalone profile 預設啟用「整理設計稿」與「流程狀態」；只有 target 提供 contract version 1 adapter descriptor、完整 review method group 並通過 smoke check 時才啟用「元件覆核」，不得假裝其他專案已有 extraction/review backend。
- Figma Desktop 的 local manifest import 保持一次性的人工步驟。安裝完成會輸出絕對 manifest path、Coordinator 啟動／檢查命令與尚未完成的 setup action，但 installer 不以 GUI automation 假稱已匯入。
- 新增 source-sync check：實作期間可用 `--source-root` 將產品端 `add-design-automation-hub` 已驗證 runtime 與 template inventory 比對；同步完成後 `cm-skills` template 與 manifest 成為 downstream installation 的 canonical distribution source，不要求使用者存取產品 repo。
- 擴充 repo-level checks，驗證 installer dry-run 零寫入、clean install、idempotent reinstall、safe update、collision protection、config merge、multi-agent skill mirrors、ES2018-compatible Figma main runtime、project-neutral copy、manual-import handoff 與 installed-project smoke fixture。

## Capabilities

### New Capabilities

- `design-automation-hub-installer`: 定義可重用 template、manifest、dependency resolution、project config merge、install/update/check、安全碰撞處理、standalone／compatible-host feature profile 與人工 Figma import handoff。
- `figma-design-automation-skill`: 定義獨立 Figma companion skill 的 input/result schema、分析限制、禁止 mutation、generic run identity、completion gate 與 multi-agent mirror contract。

### Modified Capabilities

無。

## Impact

- Affected specs: new `design-automation-hub-installer`, new `figma-design-automation-skill`; existing `agent-automation-orchestration-skill` is a dependency but is not modified.
- New source:
  - `design-automation-hub-install/SKILL.md`
  - `design-automation-hub-install/agents/openai.yaml`
  - `design-automation-hub-install/references/installation-contract.md`
  - `design-automation-hub-install/scripts/install-design-automation-hub.mjs`
  - `design-automation-hub-install/scripts/check-design-automation-hub-install.mjs`
  - `design-automation-hub-install/template/TEMPLATE_MANIFEST.json`
  - `design-automation-hub-install/template/figma/design-automation-hub/`
  - `design-automation-hub-install/template/scripts/design-automation-hub/`
  - `design-automation-hub-install/template/skills/figma-design-automation/`
  - `design-automation-hub-install/template/project-profile.example.json`
  - `design-automation-hub-install/template/agent-automation-task.fragment.json`
  - `design-automation-hub-install/test/fixtures/`
- Modified source: root documentation and repo check entrypoints only if required to discover and validate the new installer; `agent-automation-orchestrate/` remains canonical and behaviorally unchanged.
- Installed project surface:
  - `figma/design-automation-hub/`
  - `scripts/design-automation-hub/`
  - `.design-automation/project.json`
  - `.agent-automation/config.json` merged task
  - `.agents/skills/figma-design-automation/`, `.claude/skills/figma-design-automation/`, and `.cursor/skills/figma-design-automation/`
  - project-local installed mirrors of the existing `agent-automation-orchestrate` dependency
- Runtime impact: a local Coordinator process persists safe task state and launches configured headless AI runners through `agent-automation-orchestrate`; no cloud service, Figma OAuth, public Community Plugin publishing, direct provider SDK in Coordinator, or automatic document mutation is introduced.
