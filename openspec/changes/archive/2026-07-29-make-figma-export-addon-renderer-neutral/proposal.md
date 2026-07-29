## Why

目前 Figma Export addon 的核心 DOM 匯出層已不依賴 React，但完整的 Review／Visual Comments 預覽體驗仍由 React decorator 包裝 story，安裝器也無法辨識專案 renderer；因此 Vue 專案無法獲得與 React 相同的完整工作流程。這次變更要把 renderer 差異隔離在安裝與接線邊界，先讓 Vue 3 + Vite + Storybook 10 成為與 React 等級一致的一級支援目標。

## What Changes

- 安裝器自動偵測 Storybook renderer、builder、版本與能力；只有偵測結果模糊時才要求明確 override，並輸出可驗證的 capability report。
- 將 Preview 內的 Review／Visual Comments UI 與 story render result 解耦，任何 renderer 的 decorator 都必須原樣回傳 story output。
- Vue 3 + Vite + Storybook 10 支援與 React 相同的 Export、Review、Visual Comments、meeting lifecycle、證據擷取、留言增刪改、報告與來源操作。
- Vue 專案不得為了使用 addon 而自行安裝 React 或 React DOM；Storybook manager 端仍可使用 Storybook 提供的 UI runtime。
- 建立實際 Vue Storybook 驗證 fixture，與 React fixture 共用一組功能契約與 browser regression tests。
- 更新 `design-system-to-storybook` skill、安裝文件與 framework adaptation 指引，使自動偵測、支援矩陣及 fallback 規則一致。
- 維持現有 React 行為與 Figma payload／server contract 相容，不建立 React 與 Vue 兩套分叉 addon。

## Capabilities

### New Capabilities

- （無）

### Modified Capabilities

- `figma-export-workflow`: 增加 renderer 自動偵測、renderer-neutral preview 接線、Vue 完整功能對等及跨 renderer 回歸驗證要求。
- `visual-export-review-comments`: 增加 Vue renderer 下與 React 相同的 Review／Visual Comments、meeting、持久化與報告行為要求。

## Impact

- Addon 原始碼與封裝：`design-system-to-storybook/assets/figma-export-addon/src/`、`package.json`、`tsup.config.ts`。
- 安裝器與偵測邏輯：`design-system-to-storybook/scripts/install_figma_export_addon.mjs`、`design-system-to-storybook/scripts/lib/`。
- 真實框架 fixtures 與測試：`design-system-to-storybook/assets/figma-export-addon/test/`。
- Skill 與文件：`design-system-to-storybook/SKILL.md`、`design-system-to-storybook/references/framework-adaptation.md`、`design-system-to-storybook/references/figma-export-review-setup.md`、`design-system-to-storybook/references/tooling-updates.md`。
- 發佈同步面：`design-system-to-storybook/assets/figma-export-addon/dist/`、`storybook-template/.storybook/vendor/figma-export-addon/`、`storybook-template/vendor/figma-export/`。
- 相容性：不改變既有 Figma export payload、review server API 或匯入器契約；React 使用者不需要改設定。
