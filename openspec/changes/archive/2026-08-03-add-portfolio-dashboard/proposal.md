## Why

設計師同時照看多個導入自動化的專案,但單一專案流程板一次只能回答一個專案的狀態。要知道「所有專案各自跑到哪、誰卡住了、卡在哪」,目前只能逐一到每個專案執行流程板指令再逐張開啟,專案數量一多便不可行。

## What Changes

- 新增 top-level skill `portfolio-dashboard`,產生單一自足總覽 HTML 儀表板,以 file 協定開啟即可閱讀,不需安裝、不需連接埠、不需終端機常駐。
- 新增組合定義檔:一份列出受追蹤專案根目錄與顯示名稱的設定檔,由設計師或工程師維護,儀表板只讀取它。
- 聚合層對清單中每個專案執行既有的單一專案狀態建置腳本 pipeline-board/scripts/build-pipeline-status.mjs,收集各專案的狀態物件;個別專案失敗(路徑不存在、定義檔無效)以卡片上的錯誤狀態呈現,不中斷整體建置。
- 總覽 HTML 每個專案一張卡片,顯示:目前所在階段、卡住原因(第一條未成立或已過期的連線及其原因)、待決事項數、執行區塊摘要(含可能已停止標記),並連結到該專案自己的流程板 HTML。
- 儀表板頁面標示產生時間,明示其為靜態快照而非即時狀態。

## Capabilities

### New Capabilities

- `portfolio-dashboard`: 聚合多個專案的流程板狀態物件,渲染設計師可讀的跨專案總覽儀表板。

### Modified Capabilities

(none)

## Impact

- 前置依賴:本變更消費 pipeline-board 的建置腳本輸出,實作順序在 add-pipeline-board 變更完成之後。
- Affected specs: portfolio-dashboard
- Affected code:
  - New:
    - portfolio-dashboard/SKILL.md
    - portfolio-dashboard/agents/openai.yaml
    - portfolio-dashboard/references/portfolio-definition.md
    - portfolio-dashboard/assets/default-portfolio.json
    - portfolio-dashboard/scripts/build-portfolio-status.mjs
    - portfolio-dashboard/scripts/render-portfolio-dashboard.mjs
    - portfolio-dashboard/scripts/check-portfolio-dashboard.mjs
  - Modified:
    - README.md
  - Removed: (none)
