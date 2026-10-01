## 1. 驗證器的擋開工決策閘門

- [x] 1.1 實作 Requirement「Blocking decisions gate handoff readiness」的解析部分：依設計決策「解析規則沿用接收端 lint 並共用案例表」，在 storybook-product-prototype/scripts/validate_prototype.py 新增 `extract_blocking_decisions`，以及與接收端寫法相同的 `_receiver_mask_fences`、`_receiver_section`。完成時：對 design.md〈解析結果〉表列的 8 種輸入，回傳的 (numbers, declares_none, unparsable) 逐項相同。驗證：1.3 的案例表 `BLOCKING_DECISION_CASES` 全數通過。
- [x] 1.2 [after: 1.1] 依設計決策「閘門只在交接驗證時生效」新增 `validate_blocking_decisions(handoff_text, errors, warnings, handoff_ready)` 並接進 `validate_docs` 處理 PRODUCTION_HANDOFF.md 的分支。完成時：行為如 design.md〈交接驗證的行為〉表的前四列，不帶 handoff-ready 旗標時不輸出任何擋開工訊息，`--handoff-ready` 的說明文字提到擋開工決策。驗證：1.3 的測試；把 `validate_docs` 裡的呼叫暫時拿掉後 test_scaffold_validate.py 以非 0 結束，還原後以 0 結束。
- [x] 1.3 [after: 1.2] 在 storybook-product-prototype/scripts/test_scaffold_validate.py 新增與 ds-lab 逐字相同的案例表 `BLOCKING_DECISION_CASES` 與 `check_blocking_decisions`，並在 `check_handoff_contracts` 加入經由 `validate_docs` 的接線案例（帶旗標時回報編號、草稿不回報）。完成時：在 repo 根目錄執行 python3 storybook-product-prototype/scripts/test_scaffold_validate.py 以 0 結束。驗證：該指令的結束代碼。

## 2. flow 載體新鮮度

- [x] 2.1 [after: 1.3] 實作 Requirement「Exported flow carrier freshness」：依設計決策「flow 載體新鮮度在交接驗證時檢查」新增 `validate_flow_carrier(folder, files, errors)`（在函式內延後匯入 export_flow 的 `build_flow_document`），並在 `main` 的 handoff-ready 區塊呼叫；`--handoff-ready` 的說明文字提到 docs/flow.json。完成時：行為如 design.md〈交接驗證的行為〉表的後三列。驗證：2.2 的測試；把 `main` 裡的呼叫暫時拿掉後 test_scaffold_validate.py 以非 0 結束，還原後以 0 結束。
- [x] 2.2 [after: 2.1] 在 test_scaffold_validate.py 新增 `check_flow_carrier`：沒有 docs/flow.json 時不回報、剛匯出的通過、改掉一個 route id 後回報「docs/flow.json is out of date」、內容不是 JSON 時回報「not valid JSON」，並以子行程確認帶旗標時會印出過期訊息而草稿不會；摘要行改為含「blocking decisions, flow carrier」。驗證：python3 storybook-product-prototype/scripts/test_scaffold_validate.py 以 0 結束，且摘要行含該字樣。

## 3. 範本與參考文件

- [x] 3.1 [after: 2.2] 實作 Requirement「Blocking list coexists with the decision register」的範本部分：依設計決策「擋開工清單與決策表格並存」，把 storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md 的〈Open Product Decisions〉改成「### 🚧 擋開工」（一個編號的方括號占位項目）與「### 不擋開工」（既有決策表格與說明文字原樣保留）。完成時：scaffold 產生的交接文件被 `extract_blocking_decisions` 讀成 [1]；把占位清單換成「無」後讀成 ([], True, False)；決策表格位於「不擋開工」標題之下。驗證：在 test_scaffold_validate.py 新增以 scaffold 產物檢查這三點的案例，執行該測試以 0 結束。
- [x] 3.2 [after: 3.1] 完成 Requirement「Blocking list coexists with the decision register」的文件部分：storybook-product-prototype/references/production-handoff.md 的〈Open Product Decisions〉說明兩個小節的分工、清單格式、已回答的擋開工決策移入表格（Status 為 confirmed 並填 Source）、蓋章前清單要是「無」、三處解析共用案例表，並依設計決策「擋開工一詞只能出現在清單的標題」寫明其他標題不得含這三個字；〈Review Status〉補上蓋章還需要擋開工清空與 flow 載體為最新；references/handoff-authority.md 的〈Decisions And Unknowns〉補一段說明擋住全部實作的決策放進擋開工清單。驗證：在 test_scaffold_validate.py 新增案例，確認 references/production-handoff.md 的〈Open Product Decisions〉含「confirmed」移入表格的說明與「no other heading」的規則；執行該測試以 0 結束。
- [x] 3.3 [after: 3.2] 實作 Requirement「Receiver consumption contract is documented」：依設計決策「接收端消費契約寫進參考文件」，在 references/production-handoff.md 新增〈Receiver Consumption Contract〉（區分接收端 lint 解析的項目與撰寫工程 PRD 的人閱讀的項目），Required Sections 補上 Scope Classification 與 Do Not Rebuild 並各加一節說明；依設計決策「PRD 補上既有與新建畫面兩節」，在 references/prd-workshop.md 的 PRD 結構與 assets/prototype-template/docs/PRD.md 新增 Existing Surfaces、New Surfaces。驗證：在 test_scaffold_validate.py 新增案例——範本的每個二級標題都出現在 Required Sections 清單、契約一節同時標出 lint 解析與讀者閱讀兩類、scaffold 產生的 PRD.md 含這兩個標題；執行該測試以 0 結束。
- [x] 3.4 [after: 3.3] SKILL.md 與周邊說明對新閘門的描述一致：storybook-product-prototype/SKILL.md 第 7 步新增「蓋章前清空擋開工」與「照接收端消費契約的格式寫」兩條規則、驗證指令中 handoff-ready 的說明補上擋開工與 flow 載體、Quality Bar 新增一條；references/pipeline-stations.md 第 3 站的 Gate 與跨站規則（並把第 3 站範例指令的順序改成先匯出、再執行交接驗證，因為新檢查要求驗證當下 docs/flow.json 已是最新，快照也才會記到匯出後的雜湊）、references/prototype-standard.md 的檢查清單、README.md 的 storybook-product-prototype 第 5 點、docs/skills-usage.md 的交接定版段落各補一句。驗證：以搜尋確認這五個檔案都提到擋開工閘門；node scripts/test_install_agent_skills.mjs 與修改前一樣以 0 結束。

## 4. 驗收

- [x] 4.1 [after: 1.1] 三方解析比對：以接收端工程 repo 的 PRD lint 實作，對 8 個表列案例、ds-lab 兩個原型在定版當時與目前的交接文件各跑一次，結果與正本的 `extract_blocking_decisions` 相同。驗證：比對腳本輸出零差異（腳本放暫存區，不進 repo）。
- [x] 4.2 [after: 3.1] 端對端確認：以 scaffold_prototype.py 產生一個原型；不帶旗標驗證通過，輸出不含擋開工或 docs/flow.json 的訊息；帶 `--handoff-ready` 時輸出含「unresolved blocking (擋開工) decisions 1」；把清單換成「無」後同一指令的輸出不再含擋開工字樣；匯出 docs/flow.json 後改動流程原始檔，帶 `--handoff-ready` 的輸出含「docs/flow.json is out of date」。驗證：四個指令的輸出符合上述（在暫存資料夾執行）。
- [x] 4.3 [after: 3.4] 回歸：python3 storybook-product-prototype/scripts/test_scaffold_validate.py 以 0 結束（其中內建 React 與 Vue 驗證輸出等價的比對）；工作樹的變更只包含 proposal 的 Impact 所列檔案與本變更的 openspec 資料夾。驗證：指令輸出與變更檔案清單。
