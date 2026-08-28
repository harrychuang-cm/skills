## Context

storybook-product-prototype 產出的 UI Flow 審閱鏈由四層組成：scaffold 產生的 flow/meta TypeScript 契約、React 與 Vue 的 Flow Export 模板（靜態流程圖，供審閱與 Figma 匯入）、prototype shell（互動 story 與逐路由 iframe 預覽）、以及 Prototype Inspector runtime（UI Flow / Components 頁籤）。目前四層各自持有 375×812 手機常數，契約層沒有任何欄位能宣告 viewport 或 form factor；平台決策（web/app）只存在於 PRODUCTION_HANDOFF 散文。審計另證實兩個既存缺陷：Inspector 的 `getDefaultPreviewDimension` 只讀 `document.documentElement`，但文件宣稱的 token 覆寫鏈（`--sbt-sys-size-viewport-compact-*` → `--pi-sys-size-viewport-compact-*` → `--prototype-inspector-viewport-compact-*`）定義在 `.prototype-inspector` class scope，覆寫實際無效；storybook-template 已宣告 `--sbt-sys-size-viewport-medium-width` 與 `wide-width` 但缺 height 且無任何消費者。下游消費者中，Figma importer 已驗證為逐 node 讀取實際尺寸（零修改），docs/flow.json 的消費者（native-product-implementation、flow-codegen）目前無法分辨流程的目標 form factor。

## Goals / Non-Goals

**Goals:**

- 讓作者在 scaffold 時宣告 phone / tablet / desktop / 自訂 WxH 的審閱 viewport，且該宣告成為 flow 契約的一級欄位，所有渲染端（Flow Export、prototype shell、Inspector）執行期讀取同一來源。
- 平台決策（web/app/hybrid/package）以 `meta.surface.target` 序列化，validator 的 app 目標判定優先讀取型別化欄位。
- docs/flow.json 攜帶解析後的 viewport，讓下游實作 skills 能分辨桌面與手機流程。
- 完整向下相容：未宣告 viewport 的既有 prototype 行為與今天完全一致；無 flag scaffold 維持 phone 預設基準（宣告 phone 375×812、surface web，渲染行為與變更前相同——模板新增契約欄位後逐字節相同在機制上不可能，基準以宣告值與渲染行為定義）。
- 修正 Inspector token bridge 的 scope bug，並補完 medium/wide token 橋接，使 token 覆寫真正生效。

**Non-Goals:**

- 不做響應式模擬：一個 viewport 宣告代表一個固定審閱尺寸，不是斷點系統（責任仍在 production 實作）。
- 不改 Figma importer 與 figma-export-addon（兩者已尺寸無關）。
- 不重新指向 storybook-template tokens-comp.css 中 alias 到 compact-width 的元件 token（記錄為 follow-up）。
- 不新增 Components 頁籤的 viewport 切換器（session-only UI，列為 follow-up）。
- 不遷移既有 prototype：legacy 永遠隱含 phone 375×812，不提供自動改寫工具。
- storybook-template 子樹的 token 補完與 inspector 副本同步由該子樹的伴生 change 承載，本 change 只以測試斷言兩側一致。

## Decisions

### Flow.viewport 為單一真相來源，Flow Export 執行期讀取契約

viewport 存在 flow 物件上（`Flow.viewport { formFactor, width, height }`，選配 `Route.viewport { width, height }` 逐路由覆寫），Flow Export 模板以 `flow.viewport ?? { formFactor: "phone", width: 375, height: 812 }` 解析，不再把 scaffold 值烘成模板常數。理由：常數烘進產物會製造「flow 宣告與渲染不一致」的漂移類別，之後還得靠 validator 去追；執行期讀取讓手改 flow.viewport 不需重新 scaffold 就生效。曾考慮把尺寸放在 meta 或 story parameters——否決，因為 Flow Export 與 shell 在無 Inspector 情境也要能自給自足，而 meta 已內嵌 flow，Inspector 可經 `parameters.prototype.flow.viewport` 取得。

### 單一 --viewport flag，preset 值與 --sbt viewport token tier 對齊

scaffold 提供一個 `--viewport {phone|tablet|desktop|<W>x<H>}`（預設 phone），preset 直接映射 formFactor；自訂 WxH 以寬度分類（≥1024 desktop、≥600 tablet、否則 phone），可用選配 `--form-factor` 覆寫標註。preset 數值釘死等於 storybook-template token tier（phone 375×812、tablet 768×1024、desktop 1280×800），讓 token 橋接語意一致。WxH 以 argparse regex 驗證（正整數、240–3840），杜絕把畸形值填進 TS 數值位置產生語法錯誤的檔案。曾考慮 `--form-factor` 與 `--viewport` 雙 flag——否決，單 flag 對 Step 1 訪談的映射最乾淨。

### meta.surface.target 序列化平台決策

`featurePrototypeMeta` 增加 `surface: { target: "web" | "app" | "hybrid" | "package" }`（scaffold 經 `--target-surface` 填入，預設 web）。validator 的 app 目標判定（presentation 覆蓋率檢查所依據）優先讀此欄位（app/hybrid 視為 app in scope），PRODUCTION_HANDOFF 散文剖析保留為 legacy fallback。理由：讓工作流第一步的決策變成機器可讀，而不是永遠困在散文裡。

### prototypeFlowLayout payload v2 加入 viewport signature

payload version 升為 2，新增 viewport signature 字串（`<formFactor>:<width>x<height>`，legacy 為 null）；讀取端接受 expectedViewport，簽章不符時忽略已存位置並以 console.info 告知。v1 / 無簽章 payload 僅在解析結果為 phone 375×812 時沿用（precisely 保留 legacy 行為）。理由：手機時代儲存的拖拉座標套上桌面 frame 會疊成一團；簽章把它變成一次乾淨的重新排列。position 仍是唯一持久化的幾何——尺寸永遠由契約推導，不寫入 storage。

### Inspector 解析鏈與 token bridge scope 修正

Inspector 以 `route.viewport → prototype.flow.viewport → form-factor tier CSS token → 375/812 常數` 的順序解析每張卡片的預覽尺寸；`getDefaultPreviewDimension` 改為先讀 `.prototype-inspector` 根元素的 computed style、再讀 `documentElement`（保留既有把變數設在 `:root` 的安裝的行為）、最後才用常數。CSS 側補齊 `--pi-sys-size-viewport-medium-*` 與 `wide-*` 橋接（fallback 768×1024 / 1280×800），新增 `--prototype-inspector-active-viewport-*` inline 變數讓逐 prototype 的解析結果覆蓋版面上限，而不去改動「compact = phone」的 token 語意。auto-grid fallback 間距由解析出的卡片尺寸推導。曾考慮把桌面值直接鏡射進 compact 變數——否決，違反 storybook-template 治理文案對 compact 的定義。

### flow.json 附加 viewport 欄位並維持 flowSchemaVersion 1

export_flow.py 在輸出頂層附加選配 `viewport { formFactor, width, height }` 與逐路由 `viewport`（未宣告則整個省略），`flowSchemaVersion` 維持 1。理由：欄位是純附加、缺席即 legacy 語意，升版會迫使所有消費者同步改動。viewport 屬產品語意而非畫布佈局，因此不進 LAYOUT_FIELDS 剝除清單。同一 change 內更新 flow-codegen spec 與 native-product-implementation 的 handoff-ingestion 文件，聲明消費者必須容忍此選配欄位。

### 桌面寬 frame 的 fallback 排版改為 flowGroup 一列

Flow Export 的無位置 fallback：frame 寬 <900px 時使用由尺寸推導的間距（route 寬 +183、高 +102，phone 下與現行 560/980 逐 byte 相同）；≥900px 時改為每個 flowGroup 一列的橫向排列。理由：三欄固定間距在任何桌面寬度下都會重疊；分列排版讓未手動排位的桌面流程可讀。

### 無 flag scaffold 內容不變的回歸守門與 inspector 副本 byte-diff

test_scaffold_validate.py 矩陣擴為 {react, vue} × {無 flag, --viewport desktop, --viewport tablet, --viewport 1440x900}，並加入兩個硬斷言：無 flag scaffold 的產物內容與變更前完全相同；skill asset 與 storybook-template `.storybook` 下的 preview.js 與 prototype-inspector.css 兩兩 byte-identical。理由：前者是向下相容的唯一可信證明，後者防止兩份副本在部分出貨時語意分岔。

## Implementation Contract

**可觀察行為：**

- `python3 scripts/scaffold_prototype.py <root> --feature-name X --viewport desktop` 產生的 flow 檔含 `viewport: { formFactor: "desktop", width: 1280, height: 800 }`，meta 含 `surface: { target: "web" }`，Flow Export story 以 1280×800 frame 渲染路由卡片並顯示「desktop · 1280x800」徽章，scaffold 摘要印出解析後的 viewport 與「--force 重刷需重複 flag」提醒。
- 無任何新 flag 的 scaffold 產物維持 phone 預設基準：flow 宣告 phone 375×812、meta 宣告 surface web、CSS 維持 375px/812px fallback 與 720px 寬版上限，渲染行為（frame 尺寸、fallback 間距）與本 change 之前相同。
- 未宣告 viewport 的既有 prototype：Flow Export、shell、Inspector、validator、export_flow.py 全部維持現行為（隱含 phone 375×812；flow.json 不含 viewport 欄位；新檢查全部靜默跳過）。
- Inspector 在專案 `:root` 或 `.prototype-inspector` 設定 `--sbt-sys-size-viewport-compact-*` 後，路由預覽 iframe 尺寸實際改變（修正前僅 `:root` 直設 `--prototype-inspector-viewport-compact-*` 有效）。
- 宣告 desktop 的 prototype 若存有 phone 時代的拖拉佈局，Inspector 與 Flow Export 忽略儲存位置、使用 fallback 排版，並在 console 輸出一則 info 訊息說明簽章不符。

**介面／資料形狀：**

- Flow 型別：`viewport?: { formFactor: "phone" | "tablet" | "desktop"; width: number; height: number }`；Route 型別：`viewport?: { width: number; height: number }`。
- Meta 型別：`surface: { target: "web" | "app" | "hybrid" | "package" }`。
- scaffold CLI：`--viewport {phone|tablet|desktop|<W>x<H>}`（預設 phone）、`--form-factor {phone,tablet,desktop}`（選配）、`--target-surface {web,app,hybrid,package}`（預設 web）。模板置換 token：`__FORM_FACTOR__`、`__VIEWPORT_WIDTH__`、`__VIEWPORT_HEIGHT__`、`__TARGET_SURFACE__`、`__SHELL_WIDE_CAP__`（phone → `720px`，其餘 → `100%`）。
- flow.json：頂層選配 `viewport { formFactor, width, height }`、route 物件選配 `viewport { width, height }`；`flowSchemaVersion` 為 1。
- prototypeFlowLayout payload：`version: 2`、新增 `viewport: string | null`（格式 `<formFactor>:<width>x<height>`）；schema 名稱不變。
- CSS 變數：`--pi-sys-size-viewport-medium-width/height`、`--pi-sys-size-viewport-wide-width/height`（橋接 `--sbt-sys-size-viewport-medium/wide-*`）、`--prototype-inspector-active-viewport-width/height`。

**失敗模式：**

- 畸形 `--viewport` 值（非 preset 且不符 WxH regex 或超出 240–3840）→ argparse 立即報錯退出，不產生任何檔案。
- flow 宣告的 formFactor 不在枚舉內或 width/height 超出範圍 → validator error。
- flow 宣告 viewport 但 Flow Export 檔缺少讀取 Flow.viewport 的參照（half-converted）→ validator warning，`--strict-style` 下為 error。
- 未宣告 viewport → 僅 `--handoff-ready` 下 warning（提示消費者將假設 phone 375×812）；web-only 目標配 phone viewport → `--handoff-ready` 下 warning（確認 mobile-first 是刻意的）。
- 純 `--force` 重刷未重複 `--viewport` → flow 與 export 一致地回到 phone，validator 無法（也不應）與刻意的 phone scaffold 區分；緩解靠 scaffold 摘要輸出、SKILL.md 警告、以及 Inspector 端 layout 簽章不符的可見提示。

**驗收標準：**

- `python3 storybook-product-prototype/scripts/test_scaffold_validate.py` 通過全部擴充矩陣，含無 flag 內容不變斷言與 inspector 副本 byte-diff 斷言。
- 各 viewport 變體的 scaffold 產物直接通過 `validate_prototype.py`（無 error）；half-converted fixture 觸發預期 warning。
- 對 desktop scaffold 執行 export_flow.py 後，flow.json 含解析後 viewport；對 legacy fixture 執行後不含該欄位。
- 手動驗證：Storybook 中 desktop prototype 的 Static Flow story 路由卡片為 1280×800 且互不重疊；Inspector UI Flow 頁籤同尺寸渲染並顯示徽章。

**範圍邊界：**

- In scope：上述契約、模板、Inspector skill asset、scripts、references 文件、native-product-implementation handoff-ingestion 文件、flow-codegen 等 spec delta。
- Out of scope：storybook-template 子樹的實際檔案修改（tokens-ref.css、tokens-sys.css、copy.ts、`.storybook` inspector 副本——由該子樹伴生 change 承載，本側僅以 byte-diff 測試守門）、Figma importer、tokens-comp.css alias 重新指向、Components 頁籤 viewport 切換器、既有 prototype 的自動遷移、任何響應式斷點模擬。

## Risks / Trade-offs

- [兩份 inspector 副本部分出貨導致行為分岔] → byte-diff 測試為必要斷言而非選配；兩側 change 同一批 commit。
- [UI Flow 頁籤同時掛載多個 1280px 寬 live iframe 的記憶體/CPU 成本] → fit-zoom 先在視覺上緩解；大型桌面流程的 lazy iframe mounting 列為 follow-up。
- [flow.json 的嚴格消費者拒絕未知頂層欄位] → 欄位為選配且缺席即 legacy；同 change 更新 flow-codegen spec 與 native handoff-ingestion 文件；flowSchemaVersion 不升版即基於「消費者容忍附加欄位」的假設，實作時需向下游文件確認此假設成立。
- [layout 簽章不符使作者精心排列的佈局失效] → 刻意設計（優於疊圖），以 console.info 與 ui-flow-contract 文件說明；重排為一次性成本。
- [tokens-comp.css 仍有多處 alias 到 compact-width，桌面 prototype 組合 storybook-template 元件時寬元件被卡 375px] → 明文記錄為 follow-up，不在本 change 靜默處理。
- [純 --force 重刷靜默回到 phone] → 無法由 validator 區分，靠摘要輸出、文件警告與 Inspector 簽章提示三重緩解。

## Migration Plan

1. 本 change 與 storybook-template 伴生 change 同批實作、同批 commit（inspector 副本 byte-identical 由測試守門）。
2. 既有專案的 Inspector 安裝經 `install_prototype_inspector.mjs`（舊版需 `--force`）升級取得新 preview.js 與 CSS。
3. 既有 prototype 零動作：未宣告 viewport 即維持現行為；要轉桌面時在 flow 檔手填 `viewport` 或以 `--force --viewport desktop` 重刷。
4. 回滾：還原模板與 scripts 即可；v2 layout payload 對舊讀取端無害（舊程式讀 positions 欄位不看簽章），新讀取端相容 v1。
