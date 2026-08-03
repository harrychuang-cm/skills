## Why

兩個看板的骨架已經是軟體介面（app shell、水平流程圖、流動連線），但細節仍停在草稿層級：間距與圓角是臨時值、所有容器視覺重量相同、中文標籤套用拉丁字體慣例、數字非等寬、狀態只靠讀字辨識。設計師回饋「視覺 UI 還不夠細緻」，指的正是這一層——結構對了，質感沒到。

## What Changes

- 兩支 render 各自建立一組設計 token（間距階、圓角階、層級陰影、狀態色的邊框與底色分離變體），既有的臨時數值全部改為引用 token，兩個檔案的 token 名稱與數值保持一致。
- 容器改為三級視覺層次：主面板最重、次級區塊（階段卡、交接卡、專案卡）中等、內嵌區塊（執行紀錄、路徑清單）最輕，靠底色、邊框強度與內側高光區分，不使用外部資源。
- 中文標籤改用中文排版慣例：移除對中文標籤無效的 text-transform 與過寬字距，改以字級、字重與顏色建立層級；純拉丁的品牌字樣保留原本的字距處理。
- 所有數字（快照時間、待決數、專案計數、執行時間戳）改用等寬數字，狀態切換時不再左右跳動。
- 徽章改為柔和色票：狀態色底、低透明度邊框、狀態圓點前綴；文字字串一字不改。
- 流程節點本身帶狀態：節點左側加上狀態色軌條與狀態圓點，掃視時不必讀字就能定位有問題的階段。
- 補上鍵盤焦點樣式：側欄連結、流程節點、卡片連結在 focus-visible 時顯示可辨識的焦點環。
- 頂欄改為浮起層：與內容底色分離並加上柔和陰影，捲動時有明確的層疊感。
- 側欄與流程圖捲軸改為細捲軸並套用深色配色。
- 定義文字選取樣式；portfolio 的連結色改為中性強調色，不再與「流程健康」的綠色撞義。
- 卡片與面板內部層級重整：標題、注意事項、次要資訊拉開字級差距；面板標題改為貫穿面板的分隔帶；待決數與注意事項數字改以指標樣式呈現。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `pipeline-board`: 單一專案流程板的視覺呈現要求，從「app shell 佈局與水平流程圖」細化為「具備設計 token 尺度、三級容器層次、狀態化流程節點、鍵盤焦點回饋與中文排版慣例」。
- `portfolio-dashboard`: 多專案總覽的視覺呈現要求，加入同一組 token 尺度與層次規則、卡片內部層級、中性連結色與鍵盤焦點回饋。

## Impact

- Affected specs: `pipeline-board`、`portfolio-dashboard`
- Affected code:
  - Modified:
    - `pipeline-board/scripts/render-pipeline-board.mjs`
    - `pipeline-board/scripts/check-pipeline-board.mjs`
    - `portfolio-dashboard/scripts/render-portfolio-dashboard.mjs`
    - `portfolio-dashboard/scripts/check-portfolio-dashboard.mjs`
  - New：（無）
  - Removed：（無）
- 不受影響：兩支 build 腳本、status 物件 schema、兩份 SKILL.md 契約、淨化 allowlist、自足性掃描規則。
- 產出檔案仍為單一自足 HTML，離線以 file 協定開啟結果相同。
