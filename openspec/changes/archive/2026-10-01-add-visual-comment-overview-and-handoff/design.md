## Context

前一個 change `redesign-visual-comment-capture-flow` 完成後，留言由釘點旁的浮動卡片輸入，面板顯示目前 Story 的全部留言與類別篩選。本 change 處理留言「存好之後」的兩個環節：在 Story 上看得到已標註的位置，以及把埋點留言交給 AI。

以 addon 0.10.0 實測截圖確認的現況：

- 儲存留言後 Story 上沒有任何標記，已標註的位置只能從面板清單的文字或 Reports 頁的截圖回想。
- 埋點的批次複製（`Copy tracking prompts`）只在 Reports 頁，開發者必須離開 Story。
- Reports 頁的時間顯示為 `2026-10-01T05:36:43.790Z` 這類原始字串；每個擷取畫面是截圖在上、留言卡片在下，1280px 寬的視窗下一個擷取約佔 870px 高；擷取卡片、類別標籤、批次列都帶 1px 外框；Story 標題是整段加底線的連結。
- 報告頁的樣式沒有小於 12px 的字級。

相關約束：

- 報告頁是伺服器輸出的靜態 HTML，可離線開啟；互動來自一段帶 nonce 的內嵌腳本，CSP 禁止其他腳本來源。
- prompt 的格式是規格的一部分：視覺修正的輸出必須與既有版本逐字相同，埋點的輸出有固定章節。
- overview 回應的每則留言目前只有編號、截圖預覽與釘點，沒有擷取當時的 route／state。
- review 介面使用 addon 自有的 domRuntime，React 與 Vue 3 共用同一份程式。
- 留言釘點的位置是相對於擷取目標範圍的比例；擷取目標現在的大小或畫面狀態與留言當時不同時，同一比例會落在不同的元件上。

## Goals / Non-Goals

**Goals:**

- 面板展開時，開發者在 Story 上直接看到這個 Story 已標註的位置與編號。
- 不離開 Story 就能把埋點留言交給 AI，輸出與 Reports 頁相同。
- Reports 頁在一個螢幕內同時看到截圖與它的留言，時間可讀，可依類別與完成狀態篩選。
- prompt 只有一份實作。
- 報告頁與索引頁符合專案的視覺要求並由測試把關。

**Non-Goals:**

- 在 Story 上直接編輯或拖曳已存留言的釘點。編輯沿用既有的對話框。
- 重播留言當時的 prototype 狀態。畫面狀態不同時只是不顯示釘點。
- 釘點跟隨元件移動（以 DOM 選擇器定位）。釘點維持以比例定位。
- 更改 prompt 的內容或章節。
- 報告頁的留言生命週期動作（Copy AI prompt、Edit、Complete、Delete）的行為與排列。
- Export review 與 Figma export 工作區。

## Decisions

### 已存留言的釘點只在面板展開且開關開啟時顯示

釘點疊在 prototype 上會攔截底下元件的點擊。因此只有在面板展開、且面板上的 `Show pins` 開關為開（預設開）時才顯示；收合面板即全部隱藏。釘點套用面板目前的類別篩選。釘點與待存釘點一樣標記為不納入擷取。開關狀態只存在頁面記憶體。

替代方案：釘點永遠顯示。否決，因為面板收合代表使用者在操作 prototype，此時攔截點擊會造成困惑。

### 留言當時的畫面狀態與目前不同時不顯示釘點

擷取紀錄已保存 Story 的 routeId 與 stateId（由 prototype 根元素的 data 屬性取得）。overview 為每則留言新增衍生欄位 `state`（`{ routeId?, stateId? }`，不寫入 meeting.json）。面板讀取目前的 routeId 與 stateId：留言有記錄而且與目前值不同時，不顯示它的釘點，清單項目加註 `Captured in another state`；兩邊都沒有記錄時照常顯示。

理由：比例定位在不同畫面狀態下會指到錯的元件，顯示錯的位置比不顯示更糟。沒有 route／state 資訊的一般元件 Story 沒有判斷依據，照常顯示。

### 釘點以形狀與文字區分類別，不只靠顏色

Visual fix 的釘點是圓形，Tracking 的釘點是圓角方形；無障礙名稱為 `Comment <編號>, <類別>, <狀態>`。已完成的留言釘點改用次要底色。顏色沿用既有的不透明 token。

### 釘點與清單雙向對應，點釘點不觸發 prototype

點釘點：阻止事件傳到 prototype，在面板清單中把對應項目捲入可視範圍、標記 `aria-current="true"` 並移入焦點；每次點擊都會重新捲動與聚焦，包含該留言已被選取的情況。被選取留言的釘點帶「已選取」標記。游標移到或聚焦清單項目：對應的釘點加上「標示」狀態；標示與已選取是兩個獨立的標記，標示同一時間只會出現在一個釘點上（游標所在的項目優先，其次是有焦點的項目）。若目前的類別篩選把該留言濾掉，釘點本來就不顯示，不需處理。

焦點的標示以文件層級的 focusin／focusout 監聽、延後到事件結束後再讀取 `document.activeElement` 來更新。不直接在清單項目上綁定 focus 事件，是因為清單重繪時被移除的元素會觸發 focusout，在重繪途中更新狀態會讓 addon 的渲染層出錯。

### prompt 產生邏輯抽成單一模組，報告頁內嵌其原始碼、面板直接匯入

新增 src/visualCommentPrompt.ts，內含產生 Visual UI Fix Request 與 Tracking Instrumentation Request 的純函式：不引用模組外的任何識別字、不使用閉包變數。報告頁的內嵌腳本在產生 HTML 時以函式的原始碼字串嵌入；面板直接匯入同一模組。兩邊因此執行同一份程式。

替代方案：伺服器新增端點回傳 Markdown。否決，因為報告頁必須能離線使用，仍需要瀏覽器端的實作，結果還是兩份。

替代方案：面板的按鈕只開啟 Reports 頁。否決，因為使用者要的是不離開 Story。

風險在於打包工具改寫函式內容後，嵌入的原始碼是否仍可獨立執行；以測試比對面板與報告頁對同一份會議資料的輸出逐字相同來把關。

### 面板的複製以目前 Story 為預設範圍

面板的 `Copy tracking prompts` 複製目前 Story 在進行中會議裡未完成的埋點留言。會議內其他 Story 也有未完成的埋點留言時，旁邊多一個 `Copy all stories` 動作，複製整場會議的。兩者的回饋訊息與報告頁批次複製相同。整場會議的資料由面板讀取既有的會議端點取得；組出證據欄位所需的專案相對路徑由 overview 新增的 `activeProjectRelativeSessionPath` 提供（位於專案外時為 `null`）。面板的複製只寫入文字，不附圖片。

沒有任何埋點留言時不顯示這組動作。

### 面板展開時下方工作區保留的高度由 46% 調整為 38%

實作釘點與清單對應時量到：面板展開時 Figma export 工作區固定保留 `min(46vh, 420px)`，在 800px 高的視窗下留言清單的可視高度比一則留言還矮。把保留值改為 `min(38vh, 340px)`，清單在 860px 高的視窗下約可顯示兩則。工作區內容原本就可在自己的範圍內捲動，兩個介面仍不重疊。這只改一個共用的 CSS 變數，不涉及工作區的版面或樣式。

### 報告頁寬螢幕並排、頂部工具列固定

```
┌ Notes 2026-10-01 · Active · 3 captures · 5 comments ────────────────┐
│ [All 5][Visual fix 2][Tracking 3]  ☐ Hide completed                 │
│ Tracking scope [All stories ▾]  [Copy tracking prompts]             │  ← 捲動時固定
├──────────────────────────────────────────────────────────────────────┤
│ Pages/Order / Default                               Open story ↗    │
│ ┌──────────────────────────────┐  ③ Mina · Tracking · Open          │
│ │                              │  2026-10-01 13:36                  │
│ │        截圖與編號釘點         │  點擊送出時送 order_submit_click…  │
│ │                              │  🗑        Copy AI prompt Edit ✓    │
│ │                              │                                     │
│ └──────────────────────────────┘  ② Mina · Visual fix · Completed   │
│                                    …                                 │
└──────────────────────────────────────────────────────────────────────┘
```

- 視窗寬度 1024px 以上：每個擷取的截圖在左、留言卡片在右；低於 1024px 維持上下堆疊。
- 頂部工具列在捲動時固定，內含會議標題與數量、類別篩選、`Hide completed` 開關、埋點批次複製。
- Story 標題改為純文字，旁邊是 `Open story` 連結（只有合法的 http／https 網址才顯示）。
- 篩選在瀏覽器端進行，狀態寫在網址的 hash（例如 `#kind=tracking&completed=hidden`），貼給別人時保留同樣的檢視。沒有可見留言的擷取整個隱藏。篩選不改變批次複製的範圍規則。

### 報告頁的時間由內嵌腳本轉為本地時間

伺服器照舊輸出 ISO 時間，改放在 `<time datetime="…">` 內並以 ISO 字串作為預設文字；內嵌腳本載入後把文字換成觀看者本地時區的 `YYYY-MM-DD HH:mm`，並把 ISO 字串放在 `title`。腳本未執行時仍顯示 ISO，資訊不遺失。

### 報告頁與索引頁套用同一組視覺規則並以瀏覽器稽核

規則與前一個 change 的留言介面相同：計算後字級不低於 12px；背景色與邊框色不使用 0 到 1 之間的透明度（刪除確認後方的遮罩除外）；不使用漸層與 backdrop filter；擷取卡片與留言卡片不加外框、卡片內不再有自帶外框的容器（表單欄位與 focus-visible 外框除外）。稽核在報告測試的 headless Chrome 流程中，對淺色與深色兩種配色各執行一次。

為符合規則所做的調整：卡片以陰影和底色差異表達層級；按鈕改為無外框的填色；類別與狀態標籤改為純文字；截圖上的釘點以陰影畫出白色環，不用邊框；錯誤訊息改為只用顏色。只有 `input`、`textarea`、`select` 保留 1px 不透明邊框。

## Implementation Contract

**行為（使用者可觀察到的結果）**

- 面板展開時，Story 上出現目前 Story 留言的編號釘點；收合面板或關閉 `Show pins` 後消失。
- 點釘點，面板清單捲到並標示該留言；prototype 不受影響。
- 面板出現 `Copy tracking prompts`（有埋點留言時）；複製的內容與 Reports 頁相同。
- Reports 頁寬螢幕並排、工具列固定、時間為本地格式、可篩選；索引頁時間同樣可讀。

**介面與資料形狀**

- overview 回應新增：每則留言的 `state: { routeId?: string; stateId?: string }`；頂層的 `activeProjectRelativeSessionPath: string | null` 與 `activeTracking: { open: number; total: number }`（整場會議、不分 Story 的埋點留言數）。三者皆為衍生值，不寫入 meeting.json。`activeTracking` 是實作時補上的：overview 依 Story 篩選留言，面板需要整場會議的數量才能判斷是否顯示複製動作、以及其他 Story 是否還有未完成的埋點留言。
- src/visualCommentPrompt.ts 另輸出 `buildCommentPromptContext(...)`，由報告的伺服器端輸出與面板共用，確保兩邊組出的證據欄位相同。
- src/visualCommentPrompt.ts 輸出 `formatVisualFixPrompt(context, screenshotUrl)` 與 `formatTrackingPrompt(entries)`，回傳字串；輸入的 context 形狀與報告頁內嵌的 context JSON 相同。
- 可供測試定位的 DOM 標記：Story 上的已存釘點 `data-saved-comment-pin="<comment id>"`、`data-comment-kind`、`data-comment-status`、標示狀態 `data-highlighted="true"`、已選取 `data-selected="true"`；面板開關 `data-show-pins`；面板複製動作 `data-panel-tracking-copy="story"｜"all"`；報告頁篩選 `data-report-filter="all"｜"visual-fix"｜"tracking"`、`data-hide-completed`、工具列 `data-report-toolbar`。
- 報告頁的 hash 格式：`kind=<all|visual-fix|tracking>` 與 `completed=<shown|hidden>`，以 `&` 連接；未知的值視為預設。

**失敗模式**

- 面板複製時讀取會議資料失敗或剪貼簿寫入失敗：顯示 `Unable to copy AI prompt. Check browser clipboard permission.`，不送出任何變更請求。
- 範圍內沒有未完成的埋點留言：顯示 `No open tracking comments to copy.`，不寫入剪貼簿。
- 設定的擷取選擇器找不到元素，或擷取目標範圍為零：不顯示任何已存釘點，面板清單照常運作。新增留言的擷取在選擇器找不到元素時仍會退回 Story 根元素，釘點不跟著退回，因為比例屬於原本設定的目標。
- 留言的截圖證據遺失：釘點仍以留言自身儲存的位置顯示。
- 正在新增留言（從開始選點到輸入卡片關閉）：已存釘點照常顯示但不接收指標事件，點在釘點上會在該位置放下新留言，不會選到舊留言。
- 報告頁的腳本未執行：時間維持 ISO、篩選控制無作用，所有留言照常顯示。

**驗收方式**

- test/run-visual-comment-report-test.mjs：既有的 Visual UI Fix Request 與 Tracking Instrumentation Request 預期字串不修改即通過；新增面板端與報告端輸出逐字相同的比對；新增篩選、hash、時間轉換、並排版面、樣式稽核的案例。
- test/visual-comment-fixture-entry.ts：已存釘點的顯示與隱藏、狀態不符時不顯示、釘點與清單對應、點釘點不觸發 prototype、面板複製的範圍與訊息。
- test/run-visual-comment-store-test.mjs 與 test/run-visual-comment-http-test.mjs：overview 的新欄位。
- test/run-renderer-parity.mjs：Vue 與 React 的已存釘點與面板複製。
- `npm run test:visual-comments`、`npm run test:renderer-parity`、`npm run test:package`、`npm run test:renderer-neutral`、`npm run test:review-controller` 通過；副本檢查腳本回報一致。

**範圍界線**

- 範圍內：Story 上的已存釘點與其開關、釘點與清單的對應、面板的埋點複製、prompt 共用模組、overview 的兩個新欄位、報告頁與索引頁的版面、篩選、時間與樣式、對應測試與文件、版本 0.12.0 與副本同步。
- 範圍外：Goals / Non-Goals 中列為 Non-Goals 的所有項目；留言的建立、編輯、刪除 API；meeting.json 格式。

## Risks / Trade-offs

- [視窗大小改變後比例定位的釘點與留言當時的位置有落差] → 釘點隨擷取目標目前的範圍重新計算；版面差異大的情況以 `Show pins` 關閉，或以編輯對話框的原始截圖為準。README 說明這個限制。
- [沒有 route／state 資訊的 Story 在不同互動狀態下顯示了不相符的釘點] → 這類 Story 沒有判斷依據，屬已知限制；清單項目與報告的截圖仍是正確的依據。
- [打包後的函式原始碼嵌入報告頁後無法獨立執行] → 面板與報告輸出逐字比對的測試會失敗而擋下；模組內的函式限制為不引用外部識別字。
- [釘點擋住使用者想操作的 prototype 元件] → 收合面板或關閉 `Show pins` 即可；預設只在面板展開時顯示。
- [固定的工具列在矮視窗佔去太多高度] → 工具列內容限制在兩列以內；視窗高度不足 600px 時取消固定。
- [既有報告測試以正規表示式比對 HTML 結構，版面調整會大量失敗] → 驗收條件要求 prompt 相關的預期字串不得修改；結構斷言隨版面更新，生命週期動作的行為斷言保留。

## Migration Plan

1. 前置：`add-tracking-visual-comments` 與 `redesign-visual-comment-capture-flow` 已歸檔。
2. 發佈 addon 0.12.0（canonical 與兩份副本）；既有專案重新執行安裝器升級，不需修改設定。
3. 既有會議的報告在下一次留言變更或報告重建時套用新版面；meeting.json 不需遷移。
4. 回退：重新安裝 0.11.0 的 tarball；design-system/figma-export-review/ 不可刪除。

## Open Questions

（無）
