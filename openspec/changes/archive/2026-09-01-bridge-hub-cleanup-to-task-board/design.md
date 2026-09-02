## Context

團隊自動化分四層：內容層（各領域 skill）、執行層（agent-automation-orchestrate 的 run-task.mjs，含 runner fallback、驗證、durable run summary）、本機 Figma 入口（design-automation-hub-install 裝進目標 repo 的 Plugin + 127.0.0.1:8787 Coordinator）、團隊派工層（task-board 的雲端控制平面 + 各設計師機器上的 worker）。

現況缺口有三個具體位置：

1. Coordinator 的 HTTP 層在 POST /v1/automation/tasks 成功後立刻排程分析，排程預設直接呼叫 core 的 analyzeTask，analyzeTask 再呼叫 agent-runner 的 runGenericCleanup，在當下行程 spawn run-task。整條路徑都在送出者機器上。
2. worker 只認得專案 .agent-automation/config.json 裡的 task id，並把卡片的 note 原封不動當成 run-task 的 --request。Hub 的 request 字串形如「Read .design-automation/runtime/<automation-task-id>/input.json and write exactly one result to .design-automation/runtime/<automation-task-id>/result.json.」，所以只要卡片 note 帶這段字串、且該機器讀得到那個 input.json，worker 就能執行，不需要 worker 認識 Hub。
3. 卡片來源目前只有成員手動建卡與流水線接棒兩種，兩者都預設自動執行；外部觸發來源沒有對應的 origin，也沒有「預設不放行」的入口。

硬性限制：Hub standalone 規格禁止建立、模仿或回報萃取佇列；orchestrate 的 config schema 是封閉欄位集，腳本與規格不得為了派工而修改；未綁定 task-board 的專案行為必須與今天完全相同。

## Goals / Non-Goals

**Goals:**

- 已安裝 Hub 且已綁定 task-board 的專案，Plugin 送出 cleanup 後不在送出者機器立刻燒 AI 額度，改為在看板出現一張未放行的卡
- 放行後由 worker 以該機器的 AI 帳號跑既有的 run-task.mjs，執行歸屬（member + machine + runner）記錄在看板
- Plugin 的流程狀態仍然是設計師唯一需要看的地方：派工中、已領取、plan-ready、blocked 都在 Plugin 說得清楚
- Figma 的實際修改仍然只由設計師在 Plugin 完成，看板永遠不碰 Figma
- 未綁定時 standalone 路徑逐位元不變，既有 checker 與模板測試全數維持通過

**Non-Goals:**

- 不修改 agent-automation-orchestrate 的腳本、config schema、runner 契約或 run-task 語意
- 不讓 standalone Hub 回報 extractionQueue true，不新增任何萃取佇列端點或狀態
- 不在 Hub 內重做看板、lease、heartbeat、OAuth——Hub 只呼叫控制平面既有的資料模型
- 不做「指派給某成員／某機器」的欄位或 UI（v2）
- 不做 Ready-for-dev 自動掃描建卡，範圍只涵蓋 Plugin 明確送出的 cleanup
- 不支援同一 working tree 並行跑多個 agent
- 不把 access code、Figma file key、原始 snapshot、credential 寫進看板、log 或受追蹤檔案

## Decisions

### 跨機 snapshot 採同機約束而非把 snapshot 搬上看板

Hub 落地的 .design-automation/runtime/<automation-task-id>/input.json 位於 gitignore 的目錄，另一台機器的 working tree 看不到它。兩個可行解只能選一個：

**選定：方案一（同機約束）。** snapshot 留在產生它的機器，只有讀得到該 automation task id 之 input.json 的 worker 可以領到該卡。理由是決定性的：input.json 的欄位包含 fileKey，把它整包送上控制平面會直接違反「Figma file key 不得寫進看板」這條硬性非目標；要合規就得在 Hub 端剝掉 fileKey、在 worker 端從專案 profile 重新注入，並額外處理 1MiB 上限、保留期限與存取範圍——那是另一個 change 的體量。方案一另有一個現實優勢：送出者機器本來就同時持有 working tree、Hub 任務 store 與 runtime 目錄，所以它永遠是合格的領卡者，v1 立刻拿得到真正要的東西（放行閘門、看板可見度、歸屬記錄），而不是地理上的跨機分派。

**否決：方案二（把 snapshot 放進可同步位置）。** 除上述隱私與體量問題外，worker 領卡後還得把 snapshot 寫回 runtime 目錄，而 Hub 建立 runtime 目錄的既有函式在目錄已存在時是直接失敗的，等於要動 Hub 的落地路徑。留給後續 change，屆時要一併設計 snapshot 的去識別化與保留政策。

同機約束怎麼落實：worker 輪詢領卡時，一併申報「本機各 advertise 專案的 .design-automation/runtime/ 下有 input.json 的目錄名清單」。控制平面挑候選卡時，非 Hub 卡（Hub automation task id 為空）照舊，Hub 卡只在該 id 出現在申報清單內才進入候選。讀不到的機器連候選都拿不到，卡片就停在待領取——這正是我們要的「不要靜悄悄在錯的機器跑完再假裝是派工」。

沒有任何機器領得到時的可觀察結果：看板上卡片停在待領取（放行後仍然停著），Plugin 的該筆任務維持 queued 並顯示派工資訊與「尚無機器領取」的說明；沒有任何一方顯示成功或完成。

### 綁定設定放在未追蹤的本機檔案，缺席即回到 standalone

綁定來源優先序：環境變數（控制平面 URL、token、專案 slug）優先於 .design-automation/task-board.json；兩者都缺任一必要欄位就視為未綁定。設定檔加進 gitignore 合併片段，與 runtime、state 目錄同級處理。token 絕不寫入 .design-automation/project.json（該檔的既有驗證本來就會因為 credential-like key 而整個拒絕）、不寫入安裝 receipt、不出現在任何 JSON 輸出或錯誤訊息，錯誤一律只用穩定錯誤碼。

專案 slug 預設值必須與 worker 的推導規則一致（專案根目錄名轉小寫、非 a-z0-9- 換成 -、去除頭尾 -），否則 Hub 建的卡會落在 worker 從未 advertise 的專案上而永遠沒人領。設定檔可覆寫這個預設值。

Hub 對控制平面的認證重用既有的 worker token（成員在看板簽發）。不新增 token 類型：同一位成員、同一台機器、同一信任等級，多一套簽發與撤銷流程沒有換到安全性。代價是這個 token 同時具備領卡能力，記錄在風險段。

### 派工模式以裝飾既有 core 的方式接上，不改 core 與 agent-runner

Coordinator 的 HTTP 伺服器建構函式本來就接受一個可覆寫的排程函式，core 也是以參數注入。因此派工模式的接法是：在 standalone 進入點判斷綁定後，注入一個派工版排程函式，並用一層薄裝飾包住 core（列表與任務詳情讀取前先做調解）。core 與 agent-runner 的原始碼因此不需要任何修改——runGenericCleanup 在派工模式下根本不被呼叫，而落地 snapshot 用的既有 createTaskInvocation 函式已經是具名匯出。

被否決的替代方案：在 core 內部加一個 mode 旗標分支。那會讓 standalone 的關鍵路徑多帶一個永遠為 false 的分支，並讓「standalone 不變」變成需要逐行證明的事，而不是結構上就不可能變。

伺服器健康檢查新增一個布林旗標指出目前是否為派工模式，並繼續回報 extractionQueue false。派工模式不是萃取佇列：它不接受掃描請求、不維護待萃取集合、不主動產生任務，只把 Plugin 明確送出的單筆任務轉交看板。

### Hub 任務狀態機不變，改用調解（reconcile）推進

Hub 的狀態機（queued → analyzing → plan-ready → applying → completed，另有 blocked 與 stale）維持原樣，一個轉移都不加。派工模式下：

- 建卡成功後任務留在 queued，並在任務記錄上掛一個派工區塊（看板卡片 id、派工時間、看板最近已知欄位）
- 建卡失敗（控制平面不可達、被拒）→ queued 轉 blocked，失敗碼為穩定的派工失敗碼，訊息不含 URL 與 token；設計師在 Plugin 看到可重送的封鎖狀態，重新送出即可（新的冪等鍵）
- Plugin 每次讀取任務列表或任務詳情時，裝飾層對「queued 且有派工區塊」的任務做調解：runtime 目錄出現 result.json 就依既有結果驗證邏輯驗證，通過則走 queued → analyzing → plan-ready 兩步轉移（與本機分析路徑走同一組轉移），失敗則走 queued → analyzing → blocked，沿用既有的分析失敗碼
- 沒有 result.json 時查詢看板卡片狀態：卡片在需要處理 → queued → analyzing → blocked；其餘狀態維持 queued 並更新派工區塊的看板欄位。查詢看板失敗時一律不改變任務狀態，沿用上次已知資訊，讀取本身不因此失敗

### 看板欄位與 Hub 狀態的對齊，以及 Plugin apply 後的回寫

figma-cleanup 的 AI 步驟只到 plan-ready（產計畫，不動 Figma），所以看板與 Hub 不是 1:1。對齊規則：

- Hub 卡片一律 reviewGate true。worker 回報 completed → 卡片進待確認，同時 Hub 任務會在下一次 Plugin 讀取時進 plan-ready
- 看板對 Hub 來源的待確認卡使用固定文案，明說「到 Figma Plugin 確認清理計畫」。在 Hub 回報 apply 完成之前，卡片不得以任何文案呈現為工程任務已完成
- 設計師在 Plugin 選 operations 並 apply。Coordinator 在 Plugin 完成或失敗後回寫看板：完成 → 卡片結案；失敗 → 卡片進需要處理，原因為 apply 失敗。回寫是盡力而為，失敗不影響 Plugin 的回應，也不改變 Hub 任務狀態
- 回寫只在卡片正好位於待確認時移動卡片。卡片已被成員在看板批准結案（或已被重跑帶走）時，回寫只寫一筆卡片歷史事件、不移動卡片，並回報未套用。這樣封閉狀態機不必為了容錯而開後門

封閉事件表因此新增兩列：Hub 回報 apply 完成（待確認 → 完成）、Hub 回報 apply 失敗（待確認 → 需要處理）。看板的「批准」按鈕對 Hub 卡仍然可用（Coordinator 可能沒開著），但按鈕旁必須有指向 Plugin 的說明文案。

### worker 端的缺輸入硬保險與失敗詞彙

資格過濾是輪詢當下的快照，input.json 可能在領卡後才消失（人工清理、換分支）。因此 worker 在 spawn run-task 之前必須再驗證一次：卡片帶 Hub automation task id 時，對應的 input.json 必須存在、是一般檔案、且解析後仍在專案根之內。不成立就完全不 spawn，直接回報終態，卡片進需要處理。

失敗詞彙不新增 phase：phase 是 orchestrate 的 run summary 詞彙，分叉它會製造第二套語意。改為在回報主體加一個選用的「需要處理原因」欄位，只在結果欄位是需要處理時採用，且取值限定於封閉集合（可能已停止、驗證失敗、runner 耗盡、Hub 輸入缺失、Hub apply 失敗）。這讓設計師在看板上看到的是「找不到這台機器上的清理輸入」而不是含糊的 runner 耗盡。

## Implementation Contract

**行為（綁定存在時）**：Plugin 送出 cleanup → Coordinator 落地 snapshot 到 runtime 目錄 → 在看板建立一張 origin 為 Design Automation Hub、autoRun false、reviewGate true 的卡，note 就是 run-task 要用的 request 字串 → 卡片停在待領取直到成員放行 → 只有申報得出該 automation task id 的機器能領到 → worker 驗證 input.json 後 spawn run-task → 完成後卡片進待確認、Hub 任務進 plan-ready → 設計師在 Plugin apply → Coordinator 回寫看板結案。

**行為（綁定缺席時）**：與今天完全相同——建立任務後立即本機分析、健康檢查回報 extractionQueue false 且派工旗標為 false、review 為 false。

**介面與資料形狀**：

- 綁定設定：未追蹤的本機 JSON，欄位為 schema 版本、控制平面 URL、專案 slug、token；環境變數可覆寫同名設定。任一必要欄位缺失即視為未綁定。
- 建卡請求（worker token 認證）：專案 slug、task id（固定為 figma-cleanup）、note（request 字串）、Hub automation task id。回應含卡片 id、目前欄位、是否為本次新建。以（專案、Hub automation task id）為唯一鍵，重送回傳同一張卡且不新建。
- 卡片狀態查詢（worker token 認證）：只回傳欄位、是否已放行、需要處理原因；不回傳 note、log、歷史細節。
- Hub 回寫（worker token 認證）：結果為已套用或失敗，失敗時只帶穩定錯誤碼。卡片不在待確認時只寫歷史、不移動卡片。
- claim 請求新增選用欄位：本機可讀的 Hub automation task id 清單。欄位缺席或為空時等同空清單——舊版 worker 因此永遠領不到 Hub 卡，這是刻意的向下相容行為。清單長度設上限，超過時取最近修改的前若干筆。
- 回報請求新增選用欄位：需要處理原因，取值限定封閉集合，且僅在結果欄位為需要處理時生效。
- 資料模型：卡片來源列舉新增一個值；卡片新增可為空的 Hub automation task id 欄位，並對（專案、該欄位）建唯一索引（空值不互斥）。

**失敗模式**：

- 控制平面不可達或拒絕建卡 → Hub 任務進 blocked，穩定錯誤碼，訊息不含 URL 與 token；runtime 目錄已落地的 input.json 保留（重送會用新的 automation task id，不覆寫）
- 沒有機器申報得出該 input → 卡片停在待領取，Plugin 顯示派工中與「尚無機器領取」的說明；兩邊都不顯示完成
- worker 領到卡但 input.json 不存在 → 不 spawn，卡片進需要處理且原因為 Hub 輸入缺失
- run-task 驗證失敗或 runner 全數失敗 → 沿用既有路徑，卡片進需要處理；Hub 任務在下次 Plugin 讀取時進 blocked
- 回寫失敗 → 靜默於 Plugin（不影響 apply 回應），但必須可從 Coordinator 的標準輸出看到一行不含憑證的訊息；卡片留在待確認，成員可自行批准結案

**驗收條件**：

1. 未綁定回歸：健康檢查回報 status ok、schemaVersion 1、extractionQueue false、派工旗標 false；建立任務後仍在本機完成分析並到達 plan-ready；review 仍為 false
2. 綁定端到端：Plugin 送出 → 看板出現未放行卡 → worker 不領 → 放行後恰好一台 worker 領到 → runtime 出現 result.json → Hub 任務 plan-ready → 看板待確認文案指向 Plugin
3. 兩個模擬 worker 併發 claim 同一張 Hub 卡，恰一成功、敗者收到衝突回應（沿用既有測試模式）
4. 同一個 Hub automation task id 重送建卡，回傳同一張卡且卡片總數不變
5. 未申報該 input 的機器輪詢時，該 Hub 卡不出現在其候選中；卡片仍在待領取
6. 卡片帶 Hub automation task id 但 input.json 不存在時，worker 不 spawn 子程序，回報後卡片在需要處理且原因為 Hub 輸入缺失
7. 控制平面回應與 log 不含 access code、Figma file key、snapshot 內容
8. 既有檢查全數通過：orchestrate 的技能檢查腳本、Hub 安裝器的模板檢查（--template --json）、控制平面既有測試、worker 既有測試
9. agent-automation-orchestrate 目錄的 git diff 為空

**範圍邊界**：

- in scope：Hub 的派工模式與調解、綁定設定解析、控制平面的 Hub 來源與回寫端點與資格過濾、worker 的輸入申報與硬保險、Plugin 對派工任務的狀態文案、看板對 Hub 卡的文案、README 與 Hub 安裝文件的說明、對應測試與一次 Prisma migration
- out of scope：Ready-for-dev 掃描建卡、指派 UI、跨機 snapshot 搬運、Hub 任務狀態機的任何新狀態、orchestrate 與 pipeline-board 與 portfolio-dashboard 的任何修改、token 權限分級、看板端主動輪詢 Hub

本 change 橫跨 Hub 模板、控制平面、worker 三個子系統。這不是可拆的三件事：只做其中兩件會留下一座接不通的橋（例如看板建得出卡但沒有機器領得到，或 worker 認得資格但沒有卡片帶那個欄位），因此刻意維持為一個 change，並以上述驗收條件的第 1、8、9 條保護未綁定路徑與外部契約。

## Risks / Trade-offs

- [同機約束讓「派工」在多數情境等於「在送出者機器上排隊等放行」，可能被誤解為沒有達成跨機分派] → 在 README 與 Hub 安裝文件明說 v1 的約束與理由，Plugin 對長時間無人領取的任務顯示明確說明；跨機 snapshot 搬運列為後續 change
- [Hub 綁定重用 worker token，該 token 同時具備領卡能力，外洩影響面大於純建卡權限] → token 只存於未追蹤本機檔案與環境變數、不進輸出與 log，成員可在看板撤銷；權限分級留待 v2
- [看板批准與 Plugin apply 兩條路徑同時存在，成員可能先在看板結案，造成 Hub 回寫無處可去] → 回寫在卡片不在待確認時只寫歷史事件；看板對 Hub 卡的批准按鈕帶指向 Plugin 的文案，避免誤以為批准等於已套用
- [Coordinator 沒開著時，Hub 任務停在 queued 而看板已經進到待確認，兩邊資訊落差] → 調解在 Plugin 每次讀取時發生，設計師一開 Plugin 就會補齊；看板端不假設 Hub 在線
- [資格過濾清單隨 runtime 目錄增長而變大] → 設上限並取最近修改者；過舊的派工卡因此可能不再被提供，這類卡本來就該以重送取代
- [新增列舉值與唯一索引需要 migration，部署順序錯誤會讓建卡失敗] → migration 隨控制平面部署一起套用（既有部署腳本已先跑 migrate 再啟動）；Hub 端建卡失敗會落到 blocked 而非靜默丟失

## Migration Plan

無資料遷移。部署順序：先套用控制平面 migration 並部署新版控制平面（舊版 worker 與未綁定的 Hub 完全不受影響），再更新各機器的 worker，最後才對需要派工的專案寫入綁定設定。綁定是逐專案 opt-in：沒寫設定的專案永遠走 standalone。

回滾：刪除或清空該專案的綁定設定（或移除環境變數）即回到今天的本機即跑行為，不需要回滾控制平面；已建立的卡片留在看板上由成員自行處理。

## Open Questions

- 資格申報清單的上限值取多少（初步取最近修改的 200 筆）待實作時以真實 runtime 目錄規模確認
- 看板卡片對 Hub 來源目前只顯示 automation task id 作為對照，是否需要一個不含設計內容的短識別碼（例如前 8 碼）以便設計師肉眼比對，待第一次實機驗收後決定
