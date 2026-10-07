## Context

figma-export addon 0.14.0（`add-anchored-visual-comments`）讓留言可以綁在宿主宣告的框、連線或畫布座標上；Prototype Inspector 的 UI Flow（`add-flow-canvas-comments`）已經宣告這些錨點，相機移動時釘點會在同一個畫格跟著移動。

已存釘點目前的行為（讀程式確認）：

- 畫布上的已存釘點是 capture-ignore 的按鈕，`pointerdown`／`pointerup` 停止傳遞；點一下選取清單裡的留言，滑鼠停留顯示資訊卡（`getSavedPinCardPlacement` 決定卡片位置）。不能拖曳。
- 撰寫中的釘點可以拖曳，也能用方向鍵移動（1%／5%），撰寫輸入框依 `getCommentComposerPlacement` 開在釘點旁，並跟著釘點移動。
- 清單的 Edit 開一個 body 層級、置中、有遮罩的 `role="dialog"` 彈窗，顯示截圖與截圖上的點，可在截圖上拖點；連線與畫布留言不能改點（伺服器拒絕 `pin` 修改）。
- 伺服器的修改請求由 `normalizeCommentDetailsPatch` 驗證，只接受 `body`、`pin`、`kind`，有其他欄位就回驗證錯誤。
- `resolveCommentAnchor(target, clientX, clientY)` 不傳按下的元素時，以 `hitElementAt` 略過 capture-ignore 元素（包含釘點）往下找錨點。

## Goals / Non-Goals

**Goals:**

- 已存釘點可以直接拖曳到新位置，放開即儲存；連線與畫布留言也能移動。
- 移動後，截圖與截圖上的點只在仍然對得上時更新，否則清楚標示「截圖之後移動過」。
- Edit 在釘點旁開啟，與撰寫輸入框的位置與跟隨行為一致。
- 誤拖可以在 5 秒內復原；儲存失敗不會留下錯誤的位置。

**Non-Goals:**

- 移動後重新截圖（之後可另加「重新截圖」）。
- 多選、批次移動、對齊或吸附。
- 修改 Prototype Inspector 的執行檔；UI Flow 的錨點與事件已足夠。
- 報告頁上拖曳釘點。

## Decisions

### 拖曳門檻與點擊共存

按下釘點後先不動作；移動超過 4 個 CSS 像素才進入拖曳，並以 `setPointerCapture` 接住後續指標事件。沒超過門檻就在放開時照舊選取留言。拖曳結束後吞掉緊接的 `click`，避免同時觸發選取。

替代方案「先選取、再拖曳」被否決：要點兩次，與 Figma 的直覺不同。

### 放開時重新判定錨點

以釘點中心的 client 座標呼叫 `resolveCommentAnchor(target, x, y)`（不傳按下的元素，所以會略過釘點本身），順序與建立留言相同：元素錨點 → 8 像素內的連線 → 畫布。判定結果：

- 判定出錨點：送出 `anchor` 修改。
- 沒有錨點、且留言本來就沒有錨點：送出 `pin` 修改（目標範圍內的比例位置），與現有 Edit 的行為相同。
- 沒有錨點、但留言原本有錨點：放回原處，不送請求，顯示 `Drop the pin on a frame, a line or the canvas.`。

替代方案「只允許在同一個框內移動」被否決：使用者要能把釘點拖到其他框或空白處。

### 截圖上的點只在對得上時更新

截圖上的點（`pin`）描述截圖內的位置。只有兩種情況截圖仍對得上：從沒被移動過、且仍在同一個元素錨點（截圖就是該元素），以及沒有錨點的比例留言（截圖就是整個擷取目標）。這兩種情況更新 `pin`；其他情況保留原 `pin`，並由伺服器寫入 `movedAt`。已有 `movedAt` 的留言，截圖已經對不上錨點，所以伺服器拒絕單獨修改 `pin`，置中彈窗也不提供改點。

由伺服器而不是瀏覽器決定，這樣報告與其他瀏覽器看到的結果一致，也避免不同版本的面板算出不同結果。

### 修改請求以「移動」與「還原」兩種形式擴充

PATCH 新增兩個欄位：

- `anchor`（物件）：移動。伺服器以既有的錨點驗證檢查，依上一個決策更新 `pin` 或寫入 `movedAt`。此時不可同時送 `pin` 或 `movedAt`。
- `anchor`（物件或 `null`）、`pin`、`movedAt`（ISO 字串或 `null`）三者一起送出：還原，伺服器照值寫入（`movedAt` 為 `null` 時移除）。Undo 使用這個形式送回移動前的值。

`anchor: null` 只能出現在還原形式中。既有的 `pin` 單獨修改規則不變（元素錨點同步 `x`／`y`；連線與畫布錨點拒絕）。舊版伺服器遇到新欄位回驗證錯誤，面板視為儲存失敗。

替代方案「伺服器保存上一個位置並提供 undo 端點」被否決：需要額外狀態，且同時有其他移動時語意不清。

### 樂觀放置與儲存中鎖定

放開後釘點留在新位置，送出請求。請求進行中：該釘點不能再拖曳，定期的 overview 更新不覆蓋它的位置。成功後以伺服器回傳的留言更新；失敗時放回原處並顯示 `Couldn't move the comment.` 加上錯誤訊息。

### 鍵盤移動以短暫停頓後儲存

已存釘點聚焦時，方向鍵移動 1 像素、Shift + 方向鍵移動 10 像素（以畫面像素計，不受畫布縮放影響），並呼叫 `preventDefault` 與 `stopPropagation`。最後一次按鍵後 600ms 或釘點失去焦點時，以同樣的判定規則儲存一次；儲存前按 Esc 放回原處。

替代方案「沿用撰寫中釘點的 1%／5%」被否決：大畫布上 1% 太粗，無法微調。

### 移動後顯示復原提示

儲存成功後，面板顯示 `Comment moved.` 與 `Undo`，約 5000ms 後消失（`role="status"`）。Undo 以還原形式送回移動前的 `anchor`、`pin`、`movedAt`。一次只保留最近一次移動的復原；新的移動會取代它。

### 編輯面板開在釘點旁

Edit 被觸發時，如果該留言的釘點目前顯示在畫面上，開啟非強制的編輯面板（`role="dialog"`，不加 `aria-modal`，沒有遮罩），位置以 `getCommentComposerPlacement` 計算，與撰寫輸入框相同。面板跟著釘點移動（視窗調整、捲動、`sbfx:anchors-moved`、拖曳釘點），內容為 `Comment type`、內容、`Cancel`、`Save changes`；`Save changes` 只送 `body` 與 `kind`，位置由拖曳釘點負責。點擊面板外不關閉，避免遺失輸入中的文字。

釘點不在畫面上時：有錨點的留言先發出 `sbfx:reveal-anchor`，宿主處理且下一個畫格釘點出現時就在釘點旁開啟；否則（宿主未處理、列在其他檢視、記錄於其他狀態、`Show pins` 關閉、錨點不存在）退回現有的置中彈窗，彈窗內容與規則不變。

替代方案「完全移除置中彈窗」被否決：釘點看不到時就沒有地方可以編輯。

### 點擊釘點開啟含截圖的編輯面板

**Supersedes**: add-direct-pin-editing / 編輯面板開在釘點旁

2026-10-06 使用者要求：點擊釘點與按 Edit 都直接開啟編輯面板，並在面板中同時看到截圖與文字編輯。因此：

- 點擊已存釘點（沒有超過拖曳門檻）時，照舊選取清單中的留言並把它捲入畫面、標上 `aria-current`，同時開啟該留言的編輯面板；焦點移到面板的內容欄，而不是清單項目。點擊另一個釘點時切換到那則留言（前一則未儲存的草稿與 Cancel 相同地捨棄）；點擊目前開著的那則留言的釘點時，面板保持開啟。
- 編輯面板最上方顯示留言的截圖，並在截圖上以編號標出儲存的截圖點（不能拖曳；位置改由拖曳畫布上的釘點）。截圖最寬 296 像素、最高 200 像素，維持原比例；沒有截圖時顯示 `Screenshot unavailable`；有 `movedAt` 的留言在截圖下方顯示 `Moved since the screenshot`。下方依序是 `Comment type`、內容、`Cancel`、`Save changes`。
- 編輯面板開著時，不顯示同一則留言的滑鼠預覽卡，避免重疊；其他釘點的預覽卡照常。

替代方案「移除滑鼠預覽卡」被否決：只想快速瞄一眼時，不必開啟編輯。

### 移動標記的呈現

留言有 `movedAt` 時：清單項目與釘點資訊卡顯示 `Moved since the screenshot`；報告卡片顯示同一句並保留截圖上的原點；AI 提示的 `Comment location:` 行結尾加上 ` (moved since the screenshot)`。

### 版本升為 0.15.0

新增使用者可見的能力，依既有規則升 minor 版本。README 新增「Upgrading from 0.14.x」：說明可直接拖曳、Edit 的位置改變、伺服器需同時升級才能移動。

### 驗收與審查後的修正

2026-10-07 的 `/spectra-verify` 與 `/spectra-review` 找到以下問題（都讀程式確認屬實），修正方式：

- **鍵盤移動的 Esc 先於編輯面板**：鍵盤移動和指標拖曳一樣，在 window 的 capture 階段攔 Esc。編輯面板的 Esc 掛在 document 的 capture 階段，比較晚執行，所以第一次 Esc 只取消移動、面板保持開著；第二次 Esc 才關面板。原本面板先攔下 Esc，移動沒被取消，焦點回到 Edit 時反而存檔。
- **按下釘點先存待存的鍵盤移動**：鍵盤移動還在等 600ms 時按下任何釘點，先存下這次移動；按下的就是正在儲存的釘點時，這次按下不開始拖曳。原本按下會覆蓋進行中的移動，移動既不存也不還原，`draggingPinId` 也一直留著。
- **吞掉點擊只限指標拖曳**：「忽略下一次點擊」只在指標拖曳結束或取消時設定，並在下一次按下釘點或在釘點上按鍵時清除。原本鍵盤移動按 Esc 後也會設定，而且只有點擊同一個釘點才會清除，下一次 Enter 或點擊被吞掉。
- **移動中的釘點依移動位置繪製**：拖曳或鍵盤移動進行中，釘點與編輯面板的位置取自這次移動的目前中心，不取已存位置。這個 addon 的畫面框架重繪時，會把和 DOM 不同的 style 寫回元素；原本第一次方向鍵的位移會被緊接的重繪蓋掉，定期更新也會讓拖曳中的釘點跳回原處。
- **置中彈窗一律顯示已存截圖**：有截圖就顯示。可改點（沒有 `movedAt`，且沒有錨點或是元素錨點）時是可拖曳的點；否則是不可拖曳的編號點，有 `movedAt` 時加上 `Moved since the screenshot`。原本不能改點時連截圖都不顯示，改顯示 `Screenshot evidence is unavailable.`；這句只留給沒有截圖或截圖載入失敗的情況。
- **由編輯介面決定是否送 pin**：編輯面板從不送 `pin`；置中彈窗只在可改點時送。可改點的判斷與彈窗顯示可拖曳點共用同一個函式。原本靠尋找彈窗裡的截圖元素間接判斷，彈窗加入固定點的截圖後會誤送，伺服器會拒絕移動過留言的 `pin`。
- **「釘點顯示中」要求中心在視窗內**：Edit 只在釘點中心位於視窗內時開在釘點旁。Story 上捲到視窗外的比例釘點（沒有錨點，不會被隱藏）改開置中彈窗，不會把面板開在看不到的釘點旁。
- **復原提示放在捲動區外**：`Comment moved.`、`Undo` 與移動失敗的提示放在清單的捲動區之外，清單捲到下方時仍看得到。
- **規格措辭**：Save changes 送出 body、有變更時的 kind，以及（只有置中彈窗可改點時的）pin。主規格只要求修改請求至少包含 body、pin、kind 其中一項，所以只送有變更的 kind 符合主規格；這次修正的是本 change 規格中「送出 body 與 kind」的寫法。

## Implementation Contract

**Behavior**

- 按住已存釘點移動超過 4 像素就開始拖曳，釘點跟著指標；資訊卡在拖曳中隱藏；放開時儲存。移動不到 4 像素則是原本的選取。
- 拖曳中按 Esc：釘點回到原處，不送請求。
- 撰寫留言期間（從開始選點到輸入框關閉）已存釘點維持不接收指標事件，不能拖曳。
- 儲存成功：顯示 `Comment moved.` 與 `Undo` 約 5 秒；按 Undo 後回到移動前的位置與標記。
- 儲存失敗：釘點回原處，顯示 `Couldn't move the comment.` 與錯誤。
- Edit：釘點在畫面上時，面板開在釘點旁並跟著移動；否則退回置中彈窗。
- 點擊釘點（沒有拖曳）：選取清單中的留言並開啟它的編輯面板，面板最上方顯示截圖與截圖上的編號點。
- 鍵盤移動中按 Esc：釘點回到原處，不送請求；編輯面板開著時保持開著。
- 鍵盤移動待存時按下任何釘點：先存下這次移動。
- 取消拖曳或鍵盤移動後，下一次點擊或 Enter 照常選取並開啟編輯面板。
- 移動中的釘點與編輯面板，在重繪時仍停在移動的位置；第一次方向鍵就看得到位移。
- 置中彈窗：有截圖就顯示；不能改點時是不可拖曳的編號點，移動過的留言加註 `Moved since the screenshot`。

**修改請求（PATCH `/sessions/<session id>/comments/<comment id>`）**

| 請求內容 | 伺服器行為 |
| --- | --- |
| `{ anchor: A }`，留言沒有 `movedAt`，原錨點是 id 相同的元素錨點，A 也是元素錨點 | 寫入 A；`pin` 設為 `{ xRatio: A.x / A.width, yRatio: A.y / A.height }`（限制在 0 到 1）；`movedAt` 不變 |
| `{ anchor: A }`，其他情況 | 寫入 A；`pin` 不變；`movedAt` 設為伺服器現在時間 |
| `{ anchor, pin, movedAt }`（還原） | 三者照值寫入；`anchor: null` 移除錨點，`movedAt: null` 移除標記 |
| `{ pin }` | 不變（元素錨點同步 `x`／`y`；連線、畫布錨點拒絕）；留言有 `movedAt` 時拒絕 |
| `{ anchor: null }` 或 `{ anchor, pin }`、`{ anchor, movedAt }` 等不完整組合 | 驗證錯誤，不寫入 |
| 不合法的 `anchor` 或 `movedAt` | 驗證錯誤，不寫入（`movedAt` 必須是可解析且不晚於現在的 ISO 時間） |

**資料形狀**

```ts
// VisualComment（儲存）與 overview 的留言新增
movedAt?: string; // ISO 時間；有值代表截圖之後被移到截圖對不上的位置
// VisualCommentDetailsPatch 新增
anchor?: VisualCommentAnchor | null;
movedAt?: string | null;
```

meeting 檔案版本維持 1；`movedAt` 不參與建立留言的冪等雜湊。

**文字（集中在 labels）**

`Comment moved.`、`Undo`、`Couldn't move the comment.`、`Drop the pin on a frame, a line or the canvas.`、`Moved since the screenshot`、`Edit comment <ordinal>`（編輯面板的名稱）。

**驗收**

- `run-visual-comment-store-test.mjs`：上表每一列。
- `run-visual-comment-http-test.mjs`：移動與還原的 PATCH 往返、`movedAt` 出現在 overview。
- `run-anchor-fixture.mjs`：框內移動、換到其他框、連線留言移到畫布、點擊不移動、Esc 取消、鍵盤移動、儲存失敗回原處、Undo、無錨點處放回、編輯面板在釘點旁並翻面與跟隨、釘點不在畫面時的退路。
- `run-visual-comment-fixture.mjs`：Story 上沒有錨點的釘點拖曳後 `pin` 更新、編輯面板在釘點旁。
- `run-visual-comment-report-test.mjs`：`Moved since the screenshot` 與提示註記。
- `check_flow_canvas_comments.mjs`：在 UI Flow 把框留言拖到另一個框，錨點換成新框並標示移動；Edit 面板開在釘點旁。
- `run-anchor-fixture.mjs`（驗收與審查後的修正）：面板開著時鍵盤移動按 Esc、按下釘點先存鍵盤移動、取消後第一次啟用、第一次方向鍵立即顯示、拖曳中重繪不跳回、移動過留言的置中彈窗截圖、復原提示在捲動區外、編輯面板儲存失敗、畫布錨點放到無錨點處。
- `run-visual-comment-fixture.mjs`（驗收與審查後的修正）：釘點在視窗外的 Story 留言，Edit 開置中彈窗。

**範圍**

- 範圍內：addon 的面板、錨點輔助、儲存與 HTTP、報告與提示、測試、dist、README、兩份 template 鏡像、`design-system-to-storybook` 設定文件、`check_flow_canvas_comments.mjs` 的檢查案例。
- 範圍外：Prototype Inspector 執行檔；報告頁的拖曳；重新截圖。

## Risks / Trade-offs

- [拖曳釘點與平移畫布衝突] → 釘點本來就停止 `pointerdown` 傳遞，畫布不會開始平移；空白鍵平移時按住的是畫布，不是釘點。
- [誤拖] → 4 像素門檻與 5 秒 Undo。
- [多個瀏覽器同時移動同一則留言] → 後寫入者為準；其他瀏覽器在下一次 overview 更新（約 5 秒）看到結果。
- [舊版伺服器] → 新欄位被拒絕，面板放回原處並顯示錯誤；README 說明需同時升級。
- [編輯面板擋住其他釘點] → 面板可以關閉；位置與撰寫輸入框相同，使用者已熟悉。

## Migration Plan

1. 升級 addon 到 0.15.0 並同步 template 鏡像；不需要資料遷移，既有留言沒有 `movedAt`。
2. 回復方式：裝回 0.14.0。0.14.0 讀取 meeting 檔時不逐欄檢查留言，`movedAt` 會原樣保留但不顯示；已移動留言的位置照新錨點顯示。
