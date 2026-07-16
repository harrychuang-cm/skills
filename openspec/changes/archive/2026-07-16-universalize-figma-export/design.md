## Context

前一 change 已把 exporter 引擎統一到 assets 權威副本並建立三層驗證（builds、headless Chromium fixture、payload 驗證器）。目前 preview 端進入點 preview.tsx 以 react createElement 包裝 story（FigmaCodeExporter React 元件負責 scope 包裝與 overlay UI），因此非 React 的 Storybook 在 bundle preview 時無法解析 react；tokenExport.detectTokenPrefix 在無 `--prefix-layer-*` token 時擲錯中止匯出；domExport 遍歷使用 element.children 不進 shadowRoot，規則收集只讀 document.styleSheets；匯出結果靠剪貼簿手動搬運到 Figma plugin。review-server.ts 已是一個 Vite middleware（review 狀態持久化），具備擴充端點的位置。Figma plugin（1.2.0）ui.html 已同時支援貼上與選檔。

## Goals / Non-Goals

**Goals:**

- 任何 renderer（React/Vue/Svelte/Angular/Web Components）的 Storybook 10 都能安裝並使用匯出 addon 的核心功能
- 無三層 token 的專案能完成純視覺匯出（tokens 空、不擲錯）
- open Shadow DOM 元件（含 adoptedStyleSheets）能匯出結構、樣式與 token 綁定
- 匯出 payload 可經本機橋自動入庫，Figma plugin 一次拉取多筆匯入，貼上/選檔流程不受影響
- 全部新行為納入可重複的 headless/node 驗證

**Non-Goals:**

- 批次「自動渲染全部 story」的 manager 端巡覽匯出
- closed shadow root 內容擷取
- review 面板（review.ts）的去 React 化——維持 React-only 選配並如實記錄
- Figma plugin 發佈版（非 development）的 networkAccess 政策
- 匯出引擎既有擷取行為的變更（前一 change 範圍）

## Decisions

### 決策 1：preview 端以 pass-through decorator 加 body 掛載 vanilla overlay 取代 React 包裝

**選擇**：createFigmaExportDecorator 改為 (storyFn, context) => { 更新 overlay 狀態(context); return storyFn(); }——不建立 wrapper 元素、不改寫 story 回傳值，因此對任何 renderer 的 decorator 契約都成立。overlay 改為純 DOM 單例模組 overlay.ts（document.createElement 建構，掛載於 document.body），沿用 figma-code-exporter.css 樣式類名與三個既有動作（Copy JSON、Plugin Console Script、Copy design to Figma）；globals 開關為 on 且 context.viewMode 為 story 時掛載，否則自 DOM 移除。匯出範圍改為 document.getElementById("storybook-root")，找不到時 fallback 至 document.body 並在狀態列顯示警告；overlay 掛於 body 不在 scope 內。preview 進入點檔案不再 import react 與 @storybook/icons（改用 inline SVG 字串）；FigmaCodeExporter.tsx 刪除，純函式（componentTitle 解析、SVG 產生、剪貼簿）遷入 overlay.ts。
**理由**：剪貼簿寫入必須發生在使用者手勢的同一 context——overlay 留在 preview 內最安全；manager-panel + channel 方案會讓 clipboard 寫入失去 user activation。pass-through decorator 是唯一與所有 renderer 相容的形狀。
**替代方案**：manager 面板 + channel 事件（被否決：clipboard user-activation 與 payload 過 channel 的體積/時序成本）；為每個 renderer 寫 framework decorator（被否決：維護面爆炸）。

### 決策 2：token-less 以空 token system 降級而非擲錯

**選擇**：detectTokenPrefix 找不到候選時回傳 undefined（不 throw）；detectTokenSystem 回傳 prefix 為空字串、catalog 為空的系統；extractCssVariableNames 在 prefix 空時直接回空陣列；collectBindings 與漸層 stop token 附掛在空 catalog 下自然產出空綁定。payload.tokenSystem.prefix 為空字串、tokens 為空陣列。overlay 摘要顯示 0 variables。明確設定 tokenPrefix 的專案行為不變。
**理由**：無 token 專案的「純視覺匯出」仍有完整價值；擲錯是全有全無的錯誤設計。
**替代方案**：新增 options.tokenless 開關（被否決：多一個開關但語意與自動降級相同）。

### 決策 3：Shadow DOM 以 shadowRoot 子層、slot flatten 與 per-root 規則納入

**選擇**：遍歷取子層時：元素有 open shadowRoot → 以 shadowRoot 的元素子層為 children；遇 slot 元素 → 以 assignedElements({ flatten: true }) 展開為該位置的子層、slot 本身不產生節點（無 assigned 時使用 slot 的元素子層作為 fallback content）。規則收集重構為 rule index：document.styleSheets + document.adoptedStyleSheets 為基底；首次進入某 shadowRoot 時收集該 root 的 styleSheets 與 adoptedStyleSheets 並快取，該 root 內元素的綁定比對使用「document 規則 + 該 root 規則」串接（跨界比對自然 false、無害）。matchMedia 過濾與 specificity 排序沿用。tokenExport 的 collectCssCustomProperties 亦加入 document.adoptedStyleSheets。getBoundingClientRect 與 getComputedStyle 跨 shadow 邊界原生可用，量測法不需調整。
**理由**：Lit 等框架以 adoptedStyleSheets 注入樣式，不讀就沒有任何 var() 綁定；slot flatten 對應瀏覽器實際渲染樹。
**取捨**：::slotted、:host 特異選擇器的 specificity 以現行簡化計數處理；closed root 不可存取，維持不匯出。

### 決策 4：批次橋採「exporter push 至 dev server、plugin 拉取」

**選擇**：review-server.ts 的 middleware 新增 payload store 端點群（與既有 review 狀態端點同一 plugin 內）：POST /__figma-export/payloads 以 payload.storyId 為檔名（sanitize 為小寫英數與連字號）寫入設定目錄（新選項 payloadDir，預設 design-system/figma-export-payloads）；GET /__figma-export/payloads 回傳摘要清單（storyId、storyName、componentTitle、generatedAt）；GET /__figma-export/payloads/<storyId> 回傳完整 payload；全端點回 Access-Control-Allow-Origin: *、Access-Control-Allow-Methods 與 OPTIONS 204（plugin iframe origin 為 null）。exporter options 新增 payloadSyncUrl（預設關閉）；overlay 匯出成功後 fire-and-forget POST 並在狀態列顯示 synced 或 sync failed，不影響剪貼簿主流程。plugin ui.html 新增 Load from Storybook 區塊：URL 輸入（預設 http://localhost:6006）、Fetch 清單、checkbox 多選、Import selected 逐筆以既有 import-json 訊息送入 main thread（code.ts 匯入邏輯零變更）；manifest.json 加 networkAccess（allowedDomains: ["none"]、devAllowedDomains: ["http://localhost:*", "http://127.0.0.1:*"]）。
**理由**：payload 生成需要真實渲染的 DOM，dev server 無法代產——push-on-export 讓多 story 累積、Figma 端一次拉取，去掉剪貼簿往返；main thread 不動把風險關在 UI 層。
**替代方案**：plugin 直連 Storybook iframe 渲染任意 story 後取 payload（被否決：Figma iframe 無法載入外部頁面執行 exporter）；manager 端自動巡覽全部 story（記入 Non-Goals）。

### 決策 5：驗證以 overlay fixture、token-less fixture、shadow 案例與 store node 測試擴充既有三層

**選擇**：(a) 新增 test/overlay-fixture.html + test/run-overlay-fixture.mjs——頁面載入 overlay bundle，以假 context（globals on、viewMode story）呼叫 decorator 兩次（on/off），斷言 aside 掛載與移除；以覆寫 navigator.clipboard.writeText 的 stub 收集文字，觸發 Copy JSON 後斷言可解析且 version 為 2；設定 payloadSyncUrl 指向 runner 起的本機 server，斷言收到 POST 且 body storyId 正確。(b) 新增 test/tokenless-fixture.html（無任何 token 定義）——runner 斷言匯出完成、payload.tokens 長度 0、tokenSystem.prefix 為空字串。(c) 主 export-fixture.html 新增 case-shadow-dom：custom element open shadowRoot、adoptedStyleSheet 內以 var(--fx-sys-color-primary) 設定背景——斷言 host 節點 children 含 shadow 內容且其 bindings.backgroundColor 為該 token。(d) 新增 test/run-payload-store-test.mjs——以 node http server 掛 review-server middleware，驗證 POST→list→GET roundtrip、CORS 標頭、storyId sanitize（含路徑穿越樣本拒收）。(e) plugin 的 Load from Storybook 無法在 Figma 外執行，README 記錄手動驗證步驟；ui.html 的清單解析函式以可注入 fetch 的形式撰寫並於 node 驗算。
**理由**：延續前一 change 的驗證架構，讓每個新行為都有可重複執行的驗證入口。

## Implementation Contract

**Decorator / overlay 契約：**

- createFigmaExportDecorator(options) 回傳的 decorator 對任何 renderer 滿足：回傳值嚴格等於 storyFn() 的回傳值（不包裝、不複製）；副作用僅限 overlay 單例的掛載/更新/移除。
- overlay 為 aside 元素、class 含 sbfx-exporter、掛載於 document.body；data-status 屬性值域 idle/copying/copied/error；globals[globalName] 非 "on" 或 context.viewMode 非 "story" 時該 aside 不存在於 DOM。
- 匯出 scope 解析順序：id 為 storybook-root 的元素 → document.body（fallback 時狀態列顯示警告字樣）。
- preview 進入點與 overlay.ts 對 react、@storybook/icons 零 import（以建置產物 grep 驗證）。

**Token-less 契約：**

- 無任何 `--<prefix>-<layer>-*` token 的頁面：createFigmaExportPayload 正常 resolve；payload.tokens 為 []；payload.tokenSystem.prefix 為 ""；全節點 bindings 為空物件；不出現 "Unable to detect a CSS token prefix" 錯誤。

**Shadow DOM 契約：**

- host 元素的匯出節點 children 為其 open shadowRoot 的元素子層（slot 位置展開為 assignedElements flatten 結果）。
- shadowRoot.adoptedStyleSheets 內 var(--token) 宣告對 shadow 內元素產生 bindings；document.adoptedStyleSheets 定義的 :root token 進入 token catalog。

**批次橋契約：**

- POST /__figma-export/payloads：body 為合法 payload JSON → 201 並落盤；storyId sanitize 後為空或 body 非法 → 400。
- GET /__figma-export/payloads：JSON 陣列，元素含 storyId、storyName、componentTitle、generatedAt。
- GET /__figma-export/payloads/<storyId>：回傳與 POST 相同內容；不存在 → 404。
- 全端點含 Access-Control-Allow-Origin: *；OPTIONS 回 204。
- exporter 設 payloadSyncUrl 時：匯出成功後對該 URL 發 POST（body 為 payload），失敗不中斷剪貼簿流程且狀態列顯示 sync failed。
- plugin UI：Fetch 使用 GET 清單、Import selected 逐筆 GET 單筆後以既有 import-json postMessage 匯入；code.ts 的訊息協定與匯入行為零變更。

**相容性：**

- 未設定 payloadSyncUrl、未使用 shadow DOM、有 token 專案：行為與 1.2.0/前版完全一致。
- React Storybook 專案沿用同一 decorator（pass-through 對 React 同樣成立），既有 storyTitlePrefix 過濾與 componentTitle 解析行為保留。
- template 使用者需在 Figma 重新 Import plugin manifest 以取得 networkAccess。

**驗收方式：**

1. addon tsup build、plugin tsc build 零錯誤；建置後 dist 的 preview 相關產物 grep 不到 from "react"。
2. node test/run-overlay-fixture.mjs、node test/run-export-fixture.mjs（含 shadow 案例）、tokenless 斷言（併入 overlay 或獨立 runner）、node test/run-payload-store-test.mjs、node test/verify-pure-functions.cjs 全數通過。
3. validate_figma_export_payload.mjs 對主 fixture payload 零 error。
4. 三份 exporter src 遞迴 diff 一致；template plugin 副本與 assets 建置產物一致（含 manifest、ui.html）。

**範圍邊界：**

- In scope：上述契約、副本同步、SKILL.md 門檻放寬、README/readiness 更新、主 specs Purpose 補寫。
- Out of scope：Non-Goals 各項、匯出引擎既有擷取規則的改動、review 面板重寫。

## Risks / Trade-offs

- [不同 renderer 對 decorator 回傳值的處理差異] → pass-through 不觸碰回傳值；overlay 與 story 樹完全解耦；overlay fixture 直接以 decorator 函式驗證。
- [storybook-root id 隨 Storybook 版本變動] → fallback 至 document.body 並顯示警告；findExportRoot 仍以 data-component 錨定實際元件根。
- [Figma plugin iframe 的網路政策阻擋 localhost fetch] → manifest devAllowedDomains 明確宣告；UI 顯示連線/CORS 錯誤並保留貼上與選檔流程為主路徑。
- [payload store 檔名注入/路徑穿越] → storyId sanitize 為 [a-z0-9-] 集合，空值拒收；store node 測試含穿越樣本。
- [移除 React 造成 React 專案 overlay 回歸] → DOM overlay 與 renderer 無關；主 fixture 全套回歸把關。
- [adoptedStyleSheets 規則量大造成綁定掃描變慢] → per-root 規則快取一次收集；token-less 短路徑跳過全部掃描。
