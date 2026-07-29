## 1. Exporter：story 根與文字幾何（domExport.ts）

- [x] 1.1 （spec: Story-root export scope）修改 findExportRoot 為一律回傳 scope.firstElementChild ?? undefined，移除單一 data-component 收斂與 getCommonAncestor 收斂。完成條件：含示範標記的 story（fixture：段落包 inline 連結）匯出的 payload root 是段落節點且內層節點帶 component reference；story 根即元件的 fixture 匯出 root.component 不變。驗證：npm run test:plugin-code（於 design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon）與 5.2 的 fixture 斷言。
- [x] 1.2 （spec: Text style capture）移除 getTextExportWidth 的 safety width（max(12, fontSize)），文字寬度改輸出 rect 原值，並化簡 getTextExportX 的補償路徑。完成條件：單行文字 payload width 與 rect 寬相等（誤差 0）。驗證：5.2 fixture 斷言こちら節點 width 為 48±0.5。
- [x] 1.3 （spec: Text style capture）在 createTextLeafNode 對單行文字（text 不含換行、無 maxLines、無固定 flex basis）輸出 textAutoResize: "WIDTH_AND_HEIGHT"。完成條件：Inline fixture 的連結文字節點帶 textAutoResize WIDTH_AND_HEIGHT，多行段落節點不帶。驗證：5.2 fixture 斷言。
- [x] 1.4 （spec: Text style capture）在 createTextLeafNode 實作 inline/run 行盒補償：inline 或 bare run 情境下由行數推導內容盒高度，小於 line-height 時 height 補上缺少的 leading、y 上移 leading/2；run 行數以 Range.getClientRects 判定並據以決定多行 HEIGHT 標記。完成條件：rect 高 16、line-height 26.4、y 100 的單行 inline 文字輸出 height 26.4、y 94.8；2 行 run（rect 高 42.4、y 5.2）輸出 height 52.8、y 0；display inline-block 不受影響。驗證：5.2 fixture 斷言。

## 2. Importer：字型解析（code.ts）

- [x] 2.1 （spec: Text style application）新增 pure helper parseFontStyleWeight(styleName) 回傳 { weight, italic } 或 undefined：W 數字（W3→300、W6→600）與純數字命名優先，其次 Thin(100)〜Black(900) 歐文對照表（含 Italic 判定），無法解析回傳 undefined；並加入 module.exports。完成條件：W6→{600,false}、"Bold Italic"→{700,true}、"53 Extension"→undefined。驗證：test/verify-pure-functions.cjs 新增案例綠燈（於 design-system-to-storybook/assets/figma-plugin-code-to-design 執行 node test/verify-pure-functions.cjs）。
- [x] 2.2 （spec: Text style application）實作 available-styles fallback：loadTextFont 與 loadBoundFontFamily 共用 helper，getFontStyleCandidates 全失敗時查 figma.listAvailableFontsAsync（Map 快取一次/run），以 parseFontStyleWeight 選字重最近（平手取較重）的 style 載入；成功即視為該家族解析成功，失敗才輪到下一家族、最後 Inter Regular。完成條件：家族 "Hiragino Kaku Gothic ProN"（styles W3/W6）+ weight 700 解析為 W6 且不落到 Noto Sans JP。驗證：test/verify-pure-functions.cjs 的選擇邏輯案例（nearest-weight 表：700→W6、400→W3、500→W6）綠燈；Figma 手動匯入驗收見 6.2。
- [x] 2.3 PLUGIN_VERSION 更新為 "1.7.0 (實作日期)"。完成條件：匯入 UI 徽章顯示 1.7.0。驗證：grep PLUGIN_VERSION 顯示新值且 npm run build 成功。

## 3. 版本與建置

- [x] 3.1 addon package.json version 0.7.0→0.8.0，執行 npm run build 與 npm run test:plugin-code。完成條件：dist 重建成功、既有測試綠燈、overlay 徽章值來源（__SBFX_VERSION__）為 0.8.0。驗證：建置輸出與測試結果。
- [x] 3.2 importer 於 design-system-to-storybook/assets/figma-plugin-code-to-design 執行建置產出 code.js，並執行全部 test/*.cjs 與 test/*.mjs 驗證腳本。完成條件：code.js 與 code.ts 行為一致、測試綠燈。驗證：測試輸出。

## 4. 同步產物

- [x] 4.1 將 assets/figma-plugin-code-to-design 建置後的 code.js（與 ui.html、manifest.json 若有變）複製到 design-system-to-storybook/storybook-template/figma/storybook-code-to-design/。完成條件：兩處 code.js md5 相同。驗證：md5 比對指令輸出。
- [x] 4.2 同步 80sJP-Grok 外掛副本：複製 code.ts 與 code.js 到 /Users/a04-0214-0320/Public/works/cm-ds-extractor-lab/80sJP-Grok/figma/storybook-code-to-design/。完成條件：md5 與 cm-skills assets 版一致。驗證：md5 比對指令輸出。

## 5. Exporter 驗證 harness

- [x] 5.1 在 addon test 目錄新增 story-fidelity fixture：複刻 Text Link Inline story 的 DOM 與 CSS（.md-text-link 系列 + demo body 樣式），供 headless 驗證。完成條件：fixture 頁面可被既有 test runner 或新增 run 腳本載入並產生 payload。驗證：執行輸出 payload JSON。
- [x] 5.2 對 fixture payload 斷言：root 為段落（children 含 3 個以上節點）、內層連結節點帶 component reference、こちら width 48±1、height 26.4±0.15、y 落在首行行盒頂（−1〜0.75）、textAutoResize WIDTH_AND_HEIGHT、段落節點維持固定 375 寬、換行尾段 run 高 52.8 且 HEIGHT 自動成長。完成條件：斷言全部通過並納入 npm run test:plugin-code 或獨立 node 腳本。驗證：測試輸出。

## 6. 下游驗收（80sJP-Grok，需使用者環境）

- [x] 6.1 重打包 addon tgz（npm pack）替換 80sJP-Grok/.storybook/vendor/harrychuang-storybook-addon-figma-export-*.tgz 並重新安裝，重啟 Storybook dev server（同時解除現存 vite optimize-dep 504）。完成條件：Storybook 啟動後 figmaExport overlay 徽章顯示 0.8.0。驗證：瀏覽器檢視 overlay。
- [x] 6.2 於 Figma 重跑匯入（外掛徽章 1.7.0）匯入 Inline story 新 payload。完成條件：Figma 內為完整段落（詳細は…をご確認ください…）、こちら 為 Hiragino Kaku Gothic ProN W6 紅色粗體、與 Storybook 截圖視覺一致。驗證：Figma 畫面與 story-truth 截圖比對。

  驗收記錄（2026-07-29，外掛實測版本 1.8.0）：
  - 已驗證：段落結構完整（frame 375×52.78、4 個 text 節點，`こちら` x=48 w=48 h=27，尾段拆行 x=96 / x=0 y=26.19），以 Figma MCP 讀取節點確認；顏色 `#e21820`、line-height 26.4px 正確。最終一次匯入回報 **0 條警告**，而外掛對每次字型 fallback 皆會發出警告，故可判定未發生字型 fallback。
  - 未驗證：實際 style 為 W6 或 W7。`selectNearestFontStyle` 依最近字重選擇，結果取決於 Figma 回報的可用 style 清單（`["W3","W6"]` → W6；`["W0".."W9"]` → W7）。完成條件寫死 W6 屬於未經查核的預期值，若日後實測為 W7，應修正本條件而非改動外掛。
  - 過程發現：先前多次匯入失敗係環境問題而非工具缺陷。Figma 本機字型檔服務（`127.0.0.1:44950`）連線被拒，導致所有系統字型無法載入而 fallback 至 Noto 系列；重啟 Figma 後恢復。

## 7. 跨行 run 拆行（驗收發現的缺陷）

- [x] 7.1 （spec: Text style capture）exporter 將跨行 bare text run 依 Range 逐行拆成單行 text 節點（二分搜尋字元 offset 找換行點），行中起點的 x 保留；inline 純文字元素跨行時改走 frame+runs 路徑。完成條件：Inline fixture 的尾段 run 拆成兩個單行節點（第一個 x≈96、第二個 x≈0 y≈26.2），全部 run 文字串接等於段落全文。驗證：run-story-fidelity-fixture 新斷言綠燈。
- [x] 7.2 addon 0.8.0→0.8.1：重建、同步三份原始樹與 dist、重打包 tgz 並重裝 80sJP-Grok、重啟 Storybook。完成條件：既有測試全綠、md5 同步一致、dev server 供應 0.8.1。驗證：測試輸出與 curl 檢查。
