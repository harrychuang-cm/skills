## Why

設計師使用新版看板後提出兩個體驗缺口:流程圖是靜態的,看不出「料往下一個階段流動」的方向感;且畫面上仍殘留工程師語言(錯誤代碼當主文案、指令名稱與檔案細節與人話混排),對不熟技術細節的設計師受眾不友善。

## What Changes

- 流程板連線加入方向動畫:已銜接的連線以虛線持續向前流動、已過期以較慢速度流動、未銜接維持靜止;系統開啟「減少動態」時全部退回靜態。動畫僅表達流動方向,節點與執行狀態(含可能已停止)維持完全靜態,不新增任何暗示「正在執行」的元素。
- 兩個 HTML 的文案全面改為設計師語言:錯誤卡以人話為主文案、穩定錯誤碼降為次要小字但仍保留;唯讀說明縮短為人話並把重新產生的指令名稱降為次要層;卡片與面板的視覺層級改為「該做的事」最大、技術細節(路徑、run ID)降級。
- 對應放寬與收緊 spec:pipeline-board 的 app shell requirement 由「禁一切 keyframes/transition」改為「僅允許流程連線的方向動畫,且必須支援減少動態退回靜態、禁止任何執行進度暗示」;兩個 capability 的「標籤字串凍結」改為「狀態語意不變,字面可為設計師可讀性調整,檢查器同步更新」。
- 兩個檢查器同步更新:字串斷言隨新文案調整,流程板新增動畫規則存在與減少動態退回規則存在的斷言。

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `pipeline-board`: 修改 app shell 呈現 requirement——允許連線方向動畫(限定範圍與減少動態退回),文案改為設計師語言。
- `portfolio-dashboard`: 修改 app shell 呈現 requirement——文案改為設計師語言、錯誤碼降為次要,動畫維持禁止。

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
