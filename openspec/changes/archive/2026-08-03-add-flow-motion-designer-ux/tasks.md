## 1. 流程板

- [x] 1.1 依 design「動畫只說方向，不說進度」「減少動態一律退回靜態」「連線動畫以 stroke-dashoffset keyframes 實作」及 Implementation Contract「行為」與「介面與資料形狀」完成 requirement「The board presents the pipeline as a horizontal flow inside an application shell」的動畫部分:`pipeline-board/scripts/render-pipeline-board.mjs` 的 CSS 新增單一 keyframes 規則遞減 stroke-dashoffset,僅綁定已銜接(向前流動)與已過期(慢速流動)的 edge-line class,未銜接與所有節點、徽章、執行狀態元素不套用任何動畫;新增 prefers-reduced-motion 媒體規則停用全部動畫並退回三態仍以色彩加線型可區分的靜態呈現;不使用 transition 與 SVG animate 元素。以 spec 的 Motion carries direction, never execution progress 與 Reduced motion falls back to static 兩情境驗證:字串檢視動畫宣告只出現於 satisfied 與 stale 的 edge-line 選擇器,且輸出含 prefers-reduced-motion 規則。
- [x] 1.2 依 design「文案分層：人話為主，技術資訊降為次要」與「字串凍結改為語意凍結，檢查器既有斷言字串全部保留」更新流程板文案:唯讀說明縮為兩句人話並點明「流動代表路是通的,不代表正在執行」,重新產生的指令名稱降為小字次要層;既有狀態標籤與檢查器斷言字串(尚未開始、還沒有任何來源、沒有任何執行紀錄、已驗證、已銜接、已過期、可能已停止、未執行 2 項等)原字保留。完成後 `node pipeline-board/scripts/check-pipeline-board.mjs` 既有字串斷言不改字全數通過。

## 2. 儀表板

- [x] 2.1 依 design「文案分層：人話為主，技術資訊降為次要」與「字串凍結改為語意凍結，檢查器既有斷言字串全部保留」完成 requirement「The overview presents projects inside an application shell」的文案部分:`portfolio-dashboard/scripts/render-portfolio-dashboard.mjs` 新增錯誤碼對照表(渲染層,例如 missing-project-root 對應「找不到這個專案的資料夾」),錯誤卡主文案為人話標題、原因句其次、穩定錯誤碼原字降為小字;未知碼退回顯示原因與原碼;卡片層級調整為注意事項最醒目;唯讀說明縮為人話、指令名稱降為小字但仍出現;不新增 keyframes 與 transition。以 spec 的 Error cards lead with plain language 情境驗證:缺根目錄專案的錯誤卡人話標題最醒目且 missing-project-root 原字仍在。

## 3. 檢查器與驗收

- [x] 3.1 依 design「檢查器新增動畫存在與退回規則斷言」更新兩個檢查器:`pipeline-board/scripts/check-pipeline-board.mjs` 新增輸出含 keyframes 規則與 prefers-reduced-motion 規則、動畫宣告僅綁定 edge-line 選擇器、blocked 的 edge-line class 未被動畫涵蓋的斷言;`portfolio-dashboard/scripts/check-portfolio-dashboard.mjs` 新增錯誤卡人話標題存在且 missing-project-root 原字並存、輸出不含 keyframes 的斷言;其餘斷言逐字不動。完成後兩個檢查器皆零退出且輸出各自全部既有情境名稱。
- [x] 3.2 依 Implementation Contract「驗收標準」「範圍邊界」與「失敗模式」執行完整驗收:對真實專案重新渲染兩份 HTML,流程板掃描含 keyframes 與 prefers-reduced-motion、不含 transition,儀表板不含 keyframes 與 transition,兩份皆不含 script、button、onclick、http(s) URL、src、@import、fetch、link、url()、iframe;確認兩個 build 腳本、狀態物件 schema、錯誤碼集合、SKILL.md、自足性掃描模式清單與淨化 allowlist 未被修改,渲染器既有失敗模式與錯誤碼不變;最後依序執行 `node pipeline-board/scripts/check-pipeline-board.mjs`、`node portfolio-dashboard/scripts/check-portfolio-dashboard.mjs`、`git diff --check`、`spectra analyze add-flow-motion-designer-ux --json` 與 `spectra validate add-flow-motion-designer-ux`,全部通過才視為完成。
