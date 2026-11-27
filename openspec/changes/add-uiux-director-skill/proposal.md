## Why

PM 用 AI 做產品畫面時，缺少一個能先釐清 TA 與產品目的、再把設計方向寫成未來 AI 可讀文件的「UI/UX 設計總監」角色；現有的 `uiux-director/SKILL.md` 草稿只是一份對話內規則，變更紀錄只活在對話裡，第 6 節是寫死的占位 Tokens，且 frontmatter `name: design-director-avatar` 與資料夾名稱不符，導致 `node scripts/install_agent_skills.mjs` 在列舉 skill 時直接失敗，任何 skill 都裝不了。

## What Changes

- 重寫 `uiux-director/SKILL.md`：`name` 改為 `uiux-director`，description 改為英文主體加中文觸發詞，修復安裝腳本失敗。
- 新增五個模式：`discover`（0→1 釐清 TA、產品目的、研究、設計方向）、`build`（依方向做畫面且不阻擋探索）、`review`（對已 vibe coding 一半的專案做 UI/UX 健檢）、`fix`（只動 UI 結構與樣式的修正）、`feature-change`（增刪功能並檢查對核心任務深度的影響）。
- skill 在目標專案 `product-design/` 留下四份文件：`PRODUCT_BRIEF.md`、`DESIGN_DIRECTION.md`、`EXPERIENCE_MAP.md`、`DECISION_LOG.md`，並在目標專案的 `AGENTS.md` 或 `CLAUDE.md` 加入讀取指引，讓之後任何 AI session 都能接手。
- 文件語言：第一次使用時詢問使用者（中文或英文，預設繁體中文），記錄在 `DECISION_LOG.md` 後不再詢問。
- 不迷路與核心功能深度的可檢查規則：核心任務預設 ≤2 步、次要功能 ≤3 步，可由產品在 `EXPERIENCE_MAP.md` 覆寫。
- 呼吸感由 TA 與任務推導成密度檔位（緊湊／標準／寬鬆）與具體數值，避免與 anti-ai-style 的「虛胖留白」衝突。
- 設計 token 採用 Google Material Design 3（MD3）方法：`DESIGN_DIRECTION.md` 的 token 決策以 Ref → Sys → Comp 三層表達，程式碼命名 `--md-ref-*`／`--md-sys-*`／`--md-comp-*`（與 `design-system-extractor` 一致），Figma 命名 `ref/`／`sys/`／`comp/`（與 `figma-m3-variables` 一致）；色彩由證據選 key color 生成 tonal palette 再對應 sys color roles，字級、圓角、層次、互動狀態與密度分別用 M3 typescale、shape scale、surface container 與 elevation、state layer、density scale。MD3 是方法不是外觀：不沿用 baseline 紫色 `#6750A4` 與 Roboto，除非有證據或 PM 明確選擇。目標專案已有非 MD3 token 系統時把 MD3 角色對應到既有 token，不另建平行系統。
- PM 參考素材：把「自家品牌素材」（品牌色、logo、品牌規範、既有產品、Figma，屬設計證據）與「PM 喜歡的網站、App 或截圖」（屬方向參考）分開詢問；方向參考一定追問「喜歡它哪一點」，整理成借什麼／不借什麼並對應到設計決策，不照抄他牌識別。在 discover 訪談、提出比較頁時、以及 PM 任何時候丟進參考時處理；截圖存到 `product-design/references/`，`PRODUCT_BRIEF.md` 新增 PM References。review 維持最多三題確認，改在交回健檢報告時詢問參考素材。
- 設計方向比較頁：每個候選方向附真實參考產品案例與來源，並用 PM 自己的畫面渲染 demo 並排比較，提供 HTML 模板。
- 去 AI 味判斷交給 `anti-ai-style`、token 與共用元件交給 `ds-governance`、Storybook 原型交給 `storybook-product-prototype`；在 `scripts/skill-dependencies.json` 登記 `anti-ai-style` 與 `ds-governance` 為 support 依賴。
- 新增 PM 導向的 `uiux-director/README.md`、`agents/openai.yaml`，並在 repo `README.md` 加入此 skill 段落。

## Capabilities

### New Capabilities

- `uiux-director-skill`: PM 用的 UI/UX 設計總監 skill，涵蓋五個模式、`product-design/` 四份持久文件、文件語言選擇、體驗健檢規則（迷路與功能深度）、由 TA 推導並對應 MD3 的密度設定、以 MD3 三層方法記錄的設計 token 決策、PM 參考素材（品牌證據與方向參考分開處理）、附參考案例與 demo 的設計方向比較頁，以及與 anti-ai-style、ds-governance、storybook-product-prototype 的分工。

### Modified Capabilities

(none)

## Impact

- Affected specs: 新增 `uiux-director-skill`。
- Affected code:
  - uiux-director/SKILL.md（重寫）
  - uiux-director/README.md（新增）
  - uiux-director/agents/openai.yaml（新增）
  - uiux-director/references/（新增：discovery-interview.md、product-research.md、design-direction.md、md3-token-method.md、experience-review.md、feature-change.md、review-report-template.md）
  - uiux-director/assets/（新增：四份文件模板與 direction-comparison.template.html）
  - scripts/skill-dependencies.json（新增 uiux-director 的 support 依賴）
  - README.md（新增 skill 段落）
- 修復：`node scripts/install_agent_skills.mjs` 因 name 與資料夾不符而全部失敗的問題。
- 無新增 runtime 依賴；步數自動檢查腳本不在本 change 範圍。
