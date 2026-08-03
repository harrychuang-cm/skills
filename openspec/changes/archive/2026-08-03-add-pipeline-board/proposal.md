## Why

設計師無法回答三個關於自動化的基本問題：這條流程會做哪些事、現在跑到哪一步、什麼時候輪到我。目前唯一能回答的方式是閱讀多份 Markdown 文件、翻 run summary JSON，或直接問工程師。

這些答案所需的資料其實已經在磁碟上：skill 之間的依賴是 runtime 強制的檔案存在性，`design-system-to-storybook` 的來源追蹤在缺少設計系統套件時會直接中止；`agent-automation-orchestrate` 的每次執行都寫下含階段、選用 runner、fallback 與驗證結果的持久摘要。缺的是把這些證據組成一張設計師看得懂的流程圖。

## What Changes

- 新增 top-level skill `pipeline-board`，產生單一自足 HTML 流程板，以 file 協定開啟即可閱讀，不需安裝、不需連接埠、不需存取碼、不需終端機。
- 流程板的節點與連線狀態全部由磁碟證據推導：來源節點依專案實際存在的證據決定並支援多種來源，連線狀態由下游腳本實際會中止的檔案條件決定。
- 連線狀態新增「已過期」：上游產物的修改時間晚於下游步驟完成時間時，明確告知設計師該段已過期。
- 節點顯示待決事項數量，資料來自設計系統審閱工具已計算但目前只以 HTML 呈現的統計。
- 為 `generate_review_html.mjs` 新增機器可讀輸出模式，使上述統計可被流程板消費。
- 流程板明確區分「檔案已產出」與「已驗證」，並在執行紀錄超過預期時間時顯示需人工確認，不顯示假進度。

## Non-Goals

- 不做節點拉線編排、不做圖執行引擎、不做「全部執行」或排程觸發。專案任務契約的欄位集合是封閉的且不含依賴關係欄位，畫出的連線在執行期不具任何效力。
- 不做即時串流進度。執行期的持久紀錄在 agent 執行期間完全靜止，任何介面層都無法合成步驟級事件。
- 不依賴 Figma、不做 Figma plugin、不修改 Design Automation Hub 的 Coordinator 或 Plugin。Figma 只是來源節點的其中一種。
- 不修改 `agent-automation-orchestrate` 的模式、任務契約 schema、runner fallback、摘要或狀態語意；流程板只讀取其產出。
- 不新增串鏈編排、鏈序執行器或範本層的步驟欄位；那些屬於後續變更。
- 不在流程板中提供啟動執行的按鈕。

## Capabilities

### New Capabilities

- `pipeline-board`: 從磁碟證據推導並渲染設計師可讀的自動化流程狀態板。

### Modified Capabilities

(none)

## Impact

- Affected specs: pipeline-board
- Affected code:
  - New:
    - pipeline-board/SKILL.md
    - pipeline-board/agents/openai.yaml
    - pipeline-board/references/pipeline-definition.md
    - pipeline-board/assets/default-pipeline.json
    - pipeline-board/scripts/build-pipeline-status.mjs
    - pipeline-board/scripts/render-pipeline-board.mjs
    - pipeline-board/scripts/check-pipeline-board.mjs
  - Modified:
    - design-system-extractor/scripts/generate_review_html.mjs
    - README.md
  - Removed: (none)
