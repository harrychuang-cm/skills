# 驗證紀錄

變更：adopt-repo-ds-governance。來源是此 cm-skills checkout，未覆寫全域 skills，未 commit 或 push。

## 自動化檢查

- ds-governance 通過 skill-creator quick_validate；驗證用 PyYAML 安裝於暫存 venv，未修改專案依賴或系統 Python。
- All-skill discovery and three-agent project dry-run: PASS
- 12 source/install inventories match; governance companion and principles references resolve: PASS
- Edited guide JavaScript syntax: PASS
- Coverage nested manifest: valid copies PASS; hash drift, missing copy and missing companion all rejected
- Coverage flat manifest: valid copies PASS; hash drift, missing copy and missing companion all rejected
- Legacy name retained only in migration notes plus unchanged archive/local settings: PASS
- 最後的 companion 授權文字調整後，重新安裝至同一暫存專案，12/12 來源比對仍通過。
- 四份 main/delta 規格的需求內容一致性檢查通過。
- Spectra change 的 strict validate 通過；analyze 沒有 Critical／Warning，僅既有情境寫法的 example 建議。
- git diff --check 通過。

## 指令內容情境審查

以下是內容審查，未啟動三種 agent 的獨立互動 session。

| 情境 | 文件規定的結果 | 審查 |
| --- | --- | --- |
| SwiftUI 二層 theme，有 Preview，沒有 Storybook | 沿用 theme 與原生驗證，不補第三層或安裝 Storybook | 通過 |
| 使用者已核准具名 shared component 與 tokens | 記錄既有授權，依相同範圍繼續 | 通過 |
| feature 要求沒有授權新增缺少的 semantic token | 提供缺口與方案，暫停受影響 UI，繼續獨立盤點 | 通過 |
| feature-local helper 只組合既有 primitive | 可直接組合，不因函式拆分觸發 shared-component gate | 通過 |
| 產品規範採低彩度、直角與無裝飾動態 | 依產品證據實作，不套用原版的固定風格 | 通過 |
| 只要求 review 或缺少 runtime 工具 | 回報觀察與驗證限制，不宣稱已修正或互動驗收通過 | 通過 |

## 引用盤點

- frontend-product-implementation：必要 companion、discovery 與 token bootstrap。
- native-product-implementation：必要 companion、原生平台對應與交接說明。
- storybook-product-prototype：optional companion、獨立 fallback、交接模板。
- storybook-tools-install：component-coverage-implement 受管 companion、UI 產生的 prompt、checker、manifest 0.10.2。
- design-system-to-storybook：產出專案的架構文件與靜態 HTML。
- README、Markdown／HTML 使用指南與相關現行規格同步。
- 舊名稱只留於原有歷史封存、本機 Claude permission 記錄與兩份使用指南的遷移說明。

## 證據與界線

暫存驗證目錄：/var/folders/hp/nj75w8916pnbhc7np668sfth0000gn/T/cm-skills-ds-verify-g3282znx

三 agent 的檔案安裝、skill 身分、相對引用已驗證；未宣稱 Cursor、Codex、Claude Code 各自完整互動流程已實測。未建置產品 App 或 Storybook，因本次變更是治理指令、文件、prompt 字串與 manifest checker。

## docs 補充驗證

- 三份指南已補上治理定位、使用情境、companion 關係與可複製提示；視覺指南新增 govern-ui 旅程，設計師指南補入路線 A／B、紅綠燈、名詞小抄。
- HTML inline JavaScript 語法與文件相對連結檢查通過；新增說明連結沿用既有 accent token 並加底線。
- Chrome 實際驗證治理旅程、目錄卡片展開與導向旅程、口令表、設計師路線 A／B、紅綠燈模擬對話展開及名詞小抄。原生 App 提示經點擊複製並貼到網址列核對，文字完整；未送出為搜尋。
- 透過 Chrome 原生介面完成驗證；瀏覽器 extension 建立分頁失敗後改用同一個 Chrome 的原生介面。未宣稱收集過 console 或測試所有手機尺寸。
- Spectra analyze 無 Critical／Warning；strict validate 與 git diff --check 通過。既有四個完成項目保持不變。
- 驗證用分頁已關閉，未發佈文件、未更新全域安裝、未 commit／push。
