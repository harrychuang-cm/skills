## Why

design-automation-hub-install 的 task board 派工功能在「行為」上是 opt-in（無綁定即靜默），但在「檔案與敘事」上是 default-on：每次安裝都無條件複製三個 board 模組、SKILL.md 主線流程包含 36 行看板設定教學、.gitignore 恆加 task-board 路徑。導致 agent 在每次安裝／更新／檢查時都向使用者提及看板，而使用者的長期方向是改用 Jira / GitHub 等外部工具自動開卡，不需要自建看板成為每個專案的預設存在。

## What Changes

- **文件靜默（主因修復）**：把 design-automation-hub-install/SKILL.md 的看板派工段落整段搬移到新的參考文件 design-automation-hub-install/references/task-board-dispatch.md，主線只留兩句話指引，並加入明確指令：除非使用者明確要求，agent 不得提及、提供、設定或解釋 task board；安裝報告與後續建議清單不得包含看板。installation-contract.md 加入同樣的「不主動揭露」條款。
- **installer 模組化（BREAKING：新安裝預設不含看板模組）**：TEMPLATE_MANIFEST.json 新增 module 分組概念，把 task-board-binding.mjs、task-board-client.mjs、dispatch.mjs 三個檔案劃入可選的 `task-board-dispatch` 模組；新安裝預設排除，需帶 `--with-task-board-dispatch` 旗標才安裝。安裝收據記錄模組選擇，check 與 update 依收據驗證與維持選擇；無模組記錄的舊收據視為包含全部模組（向後相容）。
- **Coordinator 動態載入**：standalone.mjs 移除對三個 board 模組的靜態 import，改為僅在綁定條件成立（綁定檔存在或環境變數齊備）時動態載入，使 Coordinator 在 board 檔案不存在時仍能正常啟動與運作；同時消除「綁定檔格式錯誤導致未 opt-in 專案無法啟動」的故障模式。
- **orchestrate 文件中性化**：agent-automation-orchestrate/README.md 生態表中的看板列改寫為中性描述（外部 tracker 可讀取 durable run summaries），不再點名推薦看板類 skill。
- **不變**：/healthz 的 dispatch 欄位行為維持現狀（bridge-hub-cleanup-to-task-board 已契約化「兩種配置下誠實回報」）；ui.html 的派工文案維持 data-gated 靜默；已綁定專案的派工行為完全不變。

## Capabilities

### New Capabilities

- `hub-dispatch-optionality`: task board 派工是可完整排除的可選模組——Coordinator 在 board 模組缺席時照常啟動、綁定載入延遲化、skill 文件對看板保持靜默（非明確要求不得提及）。

### Modified Capabilities

- `design-automation-hub-installer`: manifest 支援可選模組分組；新安裝預設排除 task-board-dispatch 模組、以旗標 opt-in；收據記錄模組選擇，check 與 update 依收據選擇驗證與維持，不因排除的模組報 drift。

## Impact

- Affected specs: 新增 `hub-dispatch-optionality`；修改 `design-automation-hub-installer`。相依提醒：`bridge-hub-cleanup-to-task-board` 變更已全數完工但尚未 archive，其 delta（hub-dispatch-coordinator 等）應先 archive 併入主 specs，避免規格演進順序混亂。
- Affected code:
  - New: design-automation-hub-install/references/task-board-dispatch.md
  - Modified: design-automation-hub-install/SKILL.md, design-automation-hub-install/references/installation-contract.md, design-automation-hub-install/template/TEMPLATE_MANIFEST.json, design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs, design-automation-hub-install/scripts/build-template-manifest.mjs, design-automation-hub-install/scripts/install-design-automation-hub.mjs, design-automation-hub-install/scripts/check-design-automation-hub-install.mjs, design-automation-hub-install/test/task-board-standalone-regression.test.mjs, agent-automation-orchestrate/README.md
  - Removed: (none)
