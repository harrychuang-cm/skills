## Context

**正本現況（storybook-product-prototype）**

- 〈Open Product Decisions〉是一張決策表格（Decision／Status／Scope and affected behavior／Source／Owner／Replacement），Status 為 proposed、open、confirmed、superseded。規格 prototype-data-authority 的 Decision Review 需求規定：未知事項要寫明受影響的行為與 owner，不相關的已確認工作繼續進行。
- validate_prototype.py 帶 handoff-ready 旗標時檢查 Review Status、Semantic Review、Data Authority、文件與程式的一致性等，但不讀〈Open Product Decisions〉的內容。
- 交接快照（HANDOFF_MANIFEST.json 第 2 版）會記錄 docs/flow.json 的雜湊，用來偵測蓋章之後的改動；蓋章當下 docs/flow.json 是否已經過期，沒有檢查。
- references/production-handoff.md 的 Required Sections 清單漏列 Scope Classification 與 Do Not Rebuild（範本與驗證器都已經有這兩節）；沒有說明接收端實際讀什麼。

**ds-lab 現況**

- 2026-10-01 的變更 gate-handoff-blocking-decisions 已在 ds-lab 的三份 skill 副本落地並歸檔：擋開工決策閘門、flow 載體新鮮度檢查、範本與參考文件。同一批副本在 2026-09-21 已先補上 Receiver Consumption Contract。這些都沒有進正本。
- ds-lab 的副本在其他方面落後正本（沒有 Data Authority、Semantic Review、第 2 版快照），所以不能反過來用 ds-lab 的檔案覆蓋正本，只能把閘門的邏輯與文字移植過來。

**接收端 lint 的行為（接收端工程 repo 的 PRD lint，2026-10-01 的版本）**

- 依工程 PRD 記下的 commit 讀設計 repo 的 PRODUCTION_HANDOFF.md：Review Status 的 Status 必須是 confirmed；擋開工小節的每個編號都要在工程 PRD 的對應表有決定。
- 擋開工小節的認定：標題含「擋開工」且前面不是否定詞（不、不會、沒有、無）的最深一層小節；剔除其下標題為否定說法的子節；數行首的「N.」與「#… N.」子標題；code fence 內不算。小節內文唯一一行是「無」（或 N/A、None）代表明確沒有。
- 〈Open Product Decisions〉提到擋開工、卻沒有可解析的清單也沒有宣告「無」時報錯。
- 另外要求工程 PRD 連到 PRD、UI_SPEC、FLOW_SPEC、ACCEPTANCE、PRODUCTION_HANDOFF 五份文件並釘在同一個 commit；其餘內容由撰寫工程 PRD 的人閱讀引用，lint 不解析。

**約束**

- 驗證器只用 Python 標準函式庫；React 與 Vue 兩種 scaffold 的驗證輸出必須等價（既有測試會比對）。
- 另一個工作階段正在正本的 main 上進行不相干的變更，所以本變更在隔離的 clone 上以分支進行，完成後只把分支放回正本，不合併、不推送。

## Goals / Non-Goals

**Goals:**

- 交接驗證擋下「擋開工決策還沒清空就蓋章」。
- 擋開工清單與既有決策表格並存，規則不互相矛盾。
- 解析結果與接收端 lint、ds-lab 的實作逐案相同。
- docs/flow.json 過期時交接驗證失敗。
- 範本、參考文件、SKILL.md 與使用說明對新閘門的描述一致。

**Non-Goals:**

- 不改接收端 skill（frontend-product-implementation、native-product-implementation）的 ingestion 規則；它們是否也要在讀取時檢查擋開工小節，留待後續變更。
- 不把 ds-lab 的 repo 層 node 檢查（check-prototype-handoffs、export-prototype-fixtures）搬進正本。
- 不同步 ds-lab 的 skill 副本與 ~/.claude/skills 的安裝副本；不合併進 main、不推送到遠端。
- 不檢查決策表格的欄位內容（Status 的值、Owner 是否填寫）；那屬於 Semantic Review。
- 不修改 Decision Review 既有需求的文字，也不改交接快照的格式。
- 不對 PRD 的 Existing Surfaces、New Surfaces 加驗證；只更新範本與參考文件。

## Decisions

### 擋開工清單與決策表格並存

〈Open Product Decisions〉分成兩個小節：

- 「### 🚧 擋開工」：編號清單，每項寫決策、owner、哪些工作要等；沒有項目時整段只寫「無」。只放「答案出來前，任何實作都不能開始」的決策。
- 「### 不擋開工」：既有的決策表格與說明文字原樣移到這裡。只影響部分行為的未定案決策留在表格，寫明受影響的行為，其餘照常進行——Decision Review 的原則不變。

擋開工決策有了答案之後：在表格新增或更新一列（Status 為 confirmed，Source 填來源），並把清單的那一項拿掉；全部解決後清單改成「無」。

理由：接收端 lint 只認「標題＋編號清單」；表格是正本既有的模型，Semantic Review 與 handoff-authority 都以它為準。兩者描述的其實是同一批決策的兩個分類——「擋住全部」與「只擋住一部分」。

考慮過的替代方案：只留表格、加一欄「擋開工」（文件只有一種格式，但接收端 lint 讀不到表格，要工程端改 lint）；做成選用、預設不檢查（新原型容易忘了加，等於回到出事前的狀態）。使用者於 2026-10-01 選定並存。

### 閘門只在交接驗證時生效

- 不帶 handoff-ready 旗標：不檢查，草稿可以保留擋開工項目。
- 帶 handoff-ready 旗標：清單有編號項目 → error；提到擋開工卻解析不出 → error；完全沒有擋開工小節 → warning。

沒有小節只給 warning，是為了讓這份契約之前寫的交接文件繼續通過驗證；strict-style 旗標會把它升級成 error，行為與既有的新增章節檢查一致。

### 解析規則沿用接收端 lint 並共用案例表

- 新增 `extract_blocking_decisions(handoff_text)`，回傳 (numbers, declares_none, unparsable)；新增 `validate_blocking_decisions(handoff_text, errors, warnings, handoff_ready)`。名稱、回傳值與 ds-lab 的實作相同。
- fence 遮罩與小節擷取另立與接收端相同寫法的 helper（`_receiver_mask_fences`、`_receiver_section`），不重用既有的 `mask_code_fences` 與 `extract_doc_section`：既有 helper 會把 fence 標記行一併遮掉，而且只接受完全相同的標題文字；接收端保留標記行、以正規表示式比對標題。要逐案一致，就照接收端的寫法。
- 測試的案例表 `BLOCKING_DECISION_CASES`（8 個案例）與 ds-lab 逐字相同。接收端改規則時，三處（接收端 lint、本驗證器、ds-lab 的 repo 層檢查）要一起改；這一點寫進 references/production-handoff.md。

### 擋開工一詞只能出現在清單的標題

解析取「最深的含擋開工標題」，所以「### 已定案（原擋開工）」這類標題會被當成清單。參考文件明寫：除了「🚧 擋開工」與「不擋開工」兩個小節標題，其他標題不得含這三個字。

### flow 載體新鮮度在交接驗證時檢查

- 新增 `validate_flow_carrier(folder, files, errors)`：docs/flow.json 存在時，以 export_flow.py 的 `build_flow_document` 對流程原始檔重新產生一份，與檔案內容比對；不同 → error，並指示重新執行 export_flow.py（以及由它產生的 Swift、Kotlin 骨架）。
- docs/flow.json 不是合法 JSON → error。沒有 docs/flow.json 或找不到流程原始檔 → 不檢查。
- export_flow.py 匯入本驗證器，所以 `build_flow_document` 在函式內延後匯入，避免循環匯入。
- 只在帶 handoff-ready 旗標時執行。
- 錯誤訊息同時點出兩種原因：流程原始檔在匯出後改過，或檔案是舊版 export_flow.py 產生的。兩者的修法都是重新匯出。
- references/pipeline-stations.md 第 3 站的範例指令順序因此改成先匯出（export_prototype_contracts.py、export_flow.py）再執行交接驗證：新檢查要求驗證當下 docs/flow.json 已是最新，交接快照也才會記到匯出後的雜湊。

理由：交接快照的雜湊只能偵測蓋章之後的改動；蓋章當下就過期的載體會被原樣收進快照，native 實作照著它會做出流程早已拿掉的畫面。

### 接收端消費契約寫進參考文件

references/production-handoff.md 新增〈Receiver Consumption Contract〉，內容源自 ds-lab 專案先前的整理，並依正本現況與接收端 lint 的實際行為調整：

- 分清「lint 機器讀取」（Review Status、擋開工清單、五份文件的連結）與「撰寫工程 PRD 的人閱讀引用」（既有／新建畫面、使用者旅程、元件對照表、設計驗收）。
- 欄位名稱跟隨正本（Review Status 的 Scope、第 2 版快照、Semantic Review）。
- Required Sections 補上 Scope Classification 與 Do Not Rebuild，並各加一段說明。

### PRD 補上既有與新建畫面兩節

references/prd-workshop.md 的 PRD 結構與 PRD 範本新增 Existing Surfaces、New Surfaces 兩節；沒有內容時寫「無」，不省略標題。驗證器不強制這兩節，舊 PRD 不受影響。

## Implementation Contract

**交接驗證的行為（validate_prototype.py 帶 handoff-ready 旗標）**

| 文件狀態 | 結果 |
| --- | --- |
| 擋開工小節有編號項目 1、2、3 | 以非 0 結束；一則 error 指出 docs/PRODUCTION_HANDOFF.md、列出「1, 2, 3」，並說明：逐條與 owner 定案、把結論與來源記到決策表格、小節只留「無」 |
| 擋開工小節唯一一行內容是「無」 | 沒有擋開工相關的 error 或 warning |
| 〈Open Product Decisions〉提到擋開工，但沒有含擋開工的標題 | 以非 0 結束；一則 error 說明要用含擋開工的標題加編號清單（訊息含 numbered list 字樣），或寫「無」 |
| 完全沒提到擋開工 | 一則 warning，請作者補上小節並寫「無」 |
| docs/flow.json 與流程原始檔的重新匯出結果不同 | 以非 0 結束；一則 error 含「docs/flow.json is out of date」與流程原始檔的檔名 |
| docs/flow.json 不是合法 JSON | 以非 0 結束；一則 error 含「not valid JSON」 |
| 沒有 docs/flow.json | 不檢查、不輸出 |

不帶 handoff-ready 旗標時，以上狀態都不產生擋開工或 flow 載體的訊息。

**解析結果（extract_blocking_decisions）**

| 輸入 | numbers | declares_none | unparsable |
| --- | --- | --- | --- |
| 擋開工小節有 1.、2.、3.，其後的不擋開工小節有 4. | [1, 2, 3] | False | False |
| 擋開工小節唯一一行是「無」 | [] | True | False |
| 擋開工小節有一段 block quote，之後一行「無」 | [] | True | False |
| 只在條列的粗體字提到擋開工，沒有這種標題 | [] | False | True |
| 完全沒提到擋開工 | [] | False | False |
| 擋開工小節有 1.，其下「不會擋開工的備註」子節有 9. | [1] | False | False |
| code fence 裡有擋開工標題與 1.，fence 外沒有 | [] | False | False |
| 擋開工小節底下是編號子標題「#### 1. 縮放機制」 | [1] | False | False |

**範本（assets/prototype-template/docs/PRODUCTION_HANDOFF.md）**

- 〈Open Product Decisions〉依序為「### 🚧 擋開工」（一個編號的方括號占位項目，說明何時改成「無」）與「### 不擋開工」（既有決策表格與其後的說明文字）。
- 以 scaffold 產生的文件：`extract_blocking_decisions` 讀到 [1]；把占位清單換成「無」之後讀到 ([], True, False)，表格內容不會被算成擋開工項目。

**文件**

- references/production-handoff.md：Required Sections 含 Scope Classification 與 Do Not Rebuild；有〈Receiver Consumption Contract〉；〈Review Status〉說明蓋章還需要擋開工清空與 flow 載體為最新；〈Open Product Decisions〉說明兩個小節的分工、清單格式、「其他標題不得含擋開工」，以及三處解析共用案例表。
- references/handoff-authority.md 的〈Decisions And Unknowns〉說明擋住全部實作的決策放擋開工清單、其餘照既有規則。
- SKILL.md：第 7 步的規則、驗證指令的說明、Quality Bar 各有一條對應新閘門。
- references/pipeline-stations.md、references/prototype-standard.md、README.md、docs/skills-usage.md 提到交接驗證之處補上擋開工與 flow 載體。

**驗收方式**

- 在 repo 根目錄執行 python3 storybook-product-prototype/scripts/test_scaffold_validate.py 以 0 結束，摘要行含「blocking decisions, flow carrier」。
- 把 validate_docs 裡對 `validate_blocking_decisions` 的呼叫拿掉，同一指令以非 0 結束；把 main 裡對 `validate_flow_carrier` 的呼叫拿掉，同一指令以非 0 結束（各自驗證後還原）。
- 以接收端 lint 的實作對上表 8 個案例、ds-lab 兩個原型在定版當時與目前的交接文件各跑一次，結果與 `extract_blocking_decisions` 相同（一次性比對，記在 tasks 的驗收項）。

**範圍邊界**

- 在範圍內：proposal 的 Impact 所列檔案。
- 不在範圍內：見 Non-Goals。

## Risks / Trade-offs

- [三處解析實作（接收端 lint、本驗證器、ds-lab 的 repo 層檢查）可能各自漂移] → 共用同一張案例表；驗收時以接收端實作比對一次；參考文件點名三處要一起改。
- [英文範本裡出現中文標題] → 接收端 lint 只認「擋開工」這個字串，改成英文就讀不到；參考文件說明原因。
- [已經 confirmed、但仍列著擋開工項目的既有文件，下次交接驗證會失敗] → 這是要擋下的狀態；錯誤訊息直接說明怎麼修。
- [正本與 ds-lab 各有一份同名函式] → 這次以相同名稱、相同規則、相同案例表落地；ds-lab 日後從正本同步時以正本為準。
- [正本 main 上另一個工作階段可能改寫尚未推送的提交] → 把分支放回正本前先比對基底是否仍在 main 上；不在的話先在隔離 clone 內 rebase 並重跑測試。

## Migration Plan

1. 在隔離 clone 的分支完成實作、驗證、歸檔與 commit。
2. 把分支放回正本（只新增分支，不動工作樹與 main）。
3. 由使用者決定何時合併與推送；合併後另行更新 ~/.claude/skills 的安裝副本，並評估 ds-lab 副本的同步。

回復方式：不合併該分支即可；已合併時還原那幾筆提交，驗證器與範本回到現況。
