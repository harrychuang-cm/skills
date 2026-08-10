## 1. 沙箱側擷取契約

- [x] 1.1 依 design 的「批次以多筆任務實作，不擴充任務資料模型」，讓沙箱擷取入口接受一或多個範圍：新增 `capture-cleanup-scopes` 訊息處理，未帶 `nodeIds` 時以目前頁面選取為來源、帶 `nodeIds` 時以 `getNodeByIdAsync` 解析為來源，並對每個範圍各自呼叫既有的快照擷取函式產生獨立的 `snapshot` 與 `inputSnapshotHash`。完成時 `design-automation-hub-install/template/figma/design-automation-hub/main.js` 不再存在單一選取守門條件。驗證：以 `node --check` 解析 main.js 通過，且手動比對回覆物件中 `scopes` 陣列每個元素的 `scope`、`snapshot`、`inputSnapshotHash` 欄位形狀與既有單筆回覆一致。
- [x] 1.2 依「拒絕互相包含的選取組合」與「批次上限固定為十個範圍」，實作 "Plugin captures a batch of cleanup scopes and rejects overlapping or oversized batches" 的整批層級失敗規則：來源為空、任一節點為另一節點的祖先或後代、解析節點數超過批次上限 10 三種情形皆回覆 `ok: false`、帶單一穩定錯誤碼且不回傳任何範圍，並且不得靜默收斂為最外層節點。驗證：對照 design 的「失敗模式」段落逐條檢視實作分支，並確認新增的重疊與批次上限錯誤碼為常數而非字面字串散落。
- [x] 1.3 實作單筆層級的拒絕清單：節點型別不受支援、超過 500 節點或 1MB 上限、快照讀取失敗者進入 `rejected` 陣列（含節點識別碼、名稱、錯誤碼），其餘範圍照常回傳；當所有範圍皆遭拒時回覆 `ok: false` 並以第一筆的錯誤碼作為整批錯誤碼。驗證：手動以「一個 Section 加一個文字節點」與「兩個文字節點」兩種選取組合比對 spec 中 Example 表格所列的預期輸出。

## 2. Ready for dev 掃描

- [x] 2.1 依「Ready for dev 掃描只取最外層命中節點」，實作 "Plugin scans the current page for Ready for dev cleanup candidates"：新增 `scan-ready-for-dev` 訊息處理，只遍歷 `figma.currentPage`，回傳所有型別屬於既有 `CLEANUP_SCOPE_TYPES` 且標記為 Ready for dev 的最外層節點，命中後不再向下遞迴，候選上限 50 筆並回報 `truncated` 布林值。完成時掃描結果保證彼此不重疊。驗證：於 Figma Desktop 建立一個標記 Ready for dev 且內含另一個同樣標記的 Frame 的 Section，掃描後候選清單僅含外層 Section。
- [x] 2.2 依「Ready for dev 狀態以防禦性讀取取得」，讓狀態讀取在屬性不存在或非物件時一律視為未標記而非拋出例外，且掃描結果為空時回覆成功與空候選清單。完成時掃描永不因節點型別缺少 Dev Mode 狀態屬性而失敗。驗證：以不含 Dev Mode 標記的頁面執行掃描，回覆為 `ok: true` 且候選數為 0。
- [x] 2.3 確認掃描不觸及目前頁面以外的頁面，不呼叫任何載入全部頁面的 API，維持 manifest 的 dynamic-page 存取模式不變。驗證：檢視 main.js 不含 `loadAllPagesAsync` 字樣，且 `design-automation-hub-install/template/figma/design-automation-hub/manifest.json` 的 `documentAccess` 仍為 `dynamic-page`。

## 3. UI 批次狀態與呈現

- [x] 3.1 依 design 的「訊息契約（UI 與沙箱之間）」，將 UI 的整理工作階段狀態從單一 capture 與單一 task 改為 captures 陣列、tasks 陣列與 activeTaskId，並改為送出 `capture-cleanup-scopes`、接收 `cleanup-scopes-result`。完成時 UI 顯示這批範圍的名稱與圖層數。驗證：手動選取兩個不重疊 Section 後，整理設計稿頁面同時列出兩個範圍摘要。
- [x] 3.2 實作 "Batch capture creates one automation task per scope and preserves per-scope apply safety" 的建立行為：開始分析時對每個範圍各送出一次既有的 `POST /v1/automation/tasks`，每次請求只帶一個範圍與該範圍的 `inputSnapshotHash`，冪等鍵維持既有格式以確保逐範圍唯一。完成時三個範圍產生三筆任務。驗證：以三個範圍執行一次分析，於 Coordinator 任務清單確認出現三筆 `figma-cleanup` 任務且 `scopeNodeId` 互不相同。
- [x] 3.3 實作單筆建立失敗的處理行為：已成功建立的任務保留於清單，失敗範圍呈現為可重試，且不回捲任何已建立的任務。驗證：手動使 Coordinator 對第二筆請求回傳錯誤，確認第一與第三筆任務仍在清單中且第二筆顯示可重試。
- [x] 3.4 依「批次清單與單筆詳情分層呈現」，新增批次清單視圖顯示每筆的範圍名稱與任務狀態（沿用既有 `taskStatus*` 文案），點入後進入既有的整理提案、勾選、確認、套用畫面；批次只有一筆時直接進入詳情視圖。完成時既有單筆流程的互動路徑不變。驗證：分別以一個範圍與三個範圍執行，確認前者不出現中間清單、後者出現清單且可切入任一筆。
- [x] 3.5 確認套用仍為逐範圍的人工確認動作：套用前重新驗證該範圍的快照雜湊，且單一確認不得同時套用多個範圍。完成時提案、確認、套用三個算繪函式沒有行為性修改。驗證：以兩筆提案就緒的任務，套用第一筆後確認第二筆範圍的畫布內容未被修改。
- [x] 3.6 新增批次清單與 Ready for dev 候選清單所需的 `COPY` 文案（含空候選、重疊拒絕、批次上限、可重試四種提示），維持專案中性用語且不含專案名稱。驗證：執行範本檢查後既有的專案中性文案斷言與零修改承諾文案斷言仍通過。

## 4. 檢查與範本一致性

- [x] 4.1 依 design 的「驗收條件」，於 `design-automation-hub-install/scripts/check-design-automation-hub-install.mjs` 的 plugin 範本檢查新增斷言：沙箱程式碼不再含單一選取守門條件、含批次上限常數與最外層命中即停止遞迴的掃描邏輯，UI 含批次清單與 Ready for dev 候選的新增文案。驗證：執行 `node design-automation-hub-install/scripts/check-design-automation-hub-install.mjs --template` 通過且新斷言有 `record` 記錄。
- [x] 4.2 確認 main.js 維持 ES2018 語法（不得出現箭頭函式、選擇性串連、空值合併、私有欄位、動態匯入），且首頁入口仍硬性截斷為三個。驗證：執行範本檢查，既有的 `figma-main-es2018` 與 `plugin-three-entry-limit` 兩項斷言通過。
- [x] 4.3 重新產生範本清單，使 `design-automation-hub-install/template/TEMPLATE_MANIFEST.json` 中 main.js 與 ui.html 的雜湊與長度符合實際檔案。驗證：執行 `node design-automation-hub-install/scripts/build-template-manifest.mjs` 後再執行範本檢查，範本驗證無 drift 錯誤。
- [x] 4.4 依 design 的「範圍邊界」複查本次差異：確認 `design-automation-hub-install/template/scripts/design-automation-hub/` 之下的 Coordinator 檔案、companion skill 檔案、Plugin manifest 的權限與網域設定皆未被修改。驗證：檢視本次變更的檔案清單僅含 main.js、ui.html、TEMPLATE_MANIFEST.json 與檢查腳本四個檔案。
