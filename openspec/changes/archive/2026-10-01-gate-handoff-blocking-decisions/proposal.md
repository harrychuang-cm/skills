## Why

接收端的工程團隊回報：下游專案 ds-lab 的一份原型交接文件在 Review Status 為 confirmed 並定版時，仍留著三條「🚧 擋開工」決策，工程 PRD 只好自行作答，其中兩處答得與設計相反。ds-lab 專案已在自己的 skill 副本補上閘門並驗證過，但正本沒有：新專案從正本安裝 skill 得不到這道保護，之後若從正本整包同步，ds-lab 的閘門也會被蓋掉。同一輪還發現已蓋章的 docs/flow.json 帶著流程原始檔早已移除的畫面，現有檢查不會發現。

## What Changes

- 交接驗證（validate_prototype.py 帶 handoff-ready 旗標）新增擋開工決策閘門：
  - 〈Open Product Decisions〉的擋開工小節仍有編號項目時失敗，並列出編號。
  - 文件提到擋開工、卻解析不出清單（例如只寫在條列的粗體字裡）時失敗，並說明正確格式。
  - 完全沒有擋開工小節時只警告，舊文件不會因此失敗；strict-style 旗標下為錯誤。
  - 不帶 handoff-ready 旗標時不檢查，草稿可以保留未解的擋開工項目。
  - 解析規則與接收端工程 repo 的 PRD lint 相同，以同一張案例表為準。
- 交接驗證新增 flow 載體新鮮度檢查：docs/flow.json 存在、且與流程原始檔重新匯出的結果不同時失敗。
- 範本的〈Open Product Decisions〉改成兩個小節並存（使用者 2026-10-01 裁定「清單＋表格並存」）：
  - 「🚧 擋開工」小節：編號清單，或只寫「無」。只放「答案出來前，任何實作都不能開始」的決策。
  - 「不擋開工」小節：沿用正本既有的決策表格（Decision／Status／Scope and affected behavior／Source／Owner／Replacement）與「未定案只限縮受影響的行為，其餘照常進行」的原則。
- 參考文件補上接收端消費契約（Receiver Consumption Contract，源自 ds-lab 專案先前的整理）：接收端實際讀哪些項目、各自要寫成什麼格式；補齊 Required Sections 漏列的 Scope Classification 與 Do Not Rebuild；PRD 結構新增 Existing Surfaces 與 New Surfaces。
- SKILL.md、handoff-authority、pipeline-stations、prototype-standard、README 與使用指南同步說明新閘門。

## Capabilities

### New Capabilities

- `handoff-blocking-decisions`: 擋開工決策的格式、它與決策表格的並存方式、交接驗證的閘門行為，以及接收端消費契約的文件化。

### Modified Capabilities

- `flow-codegen`: 新增一條需求——交接驗證時 docs/flow.json 必須與流程原始檔重新匯出的結果一致。

## Impact

- Affected specs: 新增 handoff-blocking-decisions；flow-codegen 新增一條需求。
- Affected code:
  - storybook-product-prototype/scripts/validate_prototype.py
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - storybook-product-prototype/assets/prototype-template/docs/PRODUCTION_HANDOFF.md
  - storybook-product-prototype/assets/prototype-template/docs/PRD.md
  - storybook-product-prototype/references/production-handoff.md
  - storybook-product-prototype/references/handoff-authority.md
  - storybook-product-prototype/references/prd-workshop.md
  - storybook-product-prototype/references/pipeline-stations.md
  - storybook-product-prototype/references/prototype-standard.md
  - storybook-product-prototype/SKILL.md
  - README.md
  - docs/skills-usage.md
- 行為影響：已經 confirmed、但擋開工小節仍有編號項目的既有交接文件，下次執行交接驗證會失敗——這正是要擋下的狀態。沒有擋開工小節的舊文件只多一則警告。已匯出 docs/flow.json、之後又改過流程原始檔的原型，交接驗證會要求重新匯出；用舊版 export_flow.py 匯出的 docs/flow.json，即使流程原始檔沒動，也會因為輸出格式不同而需要重新匯出。
- 相依：無新增，仍只使用 Python 標準函式庫。
