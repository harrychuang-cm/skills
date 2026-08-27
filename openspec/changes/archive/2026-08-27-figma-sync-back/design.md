## Context

figma-export-addon 將 rendered story 匯出為 payload v2，Storybook Code To Design plugin 將其匯入 Figma。現況有三個結構性事實決定了本設計：

1. **識別是 private 的**：plugin 匯入 component artifact 時，在 component section 以 private plugin data key `storybookStoryId` 寫入 storyId（`configureComponentSection`），重複匯入會靠它找回同一個 section；但 private plugin data 只有該 plugin 自己讀得到，Figma REST API 與 MCP 都無法反查。page artifact（`artifactKind === "page"`）的 root node 直接放在專屬 Figma page 上，目前完全沒有寫入任何 storyId 識別。
2. **baseline 會被覆寫**：review-server 的 payload store 以 `writeFile(<payloadDir>/<storyId>.json)` 覆寫式寫入，「上次確認同步的版本」不存在，三方比對（base/ours/theirs）塌成兩方，無法區分「Figma 改了／code 改了／雙邊都改」。
3. **對應資料分散**：`component-review-status.json` 有 `figmaNodeUrl` 與 `figmaReviewStatus`（含 `needs-fix` 狀態），payload 有 `generatedAt`，Figma 現況可經 MCP 讀取——材料齊全但沒有工具把它們組成同步判斷。

addon 的 canonical 原始碼在 design-system-to-storybook/assets/figma-export-addon，並有兩個 mirror（storybook-template/.storybook/vendor/figma-export-addon 與 storybook-template/vendor/figma-export），由 check_figma_export_addon_mirrors.mjs 驗證一致。plugin 的 canonical 在 design-system-to-storybook/assets/figma-plugin-code-to-design。

## Goals / Non-Goals

**Goals:**

- Figma 端可被外部工具（REST plugin_data 查詢、MCP、AI agent）反查 node↔story 對應，component 與 page 兩種 artifact 都涵蓋。
- payload store 保存不被一般 export 覆寫的 synced baseline，並可由使用者確認後 promote。
- 新 skill `figma-sync-back` 產出可信的四格矩陣分流報告：已同步／Figma 單邊改（回流候選）／code 單邊改（建議重新 export）／雙邊衝突（人工裁決）。
- 已知 exporter fidelity 落差（字型 metrics 換行、sRGB clamp、raster 上限、Browser Reference 圖層等）被濾網剔除，不汙染報告。

**Non-Goals:**

- 不做 plugin 端的反向序列化（Figma selection → payload）；theirs 側由 AI 經 MCP 讀取並正規化。
- skill 不直接修改產品 code、token CSS 或 component spec——所有修改動作分流給既有機制（extractor Late-Arriving Pass、ui-compare-to-reference、人工）。
- 不做 Figma Variables 變更的自動監聽／通知；同步是使用者主動發動的。
- 不整合 Figma Code Connect（另案評估）。
- 不處理「從未經過本 plugin 匯入」的純手繪 Figma node 自動對應；此情境由使用者提供連結、skill 記錄進 review status 後併入既有流程。

## Decisions

### Shared plugin data 識別寫入（namespace storybook）

plugin 匯入時在既有 private plugin data 之外，於識別節點寫入 shared plugin data：namespace `storybook`、key `storyId`（值為 payload.storyId）與 key `generatedAt`（值為 payload.generatedAt）。寫入位置：component artifact 寫在 component section（與現行 private key 同節點，於 `configureComponentSection` 內）；page artifact 寫在匯入後的 root node（現況無任何識別，屬新增）。因為 `configureComponentSection` 在每次匯入（新建與重用）都會執行，legacy 已匯入的 section 會在下一次重匯入時自動補寫，不需獨立 migration。`generatedAt` 讓 sync skill 能判斷 Figma 內容衍生自哪一次 export，偵測 baseline 過期。

替代方案：只寫 private data 並提供 plugin 內的「匯出對應表」UI——被否決，因為那要求人工搬運，且 AI 無法自動化；改名 section 當識別——被否決，設計師改名即斷鏈。

### Synced baseline 儲存與 promote 端點

payload store 在 `payloadDir` 下新增 `synced/` 子目錄保存 baseline（`synced/<storyId>.json`）。一般 export 的 POST 只寫現行 payload，永不觸碰 `synced/`。新增路由：

- `POST /__figma-export/payloads/<storyId>/promote`：將現行 payload 複製為 baseline，回 200 與 baseline 摘要；無現行 payload 回 404。
- `GET /__figma-export/payloads/<storyId>/baseline`：回 baseline payload 或 404。
- 既有 `GET /__figma-export/payloads` 列表摘要新增 `hasBaseline`（boolean）與 `baselineGeneratedAt`（無 baseline 時為空字串）兩個 additive 欄位。

現行 `listStoredPayloads` 以 `readdir(payloadDir)` 過濾 `.json`，子目錄不會被誤列。路由解析需從「單段 storyId」擴充為「storyId + 動作段」。替代方案：獨立 `/__figma-export/baselines` 頂層路由——被否決，巢狀路由讓 store 維持單一概念、CORS 與 sanitize 邏輯全部共用。

### 三方比對以 figma-facts JSON 正規化

比對腳本 `compare_payload_baseline.mjs` 是純 Node、無網路的確定性工具。輸入三份檔案：`--base`（baseline payload）、`--ours`（現行 payload）、`--theirs`（figma-facts JSON，選填）。payload 會被正規化成「語意子集」：token 名稱→解析值、節點名稱路徑、layout mode 與 gap/padding、尺寸、圓角、effects 種類、text 內容、fills。theirs 側因為 MCP 輸出不是 payload，由 AI 依 skill reference 文件定義的 figma-facts schema 從 `get_design_context` / `get_variable_defs` / `get_metadata` 讀數填寫，餵給同一支腳本。缺 `--theirs` 時腳本只報 base-vs-ours（code 側變更偵測），分類降級為部分判定並明確標示。

替代方案：AI 直接讀兩邊自由比對——被否決，不可重現、不可測試；腳本直接打 Figma API——被否決，腳本應保持無網路可單測，網路讀取是 AI/MCP 的職責。

### 四格矩陣分類與 known-limitation 濾網

分類規則：base-vs-ours 有無語意差異 × base-vs-theirs 有無語意差異 → `synced` / `figma-only` / `code-only` / `conflict`。濾網以 suppression rules 實作在腳本內，每條規則有 id 與理由，被濾掉的差異列在報告的 `suppressed` 區而非刪除：字型 metrics 導致的文字高度／換行差（閾值內）、sRGB clamp 色差（epsilon 內）、raster 2048px 上限造成的尺寸差、`Browser Reference` 鎖定圖層、Figma 端 section 定位／viewport 座標差。閾值定義在腳本常數並在 reference 文件記載。

### 分流報告與不改碼原則

skill 產出 `design-system/figma-sync-report.md`（人讀）與同名 `.json`（機讀）。每筆 `figma-only` 或 `conflict` 差異標記類別：`token`（變數值／綁定變更）→ 導向 design-system-extractor 的 Late-Arriving Authoritative Source Pass；`visual`（style 值變更）→ 導向 ui-compare-to-reference；`structural`（節點增刪／層級變更）→ 標記人工處理。skill 本身唯二的寫入是報告檔與（使用者同意時）review status 的 `figmaNodeUrl` 補記；絕不修改元件 code、token CSS、component spec。baseline promote 只在使用者確認同步完成後由使用者（或使用者明示同意下的 skill）呼叫，skill 不自動 promote。

### 對應表發現順序與 fallback

skill 建立 story↔node 對應表時依序：(1) `component-review-status.json` 的 `figmaNodeUrl`；(2) Figma 檔案 shared plugin data 掃描（REST `plugin_data` 查詢，可用時）；(3) section／node 名稱 `componentTitle / storyName` 比對（`get_metadata`），標記為低信心。每筆對應記錄 provenance，低信心對應在報告中明示，衝突（同 storyId 對到多個 node）停下詢問。

### Mirror 同步策略

addon 修改只動 canonical（assets/figma-export-addon），完成後以既有 build 流程重建 dist、同步兩個 mirror，並以 `check_figma_export_addon_mirrors.mjs` 驗證一致。plugin 修改動 canonical 的 code.ts 並重建 code.js。實驗 lab 內的已安裝副本（cm-ds-extractor-lab）不在本變更範圍，由安裝腳本日後更新。

## Implementation Contract

**Plugin（figma-import-reconstruction）**

- 行為：任一成功匯入後，識別節點（component section 或 page root）帶有 shared plugin data `storybook` namespace 下的 `storyId` 與 `generatedAt`，值與 payload 一致；重匯入既有 section 時同樣寫入（backfill）。
- 驗證：`test/verify-pure-functions.cjs` 系列新增斷言——以 stub figma global 執行匯入路徑，檢查 `setSharedPluginData("storybook", "storyId", ...)` 與 `generatedAt` 被以正確值呼叫，component 與 page 兩種 artifactKind 各一個 case。`npm run build` 後 `node test/verify-pure-functions.cjs` 通過。

**Addon（figma-export-workflow）**

- 行為：promote 後 `synced/<storyId>.json` 存在且內容等於 promote 當下的現行 payload；之後對同 storyId 的一般 POST 不改變 baseline；`GET .../baseline` 回傳 baseline；列表摘要含 `hasBaseline` 與 `baselineGeneratedAt`。
- 失敗模式：promote 無現行 payload 回 404 JSON error；storyId sanitize 為空回 400；未知動作段回 404。全部端點維持 `Access-Control-Allow-Origin: *` 與 OPTIONS 204。
- 驗證：`node test/run-payload-store-test.mjs` 擴充——promote 成功、promote 404、baseline GET、POST 不覆寫 baseline、列表欄位。`node scripts/check_figma_export_addon_mirrors.mjs` 通過。

**Skill（figma-sync-back-skill）**

- 行為：`node figma-sync-back/scripts/compare_payload_baseline.mjs --base a.json --ours b.json [--theirs c.json]` 輸出 JSON 報告：`{storyId, classification, diffs: [{path, field, category, base, current, side}], suppressed: [{rule, reason, ...}]}`，classification ∈ synced|figma-only|code-only|conflict|partial（缺 theirs 時）。相同輸入必得相同輸出（無時間戳、無隨機值）。
- SKILL.md 定義工作流程：對應表建立（含 provenance 與 fallback 順序）→ 取得三方輸入 → 逐 story 跑腳本 → 彙整分流報告 → 指示 promote 時機。明文禁止修改產品 code。
- 驗證：`node figma-sync-back/scripts/test_compare_payload_baseline.mjs` 覆蓋四格矩陣各一 case、每條 suppression rule 至少一 case、缺 theirs 的 partial case。

**範圍邊界**

- In scope：上述三個工作面、addon mirror 同步、design-system-to-storybook/SKILL.md 加入指向新 skill 的回流入口段落。
- Out of scope：plugin 反向 export、自動改碼、Variables 監聽、Code Connect、cm-ds-extractor-lab 內已安裝副本的更新。

## Risks / Trade-offs

- [Figma REST plugin_data 查詢需要 token，MCP 不一定暴露 shared plugin data] → 對應表有三層 fallback（review status → shared data → 名稱比對），最壞情況退化為低信心名稱比對並在報告中明示。
- [theirs 側由 AI 填 figma-facts，品質不穩定] → schema 固定且欄位極簡（語意子集），reference 文件附逐欄位取值指引；腳本對缺欄位標 unknown 而非猜測。
- [濾網閾值太鬆會吞掉真差異、太緊會滿江紅] → 被濾差異保留在 suppressed 區可稽核；閾值集中在腳本常數，可依實際專案調整。
- [使用者忘記 promote，下次報告重複舊差異] → 列表摘要的 baselineGeneratedAt 讓 skill 可偵測「baseline 早於 Figma 端 generatedAt」並在報告開頭提示。
- [mirror 漂移] → 既有 check_figma_export_addon_mirrors.mjs 已是強制檢查，納入驗證步驟。

## Migration Plan

1. plugin 與 addon 變更均為 additive：舊 payload、舊 store、無 shared data 的舊 Figma 檔全部照常運作。
2. legacy Figma 檔在下一次重匯入時自動補寫 shared 識別，無需一次性 migration。
3. 回滾：移除新路由與 shared data 寫入即可；`synced/` 目錄是純資料，保留不影響任何既有功能。

## Open Questions

（無——對應表 fallback、濾網閾值可調性、promote 時機皆已在 Decisions 定案。）
