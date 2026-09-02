## 1. 文件靜默

- [x] 1.1 依 design 決策「SKILL.md 看板段落搬遷與靜默指令」：新建 `design-automation-hub-install/references/task-board-dispatch.md` 承接 SKILL.md 的完整看板派工段落（含 binding JSON 結構、worker token 說明、DESIGN_AUTOMATION_TASK_BOARD_* 環境變數、task-board 平台文件交叉連結），SKILL.md 主線縮減為兩句指引並加入禁止主動提及的明確指令，滿足規格需求 "Skill documentation keeps the task board silent unless explicitly requested"。驗證：內容審查——SKILL.md 主線不再含 controlPlaneUrl、worker token、DESIGN_AUTOMATION_TASK_BOARD 任一字樣的設定教學，且靜默指令條文存在；新參考檔內容與搬遷前段落語意等價。
- [x] 1.2 `design-automation-hub-install/references/installation-contract.md` 加入不主動揭露條款：無綁定的專案在報告中不得出現任何看板提及。驗證：內容審查——條款以 MUST NOT 語氣存在於 dispatch binding 章節。
- [x] 1.3 依 design 決策「orchestrate README 生態表中性化」：`agent-automation-orchestrate/README.md` 生態表中點名看板工具的兩列改寫為一句中性描述（外部 tracker 或狀態工具可唯讀消費 stateDir 的 durable run summaries）。驗證：內容審查——生態表不再以推薦語氣點名任何看板 skill 名稱。

## 2. Manifest 模組分組

- [x] 2.1 依 design 決策「manifest 模組分組與預設排除方向」：`design-automation-hub-install/scripts/build-template-manifest.mjs` 新增 moduleFor 來源路徑對照（與 targetFor、ownershipFor 並列），產出頂層 modules 宣告與逐檔 module 欄位（預設 core），並重新產生 `design-automation-hub-install/template/TEMPLATE_MANIFEST.json`，滿足規格需求 "Optional template modules partition the manifest inventory"。驗證：重生後的 manifest 中恰好三個檔案（dispatch 協調模組、task-board binding 載入器、task-board client）標記為 task-board-dispatch 模組，其餘項目無 module 欄位或為 core；template 模式檢查通過。
- [x] 2.2 `design-automation-hub-install/scripts/install-design-automation-hub.mjs` 的 validateTemplate 對引用未宣告 module 值的檔案項目以穩定 issue code 拒絕並阻止安裝。驗證：`design-automation-hub-install/scripts/check-design-automation-hub-install.mjs` 新增 manifest 模組欄位 fixture——未宣告 module 的項目觸發該 issue code。

## 3. Coordinator 動態載入

- [x] 3.1 依 design 決策「standalone.mjs 綁定條件式動態載入」：`design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs` 移除對三個派工模組的靜態 import，啟動時先判定派工前置條件（綁定檔存在，或 URL 與 TOKEN 環境變數同時設定），條件不成立即完全不讀取綁定檔與派工模組，條件成立且模組存在才動態載入並沿用既有派工佈線，滿足規格需求 "Coordinator boots and operates without dispatch modules present"。驗證：`design-automation-hub-install/test/task-board-standalone-regression.test.mjs` 新增模組缺席開機情境——以不含派工模組的檔案集合啟動 Coordinator，斷言啟動成功、healthz 回報 dispatch 為 false、任務走本地分析；既有 bound-mode 情境不修改而通過。
- [x] 3.2 前置條件成立但模組檔案缺席時：Coordinator 印出一行指明「派工綁定存在但看板模組未安裝」語意的警告後繼續 standalone 路徑，不得當機。驗證：task-board-standalone-regression.test.mjs 新增此組態情境，斷言啟動成功、警告行存在、任務本地分析。

## 4. 安裝器旗標與收據

- [x] 4.1 安裝器新增 --with-task-board-dispatch 布林旗標：未帶旗標的全新安裝不複製 task-board-dispatch 模組檔案，帶旗標則照常安裝與驗證，滿足規格需求 "Default installation excludes the task-board dispatch module"。createInstallPlan 與 expectedManagedInventory 依選定模組過濾 manifest 項目。驗證：安裝器 fixture——預設安裝後目標 scripts 目錄無三個派工檔案且立即 check 零 finding；帶旗標安裝後三檔存在且雜湊入收據。
- [x] 4.2 依 design 決策「收據模組選擇與向後相容」：收據新增 modules 欄位記錄本次選擇；installed-project check 由收據選擇推導期望 managed 檔案集合，被排除模組不產生 drift 或 inventory finding；無 modules 欄位的舊收據視為全模組；update 重用收據選擇——不補回被排除模組、不移除已安裝模組，滿足規格需求 "Receipt records the module selection and verification honors it"。驗證：check-design-automation-hub-install.mjs fixtures——舊收據全檔案通過、core-only 專案 update 後無新增派工檔且 check 零 finding、收據記錄派工模組但其一檔案被刪時報 managed-file-drift。

## 5. 整體驗證與版本

- [x] 5.1 依 design 決策「healthz 與 plugin 派工文案維持不變」確認範圍守恆並收斂版本：server.mjs 的 healthz dispatch 欄位與 ui.html 派工文案零變更（plugin-dispatch-copy.test.mjs 與既有 healthz 斷言不修改而通過）；bump templateVersion 並重生 manifest。驗證：執行 template 模式檢查、installed-project fixtures、以及 design-automation-hub-install/test/ 全部 node:test 檔案，全數通過；task-board-binding.test.mjs 與 task-board-dispatch.test.mjs 不修改而通過（template 仍完整攜帶派工檔案）。
