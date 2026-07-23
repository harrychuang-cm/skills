## Context

產品 repo 的 `add-design-automation-hub` change 正在定義 project-neutral Figma Plugin、durable automation task service、cleanup plan/apply safety 與 `figma-design-automation` domain contract；`cm-skills` 已有 top-level `agent-automation-orchestrate`，負責 project config validation、ordered runner fallback、process settlement、sanitized summary、verification 與 artifact gates。兩者的責任已清楚，但目前沒有 reusable package 能把 Plugin、Coordinator runtime、domain skill 與 project binding 安全安裝到另一個 repo。

現有 `scripts/install_agent_skills.mjs` 可從 `cm-skills` source tree 將 top-level skills安裝至 Claude、Codex 與 Cursor 的 user/project scope；現有 Figma companion installers也證明 local Plugin code可以被複製並輸出 Figma Desktop manifest path，但 manifest import仍是人工動作。本 change 應重用這些慣例，避免第二份 generic orchestrator、隱性 GUI automation與覆蓋 target project的既有設定。

## Goals / Non-Goals

**Goals:**

- 以一個 installer skill 將 Design Automation Hub runtime安裝、更新並驗證到明確 target project root。
- 保持 `agent-automation-orchestrate` 為唯一 generic runner source；將 Figma domain rules 放在獨立 `figma-design-automation` companion skill。
- 讓 clean install、idempotent reinstall、safe update、config merge、collision handling與 installed-project check都有 deterministic result。
- 讓沒有既有 review/extraction backend的專案可用 standalone cleanup/status；只有提供 compatible host adapter的專案才顯示 review。
- 將產品端已驗證成果同步成 versioned canonical template，downstream安裝不依賴產品 repo。
- 明確告知 Figma Desktop local manifest import仍需使用者完成一次，不把「檔案已複製」誤報為「Plugin 已匯入」。

**Non-Goals:**

- 不修改 `agent-automation-orchestrate` 的 modes、project-contract schema、runner fallback、summary或status semantics。
- 不建立 `figma-automation-orchestrate`、不在 Coordinator直接呼叫 provider SDK/CLI，也不把 Figma rules寫入 generic skill。
- 不發布 Figma Community Plugin、不自動操作 Figma Desktop UI、不建立 OAuth或cloud hosting。
- 不保證任意第三方 review backend相容；compatible mode只接受通過明確 adapter contract的 host。
- 不從 target repo推測或覆寫 runner credentials、provider account、既有 task或未知 package scripts。
- 不讓 AI analyzer直接修改 Figma document；document mutation仍由使用者在 Plugin預覽及確認後執行。

## Decisions

### Canonical template由 cm-skills管理，產品 repo只作為同步證據

`design-automation-hub-install/template/` 在第一次從產品 repo同步且所有 parity checks通過後，成為 downstream distribution的 canonical source。Template包含 project-neutral Plugin、portable Coordinator core與entrypoints、result checker、`figma-design-automation` skill、project profile example與 agent task fragment。產品 repo path不寫入 template、不出現在 downstream runtime，也不是一般 install的 dependency。

`check-design-automation-hub-install.mjs --source-root <product-root>` 只供 maintainer同步驗證：它比較明確 source inventory、contract version與內容 hash，而不是遞迴複製整個產品資料夾。沒有 `--source-root` 時，checker只驗證 cm-skills template自身及指定 installed project。

替代方案是 installer每次直接讀產品 repo，但其他開發者沒有該 private path，且產品改動會讓安裝結果不可重現，因此拒絕。

### Installer與 generic orchestrator保持 dependency關係而非複製 canonical source

Installer source tree不包含 `agent-automation-orchestrate` 的 vendored snapshot。執行 install時，它先從 installer所在位置向上解析唯一同時包含 `design-automation-hub-install/SKILL.md` 與 `agent-automation-orchestrate/SKILL.md` 的 cm-skills repository root；操作者也可用 `--skills-source-root <absolute-root>` 明確指定。零個候選回傳 `missing-agent-automation-source`，多個或與明確參數不一致回傳 `ambiguous-agent-automation-source`，兩者皆零寫入且不從網路下載。解析成功後，installer以既有 multi-agent install contract複製canonical skill至 target的 `.agents/skills/`、`.claude/skills/` 與 `.cursor/skills/`。

Coordinator runtime以 target project內固定的 `.agents/skills/agent-automation-orchestrate/scripts/run-task.mjs` 作為 machine runtime path；三份 skill mirror必須 byte-identical。其他 AI tool仍依自己的 skill surface載入同一 contract，但不形成第二套 runtime implementation。

替代方案是在 template再放一份 generic skill，但會產生兩個 canonical source與版本漂移，因此拒絕。

### Manifest區分 managed、merge與manual handoff ownership

`TEMPLATE_MANIFEST.json` 使用 schema version 1，至少包含 `templateVersion`、`minimumAgentAutomationVersion`、`files[]` 與 `manualActions[]`。每個 file entry包含 template-relative source、project-relative target、SHA-256及以下其中一個 ownership：

- `managed`：Plugin、Coordinator runtime、checker與 companion skill files；由 receipt追蹤 installed hash。
- `merge`：`.agent-automation/config.json` task、project profile與必要 gitignore entries；installer只改明確 keys/lines。
- `generated`：`.design-automation/install.json` receipt與使用者明確提供的非秘密 project identity。Receipt至少記錄managed file installed hash，以及每個merge-owned fragment id、target與normalized fragment hash。
- `manual`：Figma Desktop manifest import；只輸出 action，不聲稱已完成。

Manifest checker拒絕 duplicate target、absolute path、`..` escape、symlink escape、未知 ownership、hash mismatch、unlisted template file與listed-but-missing file。這使 template inventory可審核且更新有依據。

### 安裝與更新採完整預檢、merge-aware plan與可回復寫入

Installer命令先解析 exact project root、applicable instructions、manifest與現況，再建立完整 plan。Dry-run只輸出 plan且不得建立 directory、receipt、backup或temp file。實際 install在任何 write前完成 path containment、dependency、collision、config schema及host-mode preflight。

Managed file首次安裝只寫入不存在的 target；idempotent reinstall對相同 hash回報 `unchanged`。Update只可改寫「目前 hash等於上一版 receipt hash」的 managed file；local modification回報 `locally-modified-managed-file`。明確 `--force-managed`只允許覆寫 manifest列出的 managed files，仍不得覆寫 merge-owned未知內容。

Config merge保留現有 `schemaVersion`、`stateDir`、runner order與其他 tasks，只新增 exactly one `figma-cleanup` task。若 config不存在，installer輸出 `needs-agent-automation-bootstrap`；installer skill接著依既有 `agent-automation-orchestrate` bootstrap/guide建立 valid runner contract，再重跑 merge。若同名 task不等價於當前template fragment或上一版receipt的normalized fragment hash，回報 `conflicting-figma-cleanup-task`且不自動替換。

Initial install另外要求 `--project-id`、`--project-name` 與至少一個可重複的 `--figma-file-key`，或一個通過schema/no-secret validation的 `--project-profile <project-relative-json>`。缺少時回傳 `needs-project-profile`且零寫入，installer skill用白話向使用者取得這三項。Project profile保留未知non-conflicting keys，拒絕重複file key與credential-like values，且不得從folder name、git remote、Figma file name或node name推導identity。

所有 writes先放在 project-contained staging directory；commit中途失敗時恢復本次觸及的原檔或刪除本次新檔，保留 recoverable diagnostic並不更新 receipt。替代方案是逐檔邊檢查邊覆寫，會留下半安裝狀態，因此拒絕。

### Portable Coordinator core支援 standalone與compatible-host兩種明確模式

同一套 Coordinator core提供 plugin context、task persistence、agent-automation adapter、plan validation、status projection與session authentication。Standalone entrypoint在本機啟動 core，預設 features為 cleanup和workflow status，review固定為 false。它不建立或模擬 extraction queue。

Compatible-host mode使用 `registerDesignAutomationHub(hostAdapter)` 將相同 core掛入既有 server。由 `--host-adapter` 指定的project-relative module必須export `designAutomationHubHostAdapter` object，其 `contractVersion` 固定為1，並提供 `resolveProject(context)` 與 `resolveMember(context)`。Optional `review` object必須整組提供 `listPendingReviews(context)`、`submitReviewDecision(context, decision)` 與 `getWorkflowOverview(context)`。Compatibility checker在 config write前載入descriptor、驗證method shape，並用fixture context執行不寫入smoke check；沒有review object時強制 `review: false`，partial group或smoke failure則preflight失敗，不得顯示空殼功能。

替代方案是直接patch任意既有 Coordinator source，但無法保證不同 repo的API、auth或storage形狀，更新也不可重現，因此拒絕。

### figma-cleanup以 task-scoped artifact連接 durable task與 generic run

Coordinator為每個 automation task建立 project-contained runtime directory與唯一 `input.json`、`result.json`。Input只含 schema version、automation task id、project/file/scope identity、allowlisted snapshot與snapshot hash；不得含 bearer/provider credentials、raw prompt或非allowlisted Figma fields。它呼叫 installed `run-task.mjs --project-root <root> --task figma-cleanup --request <relative input/output instruction>`，request只傳 relative paths。

`.agent-automation/config.json` 的 `figma-cleanup` task固定 `skill: "figma-design-automation"`，verification固定執行 installed deterministic result checker，requiredArtifacts保持空陣列以避免把dynamic path寫死。Companion skill只能讀指定input並寫指定result；result含 schema version、automation task id、input snapshot hash、`agentAutomationRunId`、summary與最多100筆 allowlisted operations。它不得修改 product source、config、database或Figma document。

Verification process從 `AGENT_AUTOMATION_RUN_ID`環境取得目前 generic run identity，掃描時只接受exact task-scoped result path與one-to-one identity。Coordinator只有在child exit、sanitized run summary phase `completed`、result checker與自己的完整 plan validator都通過後才進入 `plan-ready`。任何 missing skill、invalid config、runner exhaustion、verification failure、result mismatch或unsafe operation都進入safe blocked state；不得direct-provider fallback。

### Companion skill template是domain canonical source並安裝為三份一致mirror

`template/skills/figma-design-automation/` 是該 domain skill的唯一 canonical source，包含 `SKILL.md`、OpenAI metadata、input/result reference及deterministic skill checker。Installer將它複製到三個project skill surfaces，receipt記錄每個target hash；installed checker要求三份mirror與template byte-identical。

Skill說明會明確分成 analyze mode與read-only contract：它不接受apply、delete、detach、layout/style/content mutation，也不擴張scope。若輸入超過500 nodes、1 MiB、scope escape或schema不符，它必須寫stable failure result或non-zero exit，不得猜測修復。這些domain gates不回寫generic skill。

### Figma manifest import維持可見且不誤報的人工handoff

成功 install/update result包含絕對 `manifestPath`與manual action code `import-figma-manifest`。文件以簡單步驟說明在 Figma Desktop執行 Plugins → Development → Import plugin from manifest；若使用者已從同一 manifest identity匯入，不要求重複匯入。

Installer與checker都無法從filesystem證明Figma Desktop已匯入，因此 installed status只區分 `files-installed`與 `manual-import-pending-or-user-confirmed`，絕不輸出 `plugin-installed-in-figma: true`。Plugin固定 identity不得含專案名稱；project display name只由authenticated Coordinator context提供。

## Implementation Contract

### Commands

- `node design-automation-hub-install/scripts/install-design-automation-hub.mjs --project-root <absolute-root> --host-mode standalone --dry-run --json`
- `node design-automation-hub-install/scripts/install-design-automation-hub.mjs --project-root <absolute-root> --skills-source-root <cm-skills-root> --host-mode standalone --project-id <id> --project-name <name> --figma-file-key <key> --json`
- `node design-automation-hub-install/scripts/install-design-automation-hub.mjs --project-root <absolute-root> --host-mode compatible --host-adapter <project-relative-module> --update --json`
- `node design-automation-hub-install/scripts/check-design-automation-hub-install.mjs --template --json`
- `node design-automation-hub-install/scripts/check-design-automation-hub-install.mjs --project-root <absolute-root> --json`
- `node design-automation-hub-install/scripts/check-design-automation-hub-install.mjs --source-root <product-root> --json`

Unknown flags、relative project root、root/home target、project-root escape與incompatible flag combinations必須non-zero exit且零寫入。

### Result shape

JSON mode輸出單一object：

```json
{
  "schemaVersion": 1,
  "mode": "dry-run | install | update | check | source-sync",
  "result": "planned | installed | updated | valid | needs-bootstrap | needs-profile | conflict | failed",
  "projectRoot": "/absolute/target",
  "templateVersion": "1.0.0",
  "hostMode": "standalone | compatible",
  "installed": [],
  "updated": [],
  "merged": [],
  "unchanged": [],
  "conflicts": [{ "path": "relative/path", "code": "stable-code" }],
  "issues": [{ "code": "stable-code", "path": "optional/relative/path" }],
  "manifestPath": "/absolute/target/figma/design-automation-hub/manifest.json",
  "manualActions": [{ "code": "import-figma-manifest", "completed": false }],
  "nextActions": []
}
```

Output不得包含 session access code、bearer/provider credentials、expanded runner argv、raw prompt、raw AI output或environment values。Conflict、failed與invalid installed check使用non-zero exit；`needs-bootstrap`與`needs-profile`都在 `issues` 提供stable code、不聲稱complete，並由installer skill繼續generic setup流程。

### Project profile and host adapter

`.design-automation/project.json` schema version 1包含由explicit inputs取得的stable project id、display name、non-empty Figma file key allowlist、host mode與feature flags，不含secret values。Compatible host module export contract version 1 `designAutomationHubHostAdapter`；base methods固定為 `resolveProject`／`resolveMember`，review methods為整組optional capability，不能部分存在。

### Acceptance criteria

- Template checker通過manifest completeness、hash、path、ownership、project-neutral copy、ES2018 main runtime、skill metadata、generic-source non-duplication與source-sync fixture。
- Temporary project fixtures通過dry-run byte-for-byte zero-write、clean install、idempotent reinstall、valid config merge、missing-config needs-bootstrap、task conflict、local managed edit conflict、forced managed update、rollback-on-write-failure及path/symlink escape rejection。
- Standalone smoke fixture可取得plugin context、建立cleanup task、經fake generic runner fallback產生valid result、顯示plan-ready並在Plugin確認前保持document zero mutation。
- Compatible-host fixtures驗證review adapter完整時feature可見、缺少任一review method時review false、host contract version不符時安裝零寫入。
- `node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs`、new installer checker、new companion checker、`git diff --check`、`spectra analyze add-design-automation-hub-installer --json`與`spectra validate add-design-automation-hub-installer`全部通過。
- Manual acceptance輸出可匯入的absolute manifest path，Figma Desktop匯入後同一Plugin能連到兩個project profiles而固定copy不出現任一project name；此人工結果與filesystem install status分開紀錄。

### Scope boundaries

In scope：installer skill、versioned template、portable Coordinator core、standalone/compatible host entrypoints、project profile、agent task merge、generic skill dependency install、Figma companion skill、checks、docs與manual manifest handoff。

Out of scope：修改generic orchestrator semantics、cloud deployment、OAuth、Community publishing、任意host source patching、自動Figma GUI import、credential provisioning、AI direct apply、產品repo application implementation。

## Risks / Trade-offs

- [Installer依賴完整cm-skills checkout才能取得generic canonical source] → preflight在零寫入前檢查sibling source；文件與next action提供完整checkout/run方式，不維護vendor copy。
- [產品runtime與template同步後可能漂移] → manifest hash與optional source-sync inventory在release前gate；downstream只使用versioned template。
- [Update可能覆蓋專案客製化] → receipt-based hash、merge ownership、default conflict與scoped `--force-managed`。
- [Config不存在時無法安全推測runner] →回報needs-bootstrap，由既有generic skill依repo evidence建立valid contract後再merge。
- [Standalone缺少review backend] → feature明確disabled；不顯示empty或假的Review Inbox。
- [Task-scoped runtime artifacts含設計結構] → project containment、gitignore、restricted file mode、allowlisted fields與no-secret checker。
- [Manual Figma import降低全自動感] →清楚輸出manifest path與一個短步驟，並誠實區分files installed與Figma imported。
- [三份skill mirror增加檔案數] → template canonical + receipt hashes + byte-identical checker，避免各agent版本分叉。

## Migration Plan

1. 從產品 change鎖定portable source inventory與contract version，以source-sync checker匯入template。
2. 先完成manifest、template-only checker與companion skill checker，再完成installer plan/write engine。
3. 加入standalone core、compatible host adapter contract、generic runtime integration與temporary fixtures。
4. 在產品 repo副本做dry-run與installed check，不覆寫現有手工變更；修正template至parity gate通過。
5. 以全新temporary repo完成clean install與Figma Desktop manual acceptance，標記template version 1.0.0。
6. 文件公布完整cm-skills checkout安裝路徑。Rollback時使用receipt列出的本change managed files恢復前一版；merge-owned config只移除installer新增且仍byte-equivalent的 `figma-cleanup` entry，不刪除未知或已修改內容。

## Open Questions

無；generic/domain分工、template source of truth、host modes、update ownership與manual Figma import邊界均在本change固定。
