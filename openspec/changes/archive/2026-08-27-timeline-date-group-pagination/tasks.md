## 1. 分頁邏輯改為日期群組打包

- [x] 1.1 修改 storybook-tools-install/template/src/storybook/component-timeline/ComponentTimeline.tsx，交付 Timeline page rendering 的新分頁語意：頁面建構改為由最新日期起貪婪打包完整日期群組（每頁預算 36 個元件，加入下一群組會超過 36 時開新頁；單日超過 36 自成一頁、不拆群組），日期群組永不跨頁，標頭「{count} new」等於該日在 timeline 資料中的全量；分頁按鈕、統計卡、extras 插槽與卡片渲染行為維持不變。驗證：content review 對照 spec 的四個 scenario——特別是 Example「30-component date stays whole」（8/26 五個＋8/25 兩個成第 1 頁、8/24 三十個整組在第 2 頁且顯示 30）與 oversized 群組自成一頁；並確認 import 清單仍僅限 catalog、timeline 資料與 registry（verbatim 契約不變）。
- [x] 1.2 更新 storybook-tools-install/template/TEMPLATE_MANIFEST.json 的 version 為 0.10.1，並同步 storybook-tools-install/README.md 第 3 節的分頁行為描述（日期不跨頁、count 為該日全量、每頁預算 36、單日超過 36 自成一頁），交付「安裝端更新流程可透過版本比對取得本次修正」的契約。驗證：JSON.parse 成功且 version 為 0.10.1；README.md 不再出現「超過 30 個元件會分頁」的舊語意描述，改為群組打包語意。

## 2. 收尾驗證

- [x] 2.1 收尾一致性驗證，交付「spec、實作、文件三者一致」的最終狀態：以 node --experimental-strip-types 或等效方式對分頁打包函式做一次性煙霧測試（以 Example 的 5/2/30 與 oversized 45 兩組資料驗證頁面切分與 count），或無法執行時以逐行 content review 記錄對照結果；最後執行 spectra validate timeline-date-group-pagination。驗證：煙霧測試（或 content review 記錄）與 validate 均通過並記錄輸出。
