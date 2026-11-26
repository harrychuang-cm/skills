## Why

設計師在 Storybook 看到元件想調整樣式時，目前只能描述給工程師或 AI，再等對方找到正確的檔案、規則與 token 層級；改完也沒有人證明畫面與原始碼一致。2026-11-20 的核心迴路驗證（storybook-code-layer 0.1.0，於 80sJP-Fable 試驗場）已證明「在畫面上選元件 → 改綁 token → 即時預覽 → 寫回真實的 token 檔或元件 CSS → 驗證 → 還原」這條路可靠：單元測試 48 項、真實伺服器 API 8 項、瀏覽器實測 42 項全部通過，寫入前的拒絕都零寫入，還原逐位元組相同。但驗證版只開放填色與圓角兩個屬性、只能選最外層元件、沒有 SKILL.md，還不能交給團隊使用。這個 change 把它補成可以日常使用的 v1。

## What Changes

- **可編輯的屬性從 2 個擴大到完整面板**：版面（gap）、間距（padding、margin）、尺寸（inline／block size 與最小最大值）、外觀（透明度、四角圓角）、填色、筆畫（邊框與外框的顏色與粗細、SVG stroke）、文字（字體、字級、字重、行高、字距、文字色）。全部以「改綁既有 token」完成；版面結構（display、方向、對齊）唯讀。試驗場 177 個相關宣告中 142 個是單一 `var()`，可直接改綁。
- **簡寫中的個別引用可改綁**：`padding: var(--a) var(--b)`、`border: var(--w) solid var(--c)` 這類每個分量各是一個 `var()` 或字面值的簡寫，可以逐個引用改綁。`calc()` 等運算式、帶 fallback、字面值仍唯讀並說明原因。
- **邏輯屬性與直書**：`padding-block`、`inline-size` 等邏輯屬性依元素的 writing-mode 對應到正確的邊（試驗場的尺寸與間距全部使用邏輯屬性）。
- **繼承追蹤**：文字屬性沒有直接宣告時往祖先找到真正的宣告處。同元件的祖先可編輯並標示影響範圍；外層元件、story 包裝、全域樣式表唯讀並可跳轉或標明來源（試驗場 7 個元件有 6 個需要）。
- **Figma 式的層級選取**：點選停在目前層級、雙擊或 Enter 進入下一層、Shift+Enter 回父層、Tab／Shift+Tab 切換同層、Cmd／Ctrl+click 直接選最深的元素（含 `pointer-events: none` 的元素）；面板標題有可點的 breadcrumb 與子元素清單。
- **範圍切換**：同一個調整可以選擇改在宣告、元件 token，或全域的 system token，並顯示各自的寫入位置與影響的宣告數、元件數。system 層要在專案綁定中標為可寫才會出現；reference 層永遠不可寫。
- **刻度步進**：聚焦在某一列時以方向鍵或拖曳標籤，在同類 token 的刻度上逐級移動並即時預覽。
- **文件同步治理**：改綁元件 token 時，同一筆交易改寫對應元件規格文件的 Token Contract 列（只在能精確對到那一列時）。其餘會過期的地方——沒有對應列的 token、每一筆元件 CSS 的改綁、同一行的註解、規格與原始碼中仍提到舊角色名稱的句子——列為「文件待同步」並附檔案行號。改綁容器色時檢查配對的內容色 token 並顯示對比。套用後執行專案設定的重新產生指令。試驗場實測：規格列過期、alias 指向不存在的 token、鏡像落後，三支 strict audit 都照樣通過，所以這些一致性由本工具自己負責。
- **還原的第二條路**：檔案在套用後被別處改過、無法整檔還原時，可以用反向操作重新套用，只改回當初那一行。
- **面板上的鏡像同步**：真相檔與鏡像不一致時，面板在套用前就顯示差異並提供同步（方向固定為真相覆蓋鏡像）。
- **介面語言**：所有介面字串集中管理，提供繁體中文與英文。
- **安裝器**：新增 `--update`（模板、receipt、現況三方比對；有任何衝突就完全不寫）、`--uninstall`（依 receipt 移除，只解除安裝器自己加的接線，保留專案設定與紀錄）、綁定推導（唯讀檢視專案、逐項附證據地提出設定草稿，無法判定的項目列為待確認，由人確認後才寫入）；寫入改為可回滾；拒絕不認得的旗標；提供 `--json`。
- **成為正式 skill**：新增 `storybook-code-layer/SKILL.md` 與 `agents/openai.yaml`，並登錄到 repo 的 README、使用說明與圖解指南；`scripts/install_agent_skills.mjs` 從此會把它裝進各 agent 的 skill 目錄。
- **瀏覽器能力檢查**：缺少必要的瀏覽器功能時顯示原因並停用，不半套執行。

## Capabilities

### New Capabilities

- `code-layer-selection`: 工具的啟用條件與有效狀態、hover 與選取外框、Figma 式的層級選取與鍵盤操作、選取在更新與重新整理後的保留、啟用期間不干擾 story。
- `code-layer-style-tracing`: 每個面板屬性的來源追蹤——索引為準、規則序號、屬性列表、串接勝出宣告、邏輯與實體屬性對應、繼承追蹤、值的形狀與裁決、token 鏈、編輯範圍、probe 確認。
- `code-layer-panel`: 檢視器（浮在畫布上、可以拖移的設計面板；2026-11-24 使用者試用後由「停靠在 Storybook 面板區」改為此形式）——位置與收合、以圖示與數值為主的呈現、首次使用提示、標題與 breadcrumb、屬性列、token 浮層、刻度步進、範圍切換、即時預覽、變更清單、套用與報告、各類提示、物件參照、介面語言。
- `code-layer-write-back`: 寫回原始碼——封閉的可寫集合、兩種操作與拒絕碼、位元組級修補、候選樹上的檢查、交易與當機復原、真相與鏡像一致、還原（整檔與反向）、熱更新送達、請求防護、寫入後驗證、命令列。
- `code-layer-governance`: 寫入後 design-system 套件維持一致——Token Contract 列與 token 同一筆交易改寫、文件待同步的紀錄、規格與 token 的漂移回報、配對內容色檢查、套用後指令。
- `storybook-code-layer-installer`: 模板清單、命令列契約、平台前置條件、安裝、檢查、更新、移除、可回滾的執行、綁定推導，以及 skill 的封裝與登錄。

### Modified Capabilities

(none)

## Impact

- Affected specs: `code-layer-selection`、`code-layer-style-tracing`、`code-layer-panel`、`code-layer-write-back`、`code-layer-governance`、`storybook-code-layer-installer`（皆為新增）
- Affected code（皆在 `storybook-code-layer/` 之下，另列者除外）:
  - New:
    - SKILL.md、agents/openai.yaml
    - template/code-layer/shared/sides.mjs、shared/sides.d.mts（邏輯／實體邊與簡寫分量對應）
    - template/code-layer/shared/i18n.ts、shared/messages.zh-Hant.ts、shared/messages.en.ts
    - template/code-layer/runtime/inherit.ts、runtime/navigate.ts、runtime/capabilities.ts
    - template/code-layer/server/spec-rows.mjs、server/pending-docs.mjs、server/pairing.mjs、server/post-apply.mjs
    - template/code-layer/manager/Inspector.tsx、manager/icons.tsx、manager/components/Field.tsx、RowPopover.tsx、ChangesBar.tsx、Report.tsx、Notices.tsx
    - scripts/derive_binding.mjs、scripts/lib/receipt.mjs、scripts/lib/plan.mjs、scripts/lib/staging.mjs、scripts/lib/cli_args.mjs
    - template/KNOWN_MANIFESTS.json（歷來模板版本的檔案雜湊，供接手沒有 receipt 的安裝）
    - （repo 根目錄）docs/code-layer-guide.html（給使用者的互動式說明；工具有新功能時更新同一份）
    - test/test_fixture_v1.test.mjs、test_sides.test.mjs、test_governance.test.mjs、test_i18n.test.mjs、test_installer_update.test.mjs、test_derive_binding.test.mjs、test/run_build_check.mjs、test/fixtures/v1/（多元件 fixture 專案）
  - Modified:
    - template/code-layer/shared/properties.ts、protocol.ts、value-refs.mjs、kinds.mjs、api-contract.mjs、reference.ts
    - template/code-layer/server/config.mjs、css-index.mjs、token-index.mjs、index-builder.mjs、operations.mjs、transaction.mjs、journal.mjs、write-routes.mjs、app.mjs、cli.mjs
    - template/code-layer/runtime/index.ts、tracer.ts、cascade.ts、tokens.ts、hitTest.ts、events.ts、overlay.ts、descriptor.ts、livePreview.ts、verify.ts
    - template/code-layer/manager.tsx、manager/store.ts、actions.ts、drafts.ts、apply.ts、api.ts、channel.ts、persist.ts、Tool.tsx、styles.ts
    - template/code-layer/package.json（版本 1.1.0；1.0.0 是改為浮動檢視器之前的面板版，兩版的檔案雜湊都記在 KNOWN_MANIFESTS）、template/TEMPLATE_MANIFEST.json
    - scripts/install_code_layer.mjs、scripts/lib/array_literal.mjs、wire_main.mjs、wire_tsconfig.mjs、files.mjs、scripts/dev_sync.mjs
    - test/test_index.test.mjs、test_transaction.test.mjs、test_write_routes.test.mjs、test_installer.test.mjs、run_core_loop_browser.mjs、run_live_api.mjs、helpers.mjs
    - README.md
    - （repo 根目錄）README.md、docs/skills-usage.md、docs/skills-guide.html、scripts/skill-dependencies.json（新增 storybook-code-layer 對 design-system-extractor 的 support 相依）
  - Removed:
    - template/code-layer/manager/Panel.tsx、PanelHost.tsx、layout.ts、components/PropertyRow.tsx、TokenPicker.tsx、ChangesList.tsx、VerifyReport.tsx（0.1.0 的停靠面板與其元件，由浮動檢視器取代；安裝器更新時會移除它們）
- 專案綁定（`code-layer.config.json`）：新增選用鍵 `locale`、`governance`、`postApply`，tier 的 `writable` 可用於 sys 層。0.1.0 的設定不需修改即可繼續使用（預設行為不變：只有 comp 層可寫；沒有指定元件規格目錄時不改任何文件，只記錄待同步）。
- 寫入的檔案類型新增一種：專案綁定指定的元件規格目錄下的 Markdown，而且只改 Token Contract 表的單一儲存格。
- 已安裝 0.1.0 的專案（80sJP-Fable）以 `--update` 升級；`main.ts` 與 `tsconfig.json` 的接線不變。安裝器旗標新增 `--project-root`（`--project` 保留為別名）。
- 為什麼是獨立的 skill 而不是 storybook-tools-install 的第三個工具：Code Layer 是只在 dev 啟用、會寫入原始碼的 preset addon，有自己的 dev API、狀態目錄與安全邊界；storybook-tools-install 安裝的是唯讀的 Storybook 頁面，由 agent 依說明複製，沒有安裝腳本。
- 下游：`storybook build` 的產物不含本工具；design-system-extractor 的腳本不需修改（只被當作檢查與套用後指令呼叫）。
- 檔案重疊：repo 根目錄的 README.md、docs/skills-usage.md、docs/skills-guide.html 也被尚未封存的 change（add-presentation-review-skill、adopt-repo-ds-governance）修改過，後套用的一方需在既有修改上合併。
- 後續 change：AI 對話框（`add-code-layer-ai-dialog`）依賴本 change 的物件參照、交易、紀錄與文件待同步清單，另案提出。
- 實作前置條件：開發機需有 Node 24。2026-11-24 檢查時這台機器的 `/usr/local/bin/node` 與 Homebrew 都不存在，所有測試與 Storybook 都無法執行；實作開始前要先裝回。
