## Context

task board 派工是由已完工（尚未 archive）的 bridge-hub-cleanup-to-task-board 變更引入：Coordinator 在綁定成立時把 Figma 清理任務改派到團隊看板，由 worker 在設計師機器上以本人 AI 帳號執行。行為層已是 opt-in——無綁定時 Coordinator 走純本地分析路徑，回歸測試已釘住兩種配置行為一致。

問題出在檔案與敘事層：TEMPLATE_MANIFEST.json 把 task-board-binding.mjs、task-board-client.mjs、dispatch.mjs 列為無條件 managed 項目，安裝器每次都複製；standalone.mjs 對三者靜態 import，刪檔即 ERR_MODULE_NOT_FOUND；check 對缺檔報 managed-file-drift、update 會補回；SKILL.md 主線流程含完整看板設定教學且無「非要求不得提及」的約束。使用者體感是「看板一直出現」，而其長期方向是改由 Jira / GitHub 等外部 tracker 開卡。

耦合盤點結論：core.mjs、Figma plugin main.js、companion skill 零耦合；dispatch.mjs 僅被 standalone.mjs import 且依賴注入 client；ui.html 派工文案為 data-gated 靜默。邊界乾淨，唯一需要程式碼手術的是 standalone.mjs 與安裝器／manifest 的模組化。

## Goals / Non-Goals

**Goals:**

- agent 在安裝／更新／檢查流程中不再主動提及看板（文件靜默）。
- 新安裝預設不落地任何看板模組檔案，Coordinator 照常啟動與運作。
- 需要派工的團隊仍可用旗標完整取得今日的派工行為，行為零變。
- 既有安裝（舊收據）check 與 update 完全不受影響。

**Non-Goals:**

- 不實作 Jira / GitHub TrackerAdapter（未來獨立變更；本變更僅確保排除看板後的乾淨基線）。
- 不移除 /healthz 的 dispatch 欄位（bridge 變更已契約化兩種配置下誠實回報）與 ui.html 派工文案（data-gated 靜默，且有測試釘住）。
- 不動 cm-skills/task-board/ 平台本體（control plane、worker）。
- 不模組化 gitignore fragment 的 task-board 行（per-module fragment 雜湊會顯著增加安裝器複雜度，該行無害）。
- 不 park 或移除 pipeline-board / portfolio-dashboard skill（環境層操作，不屬本 repo 變更）。

## Decisions

### SKILL.md 看板段落搬遷與靜默指令

把 SKILL.md 的「Optional: dispatch cleanup to the team task board」整段搬到新檔 design-automation-hub-install/references/task-board-dispatch.md（含 task-board/README.md 的交叉連結），主線僅留兩句話：派工是 per-project、opt-in 的綁定，文件在該參考檔；並加入明確指令——除非使用者明確要求，不得提及、提供、設定或解釋 task board，安裝報告與後續建議清單不得包含它。installation-contract.md 加一句相同的不主動揭露條款。選擇搬遷而非刪除：派工契約仍需可查，只是離開 agent 的主線閱讀路徑。這是解決「一直出現」的主因（runtime 本已靜默，敘事來自文件主線）。

### manifest 模組分組與預設排除方向

TEMPLATE_MANIFEST.json 的 files 項目新增 module 欄位（預設 core），新增頂層 modules 宣告 task-board-dispatch 為 optional；劃入該模組的正是 task-board-binding.mjs、task-board-client.mjs、dispatch.mjs 三檔。build-template-manifest.mjs 加 moduleFor 對照（與既有 targetFor、ownershipFor 並列），validateTemplate 驗證欄位值。方向選「預設排除、旗標 opt-in」（--with-task-board-dispatch）而非「預設安裝、--no-task-board 排除」：使用者明確要求看板不是預設，且 opt-in 與 runtime 綁定的 opt-in 語意一致。替代方案（預設安裝＋排除旗標）被否決，因為它讓每個新專案繼續帶著看板檔案。

### 收據模組選擇與向後相容

安裝收據新增 modules 欄位記錄本次選擇（例如 core 或 core + task-board-dispatch）。expectedManagedInventory 與 checkInstalledProject 依收據記錄的選擇過濾期望檔案集合，排除的模組不參與 managed-file-drift 與 install-receipt-inventory-drift 判定。無 modules 欄位的舊收據一律視為包含全部模組——既有安裝的 check 與 update 行為不變。update 重用收據記錄的選擇，不會把排除的模組補回，也不會移除既有安裝已存在的模組檔案。

### standalone.mjs 綁定條件式動態載入

移除對 dispatch.mjs、task-board-binding.mjs、task-board-client.mjs 的靜態 import。啟動時先做輕量判定：綁定檔 .design-automation/task-board.json 存在，或 DESIGN_AUTOMATION_TASK_BOARD_URL 與 DESIGN_AUTOMATION_TASK_BOARD_TOKEN 同時設定。判定不成立→完全不載入看板模組，走既有 standalone 路徑。判定成立且模組檔案存在→動態 import 三模組後沿用今日的綁定解析與派工佈線，行為零變（含綁定檔格式錯誤時的啟動錯誤——使用者已明確建立綁定檔，失敗應該大聲）。判定成立但模組檔案不存在→印一行清楚的警告（派工綁定存在但看板模組未安裝）後繼續 standalone 路徑，不得當機。附帶效益：綁定判定不成立時不再讀取解析綁定檔，消除「格式錯誤的殘留綁定檔讓未 opt-in 專案無法啟動」的故障模式。

### healthz 與 plugin 派工文案維持不變

/healthz 續回 dispatch 布林（未綁定為 false）；ui.html 七條派工文案與 renderDispatchStatus 原樣保留。理由：前者已被 bridge 變更的 spec delta 契約化且有回歸測試釘住，後者是 data-gated 靜默、拔除只會增加測試與 manifest 雜湊翻攪。看板不再被提及靠文件靜默達成，不靠拔健康欄位。

### orchestrate README 生態表中性化

agent-automation-orchestrate/README.md 生態表中點名 task-board 與 pipeline-board / portfolio-dashboard 的兩列，改寫為一句中性描述：外部 tracker 或狀態工具可唯讀消費 stateDir 中的 durable run summaries。該 skill 的程式碼與契約本就零看板耦合，僅此文件修整。

## Implementation Contract

**可觀察行為：**

- 新安裝（無旗標）：目標 repo 的 scripts/design-automation-hub/ 目錄不含 task-board-binding.mjs、task-board-client.mjs、dispatch.mjs；Coordinator 正常啟動並服務；healthz 回報 dispatch 為 false；安裝後立即執行 check 通過零 finding。
- 新安裝（帶 --with-task-board-dispatch）：三檔落地，綁定成立時派工行為與今日完全一致（既有 bound-mode 回歸測試不修改而通過）。
- 既有安裝（舊收據、無 modules 欄位）：check 與 update 行為與今日完全一致，模組檔案不被移除。
- 綁定檔存在但模組未安裝：Coordinator 啟動成功、輸出一行警告、任務走本地分析。
- SKILL.md 主線不含任何看板設定步驟；靜默指令以明確條文存在於 SKILL.md 與 installation-contract.md。

**介面／資料形狀：**

- manifest files 項目新增選填欄位 module（字串，預設 core）；頂層新增 modules 物件宣告 optional 模組。
- 安裝器新增布林旗標 --with-task-board-dispatch；收據新增 modules 陣列。
- 錯誤模式：validateTemplate 對未宣告的 module 值報錯；check 對「收據宣告的模組缺檔」照常報 managed-file-drift（模組被選裝即受完整驗證）。

**驗收目標：**

- design-automation-hub-install/test/task-board-standalone-regression.test.mjs 新增「模組缺席開機」情境：以預設安裝產出的檔案集合啟動 Coordinator，斷言啟動成功且 healthz dispatch 為 false。
- 既有四個看板測試（binding、dispatch、standalone-regression 既有情境、plugin-dispatch-copy）不修改而全數通過（template 仍完整攜帶檔案，僅安裝預設改變）。
- check-design-automation-hub-install.mjs 的 fixtures 擴充：預設安裝→check→update→冪等各通過；帶旗標安裝的收據 round-trip 通過。
- 重新產生 TEMPLATE_MANIFEST.json 並 bump templateVersion 後，--template 模式檢查通過。

**範圍邊界：** in scope＝上述兩個 skill 目錄內的文件、template、安裝器、檢查器、測試；out of scope＝task-board 平台本體、companion skill、Figma plugin main.js、core.mjs、任何 Jira / GitHub 整合程式碼。

## Risks / Trade-offs

- [templateVersion bump 使所有既有安裝在下次 check 報 drift，直到跑 update] → 屬既定的 template 演進機制；update 依收據選擇維持完整模組，無行為變化；發佈說明註記。
- [依賴派工的團隊用預設指令重裝新專案會拿不到派工] → 旗標與行為記載於 references/task-board-dispatch.md；綁定檔存在但模組缺席時的啟動警告會立即指出原因。
- [環境變數齊備但模組未安裝造成困惑] → 同上警告行覆蓋此情境（判定成立、模組缺席）。
- [bridge-hub-cleanup-to-task-board 尚未 archive，spec 演進順序交錯] → 建議先 archive 該變更再 apply 本變更；本變更的 delta 不與其 delta 衝突（已逐條比對）。

## Migration Plan

1. 文件層先行（SKILL.md 搬遷、installation-contract.md、orchestrate README）——獨立可交付，立即止癢。
2. template 與安裝器層：manifest 模組欄位→standalone.mjs 動態載入→安裝器旗標與收據→check 過濾→重生 manifest 與 bump templateVersion→測試擴充。
3. 既有安裝各自擇期跑 update（維持原模組集合）；新專案自動取得乾淨預設。
4. 回滾：revert template 與安裝器變更後重生 manifest 即可；收據 modules 欄位對舊版檢查器是未知欄位，需確認舊檢查器容忍未知收據欄位（實作時驗證，若不容忍則在發佈說明標註不可混用版本）。

## Open Questions

（無阻塞性未決事項。未來 TrackerAdapter 的綁定 kind 欄位設計屬後續 Jira / GitHub 變更的範圍。）
