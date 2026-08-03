## Why

設計師實際使用後回饋:兩個看板的 HTML 是文件流排版(標題、段落、清單往下排),「太像一般網頁」,缺乏軟體平台感;且流程資訊以清單呈現,看不到自動化流程的 flow 樣貌。介面的產品感直接影響設計師受眾的採用意願。

## What Changes

- 兩個渲染腳本的 HTML/CSS 產出改為 app shell 佈局:左側欄(導覽、狀態圖例;儀表板側欄含專案清單與狀態點)+ 頂欄(名稱、快照時間)+ 主面板區,視覺採固定深色操作台風格(深色底、高密度面板、狀態燈色彩鮮明)。
- 單專案流程板主畫布新增水平流程圖:來源欄與階段節點由左至右排列,連線以內嵌 SVG 繪製並依狀態上色(已銜接/未銜接/已過期),節點顯示狀態與待決數;節點以錨點連到下方 inspector 面板(產出與缺少檔案、執行紀錄),以 :target 高亮,不引入任何 JavaScript。
- portfolio dashboard 主面板改為專案卡片格,卡片內容(注意事項、目前階段、執行摘要、連結)維持既有語意。
- 兩個檢查器各新增 app shell 與流程圖標記斷言;既有全部斷言與狀態標籤字串維持不變。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `pipeline-board`: 新增呈現層 requirement——流程板以 app shell 與水平流程圖呈現,互動僅用純 CSS,不引入 script。
- `portfolio-dashboard`: 新增呈現層 requirement——總覽以 app shell 呈現,側欄含專案清單與狀態指示,不引入 script。

## Impact

- Affected specs: pipeline-board, portfolio-dashboard
- Affected code:
  - New: (none)
  - Modified:
    - pipeline-board/scripts/render-pipeline-board.mjs
    - pipeline-board/scripts/check-pipeline-board.mjs
    - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
    - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - Removed: (none)
