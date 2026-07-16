## 1. 副本統一與基準建置

- [x] 1.1 依 design「決策 1：以 assets 副本為權威來源，合併最新引擎與 review 模組」：將 storybook-template/vendor/figma-export/src 的最新引擎檔（domExport.ts、types.ts、tokenExport.ts、FigmaCodeExporter.tsx、pluginCode.ts、index.ts、globals.d.ts）合併進 design-system-to-storybook/assets/figma-export-addon/src，保留既有 review.ts、review-server.ts、source.ts、review.css 與 package.json 的 review exports。完成後 assets 副本可輸出 payload version 2（具備 backgroundLinearGradient、borderSides、HUG sizing、textAlign、outOfFlow 能力），作為「Single authoritative exporter source」的基準。驗證：在 assets/figma-export-addon 執行 npm install 與 npm run build 成功產出 dist，且 domExport.ts 輸出 version: 2。

## 2. Exporter 樣式擷取（assets/figma-export-addon）

- [x] 2.1 實作 spec「Modern CSS color normalization」（design「決策 3：色彩正規化在 exporter 端以 canvas 往返完成」）：新增 canvas fillStyle 往返正規化工具，套用於 computed 色彩輸出與 tokenExport.ts 的 token rawValue 色彩解析（oklch()/lab()/color()/hsl()/named color → hex 或 rgb()/rgba()，token 判定為色彩時 type 為 COLOR）。驗證：fixture 的 oklch 背景案例 payload backgroundColor 為 rgb()/hex 形式；hsl token 案例輸出 type COLOR。
- [x] 2.2 實作 spec「Shadow capture as effects」與「Per-corner radius capture」：解析 box-shadow 列表與 text-shadow 為 styles.effects（DROP_SHADOW/INNER_SHADOW，含 color/offsetX/offsetY/blur/spread，無陰影不輸出欄位）；讀取四角 computed radius，等值輸出 radius、異值輸出 radiusCorners。驗證：fixture 陰影案例斷言 effects 數值；border-radius 8px 8px 0 0 案例斷言 radiusCorners { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 }；無陰影節點無 effects 欄位。
- [x] 2.3 實作 spec「Raster image capture」（design「決策 5：點陣圖以 base64 內嵌並限制最長邊」）：非 SVG 的 img 與 canvas 元素繪入最長邊 2048 上限的暫存 canvas，輸出 imageBase64（無 data: 前綴）、imageMimeType、依 object-fit 映射的 imageScaleMode（cover/fill→FILL，contain/none/scale-down→FIT）；跨域 taint 時 fetch fallback，雙敗仍輸出無 imageBase64 的 image 節點。驗證：fixture 同源 PNG 案例 imageBase64 非空且 mime 為 image/png。
- [x] 2.4 實作 spec「Text style capture」（design「決策 6：text-transform 烘入匯出字串而非使用 Figma textCase」）：text-transform 直接轉換匯出字串；以 innerText 與 white-space 判斷保留渲染換行；letter-spacing 非 normal 時輸出 px 數值；text-decoration underline/line-through 輸出 textDecoration UNDERLINE/STRIKETHROUGH；font-style italic 輸出 fontStyle "italic"。驗證：fixture uppercase 案例 text 為大寫字串、br 多行案例 text 含換行字元、letter-spacing 0.5px 案例輸出 letterSpacing 0.5 與 textDecoration UNDERLINE。

## 3. Exporter 佈局與 token 綁定（assets/figma-export-addon）

- [x] 3.1 實作 spec「Measured auto-layout spacing」（design「決策 4：Auto Layout 間距採量測法（rect 推導），不均勻時退回 absolute」）：autoLayout 容器子節點先依主軸視覺位置排序（涵蓋 row-reverse/column-reverse/order）；量測相鄰間距，均勻（±1px）→ 輸出為 gap，justify-content space-between 維持既有映射，不均勻且非 space-between → 容器退回 absolute；start 對齊時以首末子元素偏移折算有效 padding。驗證：fixture margin 12px 排距案例 gap 為 12 且 layoutStrategy 為 autoLayout、混合 8px/24px 間距案例 layoutStrategy 為 absolute、row-reverse 案例 children 順序為視覺左→右。
- [x] 3.2 實作 spec「Flex wrap capture」：以子元素 cross 軸座標分行偵測換行，輸出 layoutWrap "WRAP"、行內間距 gap、行間距 counterAxisSpacing。驗證：fixture 兩行 chip 案例斷言 layoutWrap WRAP、gap 8、counterAxisSpacing 12。
- [x] 3.3 實作 spec「Token binding correctness」與「Payload compatibility」（design「決策 7：token 綁定引入 matchMedia 過濾與 specificity 排序」、「決策 2：payload 維持 version 2，新欄位一律 optional」）：getCssRules 以 window.matchMedia 過濾不匹配的 media query 規則；getMatchedDeclarations 依（selector specificity、來源順序）排序後仍後者勝，inline style 最高；types.ts 所有新欄位宣告為 optional 且不適用時省略。驗證：fixture 內 max-width 600px 專屬 token 在寬視窗不出現於 bindings、兩級 specificity 案例綁定較高 specificity 的 token；plain 節點 payload 經 JSON 斷言不含任何新欄位 key。

## 4. Figma plugin 套用（assets/figma-plugin-code-to-design）

- [x] 4.1 實作 spec「Shadow effects application」、「Per-corner radius application」、「Wrapped auto layout application」、「Text style application」：effects 轉為 Figma DROP_SHADOW/INNER_SHADOW（visible true、blendMode NORMAL、失敗記 warning 不中斷）；radiusCorners 設四角屬性；layoutWrap WRAP 與 counterAxisSpacing 套用至 auto-layout frame；letterSpacing 以 PIXELS 套用、textDecoration 套用、字型候選改為權重×斜體矩陣並涵蓋 thin(100) 至 black(900) 九級字重與 Italic 組合。驗證：npm run build（tsc）零錯誤；對照 spec 場景與 Example 表逐項 code review（含 Light/Italic/Bold Italic 候選順序）。
- [x] 4.2 實作 spec「Raster image fill creation」：imageBase64 經 figma.base64Decode 與 figma.createImage 建立 ImagePaint（scaleMode 取 styles.imageScaleMode，預設 FILL）；解碼或建圖失敗記 warning（訊息含節點路徑）並維持空 frame 行為。驗證：tsc build 零錯誤；code review 對照 spec 的 corrupt base64 場景。
- [x] 4.3 實作 spec「Robust color parsing」與「Arbitrary gradient angle」：colorFromCss 支援 4/8 位 hex、hsl()/hsla()、rgb(r g b / a) 空白語法；linear-gradient gradientTransform 改以旋轉矩陣支援任意角度。驗證：將純函式抽為可於 node 執行的驗算（或 node --eval 內嵌重算），斷言 #33667780 解析為 r 0.2、g 0.4、b 0.4667（±0.01）、opacity 0.5（±0.01），45 度角矩陣與預期方向一致。
- [x] 4.4 實作 spec「Backward and forward payload compatibility」：validateNode 接受全部新 optional 欄位並對型別錯誤擲出含節點路徑與欄位名的錯誤；不含新欄位的 v1/v2 payload 匯入行為與 1.1.8 一致；PLUGIN_VERSION 升版並重建 code.js。驗證：npm run build 成功；以 node 對抽出的 parsePayload 驗證邏輯執行——舊 payload 樣本不 throw、effects 為字串的壞樣本 throw 且訊息含節點路徑與 effects。

## 5. Fixture、驗證器與文件（design「決策 8：驗證以建置、瀏覽器 fixture 匯出、payload 驗證器三層把關」）

- [x] 5.1 新增 design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html 並完成瀏覽器匯出驗證：單檔無相依 fixture 含 ref/sys/comp token 定義與全部新特性案例（陰影、oklch、四角圓角、margin 排距、不均勻間距、wrap、row-reverse、同源 PNG、uppercase、多行、letter-spacing、media query 綁定、specificity 綁定、plain 節點）；將 domExport 打包為獨立 IIFE 在真實 Chromium 載入 fixture 執行 createFigmaExportPayload，逐案例斷言 design Implementation Contract 的可觀察行為並將 payload 存檔。驗證：全部案例斷言通過，payload 檔案留存於 change 紀錄可引用的位置。
- [x] 5.2 擴充 design-system-to-storybook/scripts/validate_figma_export_payload.mjs：接受 payload version 2，並檢查新 optional 欄位的型別與值域（effects 陣列形狀、radiusCorners 四鍵數值、layoutWrap 僅 WRAP、textDecoration 枚舉、imageBase64 字串、imageScaleMode 枚舉），未知情況維持原有警告行為。驗證：對 5.1 產出的 payload 執行 exit 0（零 error）；移除全部新欄位前後的 --strict warning 數相同（新欄位零新增 warning）；且注入型別錯誤的新欄位樣本會以 error 使 exit code 為 1。（fixture 刻意含非 token 顏色與 absolute fallback 案例，完整 fixture 的 --strict 零 warning 非驗收目標——見 design Implementation Contract 驗收方式第 3 點）
- [x] 5.3 文件更新：assets/figma-export-addon/README.md、assets/figma-plugin-code-to-design/README.md、references/figma-export-readiness.md 更新——放寬 margin 排距、flex-wrap、box-shadow、點陣圖的契約限制，記錄仍存在的限制（字型 metrics 差異、transform rotate/scale、z-index 重排、廣色域 clamp 至 sRGB、2048 圖片上限）。驗證：內容審閱與 design 的 Non-Goals、Risks 一致。

## 6. 同步與最終回歸

- [x] 6.1 落實 spec「Single authoritative exporter source」：將 assets/figma-export-addon 的 src 與重建 dist 同步至 storybook-template/vendor/figma-export 與 storybook-template/.storybook/vendor/figma-export-addon；將 assets/figma-plugin-code-to-design 重建產物同步至 storybook-template/figma/storybook-code-to-design。驗證：三份 exporter src 遞迴 diff 無差異；template plugin 副本檔案與 assets 建置產物一致。
- [x] 6.2 最終回歸：依序執行 addon tsup build、plugin tsc build、plugin node 純函式驗算（test/verify-pure-functions.cjs，內含舊 v1 payload parsePayload 不 throw 的相容樣本）、瀏覽器 fixture 匯出斷言（test/run-export-fixture.mjs）、validate_figma_export_payload.mjs 對 fixture payload 零 error（依 5.2 修訂後準則），全部通過。驗證：各命令 exit 0 並記錄於 apply 過程。
