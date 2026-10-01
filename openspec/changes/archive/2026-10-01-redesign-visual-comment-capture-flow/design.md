## Context

Visual Comments 是 figma export addon（canonical 來源在 design-system-to-storybook/assets/figma-export-addon，目前 0.10.0）在 Story 畫面上的留言工具。現行流程：展開右上角面板 → 輸入會議名稱並 Start meeting → Add comment → 點選 Story 上的位置 → 在面板內的輸入區調整釘點、填顯示名稱、選類別、寫留言 → Save comment。

以 0.10.0 在真實 Storybook dev server、1280 × 860 視窗下操作並截圖，量到的現況：

- 面板寬 320px，與下方的 Figma export 工作區共用垂直空間。輸入區的內容順序是截圖縮圖、調整提示、Display name、Comment type、Comment、Save／Close；在這個視窗下 Comment type 的按鈕被截掉一半，留言文字框與 Save 完全在可視範圍外。
- comments 目錄位於專案內（預設安裝）時，Start meeting 與兩次 Save comment 共 3 次請求，預覽 3 次整頁重新載入；Vite log 顯示 `page reload …/comments/index.html`。把同一目錄排除在 `server.watch.ignored` 之外後，同樣 3 次請求 0 次重新載入。
- 儲存後 Story 上沒有任何標記；面板清單只顯示最新三則。
- review 樣式檔有 15 處小於 12px 的字級與 24 處半透明色（留言相關選擇器各佔 11 處與 8 處），留言卡片、類別標籤、刪除鈕都帶外框。

設計方向已由使用者定案：留言輸入改為貼著釘點的浮動卡片；不必先開會議即可留言；另納入存檔不重新載入、鍵盤快捷鍵與版面視覺整理。

相關約束：

- review 介面使用 addon 自有的 domRuntime，React 與 Vue 3 共用同一份 review 程式。domRuntime 在更新既有 `<select>` 時會選錯項目，新介面不使用 `<select>`。
- 兩份 template 副本必須與 canonical 逐檔一致（design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs）。
- 專案對 HTML 介面的既有視覺要求：不用漸層與背景模糊、不用半透明底色、卡片不加外框也不做卡片內的卡片、文字不低於 12px。

## Goals / Non-Goals

**Goals:**

- 從「看到要標註的畫面」到「存好一則留言」只需要：按 `C`（或 Add comment）→ 點位置 → 打字 → `Cmd/Ctrl+Enter`。
- 留言輸入的所有控制在 1280 × 860 視窗下一眼可見，不需捲動。
- 儲存留言不改變 prototype 的畫面狀態。
- 第一次使用不需要先理解「會議」的概念。
- 留言相關介面符合上述視覺要求，並由自動化測試把關。
- 留言 API、meeting.json 格式、截圖擷取行為與報告頁不變。

**Non-Goals:**

- 已存留言的釘點顯示在 Story 上、在面板內一鍵複製埋點 prompt、報告頁重新排版：使用者已同意納入重新設計，但放在下一個 change `add-visual-comment-overview-and-handoff`，因為它們建立在本 change 的面板結構之上，且合併後任務量會超過單一 change 能驗收的範圍。
- Export review 與 Figma export 工作區的版面與樣式。它們與留言面板共用部分樣式，本 change 只調整留言相關的介面。
- 修正 domRuntime 的 `<select>` 更新問題。
- 會議改名、同時進行多場會議、帳號或權限。
- 留言輸入提供事件名、參數等結構化欄位。
- 更改 addon 的主色。

## Decisions

### 以 plugin 的 config hook 把證據目錄排除在 Vite 監看之外

review status plugin 新增 Vite 的 `config` hook，回傳 `server.watch.ignored`，內容是一個判斷函式：路徑等於 review 狀態檔，或位於已解析的 comments 目錄或 payload 目錄之下時回傳 true。用判斷函式而不用 glob 字串，是為了不必處理路徑中萬用字元的跳脫。Vite 會把 plugin 回傳的設定與專案設定合併，專案不需要修改任何檔案。

實作前已驗證的部分：把 comments 目錄列入 `server.watch.ignored` 後，3 次請求 0 次重新載入（以測試用 Storybook 專案的 viteFinal 設定驗證）。實作後的驗證結果：由 plugin 的 `config` hook 回傳同一設定，在 Storybook 的 Vite builder 下生效；test/run-evidence-reload-test.mjs 以不含任何 `server.watch` 設定的測試專案量到 7 次請求 0 次重新載入。原本準備的備案（`configureServer` 內 `server.watcher.unwatch`）因此沒有採用。

替代方案：由安裝器在專案的 .storybook/main 寫入 `viteFinal`。否決，因為會改動專案擁有的設定，且已安裝的專案要重新執行安裝器才會生效。

替代方案：把報告 HTML 改寫到專案外。否決，因為報告與截圖放在專案內是為了可攜與可提交。

### 既有的重新載入延續機制保留為後備

面板的 open-state continuation 與留言類別的延續紀錄（sessionStorage、15 秒時效、讀取即移除）維持不變。排除監看後它們在一般情況不會被用到，但其他原因造成的重新載入（原始碼變更的整頁更新、非 Vite 的 builder）仍需要它們。

### 沒有進行中的會議時由用戶端自動建立以日期命名的紀錄

Add comment 不再要求進行中的會議。擷取不需要會議；按下 Save comment 時若沒有進行中的會議，用戶端先送出建立會議的請求，標題為 `Notes ` 加上本機日期（`YYYY-MM-DD`），成功後再送出建立留言的請求。建立會議回 HTTP 409（別的瀏覽器剛開了會議）時，改用回應中的進行中會議。其他失敗則保留輸入並顯示錯誤，不送出留言。

具名會議保留：沒有進行中的會議時，面板底部提供次要操作 Start a named meeting，展開後是標題輸入與 Start meeting；會議進行中則顯示 End meeting。

替代方案：伺服器新增「存到目前會議，沒有就建立」的端點。否決，因為既有的兩個端點已足夠，留言 API 可以維持不變。

替代方案：完全移除會議概念。否決，因為多人同場審查、報告依會議分組都建立在它之上。

### 留言輸入是貼著釘點的浮動卡片，窄視窗改為停靠面板

擷取成功後，留言輸入以一個掛在 body 下、標記為不納入擷取的浮動卡片呈現，不再位於面板內。內容由上而下：Comment type 切換、留言文字框（開啟時取得焦點）、Cancel 與 Save comment。

```
      ④  ← 待存釘點，可拖曳
          ┌────────────────────────────────┐
          │ [ Visual fix ] [ Tracking ● ]  │
          │ ┌────────────────────────────┐ │
          │ │ Event name, parameters, …  │ │
          │ │                            │ │
          │ └────────────────────────────┘ │
          │              Cancel   Save ⌘↵  │
          └────────────────────────────────┘
```

位置規則（視窗寬度 720px 以上）：卡片寬 320px；起始邊距釘點中心 24px、位於釘點的 inline-end 側；若因此距視窗 inline-end 邊不足 12px，改放到 inline-start 側（卡片結束邊距釘點中心 24px）；垂直方向平移到距視窗上下邊至少 12px；不得蓋住釘點。視窗寬度低於 720px（沿用現有樣式的斷點）：卡片改為橫跨視窗寬度、停靠在底部；釘點落在底部停靠區內時改停靠頂部。

文字框的 placeholder 依類別提示該寫什麼：Visual fix 為 `What should change here?`，Tracking 為 `Event name, parameters, and when it fires`。

替代方案：留在面板內、把文字框與 Save 移到最上方。否決（使用者選擇浮動卡片）：視線仍要在 Story 與面板之間來回，面板高度受 Figma export 工作區擠壓的問題也還在。

### 留言輸入與面板展開狀態脫鉤，擷取提示移到 Story 上

面板收合時也能留言（由快捷鍵進入）。收合或展開面板不關閉、不隱藏、不改變輸入中的卡片與釘點，也不取消已啟動的點選模式。點選模式啟動時，Story 上方顯示一條不納入擷取的提示列（`Click where you want to comment`、`Esc` 提示與 Cancel），取代原本位於面板內的提示。擷取錯誤同樣顯示在這條提示列的位置，面板收合時也看得到。

這取代了現行「收合面板會取消點選模式、隱藏輸入草稿」的行為。理由：輸入已不在面板內，把它的生命週期綁在面板上只會造成意外的中斷。

### 待存釘點直接在 Story 上調整，留言輸入不顯示截圖縮圖

擷取成功後，Story 上的編號釘點成為可聚焦、可拖曳的調整點：Pointer Events 拖曳，或聚焦後以方向鍵移動（每次 0.01，Shift 為 0.05，範圍 0 到 1）。釘點上的指標與鍵盤事件不傳到 prototype。卡片跟著釘點移動。320px 寬的縮圖在大多數畫面上只是一片縮小的底色，對定位沒有幫助，因此移除；已存留言的編輯對話框仍顯示完整截圖與釘點，行為不變。

### 快捷鍵只在焦點不在可編輯元素時生效，並可由設定關閉

`C`（不含任何修飾鍵）在 Story 畫面、留言功能可用、焦點不在 input／textarea／select／contenteditable 內時進入點選模式。卡片開啟時，`Meta+Enter` 或 `Control+Enter` 等同 Save comment（Save 可用時），`Escape` 等同 Cancel。Add comment 與 Save comment 顯示快捷鍵提示，提示不計入無障礙名稱。新增選填設定 `visualComments.shortcuts`，預設開啟；設為 `false` 時停用 `C` 與儲存快捷鍵並移除提示，`Escape` 仍可取消。Docs 畫面不啟用。

理由：prototype 本身可能使用 `C` 鍵，必須能關閉；`Escape` 是既有行為，不受設定影響。

### 顯示名稱在面板底部設定一次

留言輸入不再詢問顯示名稱。面板底部顯示 `Commenting as <名稱>`（未設定時為 `Anonymous`）與 Change；按下後出現名稱欄位，確認後存入 localStorage 既有的 authorStorageKey。之後的留言沿用。

### 面板清單顯示目前 Story 的全部留言並提供類別篩選

面板展開後的結構：

```
┌──────────────────────────────────────┐
│ Comments                  Reports  ▣ │
│ Notes 2026-10-01                     │
│ ┌──────────────────────────────────┐ │
│ │ Add comment                   C  │ │
│ └──────────────────────────────────┘ │
│ [ All 5 ] [ Visual fix 2 ] [ Tracking 3 ]
│                                      │
│ ③  Tracking · Open                   │
│ 點擊送出時送 order_submit_click，帶… │
│ Mina · 13:36                  ✎  🗑  │
│                                      │
│ ②  Visual fix · Completed            │
│ 縮小標題與按鈕的間距                 │
│ Mina · 13:20                  ✎  🗑  │
│   ⋮（清單在面板內捲動）              │
│                                      │
│ Commenting as Mina · Change          │
│ End meeting                          │
└──────────────────────────────────────┘
```

- 收合時的圖示由鉛筆（EditIcon）改為留言（CommentIcon）；36 × 36 的收合尺寸與置中規則不變。
- 清單由「最新三則」改為目前 Story 的全部留言，新的在前，在面板內捲動；每則顯示會議內的編號。
- 類別篩選是名為 `Filter comments` 的一組切換按鈕（All／Visual fix／Tracking，各帶數量），只影響清單顯示，不送出請求。
- 編輯沿用既有的對話框，刪除沿用既有的確認對話框。

替代方案：維持最新三則，其餘到 Reports 看。否決，因為連續標註時三則很快就不夠，開發者無法在 Story 旁確認自己標過哪些。

### 視覺規則以瀏覽器測試稽核計算後樣式

留言面板、浮動卡片、點選提示列、待存釘點、編輯對話框、刪除確認套用四條規則：文字的計算後字級不低於 12px；背景色與邊框色不使用 0 到 1 之間的透明度（唯一例外是對話框後方的遮罩）；不使用漸層背景與 backdrop filter；清單項目不加外框，內部不再有自帶外框或底色的容器（focus-visible 的外框除外）。層級以不透明的底色差異或陰影表達。

稽核方式：在瀏覽器測試中走訪這些介面的每個元素，讀取 `getComputedStyle` 檢查上述四條。以計算後樣式而非原始 CSS 稽核，是因為共用樣式與繼承會讓靜態檢查漏判。

字級基準：留言內文與文字框 14px，按鈕與標籤 13px，時間等次要資訊 12px。半透明的欄位邊框改用不透明的 token。這些數值是設計選擇；稽核只強制「不低於 12px」。

浮動卡片、點選提示列與錯誤提示不加外框，以雙層陰影與不透明底色和 Story 區隔。面板本身沿用與 Figma export 工作區相同的 1px 不透明外框，兩者並排時外觀一致；規格對外框的限制只針對清單項目。

## Implementation Contract

**行為（使用者可觀察到的結果）**

- 在預設安裝（comments 目錄位於專案內）下，Start meeting、Save comment、編輯、刪除、End meeting 都不會重新載入預覽，prototype 停留在原本的畫面狀態。
- 沒有進行中的會議時 Add comment 可用；存第一則留言後出現標題為 `Notes YYYY-MM-DD` 的進行中會議。
- 點選位置後，留言輸入出現在釘點旁，面板內沒有留言輸入；1280 × 860 視窗下所有控制不需捲動即可見。
- 面板收合時按 `C` 可開始留言；收合或展開面板不影響輸入中的卡片。
- 面板展開後依序為標題列、Add comment、類別篩選、全部留言清單、底部的身分與會議操作。

**介面與資料形狀**

- 新增選填設定 `visualComments.shortcuts?: boolean`，預設 `true`，同時加入 FigmaExportReviewOptions 的型別。
- 留言 API、overview 回應、meeting.json、報告 HTML 不變。
- 可供測試定位的 DOM 標記：浮動卡片 `data-comment-composer`、停靠狀態 `data-composer-dock="bottom"｜"top"`（非停靠時無此屬性）、點選提示列 `data-capture-prompt`、類別篩選群組 `aria-label="Filter comments"` 與選項 `data-comment-filter="all"｜"visual-fix"｜"tracking"`、身分列 `data-commenting-as`。既有的 `data-comment-kind-select`、`data-comment-kind-option`、`data-pending-comment-pin`、`data-comment-id`、`data-comment-edit-modal` 保留。
- 自動建立的會議標題格式固定為 `Notes YYYY-MM-DD`（本機日期）。

**失敗模式**

- 自動建立會議失敗（409 以外）：卡片保持開啟，保留內文、類別、釘點與截圖，顯示錯誤，不送出建立留言的請求。
- 建立會議回 409：改用回應中的進行中會議繼續儲存，不顯示錯誤。
- 儲存留言失敗：沿用既有行為，卡片保持開啟並顯示錯誤。
- 擷取失敗：沿用既有行為，不開啟卡片；錯誤顯示在 Story 上的提示列位置，面板收合時也可見。
- `config` hook 的排除在某個 builder 下未生效：行為退回 0.10.0（重新載入後由延續機制恢復面板與類別），不產生錯誤。

**驗收方式**

- 新增 test/run-evidence-reload-test.mjs：以真實 Storybook dev server、專案內的 comments 目錄，確認 Start meeting、Save comment、編輯、刪除、End meeting 之後頁面上的標記仍在（未重新載入）。
- test/visual-comment-fixture-entry.ts 改寫為新流程並涵蓋 spec 的各 scenario，含 1280 × 860 下卡片各控制的可見性、位置範例表、窄視窗停靠、樣式稽核。
- test/run-renderer-parity.mjs 以新流程（未開會議直接留言、浮動卡片、快捷鍵）在 React 與 Vue 各跑一次。
- `npm run test:visual-comments`、`npm run test:renderer-parity`、`npm run test:package`、`npm run test:renderer-neutral`、`npm run test:review-controller` 通過；`node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs` 回報三份一致。
- 未改動行為（擷取前置狀態、編輯對話框、刪除確認、會議生命週期、報告頁）的既有斷言保留；只有描述舊版面的斷言可以改寫。

**範圍界線**

- 範圍內：review status plugin 的監看排除、Story 畫面的留言面板與留言輸入、點選提示列、待存釘點的調整、快捷鍵與其設定、留言介面的樣式、對應測試與文件、版本 0.11.0 與兩份副本同步。
- 範圍外：Goals / Non-Goals 中列為 Non-Goals 的所有項目；報告頁與其腳本；留言儲存層與 HTTP 路由；Export review 與 Figma export 工作區。

## Risks / Trade-offs

- [`config` hook 在 Storybook 的 builder 下不生效] → 第一個任務先驗證；備案是 `configureServer` 內 `server.watcher.unwatch`，驗收測試相同。
- [prototype 自己使用 `C` 鍵] → 只在焦點不在可編輯元素且無修飾鍵時攔截；`visualComments.shortcuts: false` 可關閉。
- [浮動卡片遮住正要標註的元件] → 卡片放在釘點側邊且不得蓋住釘點；拖曳釘點時卡片跟著移動。
- [瀏覽器測試有上百個斷言綁定舊版面，改寫時可能悄悄丟掉對未改動行為的涵蓋] → 驗收條件明訂未改動行為的斷言須保留；改寫以區塊為單位，每個任務結束時測試都要通過。
- [自動建立的會議沒有人按 End meeting 而長期開著] → End meeting 留在面板底部；會議標題含日期，隔天續用時從標題就能看出是舊紀錄。本 change 不自動結束會議。
- [專案以自訂 CSS 覆寫舊的面板結構] → README 的升級說明列出改變的結構；0.10.0 的 tarball 仍可重新安裝回退。
- [排除監看後，手動修改 meeting.json 不會觸發任何更新] → 這些是資料檔，面板原本就以每 5 秒輪詢取得最新內容。

## Migration Plan

1. 先歸檔 `add-tracking-visual-comments`。
2. 發佈 addon 0.11.0（canonical 與兩份副本）；既有專案重新執行 install_figma_export_addon.mjs 升級，不需修改設定，既有會議資料不需遷移。
3. 回退：重新安裝 0.10.0 的 tarball；design-system/figma-export-review/ 不可刪除。

## Open Questions

- addon 的主色目前是紫色（#6f63ff）。專案其他看板的主色是偏紅的 rose 系；是否讓留言介面跟著改，由使用者決定。本 change 預設不改。
