## 1. Token 層

- [x] 1.1 落實 spec「Complete three-tier viewport token pairs」：tokens/tokens-ref.css 新增 `--sbt-ref-size-800: 800px` 與 `--sbt-ref-size-1024: 1024px`；tokens/tokens-sys.css 在既有 viewport 區塊補上 `--sbt-sys-size-viewport-medium-height: var(--sbt-ref-size-1024)` 與 `--sbt-sys-size-viewport-wide-height: var(--sbt-ref-size-800)`，compact 值與語意不動。驗證：Storybook 啟動後於 devtools 讀取六個 viewport token，compact 解析 375px/812px、medium 768px/1024px、wide 1280px/800px，且每個 sys token 都經 ref token 間接參照。

## 2. 治理文案

- [x] 2.1 落實 spec「Governance copy names the form-factor tiers」：src/stories/_shared/copy.ts 的 size 治理段落把 viewport token 改寫為三個 form-factor 參考 shell（compact＝phone、medium＝tablet、wide＝desktop，經 prototype 的 flow.viewport 逐一消費），保留「不是響應式斷點 token」規則；Viewport And Regions 表補上 medium/wide 的 width 與 height 四列與 form-factor 標籤。驗證：size token 文件 story 渲染後列出全部六個 token 列與 form-factor 標籤，並含 reference shell（非 breakpoint）敘述；內容審閱對照 spec 條文逐項打勾。

## 3. Inspector 副本同步

- [x] 3.1 落實 spec「Inspector runtime copies stay in sync with the skill asset」：待 cm-skills 根層 add-flow-viewport-contract 完成 skill asset 的 preview.js 與 prototype-inspector.css 更新後，把兩檔逐 byte 複製到 .storybook/prototype-inspector/（不得在本側加入任何行為差異），與 token/文案修改同一批 commit。驗證：diff .storybook/prototype-inspector/preview.js 與 skill asset 副本回報無差異（prototype-inspector.css 同）；執行 python3 storybook-product-prototype/scripts/test_scaffold_validate.py 時 byte-diff 斷言通過。
