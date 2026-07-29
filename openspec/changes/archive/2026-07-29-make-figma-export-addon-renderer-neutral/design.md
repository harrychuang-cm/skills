## Context

目前 addon 已有兩個不同層級：`preview.ts` 與 export overlay 是純 DOM、會原樣回傳 story output；但 `review.ts` 仍直接匯入 React／React DOM，並以 React 元件包住 story result。這使核心匯出可在多種 Storybook renderer 運作，完整 Review／Visual Comments 卻實際綁定 React。安裝器目前只偵測 package manager，無法判斷 renderer、builder、Storybook major 或可用能力。

這個變更橫跨 addon runtime、安裝器、Storybook 接線、真實框架 fixture、skill 文件與兩個 vendored mirrors，因此需要共同架構與一致的驗收契約。第一個完整非 React 目標為 Vue 3 + Vite + Storybook 10，功能基準是目前 React + Vite + Storybook 10 的完整工作流程。

## Goals / Non-Goals

**Goals:**

- Vue 3 + Vite + Storybook 10 可使用與 React 相同的 Export、Review、Visual Comments、meeting、證據、報告與來源操作。
- Preview addon runtime 不依賴產品專案提供 React 或 React DOM，所有 decorator 均原樣回傳 renderer 的 story result。
- 安裝器可自動辨識環境並回報能力；只有訊號衝突或不足時才停止並要求 override。
- React 既有設定與行為維持相容，Figma payload、review server API 與儲存格式不變。
- 單一 addon 原始碼、單一版本與共享跨 renderer 功能測試，避免兩套功能逐漸分歧。

**Non-Goals:**

- 不建立完整 Vue 版 `storybook-template`；驗證使用最小但真實的 Vue Storybook fixture。
- 不在本變更承諾 Vue + Webpack、Storybook 9 或 Angular／Svelte／Web Components 的完整 review parity；這些組合仍依 capability report 顯示已驗證或未驗證能力。
- 不改變 Figma plugin、匯入 payload schema、comment persistence schema 或既有 HTTP endpoint。
- 不建立 `addon-react` 與 `addon-vue` 分叉套件。

## Decisions

### 使用能力矩陣自動偵測，而不是以 React 作預設

新增可單元測試的環境偵測模組，讀取產品 `package.json` 與 `.storybook/main.{js,jsx,ts,tsx,mjs,cjs}` 的靜態訊號。輸出至少包含：

```ts
type StorybookEnvironment = {
  renderer: "react" | "vue3" | "angular" | "svelte" | "web-components" | "unknown";
  builder: "vite" | "webpack5" | "unknown";
  storybookMajor: number | null;
  confidence: "exact" | "inferred" | "ambiguous";
  signals: string[];
  capabilities: {
    coreExport: "supported" | "unsupported" | "unverified";
    reviewWorkspace: "supported" | "unsupported" | "unverified";
    visualComments: "supported" | "unsupported" | "unverified";
    persistence: "supported" | "unsupported" | "unverified";
  };
};
```

安裝器接受 `--renderer <name>` 作為明確 override，並新增 `--json` 供自動化讀取 capability report。唯一且一致的訊號直接安裝；衝突或未知 renderer 在寫檔或安裝 dependency 前失敗，訊息列出偵測訊號與可用 override。選擇能力矩陣，是因為 renderer 與 builder 對 runtime、Vite server plugin 和持久化能力的影響不同，單一 framework 字串不足以安全決策。

替代方案是每次互動式詢問框架；這會阻礙 CI，且容易讓使用者選擇與實際設定不一致。互動選擇只適合作為外層體驗，不能取代可重現的自動偵測。

### 將 Preview UI 改為 renderer-neutral 的獨立 DOM host

`createFigmaExportReviewDecorator` 保留既有公開入口與設定 shape，但其 runtime 流程改為：

1. 呼叫既有 pass-through export decorator 取得 story result。
2. 依 Storybook context 同步一個掛載在 `document.body` 的獨立 review workspace host。
3. 原樣回傳第一步的 story result，不建立 wrapper、不 clone、不轉換 renderer vnode。
4. story 切換、Docs／Story mode 變更與 HMR 時清理 listener、暫態 pin、composer 與過期 host 狀態。

Preview 的 review workspace 以原生 DOM／自訂元素與 framework-neutral controller 呈現，並沿用既有 review server、visual comment store、capture 與 report 模組。Preview／review build outputs 不得匯入 React、React DOM 或 `@storybook/icons`。Manager toolbar 可繼續使用 Storybook manager 提供的 React runtime，因為它不會進入產品 preview renderer。

替代方案一是在 Vue preview 內另掛一個隔離 React root；這仍把 React runtime 帶進 preview，增加依賴與雙 runtime 風險。替代方案二是提供 Vue 專用 decorator；它會造成 UI、狀態處理與 bug fix 分叉。兩者都不採用。

### 以共享功能契約驗證 React 與 Vue

在 addon test 目錄建立最小 React 及 Vue 3 Storybook 10 + Vite fixtures，兩者使用相同的測試 story 語意、addon options 與 Vite review server plugin。共享 browser suite 逐項驗證：

- story output 未被 decorator 改寫；
- export overlay、scope、payload sync 與來源操作；
- Review workspace 顯示與收合；
- meeting start／join／end；
- Visual Comments capture、pin、create／edit／delete；
- persistence、歷史 meeting、report 與 AI fix context；
- API 或 capability 失敗時的可見狀態。

建置檢查另掃描 preview／review artifacts 的 forbidden imports。共享 suite 是「Vue 與 React 一樣完整」的持續門檻；只有 build smoke test 不足以宣稱 parity。

### 保留單一 addon 與既有對外介面

套件維持 `@harrychuang/storybook-addon-figma-export` 與現有 `./preview`、`./review`、`./review-server` exports。Vue 與 React 使用相同 options、channel events、HTTP endpoints、payload 與 storage schema。React／React DOM 不再是產品 preview runtime 的必要 peer dependency；若 manager bundle 的 external contract 仍需要相關型別或 Storybook globals，必須標記為 optional，且 Vue fixture 在未宣告 React／React DOM 時仍須通過安裝、build 與 browser tests。

這讓現有 React 使用者不需 migration，也讓 installer 不必選擇不同的套件。

### 先完成 Vue 3 + Vite 的完整對等

完整 parity 的第一個支援格為 Vue 3 + Vite + Storybook 10，因為目前 review persistence 透過 Vite server plugin 提供。其他 renderer 可繼續使用已支援的 core export，但 installer 與文件必須將未完成的 review 組合標為 `unverified` 或 `unsupported`，不得靜默顯示成功。

這是明確的分階段支援矩陣，不是縮減 Vue 功能；Vue 目標格必須在同一變更內完成完整契約後才可標為 supported。

## Implementation Contract

### Observable behavior

- 在符合 Vue 3 + Vite + Storybook 10 的專案執行 installer，無須回答框架問題即可完成 addon 安裝並得到 `renderer=vue3`、`builder=vite` 與四項完整能力為 `supported` 的 report。
- Vue Storybook 中可完成 React fixture 可完成的每一項 export／review／comment 流程；控制、狀態、錯誤與報告語意一致。
- 啟用 review decorator 前後，Vue story render result 保持 strict identity；preview runtime 不要求產品安裝 React／React DOM。
- React + Vite + Storybook 10 的既有設定、可見功能與儲存資料維持相容。

### Interfaces and data shapes

- Installer command 維持 `node <skill-root>/scripts/install_figma_export_addon.mjs <product-repo-root> [options]`，新增 `--renderer <react|vue3|angular|svelte|web-components>` 與 `--json`。
- 環境偵測模組匯出 `detectStorybookEnvironment({ productRoot, rendererOverride? })`，回傳本文件定義的 `StorybookEnvironment`。
- `createFigmaExportReviewDecorator(options)` 的 import path 與 options shape 不變；其回傳 decorator 對任何 renderer 的 story result 維持 strict identity。
- Review server endpoints、comment JSON、meeting JSON、report URL 與 Figma export payload 不變。

### Failure modes

- renderer 訊號衝突或未知時，installer 在任何 package、lockfile、tarball或 Storybook config mutation 前以非零狀態結束，列出訊號與 `--renderer` 用法。
- 已辨識但尚未支援完整 review 的 renderer／builder 組合，capability report 明確標示 `unsupported` 或 `unverified`；installer 不得把它宣稱為完整安裝成功。
- Vue runtime 的 server API、capture 或 persistence 失敗沿用 React 的 capability-scoped 可見錯誤，不得讓 core export 一併失效。

### Acceptance criteria

- detector table tests 涵蓋 React、Vue、衝突訊號、未知環境、override 與各種 package manager。
- addon build 成功，preview／review artifacts 無 React、React DOM 或 Storybook icon imports。
- React 與 Vue 真實 Storybook fixtures 均能 build，且共享 browser parity suite 全數通過。
- Vue fixture 的 `package.json` 不宣告 React／React DOM。
- 既有 addon unit、HTTP、report、visual comment 與 plugin-code tests 全數通過。
- skill validator、Spectra analyzer 與嚴格 change validation通過，兩個 vendored mirrors 與 canonical addon version／artifact hash 一致。

### Scope boundaries

本變更只處理 addon renderer neutrality、Vue 3 + Vite 完整 parity、自動偵測、安裝接線、測試與文件。Figma plugin、import reconstruction、現有 payload fidelity change、Webpack server adapter 與完整 Vue product template 不在範圍內。

## Risks / Trade-offs

- [將大型 React review view 改寫為 DOM controller 可能造成細節回歸] → 先以既有 React fixture 建立共享行為基線，再逐段替換 view，所有 React／Vue browser scenarios 同時通過才完成。
- [靜態分析 `.storybook/main.*` 無法安全執行任意設定] → 只讀 package dependency 與已知 framework／builder 字串，保留 signals 與 confidence；模糊結果要求 override。
- [真實雙框架 browser tests 增加 CI 時間] → 共用 suite、fixture dependency cache，快速 unit/build checks 與完整 browser parity 分層執行。
- [原生 DOM UI 維護成本高於單一框架元件] → 把 meeting、capture、comment、report 邏輯留在既有純 TypeScript services，DOM view 僅負責 rendering、event binding 與 lifecycle。
- [其他 renderer 誤以為已獲得完整 parity] → capability report、支援矩陣與 skill 文件分別標示 core export 與 full review，不使用模糊的「支援 Storybook」宣稱。

## Migration Plan

1. 建立環境 detector、capability matrix 與測試，先接入 installer 的 report／guard，不改 addon runtime。
2. 建立 React／Vue 真實 fixtures 與共享 parity harness，以 React 現況固定基準。
3. 將 review workspace 拆成純 TypeScript controller 與 renderer-neutral DOM host，保留公開 exports 與資料契約。
4. 移除 preview runtime 對 React peers 的需求，重建 canonical dist，完成雙框架 tests。
5. 更新 skill／文件，再同步兩個 vendored mirrors 並驗證版本與 hash。
6. 發佈時保留前一版 tarball；若發現回歸，可將 skill bundled addon 回退至前一版，installer 的版本檢查會阻止非明確降級。

## Open Questions

- 無；Vue 完整功能範圍、第一個支援矩陣與 renderer-neutral DOM 方案已在本設計固定。
