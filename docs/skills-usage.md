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
Read <cm-skills path>/frontend-product-implementation/SKILL.md and follow that workflow to implement <feature> into <product repo path>. Also follow <cm-skills path>/design-system-governance/SKILL.md.
```

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
| 確保 UI 開發遵循設計系統規則 | `$design-system-governance` | 搭配實作類 skill 使用，先檢查 tokens、元件庫、i18n，缺 token/元件要先問。 |
| 比對已完成畫面和參考圖 | `$ui-compare-to-reference` | 找出 spacing、typography、color、layout 的偏差並修正。 |
| 產出 pixel-level 設計 QA 報告 | `$ui-pixel-align-report` | 產出有截圖證據、差異標記、歸屬層級的 HTML 報告。 |

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

用途：比對已經實作好的 UI 和參考圖，並修正偏差。

適合情境：

- 畫面已經做出來了。
- 想確認和設計稿或截圖是否一致。
- 想修正 spacing、typography、color、layout。

範例：

```text
Use $ui-compare-to-reference on reference/dashboard.png and http://localhost:3000/dashboard.
```

### `$ui-pixel-align-report`

用途：產出設計 QA 報告，不一定直接修正 UI。

適合情境：

- 需要給設計師或工程師看 pixel-level 差異。
- 想保留每個問題的截圖證據。
- 想先產出報告，再決定修哪些問題。

會產出：

- static HTML report
- reference screenshot
- implementation screenshot
- per-finding crops
- finding metadata

範例：

```text
Use $ui-pixel-align-report on reference/dashboard.png and http://localhost:3000/dashboard.
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

## 哪些 Skill 常常搭配使用

| 上游 skill | 下游 skill | 為什麼搭配 |
|---|---|---|
| `$design-system-extractor` | `$design-system-to-storybook` | 先有設計系統文件，再落地成元件庫。 |
| `$design-system-to-storybook` | `$storybook-product-prototype` | 有元件庫後，prototype 可以重用 shared components。 |
| `$storybook-product-prototype` | `$frontend-product-implementation` | prototype docs 會成為 production frontend 實作輸入。 |
| `$frontend-product-implementation` | `$ui-compare-to-reference` | 功能做完後，用參考圖檢查視覺偏差。 |
| `$ui-pixel-align-report` | `$ui-compare-to-reference` | 先產出差異報告，再修正畫面。 |
| `$design-system-governance` | 所有 UI 實作類 skill | 確保 token-first、component-first，不亂硬寫 UI。 |

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

## 重要原則

- 如果是 UI 實作，優先使用 `$design-system-governance`。
- 如果沒有 design system，先不要直接做產品畫面，先決定是否要建立設計系統。
- 如果缺 token 或 shared component，要先問使用者。
- 如果真實 API 還沒準備好，可以先做 API/data contract、fixtures、mock adapter。
- 如果只是想確認產品流程，先用 `$storybook-product-prototype`，不要急著進 production repo。
- 如果畫面已經做完，再用 `$ui-compare-to-reference` 或 `$ui-pixel-align-report` 做 QA。
