## 1. 流程板

- [x] 1.1 依 design「固定深色操作台主題，列印媒體轉淺色」「App shell 佈局：側欄、頂欄、主面板」「狀態標籤字串凍結以保檢查器綠燈」及 Implementation Contract「行為」與「介面與資料形狀」改寫 `pipeline-board/scripts/render-pipeline-board.mjs` 的 HTML/CSS 產生:根容器帶 app-shell 標記,左側欄含區塊導覽與狀態圖例、頂欄含專案名與快照時間、主面板承載既有全部內容區塊;螢幕固定深色、@media print 轉淺色並隱藏側欄;標籤常數表逐字不動。完成後 `node pipeline-board/scripts/check-pipeline-board.mjs` 零退出且既有字串斷言全綠,輸出 HTML 字串掃描不含 script、button、@keyframes、transition。
- [x] 1.2 依 design「水平流程圖以欄位網格排節點、內嵌 SVG 疊層畫連線」「節點詳情以錨點與 :target 高亮的 inspector 面板呈現」完成 requirement「The board presents the pipeline as a horizontal flow inside an application shell」:主畫布 flow-canvas 以 CSS grid 排來源欄與階段欄,內嵌 SVG 疊層依欄/列索引與固定格尺寸畫連線,三態各有專屬線色 class(綠實線/紅虛線/橘虛線),跨欄連線走下方偏移車道,箭頭以 polygon 繪製不用 SVG marker;節點顯示標題、狀態徽章、待決數並以錨點連至下方永遠渲染的 inspector 面板,:target 高亮。以檢查器暫存裝置驗證三態線色 class 各至少出現一次,並依 spec 的 A stage node leads to its inspector panel 情境確認錨點與面板對應。

## 2. 儀表板

- [x] 2.1 依 design「App shell 佈局：側欄、頂欄、主面板」「狀態標籤字串凍結以保檢查器綠燈」完成 requirement「The overview presents projects inside an application shell」:改寫 `portfolio-dashboard/scripts/render-portfolio-dashboard.mjs`,側欄列出每個專案(名稱 + 依注意事項 tone 的狀態點 + 頁內錨點至卡片)、頂欄含組合名、快照時間與可讀/失敗計數、主面板為卡片格;卡片內容與板檔連結語意不變、錯誤卡容器內無 a 元素;固定深色、print 轉淺色。以 spec 的 In-page anchors do not become board links 情境驗證:一成功一失敗時指向板檔的連結恰為一個。

## 3. 檢查器與驗收

- [x] 3.1 依 design「檢查器新增 app shell 與流程圖標記斷言」更新兩個檢查器:`pipeline-board/scripts/check-pipeline-board.mjs` 新增 app-shell 標記與 flow-canvas 內含 svg 的斷言;`portfolio-dashboard/scripts/check-portfolio-dashboard.mjs` 新增 app-shell 標記與側欄專案清單標記斷言,並把「錯誤卡無連結」斷言重新定界為:指向板檔(.html 結尾 href)的連結數等於成功專案數、錯誤卡容器內不含 a 元素;其餘斷言逐字不動。完成後兩個檢查器皆零退出且輸出各自全部既有情境名稱。
- [x] 3.2 依 Implementation Contract「驗收標準」「範圍邊界」與「失敗模式」執行完整驗收:對一個真實專案重新建置並渲染流程板與儀表板,兩份 HTML 通過全模式字串掃描(無 http(s) URL、src、@import、fetch、script、link、url()、iframe、button、onclick、@keyframes、transition)且含 app-shell 標記;確認兩個 build 腳本、狀態物件 schema、SKILL.md、自足性掃描模式清單與淨化 allowlist 未被修改,且渲染器的既有失敗模式不變(狀態檔缺失、schema 不符、被竄改的板檔連結仍以既有錯誤碼非零退出且不留輸出檔);最後依序執行 `node pipeline-board/scripts/check-pipeline-board.mjs`、`node portfolio-dashboard/scripts/check-portfolio-dashboard.mjs`、`git diff --check`、`spectra analyze restyle-boards-app-shell --json` 與 `spectra validate restyle-boards-app-shell`,全部通過才視為完成。
