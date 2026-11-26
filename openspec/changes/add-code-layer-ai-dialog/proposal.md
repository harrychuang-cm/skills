## Why

Code Layer 1.2.0 能直接改的有兩種：把 `var()` 裡的 token 換成另一個既有的 token，以及把 flex 容器的方向、對齊、分佈、換行設成固定選項之一。其餘的調整——改寫死的數值、把它換成 token、新增 token、改運算式、調整結構、同步規格文件的敘述——目前的出口是「複製物件參照，貼到 AI 對話」。使用者一開始就希望更接近 Figma 的做法：選到物件、按 AI 圖示、說出需求，AI 直接修改；2026-11-25 使用者把順序定為 B（版面編輯，已完成）→ C（這個 change）→ A（寫死的數值換成 token）。

這條路的風險遠高於現有的寫入：現有寫入端點只能寫入索引中的 token 名稱或固定清單裡的關鍵字，而啟動 coding agent 等於允許不受限的程式碼修改，在沒有版本控制的專案上尤其危險。2026-11-20 與 11-24 的 runner 試跑已確認技術上可行（claude 以受限模式不經互動改檔、沒有 shell、寫不出工作目錄；codex 在 workspace-write 下同樣被擋），2026-11-26 再確認本機的 CLI 版本與旗標沒有變。所以這個 change 要解決的是「怎麼讓它安全到可以放進瀏覽器裡的一個按鈕」。

## What Changes

- **物件上的 AI 入口與對話框**：選取外框的標籤（「複製參照」旁邊）與檢視器標題列各有一個 AI 按鈕；點擊後在檢視器旁開啟對話框，輸入需求後送出。對話框顯示目前選到的元素、會送出的脈絡（物件參照，可展開）、使用的 runner、預估時間與「每次請求有成本」的提示。
- **agent 不直接碰專案**：每次請求在狀態目錄建立一份工作區的副本，agent 只在副本上工作。結束後伺服器比對副本與快照，通過範圍關卡與檢查才把變更匯入專案；任何一關不過，專案一個位元組都不變。
- **範圍關卡**：只接受允許清單內既有檔案的修改（token 真相檔、元件原始碼與樣式表、元件規格文件）。新增、刪除、改名檔案，清單外的任何變更，token 名稱集合的變動，無法解析的 CSS，都讓整次執行被拒並列出原因。
- **匯入是一筆可還原的套用**：通過關卡的變更走既有的交易（備份、journal、真相與鏡像同步、候選樹上先跑檢查、熱更新、套用後指令），出現在還原堆疊上，按一下就能整筆還原。
- **瀏覽器外的確認**：每次請求在啟動 agent 之前，都要經過網頁程式無法代按的確認——預設是作業系統的原生對話框（顯示專案、物件、需求文字、runner、允許修改的範圍），其次是印在 Storybook 終端機的一次性代碼。拒絕或逾時就不啟動任何程序。
- **經由 repo 既有的 runner**：以 agent-automation-orchestrate 的 `run-task.mjs` 原封不動地啟動（不修改 orchestrator）。契約檔由伺服器逐次產生在工作副本內，專案本身不需要新增任何 agent 設定檔。runner 配方採用試跑驗證過的組合：claude 受限模式（沒有 shell、檔案工具限制在工作目錄、忽略使用者與專案的權限設定）；codex 為選用（workspace-write sandbox、需指定模型）。cursor-agent 不列入（未經試跑）。
- **需求文字不進 argv、不經伺服器回傳、agent 輸出不落地**：傳給 CLI 的 prompt 只是一句「讀哪個請求檔、把結果寫到哪個結果檔」；journal、`GET /state` 與所有 agent 路由的回應都不含需求文字、展開後的參數、agent 的原始輸出或環境變數。需求文字由頁面自己保存，供重新整理後顯示。
- **執行狀態看得到、停得掉**：等待確認、準備中、執行中（顯示經過時間）、檢查中、已匯入、被拒、失敗、已取消、需要決定；同一時間只有一個執行；可取消；有總時限；重新整理後狀態仍在；Storybook 結束時一併終止 agent。
- **需要人決定時不硬做**：agent 不能新增 token、檔案或共用元件 API。遇到這類情況它只回報「需要決定」與問題，對話框顯示問題，回答後以新的請求接續（仍受同樣的範圍限制）。
- **預設關閉，啟用要兩個條件**：專案綁定明確開啟，而且這台機器有以啟用腳本產生的 runner 檔（CLI 的絕對路徑、node 的絕對路徑、orchestrator 的位置）。安裝、更新、推導綁定都不會啟動任何 agent 程序。
- **版本與文件**：模板版本 1.3.0；`docs/code-layer-guide.html` 在同一個 change 更新。

## Capabilities

### New Capabilities

- `code-layer-ai-dialog`: 瀏覽器端的 AI 入口、對話框、確認提示、進度與取消、結果檢視與還原、需要決定時的接續。
- `code-layer-agent-runs`: 伺服器端的 agent 執行——啟用條件與就緒狀態、瀏覽器外確認、隔離的工作副本、經由既有 runner 啟動、請求與結果檔協定、範圍關卡、匯入為可還原的套用、生命週期、紀錄內容、請求防護。

### Modified Capabilities

(none)

## Impact

- Affected specs: `code-layer-ai-dialog`、`code-layer-agent-runs`（皆為新增）。
- 相依：add-storybook-code-layer 與 add-code-layer-layout-editing 皆已完成並封存，本 change 以 `openspec/specs/code-layer-*` 的現行需求為基礎。使用其中的物件參照、訊息目錄、交易與 journal、封閉可寫集合、請求防護、套用後指令。不修改它們的任何規格需求；本 change 新增的拒絕情境（agent 執行中不接受其他寫入）寫在 `code-layer-agent-runs`。
- 與 add-code-layer-tokenize-literals（A，未核可）沒有需求重疊。
- Affected code（皆在 `storybook-code-layer/` 之下，另列者除外）:
  - New:
    - template/code-layer/server/agent/routes.mjs、runs.mjs、confirm.mjs、workcopy.mjs、launcher.mjs、contract.mjs、scope-gate.mjs、import.mjs、request-file.mjs、runners.mjs
    - template/code-layer/server/agent/check-result.mjs（orchestrator 的 verification 指令）
    - template/code-layer/manager/agent.ts、manager/components/AgentDialog.tsx、manager/components/AgentRunReport.tsx
    - scripts/enable_agent.mjs
    - test/test_agent_scope_gate.test.mjs、test_agent_runs.test.mjs、test_agent_confirm.test.mjs、test/fixtures/fake-runner.mjs、test/run_agent_browser.mjs
  - Modified:
    - template/code-layer/server/config.mjs（新增 `agent` 鍵）、app.mjs、plugin.mjs、transaction.mjs（匯入型交易與 agent 模式的 lock）、journal.mjs
    - template/code-layer/shared/api-contract.mjs、protocol.ts、messages.zh-Hant.ts、messages.en.ts
    - template/code-layer/runtime/overlay.ts、index.ts（選取標籤上的 AI 按鈕，經 channel 通知 manager）
    - template/code-layer/manager.tsx、manager/store.ts、manager/Inspector.tsx、manager/icons.tsx、manager/components/ChangesBar.tsx、Report.tsx
    - template/code-layer/package.json（版本 1.3.0）、template/TEMPLATE_MANIFEST.json、template/KNOWN_MANIFESTS.json
    - SKILL.md、README.md、scripts/install_code_layer.mjs（`--check` 回報 agent 就緒狀態）
    - （repo 根目錄）README.md、docs/code-layer-guide.html、docs/skills-usage.md、docs/skills-guide.html、scripts/skill-dependencies.json（storybook-code-layer 對 agent-automation-orchestrate 的 support 相依）
  - Removed: (none)
- 不修改：agent-automation-orchestrate 的任何檔案（既有規格要求其他使用者不得修改它的腳本、schema 與專案契約）。
- 專案綁定新增選用鍵 `agent`（`enabled`、`confirm`、`allowedGlobs`、`workcopy`、`timeoutMs`）；沒有這個鍵時行為與 1.2.0 完全相同。
- 狀態目錄新增 `agent/`（各次執行的請求檔、結果檔與工作副本；副本在執行結束後移除）與本機專屬的 `agent-runners.json`。
- 寫入端點的能力範圍：啟用之後，同源的網頁程式可以「提出」一次 agent 執行，但每一次都必須在瀏覽器外由人確認才會啟動；確認後的結果仍受範圍關卡限制，而且是一筆可還原的套用。使用者在 2026-11-20 接受的風險（同源程式碼能做檢視器能做的事，範圍限於封閉可寫集合而且可以還原）不因此擴大到「不經人確認」。
- 成本與外部服務：每次請求會呼叫使用者自己已登入的 CLI（claude 或 codex），產生該服務的用量；試跑量到的小任務約 10～30 秒、0.4～0.9 美元。本工具不另外傳送任何資料到其他服務。
