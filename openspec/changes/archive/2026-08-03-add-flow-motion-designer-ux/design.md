## Context

restyle-boards-app-shell 已上線:深色操作台 app shell 與水平流程圖。設計師實測後要求兩件事:連線要有「料往下一階段流動」的方向動畫;整體文案與層級要為不熟技術的設計師優化。現行 spec 在兩個 capability 的 app shell requirement 中明文禁止 keyframes 與 transition,且凍結標籤字串;pipeline-board 另有「執行進度不得暗示未觀測到的動作」requirement(禁止進度指示動畫),該 requirement 本變更不修改、只釐清邊界。兩個檢查器對多個介面字串有斷言。

## Goals / Non-Goals

**Goals:**

- 流程板連線有方向動畫:通的路看得出料在往前流,斷的路一眼看出是靜止的。
- 尊重使用者的減少動態設定:開啟時整頁退回靜態,資訊零損失。
- 文案與層級以設計師為第一讀者:人話為主文案,錯誤碼、指令名、路徑等技術資訊降為次要層但不刪除。
- 兩個檢查器同步演進,既有斷言字串全部維持有效。

**Non-Goals:**

- 不動 pipeline-board 的「Execution progress is derived and never implies motion it cannot observe」requirement:節點、徽章、執行狀態(含可能已停止)維持完全靜態,不新增任何暗示「正在執行」的元素。
- 不引入 JavaScript、transition 規則、外部資源;自足性掃描模式清單與淨化 allowlist 不變。
- 不改 CLI 參數、狀態物件 schema、build 腳本、SKILL.md、README。
- 不改任何狀態語意與推導邏輯;只改呈現與文字層級。
- 儀表板不加動畫(它沒有流程連線,keyframes 與 transition 維持禁止)。

## Decisions

### 動畫只說方向，不說進度

連線動畫的語意是「這條交棒路徑通不通」:已銜接的連線以虛線持續向前流動、已過期以較慢速度流動(路通但流的是舊料)、未銜接維持靜止(斷路)。動畫綁定於連線的狀態 class,節點、徽章、執行區塊在任何狀態下都不得有動畫——尤其可能已停止與執行中,動起來就是對「看板讀的是靜止快照」這件事說謊。替代方案是依執行狀態決定動畫,拒絕:那正是被既有 requirement 禁止的假進度。

### 減少動態一律退回靜態

以 prefers-reduced-motion 媒體查詢在使用者開啟減少動態時停用全部動畫,畫面退回與前一版等價的靜態呈現,狀態仍由色彩與線型完整區分,資訊零損失。列印媒體同樣靜態。

### 連線動畫以 stroke-dashoffset keyframes 實作

動畫用單一 keyframes 規則遞減 stroke-dashoffset;連線路徑一律由來源端畫向目的端,因此同一條規則在所有連線上都表現為「向目的端前進」。已銜接在螢幕上改為流動虛線(減少動態與列印時退回實線),已過期為慢速流動虛線(退回靜態虛線),未銜接不套用動畫。三態在動態與靜態模式下都同時以色彩與線型可區分。不使用 transition、不使用 SVG animate 元素。

### 文案分層：人話為主，技術資訊降為次要

錯誤卡主文案改為人話標題(渲染層以錯誤碼對照表產生,例如根目錄不存在對應「找不到這個專案的資料夾」),原因句其次,穩定錯誤碼降為小字但保留原字。兩頁的唯讀說明各縮為兩句人話;重新產生的指令名稱依 spec 仍須出現,降為小字次要層。卡片層級改為注意事項最醒目、目前階段其次、執行摘要與連結再次。此對照表只存在於渲染層,build 腳本與錯誤碼本身不動。

### 字串凍結改為語意凍結，檢查器既有斷言字串全部保留

前一變更的「標籤字串凍結」放寬為「狀態語意凍結」:狀態標籤(尚未開始、已驗證、已銜接、已過期、可能已停止、流程健康・全部已驗證等)與錯誤碼字串原字保留,兩個檢查器的全部既有字串斷言因此不需改字仍然通過;重寫的只有說明段落與錯誤卡的層級結構,新增的人話標題是新增字串而非取代既有字串。

### 檢查器新增動畫存在與退回規則斷言

pipeline-board 檢查器新增:渲染輸出包含 keyframes 規則與 prefers-reduced-motion 規則,且 keyframes 僅作用於連線 class(以動畫屬性只出現於 edge-line 選擇器驗證);未銜接連線的 class 不套用動畫。portfolio-dashboard 檢查器新增:錯誤卡包含人話標題且錯誤碼仍以原字出現。其餘斷言逐字不動。

## Implementation Contract

### 行為

開啟流程板,通的連線上虛線持續往下一階段流動、過期的慢速流動、斷的靜止;節點與執行資訊完全靜態。系統開啟減少動態時整頁靜止,狀態仍可由色彩與線型分辨。錯誤卡先讀到人話(出了什麼事、該做什麼),錯誤碼是角落小字;說明區兩句內講完,指令名稱是小字。儀表板無動畫,文案與層級同樣以人話優先。

### 介面與資料形狀

兩個渲染腳本的 CLI 參數、輸入 schema、錯誤碼與失敗模式完全不變。流程板輸出包含:一個 keyframes 規則(僅由 edge-line 相關選擇器引用)與一個 prefers-reduced-motion 媒體規則;儀表板輸出不含 keyframes 與 transition。錯誤碼對照表(碼 → 人話標題)只存在於渲染層,未知碼退回顯示原因句與原碼。

### 失敗模式

與現行版本完全相同;本變更不新增錯誤碼、不改變任何拒絕行為。

### 驗收標準

- 兩個檢查器零退出,各自全部既有情境名稱與既有字串斷言不變地通過,新增斷言(流程板 keyframes 與 prefers-reduced-motion 存在且動畫僅綁定 edge-line;儀表板錯誤卡人話標題與原錯誤碼並存)通過。
- 對真實專案重新渲染兩份 HTML:流程板掃描確認含 keyframes 與 prefers-reduced-motion、不含 transition;儀表板掃描確認不含 keyframes 與 transition;兩份皆不含 script、button、onclick、http(s) URL、src、@import、fetch、link、url()、iframe。
- 流程板中 blocked 連線的 class 未被 keyframes 引用選擇器涵蓋(以字串檢視動畫宣告只掛在 satisfied 與 stale 的 edge-line class 上)。
- git diff --check、spectra analyze add-flow-motion-designer-ux --json 與 spectra validate add-flow-motion-designer-ux 全部通過。

### 範圍邊界

**在範圍內**:pipeline-board/scripts/render-pipeline-board.mjs、portfolio-dashboard/scripts/render-portfolio-dashboard.mjs 的 CSS 與文案產生,pipeline-board/scripts/check-pipeline-board.mjs、portfolio-dashboard/scripts/check-portfolio-dashboard.mjs 的斷言更新。

**在範圍外**:兩個 build 腳本、狀態物件 schema、錯誤碼集合、SKILL.md、README、自足性掃描模式清單、淨化 allowlist、Execution progress requirement 的任何語意。

## Risks / Trade-offs

- [方向動畫被誤讀為正在執行] → 動畫語意只綁連線狀態且未銜接靜止;說明區以一句人話點明「流動代表路是通的,不代表正在執行」。
- [減少動態使用者失去狀態資訊] → 三態在靜態下仍以色彩加線型雙重編碼,動畫只是第三層冗餘。
- [文案改寫誤刪檢查器斷言字串] → 設計明定既有斷言字串原字保留、只新增不取代;驗收以兩個檢查器全綠為硬條件。
- [dash 流動在長路徑上速度不一致] → 以固定 dash 週期與固定時長,速度差異可接受且不承載語意。

## Migration Plan

1. 流程板:連線動畫(keyframes + reduced-motion 退回)與文案分層。
2. 儀表板:文案分層與錯誤卡人話標題。
3. 兩個檢查器補斷言,跑全套驗收。

回滾方式為還原四個檔案;無資料與 schema 影響。

## Open Questions

無。動畫語意對照、退回行為、文案分層原則與凍結面均已與使用者確認或由既有 requirement 固定。
