## 1. 替換紀錄的資料通道

- [x] 1.1 依 design「決策一：以結構化替換紀錄取代純字串警告」、「決策三：嘗試過的 style 由解析路徑回傳，而非於警告處重建」與「可觀察行為」，完成 requirement「Font substitution is recorded and surfaced」的資料收集：在 `code.ts` 的匯入統計新增字型替換清單欄位，並讓字型解析路徑回傳本次嘗試過的全部 style 名稱（含 available-style 階段實際嘗試的 W-number style）給呼叫端；每個發生替換的文字節點寫入一筆含節點路徑、請求家族、請求字重、實際家族、實際 style 與嘗試 style 清單的紀錄，欄位缺漏以空值記錄且不得拋出例外。保留既有 `warnings` 字串輸出不變。以外掛目錄的 `npm run build` 通過型別檢查驗證。
- [x] 1.2 依 design「介面」與「失敗模式」，完成 requirement「Widespread font load failure is reported as an environment fault」的判定邏輯：在 `code.ts` 建立不依賴 Figma runtime API 的純函式，輸入為本次匯入的替換紀錄集合，輸出為是否判定環境異常與涉及的家族名稱清單；判定條件為兩個以上不同家族其所有 style 皆載入失敗，單一家族失敗不判定，且函式不得探測網路端點或拋出例外。以外掛目錄的 `npm run build` 通過型別檢查驗證。

## 2. 回報與顯示

- [x] 2.1 依 design 決策二：以「兩個以上不同家族全部載入失敗」判定環境異常，將 1.2 的判定接上匯入回報：判定成立時輸出「所有本機字型皆無法載入」的說明、涉及的家族名稱，以及重啟 Figma 或檢查字型存取權限的建議；判定不成立時維持既有的個別家族不可用訊息。以匯入回報在兩家族失敗時含環境異常判定、單一家族失敗時不含該判定驗證。
- [x] 2.2 依 design「決策四：UI 摘要顯示替換次數，不使用阻擋式提示」，在 `ui.html` 的摘要行顯示字型替換次數，與節點數、變數數同層級；替換次數為零時不顯示任何替換文字，且不得新增彈窗或阻擋流程。以摘要字串在零替換與四次替換兩種輸入下的輸出驗證。

## 3. 測試、建置與同步

- [x] 3.1 依 design「驗收」，在 `test/verify-pure-functions.cjs` 新增四組案例：零替換不判定環境異常、單一家族失敗不判定環境異常、兩個家族失敗判定環境異常且回傳兩個家族名稱、替換紀錄的嘗試 style 清單包含 available-style 階段嘗試的 W-number style；測試不得載入 Figma plugin runtime。以 `node test/verify-pure-functions.cjs` 全數通過驗證。
- [x] 3.2 依 design「Goals / Non-Goals」與「範圍邊界」，先遞增外掛 `package.json` 版本號再執行 `npm run build`，使 prebuild 的版本標記寫入 `code.ts` 與 `ui.html` 徽章並產生新的 `code.js`；同步更新 `test/verify-manifest.mjs` 內寫死的版本斷言；接著將 runtime 檔案 `code.js`、`ui.html`、`manifest.json`、`README.md` 同步至 `design-system-to-storybook/storybook-template/figma/storybook-code-to-design`，該鏡像不得放入 `code.ts`、`package.json`、測試或建置設定；不得變更字型解析邏輯、匯出端 addon 或 payload schema。以正本與鏡像四個 runtime 檔案的 md5 全數相同、且 `node test/verify-manifest.mjs`、`node test/verify-bridge-helpers.cjs` 通過驗證。
