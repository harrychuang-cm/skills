## Context

Storybook→Figma 匯出管線由兩端組成：figma-export-addon（瀏覽器端，把渲染後 DOM 序列化為 JSON payload）與 figma-plugin-code-to-design（Figma plugin，把 payload 重建為 Figma 圖層與 Variables）。skill 內共有三份 exporter 副本（assets、storybook-template/vendor、storybook-template/.storybook/vendor），內容已分歧：template/vendor 引擎最新（v2 payload：linear-gradient、borderSides、HUG、textAlign、outOfFlow、component references），assets 與 .storybook 副本則獨有 review 模組（review.ts、review-server.ts、source.ts、review.css，兩份內容相同）；options.ts 三份一致。installer（scripts/install_figma_export_addon.mjs）以 assets 副本為來源。plugin 僅一份原始碼（assets/figma-plugin-code-to-design，PLUGIN_VERSION 1.1.8，支援 payload v1|v2），template 另有一份 built 副本。

即使最新引擎，仍未擷取：box-shadow/text-shadow、點陣圖、四角獨立圓角、oklch/lab/color() 色彩、letter-spacing/text-transform/text-decoration/italic、多行文字換行、margin 排距、flex-wrap、reverse/order 視覺順序；token 綁定掃描不過濾 media query 也不計 specificity。

## Goals / Non-Goals

**Goals:**

- 三份 exporter 副本統一為單一權威內容，消除 installer 路徑的退化體驗
- 消除主要「樣式不正確／跑版」根因：陰影、點陣圖、四角圓角、現代色彩、margin 排距、flex-wrap、視覺順序、文字樣式細節
- token 綁定正確性：只綁定實際生效的宣告（media query、specificity）
- payload 相容性：舊 plugin 讀新 payload 優雅降級，新 plugin 讀舊 payload 行為不變
- 可重複驗證：無相依 fixture 頁 + 既有 payload 驗證器覆蓋新欄位

**Non-Goals:**

- 非 React renderer（Vue/Svelte/Angular/Web Components）支援與 framework-agnostic decorator 改造
- Shadow DOM / adoptedStyleSheets 遍歷
- 無 token 系統專案的降級匯出模式
- review-server／localhost 直連批次匯入 UX
- transform rotate/scale 擷取、z-index 重排、mask/filter 特效（維持既有 fallback 行為，記錄為已知限制）
- Figma plugin 端的元件／variant 管理邏輯重構（僅新增欄位套用）

## Decisions

### 決策 1：以 assets 副本為權威來源，合併最新引擎與 review 模組

**選擇**：把 template/vendor 的最新引擎檔（domExport.ts、types.ts、tokenExport.ts、FigmaCodeExporter.tsx、pluginCode.ts、index.ts、globals.d.ts）合併進 assets/figma-export-addon，保留 assets 既有 review 模組與 package.json exports；所有新開發都在 assets 進行，完成後整包同步到兩個 template 副本（src 與 dist 皆同步）。
**理由**：assets 是 installer 與 README 指定的散佈來源；review 模組在 assets/.storybook 兩份完全相同、且只依賴 options/preview/source，合併風險低。
**替代方案**：以 template/vendor 為權威——被否決，因 installer 讀 assets，且該副本缺 review 模組。

### 決策 2：payload 維持 version 2，新欄位一律 optional

**選擇**：不引入 version 3。新欄位（effects、radiusCorners、layoutWrap、counterAxisSpacing、letterSpacing、textDecoration、fontStyle、imageBase64/imageMimeType/imageScaleMode、textShadow 併入 effects）全部為 optional，加入 exporter 的 types.ts 與 plugin 的節點驗證。
**理由**：plugin 的 parsePayload 白名單只驗證已知受限欄位、忽略未知欄位，舊 plugin 讀到新 payload 自然忽略新欄位（視覺降級但不失敗）；升 v3 會讓舊 plugin 直接拒收。
**替代方案**：升 v3 並雙軌支援——被否決，破壞已散佈副本且無對應收益。

### 決策 3：色彩正規化在 exporter 端以 canvas 往返完成

**選擇**：exporter 建立單一 2D canvas context，把任何色彩字串（oklch()、lab()、color()、hsl()、named color）經 fillStyle 設定後讀回，得到 #rrggbb 或 rgba() 標準形式；套用於 computed style 色彩與 token rawValue（token 僅在值看起來是色彩時嘗試）。plugin 端 colorFromCss 補防禦性解析：hsl()、4/8 位 hex、rgb(r g b / a) 空白語法。
**理由**：瀏覽器有完整 CSS Color 4 引擎，plugin sandbox 沒有；在來源端正規化一次，所有下游（plugin、SVG 複製、驗證器）都受益。
**替代方案**：在 plugin 內實作 oklch→sRGB 數學轉換——被否決，重複造輪、易錯、且救不了 SVG 複製路徑。
**取捨**：canvas 往返會把廣色域 clamp 到 sRGB；Figma Variables 本就以 sRGB 儲存，可接受。

### 決策 4：Auto Layout 間距採量測法（rect 推導），不均勻時退回 absolute

**選擇**：flex 容器轉 autoLayout 時，不再只讀宣告的 gap，而是量測子元素 bounding rect：(a) 依主軸座標排序子節點（自動涵蓋 row-reverse/column-reverse/order）；(b) 計算相鄰間距序列，全部相等（±1px）→ 該值為 itemSpacing（涵蓋 margin 排距、space-around/space-evenly 的均勻間距）；(c) justify-content 為 space-between 時維持 SPACE_BETWEEN、itemSpacing 0；(d) 間距不均勻且非 space-between → 整個容器退回 absolute（位置像素正確）；(e) 首末子元素相對容器 content edge 的偏移在 start 對齊時折算為有效 padding。flex-wrap 以「子元素分行（cross 軸座標分群）」偵測，輸出 layoutWrap: "WRAP"、行內間距為 itemSpacing、行間距為 counterAxisSpacing。
**理由**：宣告法要重新實作 CSS 佈局引擎（margin 合併、auto margin、百分比），量測法直接使用瀏覽器已計算的結果，通用且準確；absolute 退路保證「不跑版」下限。
**替代方案**：解析 margin 宣告折算——被否決，覆蓋面窄且易錯。
**取捨**：量測值是「當前渲染快照」的間距，Figma 端改字後仍以該固定間距排版——與現況相同，屬既有限制。

### 決策 5：點陣圖以 base64 內嵌並限制最長邊

**選擇**：HTMLImageElement 非 SVG 來源與 canvas 元素，繪入暫存 canvas（最長邊上限 2048，超過等比縮小）後 toDataURL('image/png') 取 base64，輸出 node.imageBase64 + imageMimeType；styles.imageScaleMode 由 object-fit 映射（cover→FILL、contain→FIT、fill→FILL、none/scale-down→FIT）。plugin 以 figma.base64Decode + figma.createImage 建立 ImagePaint 填色；解碼失敗時維持既有「空 frame + warning」行為。跨域圖片繪製 canvas 失敗（taint）時，改走 fetch→blob→FileReader base64；再失敗則保留空 frame + warning。
**理由**：Figma createImage 上限 4096、payload 走剪貼簿需控制體積；2048 對設計稿檢視已足夠。
**替代方案**：輸出圖片 URL 由 plugin 端 fetch——被否決，plugin 網路受 manifest allowlist 限制、且 localhost 資源在 Figma 端不可達。

### 決策 6：text-transform 烘入匯出字串而非使用 Figma textCase

**選擇**：exporter 依 computed text-transform 直接轉換匯出字串（uppercase/lowercase/capitalize）；不輸出 textCase 欄位。同時：多行文字依 computed white-space 保留換行（pre/pre-wrap/pre-line/break-spaces），一般流內文字改用 innerText 取得渲染後換行（涵蓋 br 與 block 邊界）；letter-spacing 輸出 px 數值；text-decoration line-through/underline 映射 STRIKETHROUGH/UNDERLINE；font-style italic 輸出 fontStyle 欄位，plugin 字型候選改為（權重×斜體）矩陣並補齊 Light/Thin/ExtraBold/Black 對應。
**理由**：烘入字串讓舊 plugin 也顯示正確大小寫（相容優先）；textCase 雖保留原字串但舊 plugin 會顯示錯誤大小寫。
**取捨**：Figma 端失去「還原原始大小寫」的可編輯性，屬可接受的次要損失。

### 決策 7：token 綁定引入 matchMedia 過濾與 specificity 排序

**選擇**：domExport 的 getCssRules 遇 CSSMediaRule 時以 window.matchMedia(conditionText) 判斷、不符則跳過（與 tokenExport 既有行為一致）；getMatchedDeclarations 對命中的 rule 計算 CSS specificity（a,b,c 簡化計數，含逗號分組取命中 selector 的 specificity），宣告依（specificity，來源順序）穩定排序後仍以「後者勝」掃描；inline style 視為最高優先。
**理由**：修正「手機斷點 token 綁到桌面匯出」與「低 specificity 後宣告誤勝」兩類綁錯；值本身仍以 computed style 為準，此改動只影響變數綁定的正確性。
**替代方案**：完整 cascade（layer、!important、:where）——超出需求，簡化計數已覆蓋實務命名慣例。

### 決策 8：驗證以建置、瀏覽器 fixture 匯出、payload 驗證器三層把關

**選擇**：(1) addon 以 tsup、plugin 以 tsc 建置零錯誤；(2) 新增 assets/figma-export-addon/test/export-fixture.html——單檔、無相依、含三層 token 定義與全部新特性案例（陰影、oklch、四角圓角、margin 排距 flex、wrap、reverse、點陣 img、letter-spacing、text-transform、多行文字），在真實 Chromium 載入並執行打包後的 exporter，斷言 payload 欄位；(3) scripts/validate_figma_export_payload.mjs 擴充新欄位檢查並對 fixture payload 通過。plugin 端無法於 Figma 外執行，以 tsc 型別檢查 + 對 payload 驗證邏輯的 code review 把關，並維持 PLUGIN_VERSION 徽章升版以利人工回歸。
**理由**：exporter 是純瀏覽器程式，真實引擎驗證成本低、價值高；plugin 的 figma.* API 無法 headless 模擬，投資 mock 不划算。

## Implementation Contract

**Payload v2 新增欄位（exporter 輸出、plugin 套用、驗證器接受）：**

```
FigmaExportNode.styles.effects?: Array<{
  type: "DROP_SHADOW" | "INNER_SHADOW",
  color: string,          // rgba()/hex，已正規化
  offsetX: number, offsetY: number,
  blur: number, spread: number
}>
FigmaExportNode.styles.radiusCorners?: { topLeft: number, topRight: number, bottomRight: number, bottomLeft: number }
FigmaExportNode.styles.layoutWrap?: "WRAP"
FigmaExportNode.styles.counterAxisSpacing?: number
FigmaExportNode.styles.letterSpacing?: number            // px
FigmaExportNode.styles.textDecoration?: "UNDERLINE" | "STRIKETHROUGH"
FigmaExportNode.styles.fontStyle?: "italic"
FigmaExportNode.styles.imageScaleMode?: "FILL" | "FIT"
FigmaExportNode.imageBase64?: string                      // 不含 data: 前綴
FigmaExportNode.imageMimeType?: string                    // image/png 等
```

**可觀察行為：**

- 匯出端：fixture 頁各案例節點在 Copy JSON payload 中帶出上述欄位；oklch 背景色以 rgb()/#hex 形式出現；margin 排距 flex 容器輸出 layoutStrategy autoLayout 且 styles.gap 等於量測間距；間距不均勻案例輸出 layoutStrategy absolute；wrap 案例輸出 layoutWrap 與 counterAxisSpacing；row-reverse 案例 children 順序等於視覺左→右順序；text-transform: uppercase 案例的 text 為大寫字串；多行 pre-line 案例的 text 含換行字元；點陣 img 案例帶 imageBase64 非空。
- 匯入端：plugin 對含新欄位 payload 建立節點時——effects 轉為 Figma DROP_SHADOW/INNER_SHADOW effect（visible: true、blendMode: NORMAL）；radiusCorners 設 topLeftRadius 等四屬性；layoutWrap 設 node.layoutWrap 與 counterAxisSpacing；letterSpacing 設 {unit: "PIXELS"}；textDecoration/italic 套用至 TextNode（italic 反映在字型候選載入）；imageBase64 經 figma.base64Decode → figma.createImage → fills=[ImagePaint]，失敗時 warning 並維持空 frame。
- 相容性：plugin 對「不含任何新欄位」的既有 v1/v2 payload 匯入行為與 1.1.8 相同；新欄位型別錯誤時 parsePayload 擲出含節點路徑的錯誤訊息。
- 副本一致性：assets、storybook-template/vendor/figma-export、storybook-template/.storybook/vendor/figma-export-addon 三處 src 目錄內容一致（以遞迴 diff 驗證）；template 的 built plugin 副本與 assets 重建結果一致。

**驗收方式：**

1. 兩套件各自 npm run build 成功（addon：tsup 產出 dist；plugin：tsc 產出 code.js）。
2. 在真實 Chromium 載入 export-fixture.html 執行匯出，逐案例斷言上述「可觀察行為」，把 payload 存檔。
3. node design-system-to-storybook/scripts/validate_figma_export_payload.mjs 對該 payload 執行 exit 0（零 error，且接受 version 2）；並以「移除全部新欄位前後的 --strict warning 數相同」證明新欄位不新增任何 warning 或 error。注意：fixture 刻意包含非 token 顏色與 absolute fallback 壓力案例，這些會觸發既有 readiness warning，因此「完整 fixture 以 --strict 零 warning 通過」不是驗收目標；readiness warning 屬於元件實作回饋，維持原設計。
4. 遞迴 diff 三份 exporter src 一致；plugin built 副本一致。

**範圍邊界：**

- In scope：上述欄位的擷取、傳輸、套用；三副本同步；驗證器與 README/readiness 文件更新。
- Out of scope：Non-Goals 所列各項；exporter 的既有 component/variant 中繼資料流程；plugin 的 section／頁面組織邏輯。

## Risks / Trade-offs

- [瀏覽器與 Figma 字型 metrics 差異導致換行點不同] → 維持既有固定尺寸 + 安全寬度機制；本變更不試圖解決，README 記錄限制。
- [canvas 色彩往返 clamp 至 sRGB，廣色域略偏] → Figma Variables 為 sRGB，偏差可接受；記錄於 readiness 文件。
- [量測法在動畫／hover 中間態擷取到瞬時間距] → readiness 契約既有要求「固定狀態 story」；不新增處理。
- [大量點陣圖使剪貼簿 payload 膨脹] → 最長邊 2048 上限 + PNG 輸出；readiness 文件建議點陣內容優先用 SVG。
- [跨域圖片 canvas taint 導致無法輸出] → fetch fallback；再失敗維持空 frame + warning（與現況同）。
- [三副本同步遺漏（改了 assets 忘了 template）] → tasks 內含遞迴 diff 驗收步驟；未來可加 CI 檢查（out of scope）。
- [dist 重建需要 npm install 網路存取] → 離線時標記 blocked 並回報，不以手改 dist 替代。
