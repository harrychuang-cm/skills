## 1. Skill 外殼與流程定義

- [x] 1.1 依 design「流程板是獨立頂層 skill 而非受管模板的一部分」建立 `pipeline-board/SKILL.md` 與 `pipeline-board/agents/openai.yaml`，SKILL.md 的 frontmatter 名稱與資料夾同名並含非空描述。完成後 `node scripts/install_agent_skills.mjs --dry-run` 必須把 `pipeline-board` 列為可安裝 skill 且不報錯。
- [x] 1.2 依 design「流程定義是側車檔，不進入專案任務契約」與「來源節點依專案證據決定且支援多種來源」及 Implementation Contract「介面與資料形狀」的流程定義檔部分完成 requirement「Source nodes are evidence-driven and not fixed to one design tool」：建立 `pipeline-board/references/pipeline-definition.md` 定義 schema 版本 1 的欄位語意，並建立 `pipeline-board/assets/default-pipeline.json` 內含多個候選來源（設計工具匯出、UI 截圖、現有 app 專案、原型程式碼）與其證據路徑，以及萃取、Storybook 基礎、元件三個階段。完成後定義檔本身不含任何執行器會讀取的欄位；以 spec 的 source selection by evidence 範例表逐列驗證顯示結果。

## 2. 狀態推導

- [x] 2.1 依 design「連線狀態必須引用下游工具實際中止的條件」及 Implementation Contract「失敗模式」完成 requirement「Every handoff cites the downstream condition it mirrors」與「Path containment is enforced for every declared path」：`build-pipeline-status.mjs` 載入並驗證定義檔，拒絕 schema 版本不符、路徑逸出專案根目錄、交接關係引用不存在的下游腳本、以及引用的腳本未提及所宣告產物路徑等情形，每種情形回傳穩定錯誤碼、非零退出且不產生任何輸出檔。以檢查器的失效中止點引用情境驗證。
- [x] 2.2 依 design「節點狀態區分檔案已產出與已驗證」與「連線的第三種狀態是已過期」完成 requirement「Edge state distinguishes satisfied, blocked, and stale」與「Stage state separates produced files from verified results」：推導每個階段的產出與缺少檔案、稽核是否實際通過，以及每條連線的成立、未成立或已過期狀態與設計師可讀原因；缺少稽核結果一律顯示為未驗證而非通過。以 spec 的 edge state by evidence 範例表四列逐列驗證。
- [x] 2.3 依 design「執行進度是推導的，逾期顯示需確認而非假進度」完成 requirement「Execution progress is derived and never implies motion it cannot observe」：從既有持久摘要取得階段、選用 runner 識別碼與標籤、fallback 過程與驗證結果，未執行的驗證項數以設定項數減去已記錄項數推導，執行中且距最後更新超過該任務逾時上限加寬限時間者標記為可能已停止；摘要不存在或無法解析時執行區塊為無資料且指令仍以零退出。以 spec 的 verification counts when recording stops early 範例驗證 3 項設定、1 項失敗記錄應得出 0 通過 1 失敗 2 未執行。

## 3. 待決事項來源

- [x] 3.1 依 design「待決事項數量來自既有審閱統計的機器可讀輸出」完成 requirement「Pending decisions are read from a machine-readable review output」：為 `design-system-extractor/scripts/generate_review_html.mjs` 新增機器可讀輸出模式，輸出既有的各類統計欄位與需審閱列，並由 `build-pipeline-status.mjs` 消費以顯示每階段待決數量。完成後既有 HTML 輸出模式的產物必須與變更前逐位元組相同；以變更前後的 HTML 檔案雜湊比對驗證。

## 4. 渲染

- [x] 4.1 依 design「流程板是獨立頂層 skill 而非受管模板的一部分」及 Implementation Contract「行為」與「介面與資料形狀」的渲染輸出部分完成 requirement「The board renders from a self-contained file with no service dependency」與「Board output is sanitized and contains no execution secrets」：`render-pipeline-board.mjs` 消費衍生狀態物件產生單一自足 HTML，內容涵蓋來源、階段狀態、產出與缺少檔案、待決數量、連線狀態與原因及執行區塊，並在頁面明確說明啟動自動化的方式與由誰執行且不提供任何執行入口。完成後產出的 HTML 不得含任何外部資源參照，且不含存取碼、憑證、展開的執行參數、原始提示、原始輸出或環境值；以字串掃描與離線開啟驗證。

## 5. 檢查器與驗收

- [x] 5.1 依 design「檢查器以確定性暫存專案驗證，不呼叫付費執行器」建立 `check-pipeline-board.mjs`，以暫存專案裝置涵蓋空專案、僅有來源、部分完成、全部完成、上游較新造成過期、失效的中止點引用、執行區塊逾期七種情境，全部以檔案系統操作與既有腳本完成，不呼叫任何 AI 執行器或網路。完成後 `node pipeline-board/scripts/check-pipeline-board.mjs` 必須以零退出且輸出的檢查名稱包含上述七種情境。
- [x] 5.2 依 Implementation Contract「驗收標準」與「範圍邊界」執行完整驗收：在一個沒有任何自動化設定的暫存專案上確認建置與渲染皆零退出並產生可開啟的 HTML；確認未新增串鏈編排、範本層步驟欄位、鏈序執行器或執行按鈕，且 `agent-automation-orchestrate` 與 `design-automation-hub-install` 未被修改；在 README 加入流程板入口連結；最後依序執行 `node pipeline-board/scripts/check-pipeline-board.mjs`、`node agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs`、`git diff --check`、`spectra analyze add-pipeline-board --json` 與 `spectra validate add-pipeline-board`，全部通過才視為完成。
