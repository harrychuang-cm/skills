## Why

Design Automation Hub 目前是「建立即分析」：設計師在 Figma Plugin 圈好範圍送出 figma-cleanup，Coordinator 立刻在**送出者這台機器**的行程內 spawn run-task，用那台機器的 AI 帳號跑完。團隊已經有雲端看板與各機器上的 worker（add-ai-task-board-platform 已完成），但 Hub 完全繞過它：外部觸發不受放行閘門控管、看板看不到這類任務、歸屬（member + machine + runner）沒有記錄，額度也無法集中管理。

add-ai-task-board-platform 的 design.md 把「Figma 事件觸發建卡」列為 Non-Goal 並註明留給後續 change。本 change 就是那個後續 change：只做 Plugin 明確送出的 cleanup 進看板，讓外部觸發走既有的「未放行不執行」政策，並把執行歸屬與進度攤在看板上。

## What Changes

- **Hub 新增派工模式（dispatch）**：專案存在 task-board 綁定設定時，Coordinator 收到 POST /v1/automation/tasks 後不再立刻分析，改為「把 snapshot 落地到既有的 runtime 目錄 → 在看板建一張卡 → Hub 任務留在 queued 等 worker」。沒有綁定時，行為與今天逐位元相同。
- **綁定設定放在未追蹤的本機檔案**：新增 .design-automation/task-board.json（加入 gitignore 合併片段），或以環境變數覆寫。控制平面 URL 與 token 一律不進 .design-automation/project.json、不進 receipt、不進任何 JSON 輸出或 log。
- **看板新增 Hub 卡片來源**：CardOrigin 新增 DESIGN_AUTOMATION_HUB，autoRun 預設 false（外部觸發需人工放行），reviewGate 強制 true（cleanup 的 AI 步驟只到 plan-ready，永遠不是「完成」）。以 Hub 的 automation task id 作冪等鍵，重送不建第二張卡。
- **claim 加上本機輸入資格過濾**：worker 輪詢時申報本機可讀的 Hub automation task id 清單；控制平面只把對得上的 Hub 卡發給該機器。讀不到 input.json 的機器領不到卡，卡片停在待領取而不是被錯誤的機器領走。
- **worker 執行前硬保險**：卡片帶 Hub automation task id 時，spawn run-task 之前先確認對應的 input.json 存在且在專案根之內；不存在就不執行，回報可重試失敗，卡進需要處理並帶原因 hub-input-missing。
- **狀態對齊與回寫**：worker 跑完（phase completed）→ 卡進待確認、Hub 任務由 Coordinator 依 runtime 的 result.json 推進到 plan-ready；設計師仍在 Plugin 選 operations 並 apply；Plugin apply 成功／失敗後 Coordinator 回寫看板（卡片結案或進需要處理）。看板對 Hub 來源的待確認卡使用固定文案指向 Plugin，plan-ready 期間不得顯示為工程任務已完成。
- **卡片狀態機新增兩個事件**：HUB_APPLY_COMPLETED（待確認 → 完成）與 HUB_APPLY_FAILED（待確認 → 需要處理）。封閉集合仍然封閉，只是多兩列。
- **agent-automation-orchestrate 零修改**：worker 仍以既有的 --task 與 --request 呼叫 run-task.mjs；Hub 的 request 字串格式不變。

## Capabilities

### New Capabilities

- `hub-dispatch-coordinator`: Hub 端的派工模式——綁定設定的解析與缺席時的 standalone 回歸、建卡前的 snapshot 落地、看板建卡與失敗處理、依 runtime 結果推進 Hub 任務狀態、Plugin apply 結果回寫看板，以及 Plugin 流程狀態對派工任務的呈現。
- `hub-dispatch-control-plane`: 控制平面端的 Hub 來源——新 origin 與其預設（未放行、必經待確認）、以 Hub automation task id 為鍵的建卡冪等、claim 的本機輸入資格過濾、Hub 回寫端點與兩個新卡片事件、Hub 卡片的看板文案規則。
- `hub-dispatch-worker`: worker 端的派工支援——申報本機可讀的 Hub 輸入清單、執行前驗證 request 指向的 input.json 存在、缺輸入時不執行並回報帶原因的可重試失敗。

### Modified Capabilities

- `design-automation-hub-installer`: 可攜 Coordinator 的既有 host mode 需求維持不變，新增「派工綁定存在與否決定任務建立後的行為」需求——綁定缺席時 standalone 路徑不變、健康檢查仍回報 extractionQueue false、派工模式不得建立或模仿萃取佇列、綁定憑證不得進入受追蹤檔案與輸出。

## Impact

- Affected specs: 新增 `hub-dispatch-coordinator`、`hub-dispatch-control-plane`、`hub-dispatch-worker`；修改 `design-automation-hub-installer`
- Affected code:
  - New:
    - design-automation-hub-install/template/scripts/design-automation-hub/task-board-binding.mjs
    - design-automation-hub-install/template/scripts/design-automation-hub/task-board-client.mjs
    - design-automation-hub-install/template/scripts/design-automation-hub/dispatch.mjs
    - task-board/control-plane/src/lib/hub-cards.ts
    - task-board/control-plane/src/app/api/hub/cards/route.ts
    - task-board/control-plane/src/app/api/hub/cards/[id]/route.ts
    - task-board/control-plane/src/app/api/hub/cards/[id]/outcome/route.ts
    - task-board/control-plane/test/hub-cards.test.ts
    - task-board/worker/lib/hub-inputs.mjs
    - task-board/worker/test/hub-inputs.test.mjs
  - Modified:
    - design-automation-hub-install/template/scripts/design-automation-hub/standalone.mjs
    - design-automation-hub-install/template/scripts/design-automation-hub/server.mjs
    - design-automation-hub-install/template/figma/design-automation-hub/ui.html
    - design-automation-hub-install/template/gitignore.fragment
    - design-automation-hub-install/template/TEMPLATE_MANIFEST.json
    - design-automation-hub-install/SKILL.md
    - design-automation-hub-install/references/installation-contract.md
    - task-board/control-plane/prisma/schema.prisma
    - task-board/control-plane/src/lib/card-state.ts
    - task-board/control-plane/src/lib/card-transitions.ts
    - task-board/control-plane/src/lib/queue.ts
    - task-board/control-plane/src/components/Board.tsx
    - task-board/control-plane/src/components/CardDetail.tsx
    - task-board/control-plane/test/queue.test.ts
    - task-board/worker/lib/exec.mjs
    - task-board/worker/lib/loop.mjs
    - task-board/worker/lib/api.mjs
    - task-board/worker/test/exec.test.mjs
    - task-board/README.md
  - Removed: 無
- 依賴：無新增 npm 套件；Hub 端維持零依賴 Node，worker 端維持零依賴。agent-automation-orchestrate 的腳本、schema、規格與 pipeline-board、portfolio-dashboard 一律不動。
- 資料庫：新增一次 Prisma migration（CardOrigin 列舉值 + Card 的 Hub automation task id 欄位與其唯一索引）。
