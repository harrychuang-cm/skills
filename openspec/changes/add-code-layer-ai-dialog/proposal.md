## Why

Code Layer v1（add-storybook-code-layer）能直接改的只有「改綁既有 token」。其餘的調整——把寫死的數值換成 token、改運算式、調整結構、同步規格文件的敘述——目前的出口是「複製物件參照，貼到 AI 對話」。使用者一開始就希望更接近 Figma 的做法：滑到物件上出現 AI 圖示，點開對話框說出需求，AI 直接修改。這條路的風險遠高於 v1：v1 的寫入端點最多只能把 token 換成另一個既有的 token，而啟動 coding agent 等於允許不受限的程式碼修改，在沒有版本控制的專案上尤其危險。2026-11-20 與 11-24 的 runner 試跑已確認技術上可行（claude 以受限模式不經互動改檔、沒有 shell、寫不出工作目錄；codex 在 workspace-write 下同樣被擋），所以這個 change 要解決的是「怎麼讓它安全到可以放進瀏覽器裡的一個按鈕」。

## What Changes

- **物件上的 AI 入口與對話框**：hover 與選取外框的標籤、面板標題各有一個 AI 控制項；點擊後選取該元素並在它旁邊開啟對話框，輸入需求後送出。對話框顯示會送出的脈絡（物件參照）、使用的 runner、預估時間與「每次請求有成本」的提示。
- **agent 不直接碰專案**：每次請求在狀態目錄建立一份工作區的副本，agent 只在副本上工作。結束後伺服器比對副本與快照，通過範圍關卡與檢查才把變更匯入專案；任何一關不過，專案一個位元組都不變。
- **範圍關卡**：只接受允許清單內既有檔案的修改（token 真相檔、元件原始碼與樣式表、元件規格文件）。新增、刪除、改名檔案，清單外的任何變更，token 名稱集合的變動，無法解析的 CSS，都讓整次執行被拒並列出原因。
- **匯入是一筆可還原的套用**：通過關卡的變更走 v1 的交易（備份、journal、真相與鏡像同步、候選樹上先跑檢查、熱更新），出現在還原堆疊上，按一下就能整筆還原。
- **瀏覽器外的確認**：每次請求在啟動 agent 之前，都要經過網頁程式無法代按的確認——預設是作業系統的原生對話框（顯示專案、物件、需求文字、runner、允許修改的範圍），其次是印在 Storybook 終端機的一次性代碼。拒絕或逾時就不啟動任何程序。
- **經由 repo 既有的 runner**：以 agent-automation-orchestrate 的 `run-task.mjs` 原封不動地啟動（不修改 orchestrator）。契約檔由伺服器逐次產生在工作副本內，專案本身不需要新增任何 agent 設定檔。runner 配方採用試跑驗證過的組合：claude 受限模式（沒有 shell、檔案工具限制在工作目錄、忽略使用者與專案的權限設定）；codex 為選用（workspace-write sandbox、需指定模型）。cursor-agent 不列入（本機未登入、未經試跑）。
- **需求文字不進 argv、agent 輸出不落地**：傳給 CLI 的 prompt 只是一句「讀哪個請求檔、把結果寫到哪個結果檔」；journal 與 API 回應不含需求文字、展開後的參數、agent 的原始輸出或環境變數。
- **執行狀態看得到、停得掉**：等待確認、準備中、執行中（顯示經過時間）、檢查中、已匯入、被拒、失敗、已取消、需要決定；同一時間只有一個執行；可取消；有總時限；重新整理後狀態仍在；Storybook 結束時一併終止 agent。
- **需要人決定時不硬做**：agent 不能新增 token 或共用元件 API。遇到這類情況它只回報「需要決定」與問題，對話框顯示問題，回答後以新的請求接續。
- **預設關閉，啟用要兩個條件**：專案綁定明確開啟，而且這台機器有以啟用腳本產生的 runner 檔（CLI 的絕對路徑、node 的絕對路徑、orchestrator 的位置）。安裝、更新、推導綁定都不會啟動任何 agent 程序。

## Capabilities

### New Capabilities

- `code-layer-ai-dialog`: 瀏覽器端的 AI 入口、對話框、確認提示、進度與取消、結果檢視與還原、需要決定時的接續。
- `code-layer-agent-runs`: 伺服器端的 agent 執行——啟用條件與就緒狀態、瀏覽器外確認、隔離的工作副本、經由既有 runner 啟動、請求與結果檔協定、範圍關卡、匯入為可還原的套用、生命週期、紀錄內容、請求防護。

### Modified Capabilities

(none)

## Impact

- Affected specs: `code-layer-ai-dialog`、`code-layer-agent-runs`（皆為新增）
- 相依：必須在 add-storybook-code-layer 完成之後實作。使用它的物件參照、訊息目錄、交易與 journal、封閉可寫集合、文件待同步清單、請求防護。不修改它的任何規格需求；本 change 新增的拒絕情境（agent 執行中不接受其他寫入）寫在 `code-layer-agent-runs`。
- Affected code（皆在 `storybook-code-layer/` 之下，另列者除外）:
  - New:
    - template/code-layer/server/agent/routes.mjs、runs.mjs、confirm.mjs、workcopy.mjs、launcher.mjs、contract.mjs、scope-gate.mjs、import.mjs、request-file.mjs
    - template/code-layer/server/agent/check-result.mjs（orchestrator 的 verification 指令）
    - template/code-layer/runtime/aiDialog.ts
    - template/code-layer/manager/agent.ts、manager/components/AgentRunReport.tsx
    - scripts/enable_agent.mjs
    - test/test_agent_scope_gate.test.mjs、test_agent_runs.test.mjs、test_agent_confirm.test.mjs、test/fixtures/fake-runner.mjs、test/run_agent_browser.mjs
  - Modified:
    - template/code-layer/server/config.mjs（新增 `agent` 鍵）、app.mjs、plugin.mjs、transaction.mjs（匯入型交易與 agent 模式的 lock）、journal.mjs、api-contract.mjs
    - template/code-layer/runtime/overlay.ts、index.ts、events.ts
    - template/code-layer/shared/protocol.ts、messages.zh-Hant.ts、messages.en.ts
    - template/code-layer/manager.tsx、manager/store.ts、Panel.tsx
    - template/code-layer/package.json（版本 1.1.0）、template/TEMPLATE_MANIFEST.json、template/KNOWN_MANIFESTS.json
    - SKILL.md、README.md、scripts/install_code_layer.mjs（`--check` 回報 agent 就緒狀態）
    - （repo 根目錄）README.md、docs/skills-usage.md、scripts/skill-dependencies.json（storybook-code-layer 對 agent-automation-orchestrate 的 support 相依）
  - Removed: (none)
- 不修改：agent-automation-orchestrate 的任何檔案（既有規格要求其他使用者不得修改它的腳本、schema 與專案契約）。
- 專案綁定新增選用鍵 `agent`（`enabled`、`confirm`、`allowedGlobs`、`workcopy`、`timeoutMs`）；沒有這個鍵時行為與 v1 完全相同。
- 狀態目錄新增 `agent/`（各次執行的請求檔、結果檔與工作副本；副本在執行結束後移除）與本機專屬的 `agent-runners.json`。
- 成本與外部服務：每次請求會呼叫使用者自己已登入的 CLI（claude 或 codex），產生該服務的用量；試跑量到的小任務約 10～30 秒、0.4～0.9 美元。本工具不另外傳送任何資料到其他服務。
- 檔案重疊：repo 根目錄的 README.md、docs/skills-usage.md 與 add-storybook-code-layer 及其他未封存的 change 重疊，後套用的一方需在既有修改上合併。
