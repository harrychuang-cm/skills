## 1. 元件與樣式修正

- [x] 1.1 flow preview 判定與 chrome 條件渲染:`ExamplePrototype.tsx` 新增讀取 `prototypeFlowPreview=true` query 的判定,與 `isFlowPreview` prop 合併為單一 flow preview 旗標;topbar 與 tabs 僅在該旗標為 false 時渲染,route body 兩種模式皆渲染,一般 story 模式的 tab 切換行為不變(satisfies Requirement: Flow preview mode is entered by prop or query parameter; satisfies Requirement: Flow preview hides example prototype chrome)。驗證:grep 元件檔含 `prototypeFlowPreview` 讀取與 `!` 旗標條件包住 topbar 與 tabs,npm run typecheck 通過。
- [x] 1.2 CSS 防護規則:`example-prototype.css` 在 `.sbt-example-prototype--flow-preview` 範疇下加入隱藏 `.sbt-example-prototype__topbar` 與 `.sbt-example-prototype__tabs` 的 `display: none` 規則,僅作用於 flow-preview modifier 範疇內(satisfies Requirement: Defensive CSS chrome hiding)。驗證:內容審閱確認規則存在且選擇器皆以 flow-preview modifier 開頭。

## 2. 規範文件

- [x] 2.1 README 規範宣告:`src/pages/prototypes/README.md` 的原型撰寫規則加上「flow preview 模式(`isFlowPreview` prop 或 `prototypeFlowPreview=true` query)必須隱藏原型自身 chrome(header/topbar 與路由導覽),讓 flow 卡片與 iframe 預覽只呈現真實頁面內容」(satisfies Requirement: Prototype authoring guide declares the chrome rule)。驗證:內容審閱 README 含該規則條目。

## 3. 整體驗證

- [x] 3.1 型別檢查與行為確認:執行 npm run typecheck 結束碼為 0;以 grep 確認 `ExamplePrototypeFlowExport.tsx` 對範例原型傳入 `isFlowPreview`,搭配 1.1 的條件渲染即可保證 Static Flow 卡片無 chrome(satisfies Requirement: Flow preview hides example prototype chrome)。驗證:typecheck 輸出無錯誤,grep 結果非空。
