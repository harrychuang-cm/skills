## 1. Skill 改名與引用同步

- [x] 1.1 以 git mv 將 component-coverage-install/ 整樹搬移為 storybook-tools-install/（design 決策 1：skill 整樹以 git mv 改名為 storybook-tools-install，不保留舊名），並改寫 storybook-tools-install/SKILL.md 的 frontmatter name 與 description 為多工具安裝器定位，交付 Multi-tool installer identity 的新身分。驗證：SKILL.md frontmatter name 為 storybook-tools-install；git status 顯示搬移為 rename 而非 delete 加 add。
- [x] 1.2 更新 README.md、docs/skills-usage.md、openspec/specs/component-coverage-review/spec.md 的路徑引用清單，以及 storybook-tools-install/template/src/storybook/componentCatalog.template.ts 註解中的產生者名稱，完成 Multi-tool installer identity 要求的 rename 完整性（openspec/changes/archive/ 不動）。驗證：以 rg 搜尋 component-coverage-install 並排除 openspec/changes/archive/ 後為零筆。

## 2. Template manifest 模組化

- [x] 2.1 將 storybook-tools-install/template/TEMPLATE_MANIFEST.json 改為 name storybook-tools、version 0.10.0、sharedCore 加 tools 兩層結構（design 決策 2：維持單一 TEMPLATE_MANIFEST.json，改為 sharedCore 加 tools 兩層結構），交付 Multi-tool template manifest structure：sharedCore 收 componentCatalog.template.ts 與 check-component-catalog.mjs 及 catalog pathContracts；tools.component-coverage 原樣承接 0.9.1 檔案清單與 skillContentSha256；tools.component-timeline 列出第 3 組任務新增的全部檔案與 checks。驗證：JSON.parse 成功；以一次性 node 腳本斷言 sharedCore 與 component-coverage 清單聯集等於 0.9.1 檔案集合，且 manifest 列出的每個路徑實際存在於 template/ 之下。

## 3. component-timeline 工具模組

- [x] 3.1 新增 storybook-tools-install/template/scripts/component-timeline/build-component-timeline.mjs，交付 Timeline data derived from catalog componentPath（design 決策 4：timeline 資料由 componentCatalog 的 componentPath 推導 git 首次 commit）：依 catalog 解析契約（id 為首欄、字串欄位單行）取出 id 與 componentPath，對每個路徑以 git log --diff-filter=A --reverse 推導 firstSeen、短 hash 與 subject，輸出 src/storybook/componentTimeline.ts（最新日期在前、同日依 id 字母序），componentPath 無 git 歷史者記入產出檔註解的 untracked 清單且不失敗，catalog 缺失或解析出零筆 entry 時以非零碼結束並說明解析契約。驗證：node --check 通過；在 scratchpad 建立含三個元件、兩個提交日期的 fixture git repo 實跑，確認排序範例（beta-list、alpha-card、zebra-chip）、untracked 行為與零 entry 報錯皆符合 spec scenario。
- [x] 3.2 新增 storybook-tools-install/template/scripts/check-component-timeline.mjs，交付 Timeline drift check：記憶體內重新產生並與 src/storybook/componentTimeline.ts 逐 byte 比對，不一致或檔案缺失即非零碼；timeline id 對不到 catalog entry 亦非零碼；所有失敗訊息皆指名 build:component-timeline npm script 為修復方式。驗證：node --check 通過；沿用 3.1 的 fixture 使 timeline 過期後 check 非零碼且訊息含修復指令，重新產生後 check 轉零碼。
- [x] 3.3 新增 storybook-tools-install/template/src/storybook/component-timeline/ 底下的 ComponentTimeline.tsx、component-timeline.css、timelineExtrasRegistry.tsx、index.ts 與 storybook-tools-install/template/src/stories/tools/ComponentTimeline.stories.tsx，交付 Timeline page rendering 與 Self-contained page with a project extras slot（design 決策 5：timeline 頁面 self-contained，專案擴充走 timelineExtrasRegistry 插槽）：頁面掛在 Storybook 側欄 Tools 分類、依 firstSeen 日期分組最新在前、render 時 join catalog 顯示 name、category 與 storyTitle 解析出的 live story 預覽、每頁 30 筆控制 iframe 數、id 缺 catalog entry 時退化為 metadata-only 卡片；文案內建於 template 檔案、專案層 import 僅限 catalog、timeline 資料與 registry，registry 預設回傳 null 時不渲染 extras 區塊。驗證：content review 逐項對照兩個 requirement 的全部 scenario，並檢查 import 清單無 ds-lab 專屬模組（componentPipelineStats、_shared/copy 皆不得出現）。

## 4. SKILL.md 安裝與更新流程改寫

- [x] 4.1 改寫 storybook-tools-install/SKILL.md 安裝流程，交付 Tool selection during install（design 決策 3：安裝粒度預設全裝，SKILL.md 流程支援指定工具子集 — 使用者點名時只複製 sharedCore 加該工具並只接該工具的 checks）與 Tool-specific install preconditions（component-timeline 需 non-shallow git 歷史，以 git rev-parse --is-shallow-repository 檢查，shallow 時拒裝 timeline 並說明原因、不影響其他工具）。驗證：content review 對照 spec 兩個 requirement 的每個 scenario 均有對應流程步驟。
- [x] 4.2 改寫 storybook-tools-install/SKILL.md 更新流程與驗證段，交付 Update flow recognizes legacy single-tool installations（design 決策 6：安裝端 manifest 副本落點移至 outputs/storybook-tools，並支援舊落點升級）：先讀 outputs/storybook-tools/TEMPLATE_MANIFEST.json、回退讀 outputs/component-coverage/TEMPLATE_MANIFEST.json，0.9.x 扁平結構視為僅裝 component-coverage，升級時把記錄已裝工具集合的 0.10.0 manifest 副本寫入新落點並移除舊副本，雙落點皆無則視為全新安裝；驗證段同時涵蓋兩個工具的安裝結果與 check 鏈接線。驗證：content review 對照 spec 的 legacy 升級與 no-manifest scenario；SKILL.md 描述的落點字串與 TEMPLATE_MANIFEST.json 的 pathContracts 一致。

## 5. 收尾一致性驗證

- [x] 5.1 全 repo 收尾驗證，交付「改名、manifest、timeline 模組三者一致」的最終狀態：重跑 1.2 的 rg 檢查（零筆）、2.1 的 manifest 路徑存在性與清單等價腳本、3.1 與 3.2 的 node --check 及 fixture 實跑，最後執行 spectra validate generalize-to-storybook-tools-install。驗證：上述所有指令零錯誤結束，輸出記錄於實作結果說明。
