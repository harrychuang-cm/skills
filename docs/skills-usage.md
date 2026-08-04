# CM Skills 使用指南

這份文件用比較簡單的方式說明每個 skill 的用途、什麼時候用、怎麼搭配使用。

這些 skills 不是只給 Codex 使用。它們的核心是一個 skill 資料夾和裡面的 `SKILL.md` 指令，也可以被 Cursor、Claude Code、Codex，或其他能讀取專案文件的 AI coding agent 使用。

## 在不同 AI coding agent 中怎麼使用

最穩定的使用方式是：告訴 AI 你要使用哪個 skill，並提供 repo、設計稿、handoff docs 或 reference screenshot 的路徑。

如果你的工具已經支援 skills，可以直接用 skill 名稱：

```text
Use $frontend-product-implementation to implement <feature> from <handoff docs path> into <product repo path>. Follow $design-system-governance.
```

如果你的工具不會自動辨識 `$skill-name`，就明確要求它先讀對應的 `SKILL.md`：

```text
Read <cm-skills path>/frontend-product-implementation/SKILL.md and follow that workflow to implement <feature> into <product repo path>. Also follow <design-system-governance skill path>/SKILL.md.
```

`$design-system-governance` 是外部 skill，不在 cm-skills repo 裡，路徑請指向它實際安裝的位置。

通用使用原則：

- Cursor、Claude Code、Codex 都可以使用同一份 skill 文件。
- skill 的名字只是快捷入口，真正的規格以各資料夾中的 `SKILL.md` 為準。
- 請求中要提供明確路徑，例如 target repo、design-system docs、Storybook、reference images、prototype docs。
- 如果是 UI 實作，請同時要求遵循 `$design-system-governance`。
- 如果 AI 找不到 token、元件或資料 contract，應該先停下來確認，而不是直接硬寫。

## 快速選擇

| 你想做的事 | 使用 skill | 簡單說明 |
|---|---|---|
| 從截圖、Figma、既有產品整理出設計系統 | `$design-system-extractor` | 先把設計語言、tokens、元件盤點整理成文件。 |
| 把設計系統文件做成 Storybook 元件庫 | `$design-system-to-storybook` | 把 tokens、components、stories 落地到產品 repo。 |
| 從一張畫面拆成可重用 Storybook 元件 | `$ui-screenshot-to-storybook-product` | 適合只有截圖或單一畫面時，先做元件化再組畫面。 |
| 建立產品流程 prototype 和前端 handoff 文件 | `$storybook-product-prototype` | 產出 PRD、Flow、UI Spec、Data Spec、Frontend Handoff 和 clickable prototype。 |
| 根據 handoff 文件實作前端產品功能 | `$frontend-product-implementation` | 把 handoff docs 變成產品 repo 裡的 routes、screens、states、fixtures、mock adapters。 |
| 確保 UI 開發遵循設計系統規則 | `$design-system-governance` | 搭配實作類 skill 使用，先檢查 tokens、元件庫、i18n，缺 token/元件要先問。（外部 skill，不在本 repo） |
| 把畫面修成跟參考來源一致 | `$ui-compare-to-reference` | 參考來源可以是 Figma、設計圖，或另一個平台的原始碼（網頁 ↔ App 互為標準）。修在 token 或共用元件上，不是修在單一畫面。 |
| 產出設計落差稽核報告 | `$ui-pixel-align-report` | 兩邊都抽成同一份規格再比對，產出截圖證據、嚴重度、歸屬層級的離線 HTML 報告與 `findings.json`。 |
| 把重複性流程變成自動化 | `$agent-automation-orchestrate` | 自動化的起始點：建立專案契約，之後用它執行、續跑、查狀態。 |
| 在 Storybook 專案安裝元件覆蓋率工具 | `$component-coverage-install` | 帶入「UI 圖片/PRD → 覆蓋率報告 → 審查 → 實作」的工具和配套 skills。 |
| 在其他專案安裝 Figma 清理自動化 | `$design-automation-hub-install` | 安裝 Figma plugin、本機 coordinator 和 figma-cleanup task。 |

## 每個 Skill 怎麼用

### `$design-system-extractor`

用途：從設計來源萃取出可重用的設計系統。

適合情境：

- 你有 Figma、截圖、品牌參考、既有 app 或 prototype。
- 還沒有清楚的 design tokens 或 component inventory。
- 想先建立設計系統文件，再進入實作。

會產出：

- design principles
- design elements
- token architecture
- component inventory
- component specs
- review HTML

範例：

```text
Use $design-system-extractor to extract a reusable design system from ./references/screenshots and ./figma-export.
```

### `$design-system-to-storybook`

用途：把已整理好的設計系統文件落地成 Storybook 元件庫。

適合情境：

- 已經有 `design-system/` 和 `tokens/`。
- 想建立 Storybook foundations、shared components、stories。
- 想讓元件可被之後的產品畫面重用。

會做的事：

- 讀 design-system docs 和 tokens。
- 建立或更新 Storybook。
- 建立 token-backed components。
- 補 stories 和驗證。
- 可搭配 Figma export/import workflow。

範例：

```text
Use $design-system-to-storybook with design system at ./design-system and product repo at ./apps/web.
```

### `$ui-screenshot-to-storybook-product`

用途：從單張 UI 圖片或 Figma export 開始，拆出元件，再組產品畫面。

適合情境：

- 你只有一張 screenshot 或 mockup。
- 想避免直接做一次性 page CSS。
- 想先把畫面拆成共用元件。

搭配方式：

- 如果畫面背後還沒有設計系統，先用 `$design-system-extractor`。
- 如果已有設計系統和 Storybook，可直接用這個 skill 做 screen-to-components。

範例：

```text
Use $ui-screenshot-to-storybook-product on reference/dashboard.png and implement it through reusable Storybook components.
```

### `$storybook-product-prototype`

用途：把產品想法變成可點擊的 Storybook prototype 和前端 handoff 文件。

適合情境：

- 還在討論產品流程。
- 想先確認 route、state、data contract、acceptance。
- 想把設計/產品想法交給工程師、Cursor、Claude Code、Codex 或其他 AI coding agent 繼續開發。

會產出：

- `PRD.md`
- `FLOW_SPEC.md`
- `UI_SPEC.md`
- `DATA_SPEC.md`
- `PRODUCTION_HANDOFF.md`
- `ACCEPTANCE.md`
- `IMPLEMENTATION_GUIDE.md`
- typed route metadata
- deterministic fixtures
- Storybook prototype
- Static Flow export

注意：這個 skill 不負責接真實 API。它會寫清楚 API/data contract 和 fixtures，真實資料來源由接手的工程師或 AI coding agent 處理。

範例：

```text
Use $storybook-product-prototype to create a checkout flow prototype with PRD, UI Flow, Data Spec, and Frontend Handoff docs.
```

### `$frontend-product-implementation`

用途：把 handoff docs 實作成產品 repo 裡的前端功能。

適合情境：

- 已經有 `$storybook-product-prototype` 產出的 docs。
- 想從 0 到 1 建立 frontend product。
- 想在既有產品中新增 route、screen、feature。
- 真實 API 還沒準備好，但前端可以先用 fixtures/mock adapter。

會做的事：

- 讀 `PRODUCTION_HANDOFF.md`，再 cross-check PRD、Flow、UI、Data、Acceptance。
- 判斷是 greenfield 還是 existing product。
- 掃描 target repo 的 routes、screens、tokens、component library、Storybook、i18n、data pattern。
- 遵循 `$design-system-governance`。
- 優先重用現有 tokens 和 shared components。
- 如果缺 token 或 shared component，先問使用者。
- 建立 typed contracts、fixtures、mock adapters。
- 跑 typecheck、tests、build 或 Storybook/app preview。

範例：

```text
Use $frontend-product-implementation to implement the checkout flow from ./src/pages/prototypes/checkout-flow-prototype/docs into ./apps/web. Follow $design-system-governance.
```

### `$design-system-governance`

> **外部 skill：** 這個 skill 不在 cm-skills repo 裡，需要另外安裝。`scripts/install_agent_skills.mjs` 只會安裝這個 repo 裡的 skill 資料夾，不包含它。如果你的 agent 認不出 `$design-system-governance`，請改指向它實際安裝的位置（例如 `~/.claude/skills/design-system-governance/SKILL.md`），而不是 cm-skills 底下的路徑。

用途：確保 UI 實作遵循設計系統規則。

這通常不是單獨使用，而是搭配以下 skill：

- `$design-system-to-storybook`
- `$ui-screenshot-to-storybook-product`
- `$storybook-product-prototype`
- `$frontend-product-implementation`

它會要求先檢查：

- token naming
- token layers
- grid/layout system
- motion tokens
- shared components
- Storybook
- i18n source

重要規則：

- 不要硬寫顏色、spacing、radius、typography。
- 不要直接做一次性 inline child component。
- 找不到 token 時要先問。
- 找不到可組裝的共用元件時要先問。
- 顯示文字要走 i18n source。

範例：

```text
Use $frontend-product-implementation and follow $design-system-governance. If required tokens or shared components are missing, stop and ask before creating them.
```

### `$ui-compare-to-reference`

用途：比對已經實作好的 UI 和參考來源，並修正偏差。

參考來源可以是三種，不只截圖：

- Figma 檔案或 frame（優先用 Figma MCP 讀出實際數值與變數名稱）
- 設計匯出圖或截圖（沒有 Figma 權限時的備案，數值是估算）
- 另一個平台的原始碼 — 拿網頁版當標準修 App，或拿 App 當標準修網頁

適合情境：

- 畫面已經做出來了，但和設計稿不一致。
- 要把某個畫面從網頁移植到 React Native / Flutter / iOS / Android，或反過來。
- 要修正 spacing、typography、color、layout 的偏差。

修的順序是 token → 共用元件 → 組裝 → 這個畫面。它也會區分「該修的落差」和「本來就該不一樣的平台適配」，不會把合理差異當成 bug 修掉。

範例：

```text
Use $ui-compare-to-reference on https://www.figma.com/design/...?node-id=1-234 and src/screens/WalletHome.tsx.
Use $ui-compare-to-reference with apps/web/src/pages/Wallet.tsx as the reference for apps/mobile/src/screens/WalletHome.tsx.
Use $ui-compare-to-reference on reference/dashboard.png and http://localhost:3000/dashboard.
```

### `$ui-pixel-align-report`

用途：產出設計 QA 報告，不直接修正 UI。參考來源與上一個 skill 相同（Figma / 設計圖 / 另一個平台的原始碼）。

作法是把參考與實作兩邊都抽成同一份平台中立的 UI Spec 再做結構化比對，截圖是證據而不是量測工具。

適合情境：

- 需要給設計師或工程師看逐項差異。
- 想保留每個問題的截圖證據和原始設計連結。
- 想先產出報告，再決定修哪些問題。
- 需要跨平台的一致性稽核（Figma ↔ 網頁 ↔ App，或 iOS ↔ Android）。

會產出：

- 可離線開啟的 static HTML report
- `findings.json`（可直接餵給 `$ui-compare-to-reference` 修復）
- `spec/reference.json` 與 `spec/implementation.json`
- 參考與實作的完整截圖，以及每一項問題的並排截圖

範例：

```text
Use $ui-pixel-align-report on https://www.figma.com/design/...?node-id=1-234 and http://localhost:3000/dashboard.
Use $ui-pixel-align-report on reference/dashboard.png and Dashboard.stories.tsx.
```

### `$agent-automation-orchestrate`

用途：自動化流程的起始點。把重複性的工作寫成一份專案契約，之後由它執行、續跑和回報。

適合情境：

- 同一件事要在多個專案、多次重複執行。
- 想讓 Claude Code、Codex、Cursor 等 CLI 依序 fallback，其中一個不能用時換下一個。
- 已經有 `.agent-automation/config.json`，要執行或續跑某個 task。
- 設計師想用白話描述一個自動化，不想碰指令和路徑。

五種模式：`bootstrap`（建立契約）、`guide`（白話引導設定）、`run`（執行 task）、`resume`（續跑）、`status`（查狀態）。查詢和報告狀態是唯讀的，不會啟動付費 agent。

契約分工：`runners` 放各家 CLI 的指令、preflight、timeout 和環境變數名稱；`tasks` 放這個專案的指示、配套 skill、驗證指令和必要產物。憑證一律不寫進契約。

範例：

```text
Use $agent-automation-orchestrate to set up automation for ./apps/web. I want ready-for-dev Figma components built into Storybook.
```

```text
Use $agent-automation-orchestrate to run the build-components task in ./apps/web, with a dry run first.
```

### `$component-coverage-install`

用途：把 Storybook「Component Coverage Analyzer」工具安裝並綁定到 React + Vite 的 Storybook 專案。

適合情境：

- 想在新專案導入「UI 圖片或 PRD → 覆蓋率報告 → 開發者審查 → 實作」的流程。
- 需要 Storybook Tools 頁、dev API、檢查腳本和配套的 analyze / implement skills。
- 要更新既有安裝版本（依 `TEMPLATE_MANIFEST.json` 的版本比對，只覆蓋模板擁有的檔案）。

範例：

```text
Use $component-coverage-install to install the component coverage analyzer into ./apps/web.
```

### `$design-automation-hub-install`

用途：把 Design Automation Hub 安裝到指定的目標專案。

適合情境：

- 其他專案需要同一套「Figma 清理 → AI 計畫 → 人工確認」流程。
- 不想複製整個產品 repo，也不想再裝第二套通用 runner。
- 需要先看不寫入任何檔案的安裝計畫再決定。

它會在既有的自動化契約上只加入 `figma-cleanup` task，保留原本的 runners 和其他 tasks。Figma Desktop 的 manifest 匯入是刻意保留給人工執行的步驟。

範例：

```text
Use $design-automation-hub-install to preview a Design Automation Hub installation for ./apps/web.
```

## 建議工作流

### 工作流 1：從設計稿到可重用元件庫

適合：你有 Figma、截圖、既有 app，想建立設計系統和元件庫。

```text
$design-system-extractor
-> $design-system-to-storybook
-> $ui-compare-to-reference
```

說明：

1. 先萃取設計系統。
2. 再把 tokens 和 components 做進 Storybook。
3. 最後比對實作和參考圖。

### 工作流 2：從產品想法到前端功能

適合：你有產品需求，但還沒開始做 production frontend。

```text
$storybook-product-prototype
-> $frontend-product-implementation
-> $ui-compare-to-reference
```

說明：

1. 先用 prototype skill 產出 PRD、Flow、Data Spec、Frontend Handoff。
2. 再用 frontend implementation skill 把 docs 實作到產品 repo。
3. 最後用 compare skill 做視覺校正。

### 工作流 3：從單張畫面開始做產品頁

適合：你只有一張 screenshot 或 Figma export。

```text
$ui-screenshot-to-storybook-product
-> $frontend-product-implementation
-> $ui-compare-to-reference
```

說明：

1. 先拆出畫面中的可重用 UI blocks。
2. 再把它接進產品 repo 的 route 或 screen。
3. 最後比對實作結果。

如果完全沒有 design system，應先改成：

```text
$design-system-extractor
-> $design-system-to-storybook
-> $ui-screenshot-to-storybook-product
```

### 工作流 4：既有產品新增功能

適合：產品 repo 已經存在，只是要新增一個頁面或功能。

```text
$frontend-product-implementation + $design-system-governance
-> $ui-compare-to-reference
```

說明：

1. 先讀既有 repo 的 routes、tokens、shared components、i18n、tests。
2. 依照 design-system governance 重用現有元件。
3. 真實 API 不在 scope 時，用 typed contracts、fixtures、mock adapters。
4. 最後比對畫面。

### 工作流 5：設計 QA 和交付報告

適合：你想要一份可交付的設計差異報告。

```text
$ui-pixel-align-report
-> $ui-compare-to-reference
```

說明：

1. 先產生 pixel alignment report。
2. 再根據 report 修正 UI。

### 工作流 6：把流程變成可重複的自動化

適合：上面某個工作流已經做過幾次，想讓它可以重複執行。

```text
$agent-automation-orchestrate
-> 契約中指定的配套 skill
-> $ui-compare-to-reference
```

說明：

1. 用白話描述要自動化的事，讓它建立 `.agent-automation/config.json`。
2. 驗證契約，先 dry run 看執行計畫，再實際執行。
3. 每次執行結束後檢查驗證指令和必要產物，需要時用 `resume` 續跑。

## 哪些 Skill 常常搭配使用

| 上游 skill | 下游 skill | 為什麼搭配 |
|---|---|---|
| `$design-system-extractor` | `$design-system-to-storybook` | 先有設計系統文件，再落地成元件庫。 |
| `$design-system-to-storybook` | `$storybook-product-prototype` | 有元件庫後，prototype 可以重用 shared components。 |
| `$storybook-product-prototype` | `$frontend-product-implementation` | prototype docs 會成為 production frontend 實作輸入。 |
| `$frontend-product-implementation` | `$ui-compare-to-reference` | 功能做完後，用參考圖檢查視覺偏差。 |
| `$ui-pixel-align-report` | `$ui-compare-to-reference` | 先產出差異報告，再修正畫面。 |
| `$design-system-governance` | 所有 UI 實作類 skill | 確保 token-first、component-first，不亂硬寫 UI。 |
| `$agent-automation-orchestrate` | 契約中指定的配套 skill | runner 保持通用，專案自己的指示和驗證寫在 task 契約裡。 |
| `$design-automation-hub-install` | `$agent-automation-orchestrate` | 在既有契約上加 `figma-cleanup` task，不用再裝第二套 runner。 |

## 給 AI coding agent 的請求模板

這些模板可以直接用在 Cursor、Claude Code、Codex 或其他 AI coding agent。若該工具不支援 `$skill-name` 觸發，請把句子改成「先閱讀 `<skill folder>/SKILL.md`，再依照該 workflow 執行」。

### 建立設計系統

```text
Use $design-system-extractor to extract a reusable design system from <reference paths or Figma URL>.
```

### 建立 Storybook 元件庫

```text
Use $design-system-to-storybook with design system at <design-system path> and product repo at <repo path>.
```

### 建立產品 prototype 和 handoff

```text
Use $storybook-product-prototype to create a prototype for <feature name>. Include PRD, Flow Spec, UI Spec, Data Spec, Production Handoff, Acceptance, and deterministic fixtures.
```

### 實作到產品 repo

```text
Use $frontend-product-implementation to implement <feature name> from <handoff docs path> into <product repo path>. Follow $design-system-governance. Real API integration is out of scope; use typed contracts, fixtures, and mock adapters.
```

### 比對畫面

```text
Use $ui-compare-to-reference on <reference screenshot> and <local URL or route or component file>.
```

### 產出 QA 報告

```text
Use $ui-pixel-align-report on <reference screenshot> and <local URL>.
```

### 建立自動化

```text
Use $agent-automation-orchestrate to set up automation for <repo path>. <用白話描述你想自動化的事>.
```

### 執行既有的自動化

```text
Use $agent-automation-orchestrate to run the <task id> task in <repo path>, with a dry run first.
```

## 重要原則

- 如果是 UI 實作，優先使用 `$design-system-governance`。
- 如果沒有 design system，先不要直接做產品畫面，先決定是否要建立設計系統。
- 如果缺 token 或 shared component，要先問使用者。
- 如果真實 API 還沒準備好，可以先做 API/data contract、fixtures、mock adapter。
- 如果只是想確認產品流程，先用 `$storybook-product-prototype`，不要急著進 production repo。
- 如果畫面已經做完，再用 `$ui-compare-to-reference` 或 `$ui-pixel-align-report` 做 QA。
- 如果同一件事要重複做，用 `$agent-automation-orchestrate` 收成契約，不要每次重寫一次流程。
- 自動化的完成判定要分開看：契約驗證、agent 結束、專案驗證、commit、push 是五件事，不能互相代表。
