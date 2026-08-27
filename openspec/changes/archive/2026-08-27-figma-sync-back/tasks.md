## 1. Plugin：shared story identity

- [x] 1.1 實現 Shared story identity on import：在 design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts 實作 shared plugin data 識別寫入（namespace storybook）——component artifact 於 configureComponentSection 寫入 shared keys storyId 與 generatedAt（值取自 payload），page artifact 於 root node 放置完成後寫入同組 shared keys；重用既有 section 時同樣寫入以達成 legacy backfill，private plugin data 行為不變。完成後 npm run build 產出 code.js 無錯誤。
- [x] 1.2 在 test/verify-pure-functions.cjs 新增斷言：以 stub figma global 驗證 component 匯入時 section 收到 setSharedPluginData("storybook", "storyId", ...) 與 generatedAt、page 匯入時 root node 收到同組呼叫、重匯入既有 section 時 shared 值被更新為最新 payload 的 generatedAt。驗證：node test/verify-pure-functions.cjs 通過。
- [x] 1.3 更新 design-system-to-storybook/assets/figma-plugin-code-to-design/README.md：記載 shared plugin data 識別契約（namespace、keys、component/page 寫入位置、re-import backfill 行為）供外部工具引用。驗證：內容審閱涵蓋上述四點。

## 2. Addon：synced baseline 儲存與 promote 端點

- [x] 2.1 實現 Synced baseline payload store：在 design-system-to-storybook/assets/figma-export-addon/src/review-server.ts 實作 synced baseline 儲存與 promote 端點——payloadDir 下 synced/ 子目錄、POST /__figma-export/payloads/<storyId>/promote（成功 200 回 baseline 摘要、無現行 payload 回 404 JSON error）、GET /__figma-export/payloads/<storyId>/baseline（404 當不存在）、一般 POST 永不寫入 synced/、路由解析支援 storyId 後的動作段、沿用既有 sanitize 與 CORS/OPTIONS 行為。驗證：npm run build 通過。
- [x] 2.2 擴充 Payload store endpoints 列表摘要：GET /__figma-export/payloads 的每筆 summary 新增 hasBaseline 與 baselineGeneratedAt（無 baseline 時為 false 與空字串），且 synced/ 子目錄不被列為現行 payload。驗證：node test/run-payload-store-test.mjs 通過新增斷言。
- [x] 2.3 在 test/run-payload-store-test.mjs 新增測試：promote 凍結 baseline（promote 後再 POST 新 payload，baseline 內容不變）、promote 無現行 payload 回 404、baseline GET 命中與 404、列表 baseline 欄位、synced/ 不出現在現行列表。驗證：node test/run-payload-store-test.mjs 全數通過。
- [x] 2.4 更新 design-system-to-storybook/assets/figma-export-addon/README.md 的 Local bridge 章節：記載 baseline 端點契約與 promote 時機（使用者確認同步後才 promote）。依 Mirror 同步策略重建 dist 並同步 storybook-template/.storybook/vendor/figma-export-addon 與 storybook-template/vendor/figma-export 兩個 mirror。驗證：node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs 通過。

## 3. Skill：figma-sync-back 比對腳本

- [x] 3.1 實現 Deterministic three-way payload comparison（三方比對以 figma-facts JSON 正規化）：建立 figma-sync-back/scripts/compare_payload_baseline.mjs——無網路純 Node，接受 --base、--ours、選填 --theirs（figma-facts JSON），將 payload 正規化為語意子集（token 解析值、節點名稱路徑、layout mode、gap/padding、尺寸、圓角、effect 種類、text 內容、fills），輸出確定性 JSON 報告 {storyId, classification, diffs, suppressed}；缺 --theirs 時 classification 為 partial 且只含 base-vs-ours 差異。驗證：同輸入兩次執行輸出 byte-identical。
- [x] 3.2 實現 Four-quadrant sync classification 與 Known-limitation suppression filter：在同腳本實作四格矩陣分類與 known-limitation 濾網——base-vs-ours × base-vs-theirs 判定 synced/figma-only/code-only/conflict；suppression rules（字型 metrics 閾值內文字高度差、sRGB clamp epsilon 內色差、raster 2048px 上限尺寸差、Browser Reference 圖層、Figma section/viewport 座標）以具名常數閾值實作，被濾差異進 suppressed 區附 rule id 與理由、不影響分類。驗證：3.3 的測試涵蓋。
- [x] 3.3 建立 figma-sync-back/scripts/test_compare_payload_baseline.mjs：四格矩陣每格至少一 case、每條 suppression rule 至少一 case（含「僅剩被濾差異時分類為 synced」）、partial case、確定性 case。驗證：node figma-sync-back/scripts/test_compare_payload_baseline.mjs 全數通過。

## 4. Skill：figma-sync-back 工作流程文件

- [x] 4.1 定義 Story-to-node mapping discovery 契約：建立 figma-sync-back/references/sync-decision-matrix.md——figma-facts JSON schema（語意子集逐欄位、自 get_design_context/get_variable_defs/get_metadata 的取值指引、缺值標 unknown）、四格矩陣語意、對應表發現順序與 fallback（review status → shared plugin data 掃描 → 名稱比對標低信心、provenance 記錄、同 storyId 多節點時停下詢問）。驗證：內容審閱涵蓋 schema、矩陣、三層 fallback。
- [x] 4.2 建立 figma-sync-back/references/known-limitation-filter.md：逐條記載 suppression rule 的 id、對應 exporter 限制、閾值常數名與調整方式。驗證：內容與 compare_payload_baseline.mjs 的規則一一對應。
- [x] 4.3 實現 Routing report without code modification 與 Baseline promotion guidance：建立 figma-sync-back/SKILL.md——frontmatter name/description 加完整工作流程——建立對應表（含 provenance 與 unmapped 回報）→ 收集三方輸入（baseline GET、現行 export、AI 填 figma-facts）→ 逐 story 執行 compare_payload_baseline.mjs → 產出 design-system/figma-sync-report.md 與 .json（token 差異導向 Late-Arriving Authoritative Source Pass、visual 導向 ui-compare-to-reference、structural 標人工）→ baseline 過期偵測（shared generatedAt ≠ baseline generatedAt 時報告開頭標示 stale）→ 指示 promote。明文禁止修改產品 code/token CSS/component spec，figmaNodeUrl 補記需使用者同意。驗證：內容審閱對照 figma-sync-back-skill spec 全部 requirement。
- [x] 4.4 在 design-system-to-storybook/SKILL.md 新增分流報告與不改碼原則的回流入口段落：說明何時改用 figma-sync-back skill（使用者在 Figma 端調整後要判斷回流），並交叉引用 baseline promote 時機。驗證：內容審閱確認引用的檔名與指令實際存在。

## 5. 整合驗證

- [x] 5.1 端到端驗證：依序執行 node design-system-to-storybook/assets/figma-plugin-code-to-design/test/verify-pure-functions.cjs、node design-system-to-storybook/assets/figma-export-addon/test/run-payload-store-test.mjs、node figma-sync-back/scripts/test_compare_payload_baseline.mjs、node design-system-to-storybook/scripts/check_figma_export_addon_mirrors.mjs，全數通過並記錄輸出摘要。
