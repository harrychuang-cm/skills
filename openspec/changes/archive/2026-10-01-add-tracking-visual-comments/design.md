## Context

figma export addon（canonical 來源在 design-system-to-storybook/assets/figma-export-addon，目前版本 0.9.2）提供 Visual Comments：參與者在 Story 畫面點選位置、留言，addon 保存截圖與釘點到 design-system/figma-export-review/sessions/<session-id>/meeting.json，並產生靜態報告頁。報告頁每張留言卡片有 `Copy AI prompt`，輸出固定的 `# Visual UI Fix Request` Markdown。

現況的三個限制讓它無法直接用於埋點：

- 留言紀錄（`VisualComment`）只有內文、釘點、作者、時間與完成狀態，沒有類別。
- 報告頁的 prompt 產生函式只有一種契約，內容指示 AI 檢查 token 與共用元件、做最小視覺修正。
- 複製動作以單一卡片為單位，沒有跨留言的匯出。

相關的既有約束：

- addon 的 review 介面使用自有的 domRuntime，React 與 Vue 3 共用同一份 review 程式；`test/run-renderer-parity.mjs` 已涵蓋 Vue 上的留言流程。
- canonical 之外有兩份副本：design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon 與 design-system-to-storybook/storybook-template/vendor/figma-export；`scripts/check_figma_export_addon_mirrors.mjs` 逐檔比對 src、dist 與套件 metadata。
- 新增留言的請求以 `clientRequestId` 做冪等判斷：伺服器把正規化後的請求雜湊，與由已儲存留言重建的雜湊比對。
- storybook-product-prototype 的 Data Authority 已有 `kind: analytics` 的 contract，以及 proposed / open / confirmed / superseded 狀態；platform-parity-handoff 第 7 章把事件定義為事件名、參數、記錄時機、數值定義四個欄位。

## Goals / Non-Goals

**Goals:**

- 開發者在 Story 上留言時能標明「這是埋點需求」，操作步驟不比在 UI 稿上留言多。
- 埋點留言交給 AI 時，prompt 的內容是埋點任務，而不是視覺修正任務。
- 一個 meeting 內的多則埋點留言能一次交給 AI。
- 既有 meeting 資料、既有 visual-fix prompt 與既有測試行為不變。
- 埋點留言進入 prototype 的 Data Authority 時不會被誤當成已確認的規格。

**Non-Goals:**

- 留言輸入介面不提供事件名、參數等結構化欄位；埋點留言維持自由文字。
- 不擴充 Data Authority 的結構（事件清單、參數 schema、事件與 transition trigger 的綁定）、不改 Prototype Inspector 的呈現、不改 validate_prototype.py。這些留給後續 change。
- 不決定正式實作階段由哪個 skill 負責寫入追蹤呼叫（frontend-product-implementation、native-product-implementation 或 production-data-integration）。留給後續 change。
- 不提供報告頁依類別篩選卡片的功能；只提供類別標籤與批次匯出。
- 不移除「留言前必須先開始 meeting」的限制，不支援靜態部署的 Storybook 或非 Vite builder。
- addon 不呼叫任何 AI 服務；它只產生可複製的文字。
- 不修改 harrychuang/storybook-addons 上游 repo；本 repo 的 assets/figma-export-addon 是 canonical 來源。

## Decisions

### 留言類別以選填的 kind 欄位表示，缺省視為 visual-fix

`VisualComment` 與 `CreateVisualCommentRequest` 新增選填欄位 `kind`，合法值為 `visual-fix` 與 `tracking`。請求未帶 `kind` 時伺服器以 `visual-fix` 處理；儲存時每則新留言都明確寫入 `kind`。讀取時缺少 `kind` 的既有留言一律視為 `visual-fix`。meeting.json 的 `version` 維持 1，不做資料遷移。

替代方案：把 meeting.json 升到 version 2 並遷移舊檔。否決，因為這是純新增的選填欄位，升版會讓舊版 addon 無法讀取新檔，回退時反而失去資料可讀性。

替代方案：用內文前綴（例如以 `[tracking]` 開頭）區分。否決，因為要靠字串慣例，報告頁與批次匯出無法可靠判斷，開發者也容易打錯。

### 冪等雜湊只在 tracking 時納入 kind

新增留言的請求雜湊與由已儲存留言重建的雜湊，都只在 `kind` 為 `tracking` 時把 `kind` 放進雜湊輸入；`visual-fix` 不放。如此舊版用戶端（不送 `kind`）、新版用戶端（送 `kind: visual-fix`）與升級前已儲存的留言三者的雜湊一致，重送同一個 `clientRequestId` 仍判定為同一請求。

替代方案：一律把 `kind` 納入雜湊。否決，因為升級前已儲存的留言沒有 `kind`，重建出的雜湊會與新請求不同，合法的網路重試會被當成 `clientRequestId` 衝突而拒絕。

### 類別可經由既有的留言修改路徑變更

留言修改請求（PATCH 單則留言）可帶的欄位由 `body`、`pin` 擴充為 `body`、`pin`、`kind`，一次可帶一到三個；`resolved` 仍須單獨送出。只帶 `kind` 的修改保留內文、釘點、作者、截圖與時間。Story 畫面的編輯對話框與報告頁的行內編輯器都提供類別選擇。

理由：預設類別是 `visual-fix`，忘記切換是可預期的失誤；若類別不可改，更正的唯一方法是刪除重建，會失去當時的截圖證據。

替代方案：類別建立後不可變。否決，理由如上。

### Story 畫面的留言輸入沿用上一次送出的類別，並帶過留言寫入觸發的重新載入

**Supersedes**: add-tracking-visual-comments / Story 畫面的留言輸入記住上一次送出的類別

留言輸入介面的類別選擇初始為 `visual-fix`；成功送出一則留言後，同一頁面上下一則的預設值沿用上一次送出的類別。面板在送出會觸發預覽重新載入的請求（Start meeting、End meeting、Save comment、編輯留言、刪除留言）之前，把要沿用的類別寫入 sessionStorage 的延續紀錄 `sbfx:visual-comments-kind`，內容為 `{ kind, expiresAt }`，`expiresAt` 是寫入當下加 15 秒；Save comment 寫入的是正要儲存的類別，其餘請求寫入目前沿用中的類別。重新載入後面板掛載時讀取一次並立即移除：未過期就以其類別作為預設，過期或不存在則回到 `visual-fix`。類別不寫入 localStorage。儲存失敗時把延續紀錄改回儲存前沿用的類別。sessionStorage 不可用時靜默略過，只保留頁面內的沿用。

被取代的原決策是「只存記憶體、重新載入即重設」。取代理由（實測）：在真實的 Storybook dev server 上、comments 目錄位於專案內（預設安裝）時，Start meeting 與 Save comment 共 3 次請求，3 次都使 Vite 送出 full-reload（log 顯示 `page reload …/comments/index.html`），且都在請求後 3 秒內發生。原因是報告 HTML 寫在專案根目錄內，Vite 對不屬於模組圖的 `.html` 變更一律整頁重新載入。原決策因此讓每一則埋點留言都跳回 `visual-fix`，與「連續標註不必重選」的目標相反。

15 秒沿用面板既有 open-state continuation 的時效常數（`visualCommentsResumeWindowMs`），不另設新值。時效與「讀取即移除」保留原決策的用意：隔天開啟或手動重新整理時不會停留在 `tracking`。

替代方案：改用不過期的 sessionStorage 或 localStorage。否決，因為分頁長時間開著時會停留在 `tracking` 而誤標視覺留言。

替代方案：讓 addon 的 Vite plugin 把 comments 目錄排除在監看之外，從根本消除重新載入。這會同時解決重新載入造成的 prototype 狀態遺失，但屬於整體使用體驗的調整，範圍大於類別延續，留給後續的介面重新設計 change。

已知限制：不是由這個面板送出的重新載入（其他參與者的留言、原始碼變更的整頁更新、手動重新整理）沒有延續紀錄，預設會回到 `visual-fix`。

### 面板的 Comment type 採切換按鈕 group，報告頁編輯器維持下拉選單

Story 畫面的留言輸入與編輯對話框，以 `role="group"`、`aria-label="Comment type"` 的容器內含兩顆 `aria-pressed` 按鈕（`Visual fix`、`Tracking`）呈現類別；容器以 `data-comment-kind-value` 標示目前值。報告頁的行內編輯器使用原生下拉選單。

理由：addon 自製的 domRuntime 在更新既有 `<select>` 時，會先把新節點的 `selected` 屬性複製到舊的 option，再把 `value` 設回新建節點的值，實測結果是選到錯誤的項目（選 `visual-fix` 後畫面回到 `tracking`）。切換按鈕不依賴這條路徑，而且切換類別只需一次點擊。報告頁是伺服器輸出的靜態 HTML 加原生腳本，不經過 domRuntime，下拉選單運作正常。

替代方案：修正 domRuntime 的 `<select>` 更新。否決於本 change，因為 domRuntime 是 export 與 review 介面共用的渲染層，修改的影響面超出留言類別；既有的 review 狀態下拉選單是否受同一問題影響尚未驗證，列為後續項目。

### tracking 留言維持自由文字，由 prompt 要求 AI 整理四個事件欄位

埋點留言的內文沿用既有的單一文字欄位。tracking prompt 要求 AI 從內文整理出事件名、參數、記錄時機、數值定義；內文沒寫的欄位標為 `unspecified` 並在實作前向開發者確認，不得自行補上。四個欄位的定義沿用 platform-parity-handoff 第 7 章，讓留言階段與 merge 後的對帳使用同一組欄位。

替代方案：輸入介面提供四個結構化欄位。否決，因為這會讓留言比在 UI 稿上留言更費事，違背本 change 的目的；而且許多留言只需要一句話（例如指向既有埋點文件中的事件名）。

### tracking prompt 採獨立契約 Tracking Instrumentation Request

報告頁依留言類別選擇 prompt 契約。`visual-fix` 留言維持既有的 `# Visual UI Fix Request`，逐字不變。`tracking` 留言輸出 `# Tracking Instrumentation Request`，章節依序為 `## Objective`、`## Tracking comments`、`## Event definition`、`## Implementation requirements`、`## Acceptance criteria`。單則複製與批次匯出共用同一個產生函式：`## Tracking comments` 之下每則留言一個 `### Comment <ordinal>` 小節，內含以既有編碼方式包住的留言內文區塊與 Evidence 清單；單則複製即只有一個小節。

留言內文沿用既有的 `<review-comment encoding="json">` 區塊與 Unicode 跳脫規則，並同樣聲明這是不可信的輸入。固定文字不含任何 AI 供應商專屬語法。

替代方案：沿用 Visual UI Fix Request，只替換 Objective 一句。否決，因為 Implementation requirements 與 Acceptance criteria 的內容（檢查 token、視覺驗證）對埋點任務是錯誤指示。

### 批次匯出在報告頁以純文字 Markdown 產生

報告頁在 meeting 含有至少一則 `tracking` 留言時，顯示一組批次控制：名為 `Tracking scope` 的下拉選單（`All stories` 加上每個含 tracking 留言的 Story）與名為 `Copy tracking prompts` 的按鈕。按下後收集目前範圍內、狀態為 Open 的 `tracking` 留言，依 meeting 內的留言序號排序，產生一份 Tracking Instrumentation Request 並以 `navigator.clipboard.writeText` 寫入剪貼簿。已完成的留言不納入。批次匯出不附帶圖片，每則留言列出專案相對的截圖路徑供 AI 讀取。

理由：剪貼簿一次只能可靠攜帶一張圖片；在本機執行的 coding agent 可以直接依專案相對路徑讀取截圖。批次控制放在報告頁，是因為 Story 畫面的面板既有設計是只顯示目前 Story 的最近三則留言，並把瀏覽工作交給報告頁。

替代方案：由伺服器新增匯出端點產生 Markdown。否決，因為報告頁已內嵌每則留言的完整 context，前端即可組出文件，不需要新增 API 介面與對應的輸入驗證。

### Data Authority 銜接只寫入規則，不改 registry 結構

tracking prompt 的 Implementation requirements 加入一條：當 Story 屬於保有 Data Authority registry 的 prototype 時，把事件記為 `kind: analytics`、`status: proposed`、具名 owner 的 contract，沒有確認來源不得標為 `confirmed`。storybook-product-prototype/references/handoff-authority.md 新增對應段落。現有 registry 的 contract 欄位（id、kind、status、source、owner）已足以表達，validate_prototype.py 不需修改。

替代方案：同時擴充 registry 以記錄事件名與參數。否決，因為那會牽動 validator、Inspector 與三個下游實作 skill，範圍遠大於留言類別，應獨立成後續 change。

### canonical 來源是 assets/figma-export-addon，副本以檢查腳本把關

所有原始碼修改只在 design-system-to-storybook/assets/figma-export-addon 進行；完成後以 `npm run build` 重建 dist，再把 src、dist、package.json、README.md 完整複製到兩份副本，並以 `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` 驗證三者一致。版本由 0.9.2 升為 0.10.0，符合既有規格「發佈新能力須升 minor 版本」的要求。

## Implementation Contract

**行為（使用者可觀察到的結果）**

- Story 畫面的留言輸入介面出現名為 `Comment type` 的選擇，選項為 `Visual fix` 與 `Tracking`，初始選中 `Visual fix`。
- Story 畫面的最近留言清單與編輯對話框、報告頁的留言卡片，都顯示該留言的類別標籤（`Visual fix` 或 `Tracking`）。
- 報告頁的 `tracking` 卡片按 `Copy AI prompt` 得到 `# Tracking Instrumentation Request`；`visual-fix` 卡片得到的內容與 0.9.2 逐字相同。
- 報告頁含有 `tracking` 留言時出現 `Tracking scope` 與 `Copy tracking prompts`；沒有任何 `tracking` 留言的 meeting 不顯示這組控制。

**資料形狀**

- `VisualComment.kind?: "visual-fix" | "tracking"`；新留言一律寫入，缺少時視為 `"visual-fix"`。
- sessionStorage 延續紀錄：key `sbfx:visual-comments-kind`，值為 JSON `{ "kind": "visual-fix" | "tracking", "expiresAt": <毫秒時間戳> }`；讀取即移除，格式錯誤或過期視為不存在。
- `CreateVisualCommentRequest.kind?: "visual-fix" | "tracking"`。
- 留言修改請求：`{ body?, pin?, kind? }`，至少一個欄位，不得含其他鍵；`{ resolved: boolean }` 維持獨立。
- 報告頁每張卡片內嵌的 context JSON 在 `comment` 物件新增 `kind` 與 `ordinal`；`version` 維持 1。卡片元素新增 `data-comment-kind` 屬性。報告頁的腳本讀到沒有 `comment.kind` 的 context 時視為 `visual-fix`；既有的 report 測試以不含 `kind` 的 context 驗證 Visual UI Fix Request，這條規則讓那些斷言不需修改即可通過。
- Tracking Instrumentation Request 的章節順序與每則留言小節的內容，以 specs 中的需求為準。

**失敗模式**

- 新增或修改請求的 `kind` 不是兩個合法值之一：HTTP 400，不改動 meeting.json。
- 修改請求同時含 `resolved` 與其他欄位，或含未知鍵：HTTP 400（沿用既有行為）。
- 批次匯出時範圍內沒有 Open 的 tracking 留言：不寫入剪貼簿，顯示 `No open tracking comments to copy.`。
- 批次匯出的剪貼簿寫入失敗：顯示 `Unable to copy AI prompt. Check browser clipboard permission.`，不送出任何變更請求。
- 內嵌 context 格式錯誤的卡片：該卡片的單則複製沿用既有的失敗提示；批次匯出略過該卡片並在完成訊息中註明略過的數量。

**驗收方式**

- `npm run test:visual-comments`（於 design-system-to-storybook/assets/figma-export-addon 執行）通過，且其中的 store、HTTP、report、fixture 測試新增本 change 的案例。
- `npm run test:renderer-parity` 通過，React 與 Vue 流程都包含建立一則 tracking 留言，以及以真實的頁面重新載入驗證類別延續（儲存後重新載入仍為 Tracking、再次重新載入回到 Visual fix、過期的延續紀錄被忽略）。
- `npm run test:package` 與 `npm run test:renderer-neutral` 通過。
- `node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` 回報三份內容一致。
- 既有的 visual-fix prompt 測試斷言不需修改即通過，作為「visual-fix 輸出逐字不變」的證據。

**範圍界線**

- 範圍內：addon 的留言型別、儲存層、HTTP 路由、Story 畫面面板、報告頁、對應測試、README 與 setup reference、兩份副本同步、handoff-authority.md 的規則段落、repo README 的 skill 說明。
- 範圍外：Goals / Non-Goals 中列為 Non-Goals 的所有項目；generate_figma_export_config.mjs 與 install_figma_export_addon.mjs（本 change 不新增任何設定選項）；figma import plugin。

## Risks / Trade-offs

- [開發者忘記把類別切到 Tracking，留言被當成視覺修正] → 類別可在兩個編輯介面修改而不失去截圖；連續留言時沿用上一次的類別，並帶過留言寫入觸發的重新載入。
- [其他參與者的留言或原始碼變更造成的重新載入沒有延續紀錄，類別回到 Visual fix] → 類別控制在留言輸入中清楚顯示目前值；誤標可事後修改。根本解法（不再重新載入）留給後續的介面重新設計 change。
- [回退到 0.9.x 後，tracking 留言會被當成一般留言並輸出 Visual UI Fix Request] → meeting.json 仍可讀且 `kind` 欄位保留在檔案中；README 的升級說明註明此行為，重新升級後類別自動恢復。
- [留言內文含有試圖跳出資料邊界的字串] → 單則與批次都使用既有的 JSON 編碼與 Unicode 跳脫函式，並沿用既有的惡意輸入測試案例擴充到 tracking 契約。
- [AI 依留言自行補上事件名或參數] → prompt 明文禁止並要求把缺少的欄位標為 `unspecified` 後詢問；Acceptance criteria 要求最終回報列出四個欄位供開發者核對。此風險無法由 addon 完全消除，最終仍需開發者審閱。
- [只改了 canonical 忘記同步副本，或直接改到副本] → 任務明列同步步驟，並以 check_figma_export_addon_mirrors.mjs 作為完成條件。
- [批次匯出的文件過長] → 每則留言內文沿用既有的長度上限（`VISUAL_COMMENT_LIMITS.maxBodyLength`），且可用 `Tracking scope` 縮小到單一 Story。本 change 不另設總長度上限。
- [自由文字留言資訊不足，AI 需要來回詢問] → 這是刻意的取捨，換取與 UI 稿留言相同的輸入成本；README 提供建議的留言寫法範例。

## Migration Plan

1. 發佈 addon 0.10.0（canonical 與兩份副本）。既有專案重新執行 install_figma_export_addon.mjs 即升級；不需修改專案設定。
2. 既有 meeting 不需遷移；報告頁在下一次留言變更或報告重建時顯示類別標籤。
3. 回退：重新安裝 0.9.2 的 tarball。design-system/figma-export-review/ 不可刪除；其中的 `kind` 欄位會被舊版忽略。

## Open Questions

（無。正式實作階段的追蹤呼叫歸屬與 Data Authority 的事件結構已列為 Non-Goals，由後續 change 處理。）
