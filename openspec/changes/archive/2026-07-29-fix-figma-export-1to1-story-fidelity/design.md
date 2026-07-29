## Context

storybook-code-to-design 管線由兩端組成：Storybook addon（vendored 原始碼在 design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src，經 tsup 打包）在瀏覽器內把 story DOM 轉成 FigmaExportPayload JSON；Figma 外掛 importer（原始碼在 design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts，經 tsc 編成 code.js）把 payload 重建為 Figma 節點與 Variables。80sJP-Grok 消費專案透過 vendor tgz 安裝 addon、複製外掛資料夾使用 importer。

以 Text Link「Inline」story 實測（headless Chrome computed styles 對照 Figma 現況），發現四項破壞一比一還原的缺陷：story 脈絡遺失、日文字型 style 對映失敗、文字寬度膨脹、inline 行高裁切。root cause 均已定位（見 proposal）。

限制條件：payload schema 為 version 2，變更必須向後相容（importer 能吃舊 payload、新 payload 欄位為既有欄位的值語意修正）；exporter 與 importer 的既有測試（addon 的 test:plugin-code、importer 的 test/verify-pure-functions.cjs 等）必須維持綠燈。

## Goals / Non-Goals

**Goals**

- Story 的完整渲染根（含元件周圍示範標記）進入 payload，同時保留內層元件參照，讓 importer 既能重建 story 畫面也能萃取元件定義。
- 文字節點的寬、高、y 座標與瀏覽器渲染一致（誤差 < 1px），基線位置以 line box half-leading 模型補償。
- importer 對第一順位 CSS 字型家族的 Figma style 解析涵蓋非歐文命名（Hiragino W0–W9、純數字），以最接近字重取代直接 fallback 到次位家族。
- 版本推進 addon 0.8.0、importer 1.7.0，cm-skills 內三處產物（addon src、importer src、template 的 code.js）與 80sJP-Grok 外掛副本同步。

**Non-Goals**

- 不處理 story 畫布外的 Storybook chrome（背景色 preview 設定、viewport padding）——匯出範圍仍是 story 渲染根本身。
- 不改 token binding 的 value-preserving 剪枝（unitless line-height token 1.65 與 26.4px 不綁定是預期行為）。
- 不在本變更內自動重跑 80sJP-Grok 的 Figma 匯入（需使用者在 Figma 端執行外掛驗收）。
- 不修復 openspec 既有 spec 檔內被舊 @trace 汙染的 node_modules 路徑清單。

## Decisions

**D1：匯出根一律取 story scope 的第一個元素子節點。** findExportRoot 移除「單一 data-component 即以元件為根」與「多元件取共同祖先」的收斂邏輯，直接回傳 scope.firstElementChild。元件參照仍由節點層級的 data-component 屬性在遍歷時掛在對應節點上；importer 的 collectComponentDefinitionSpecs 已遞迴收集任意深度的 component reference，能同時建立元件定義與含實例的 story 畫面。當 story 根本身就是元件（如 Default story）時行為與現狀完全相同，因此不需 option 開關。替代方案（加 exportScope: component|story 選項）被否決：兩種模式的差異只在「元件周圍是否有示範標記」，而有示範標記時砍掉脈絡正是本次要修的 bug。

**D2：字型 style 解析改為「候選名單失敗後查實際 style 清單、依字重語意選最近」。** loadTextFont 與 loadBoundFontFamily 共用新 helper：先以既有 getFontStyleCandidates 快速路徑嘗試；同家族全部失敗時，呼叫 figma.listAvailableFontsAsync()（每次匯入至多查一次並快取），取該家族全部 style 名，用 parseFontStyleWeight 解析每個 style 的字重與斜體語意 — W 後接數字（W3→300、W6→600）、純數字（"300"）、歐文命名對照表（Thin=100…Black=900）— 選擇與目標字重差距最小者（同距離取較重者，符合瀏覽器對 bolder 解析的偏好）；找得到才視為該家族成功，否則進入下一個 CSS fallback 家族。替代方案（把 W# 靜態塞進候選名單）被否決：無法涵蓋其他廠商命名（如 Avenir 的 35 Light），查詢實際清單才是通解。

**D3：文字寬度匯出精確值，防換行改用 textAutoResize 提示。** getTextExportWidth 移除 max(12, fontSize) safety width，一律回傳 rect 寬度；getTextExportX 的補償隨之自然歸零（extraWidth=0）。為避免 Figma 端字型度量微差造成意外換行，exporter 對「單行文字」（匯出字串不含換行、且 rect 高度小於 2 倍行高）額外標記 textAutoResize: WIDTH_AND_HEIGHT；importer 既有 applyTextAutoResize 已支援該欄位，套用後節點以 Figma 自身度量收縮包住文字，寬度自然貼齊。多行段落（如 375px 兩行本文）維持固定寬高，靠 D2 的正確字型讓斷行位置一致。

**D4：inline 單行文字以 line box 模型補償高度與 y。** 瀏覽器對 display:inline 元素回報的 rect 高度是字型內容高（content area），而視覺行盒高是 line-height；Figma 文字節點高度由 line-height 決定。createTextLeafNode 在「computed display 為 inline、單行、lineHeight（px）大於 rect 高度」時：height 改用 lineHeight，y 上移 (lineHeight − rectHeight)/2（half-leading）。這使 Figma 的繪製基線與瀏覽器一致，匯入端無需任何配套修改。inline-block、inline-flex 不適用（其 rect 已含行高盒）。

**D5：版本與同步策略。** addon package.json 0.7.0→0.8.0（version.ts 由 tsup define 注入不用改）、importer code.ts 的 PLUGIN_VERSION 1.6.1→1.7.0。建置順序：addon tsup 打包 → npm pack 產生 0.8.0 tgz；importer tsc 產出 code.js 後複製到 template 的 figma/storybook-code-to-design/。80sJP-Grok 端同步（外掛資料夾直接覆蓋 code.ts/code.js；vendor tgz 替換與 npm install 需重啟其 Storybook dev server）列為交付後的驗收步驟，由使用者或後續作業執行，因其 dev server 目前正在服務且 vite dep cache 已過期（重啟同時可修復 504）。

## Implementation Contract

**exporter（domExport.ts）**

- findExportRoot(scope) 回傳 scope.firstElementChild ?? undefined；不再參照 [data-component] 收斂。既有「story 根即元件」payload（root.component 存在）輸出不變。
- getTextExportWidth 回傳輸入 width 原值（函式可整併移除）；getTextExportX 對應化簡。
- createTextLeafNode 新增 inline 行盒補償：條件 computed.display === "inline" 且 text 不含 "\n" 且 lineHeight 為數字且 lineHeight > height；效果 height := lineHeight、y := y − (lineHeight − height)/2。
- 單行文字（不含 "\n" 且未被 maxLines/固定 flex-basis 約束）標記 textAutoResize = "WIDTH_AND_HEIGHT"（絕對定位情境）。
- 可觀察行為：對 Inline story 產出的 payload，root 為段落節點（375 寬、text 節點 ≥ 3、其中一個含 component reference sourceName "text-link"/variant "inline"）；こちら 文字節點 width 48±1、height 26.4±0.15、y 落在首行行盒頂（相對段落 −1〜0.75）、textAutoResize WIDTH_AND_HEIGHT；換行的尾段 run 高度為 2×26.4=52.8 並標記 HEIGHT 自動成長。

**importer（code.ts）**

- 新增 pure helper parseFontStyleWeight(styleName): { weight: number; italic: boolean } | undefined，輸出加入 module.exports 供 test/verify-pure-functions.cjs 驗證；W# 與數字命名優先於歐文對照表。
- loadTextFont / loadBoundFontFamily 共用 available-styles fallback：getFontStyleCandidates 全失敗時查 figma.listAvailableFontsAsync（快取一次），同家族取字重最近的 style；仍失敗才輪到下一家族，最後 Inter Regular。
- PLUGIN_VERSION → "1.7.0 (實作當日)"。
- 可觀察行為：payload fontFamily "Hiragino Kaku Gothic ProN, …" + fontWeight 700 在 macOS Figma 上解析為 {family: "Hiragino Kaku Gothic ProN", style: "W6"}，不再 fallback 到 Noto Sans JP。

**驗證目標**

- addon：npm run build 與 npm run test:plugin-code 綠燈；以 headless Chrome 載入含 TextLink 樣式複本的 fixture 頁 + 重建後的 addon bundle，斷言上述 payload 可觀察行為。
- importer：node test/verify-pure-functions.cjs 綠燈（含 parseFontStyleWeight 新案例：W6→600、"53 Extension"→undefined、"Bold Italic"→{700,true}）。
- 同步驗證：template 的 code.js 與 assets 建置產物一致（md5 相同）；80sJP-Grok 外掛資料夾副本一致。

## Risks / Trade-offs

- **既有元件庫版面**：D1 使含示範標記的元件 story 匯出根從元件變成包裹節點，重匯入時 Components 頁的變體整理輸入形狀改變；importer 深度分組邏輯已涵蓋（depth>0 條目有既有處理路徑），但需以 Inline story 實際匯入驗收。
- **textAutoResize 寬度微差**：Figma 與瀏覽器同字型度量仍可能有 <1px 差異，置中對齊的絕對定位文字會偏移半個差值；接受此誤差（遠小於現行 +16px 膨脹）。
- **listAvailableFontsAsync 成本**：清單可達數千筆，僅在候選失敗時查一次並以 Map 快取家族→styles，對常見匯入零額外成本。
