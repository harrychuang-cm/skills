## 1. Skill 外殼與組合定義

- [x] 1.1 依 design「儀表板是獨立頂層 skill 而非併入 pipeline-board」完成 requirement「The dashboard is a self-discovered top-level skill」：建立 `portfolio-dashboard/SKILL.md` 與 `portfolio-dashboard/agents/openai.yaml`，SKILL.md 的 frontmatter 名稱與資料夾同名並含非空描述，不進入任何受管模板。完成後 `node scripts/install_agent_skills.mjs --dry-run` 必須把 `portfolio-dashboard` 列為可安裝 skill 且不報錯。
- [x] 1.2 依 design「組合定義檔是使用者維護的獨立設定檔」及 Implementation Contract「介面與資料形狀」：建立 `portfolio-dashboard/references/portfolio-definition.md` 定義 schema 版本 1 欄位語意（專案識別碼、顯示名稱、絕對或相對於定義檔目錄的根目錄路徑），並建立範例檔 `portfolio-dashboard/assets/default-portfolio.json`。完成後定義檔不含任何執行器會讀取的欄位；以內容審閱確認文件涵蓋全部欄位與路徑解析規則。

## 2. 聚合建置

- [x] 2.1 依 design「組合定義檔是使用者維護的獨立設定檔」及 Implementation Contract「失敗模式」完成 requirement「The portfolio definition file is validated before any aggregation」：`portfolio-dashboard/scripts/build-portfolio-status.mjs` 以必要參數接受定義檔路徑並驗證之，對缺失、無法解析、schema 版本不符、專案清單為空、識別碼重複各回傳穩定錯誤碼、非零退出且不產生任何輸出檔。以檢查器的 invalid-definition 情境（含空清單與識別碼重複）驗證。
- [x] 2.2 依 design「聚合以子行程呼叫既有指令而非重新實作推導」「同一次聚合產生總覽與全部專案板，輸出集中於單一目錄」「建置與渲染拆為兩支指令」完成 requirement「Aggregation reuses the per-project pipeline commands」與「One aggregation produces the overview and all project boards in one output directory」：build 腳本對每個專案以子行程呼叫 `pipeline-board/scripts/build-pipeline-status.mjs` 取得狀態物件並檢查其 schema 版本，再呼叫 `pipeline-board/scripts/render-pipeline-board.mjs` 產出以專案識別碼命名的專案板 HTML；全部輸出寫入單一輸出目錄（預設為定義檔旁的 dashboard 子目錄，可用參數覆寫），不寫入任何受追蹤專案。以暫存專案裝置驗證內嵌狀態物件與 pipeline-board 建置輸出逐欄位一致且輸出目錄含對應板檔。
- [x] 2.3 依 design「個別專案失敗以錯誤卡片呈現，不中斷整體」與「卡片的卡住原因依固定優先序推導」完成 requirement「Per-project failures become error cards without aborting the build」與「Each project card derives one attention item by fixed priority」：根目錄不存在、流程定義無效、子行程非零退出、狀態物件 schema 不符時記為含穩定錯誤碼與原因的錯誤項目並繼續聚合、整體零退出；成功項目依（可能已停止 → 第一條未成立或已過期連線 → 待決數 → 健康且區分全部已驗證與僅產出）固定優先序推導唯一注意事項並寫入組合狀態物件。以 spec 的 priority selection 範例表五列逐列驗證。

## 3. 渲染

- [x] 3.1 依 design「建置與渲染拆為兩支指令」及 Implementation Contract「行為」完成 requirement「The overview HTML is self-contained and honest about being a snapshot」：`portfolio-dashboard/scripts/render-portfolio-dashboard.mjs` 消費組合狀態物件輸出單一自足總覽 HTML，每個成功專案一張卡片（顯示名稱、目前階段、注意事項、執行區塊摘要、指向輸出目錄內專案板的相對連結），錯誤卡片顯示錯誤碼與原因且不含連結，頁面標示產生時間與重新產生指令，無任何動態進度元素或執行入口。完成後 HTML 不得含外部資源參照、存取碼、憑證、展開的執行參數、原始提示或環境值；以字串掃描與離線開啟驗證。

## 4. 檢查器與驗收

- [x] 4.1 依 design「檢查器以確定性暫存裝置驗證，不呼叫付費執行器」完成 requirement「The checker validates the dashboard with deterministic fixtures」：建立 `portfolio-dashboard/scripts/check-portfolio-dashboard.mjs`，以暫存組合與暫存專案裝置涵蓋健康專案、未成立連線、已過期連線、執行逾期、根目錄不存在、組合定義檔無效（含空清單與識別碼重複）、schema 版本不符七種情境，全部以檔案系統操作與真實 build/render 腳本完成，不呼叫任何 AI 執行器或網路。完成後 `node portfolio-dashboard/scripts/check-portfolio-dashboard.mjs` 必須零退出且輸出的檢查名稱包含上述七種情境。
- [x] 4.2 依 Implementation Contract「驗收標準」與「範圍邊界」執行完整驗收：在含一健康專案與一缺根目錄專案的暫存組合上確認建置與渲染皆零退出、總覽含一張正常卡片（連結指向實際存在的板檔）與一張無連結錯誤卡片；確認 pipeline-board 與 agent-automation-orchestrate 未被修改；在 README 加入儀表板入口連結；最後依序執行 `node portfolio-dashboard/scripts/check-portfolio-dashboard.mjs`、`git diff --check`、`spectra analyze add-portfolio-dashboard --json` 與 `spectra validate add-portfolio-dashboard`，全部通過才視為完成。
