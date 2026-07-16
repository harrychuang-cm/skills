## Why

design-system-to-storybook skill 的 Storybook→Figma 匯出管線（figma-export-addon + figma-plugin-code-to-design）目前有兩類問題：(1) 三份 vendored exporter 副本已分歧——installer 安裝給產品 repo 的 `assets/figma-export-addon` 只會產生 v1 payload，而 Figma plugin 已支援 v2（漸層、四邊 border、HUG sizing、textAlign 等），使用者拿到的是退化體驗；(2) 即使最新副本，仍有一批常見 CSS 特性完全沒被擷取或轉換錯誤（box-shadow、點陣圖、四角獨立圓角、oklch 色彩、margin 排距、flex-wrap、文字樣式細節），是「匯入 Figma 後樣式不正確／跑版」的直接根因。

## What Changes

- **統一三份 exporter 副本**：以 `storybook-template/vendor/figma-export` 的最新引擎（v2 payload）為基準，合併 `assets/figma-export-addon` 獨有的 review 模組（review.ts、review-server.ts、source.ts、review.css，三份中兩份already有且內容相同），使 `assets/figma-export-addon` 成為唯一權威來源，再同步回兩個 template 副本並重建 dist。
- **Exporter 新增樣式擷取**（domExport.ts / types.ts / tokenExport.ts）：
  - 色彩正規化：以 canvas 往返把 oklch()/lab()/color()/hsl()/named color 正規化為 rgba，涵蓋 computed style 與 token rawValue（修正 Tailwind v4 oklch 變黑問題）
  - box-shadow / text-shadow → payload `effects`（DROP_SHADOW / INNER_SHADOW）
  - 四角獨立圓角 → payload `radiusCorners`
  - 點陣圖（img PNG/JPG/WebP、canvas 元素）→ base64 `imageBase64` + `imageScaleMode`（依 object-fit）
  - 文字保真：text-transform 直接套用到匯出字串、依 white-space 保留換行、letter-spacing、text-decoration、font-style italic
- **Exporter 佈局轉換修正**：
  - Auto Layout 量測法：以子元素實際 bounding rect 推導 itemSpacing 與有效 padding（涵蓋 margin 排距、space-around/space-evenly）；間距不均勻且非 space-between 時退回 absolute
  - flex-wrap: wrap → payload `layoutWrap: "WRAP"` + `counterAxisSpacing`（以 rect 分行量測）
  - row-reverse / column-reverse / order → 依主軸視覺位置排序子節點後匯出
  - Token 綁定正確性：getCssRules 加入 matchMedia 過濾（與 tokenExport 行為一致）、宣告比對加入 CSS specificity 排序
- **Figma plugin 套用新欄位**（code.ts）：effects、radiusCorners（per-corner radius）、layoutWrap + counterAxisSpacing、letterSpacing、textDecoration、italic 字型候選（含 Light/Thin/Black 字重對應）、imageBase64 → figma.createImage 圖片填色、hsl()/8 位 hex 色彩解析、任意角度 linear-gradient transform；payload 維持 version 2（新欄位皆 optional，向前向後相容）；PLUGIN_VERSION 升版並重建 code.js。
- **驗證器與文件**：`scripts/validate_figma_export_payload.mjs` 接受並檢查新 optional 欄位；更新 addon README、plugin README、`references/figma-export-readiness.md`（放寬 margin/wrap/shadow/raster 的契約限制並記錄仍存在的限制）。
- **新增匯出功能覆蓋 fixture**：一頁無相依的 HTML fixture，涵蓋所有新擷取特性，供真實瀏覽器驗證 payload。

## Capabilities

### New Capabilities

- `figma-export-capture`: Storybook addon 端——從渲染後 DOM 擷取 Figma 匯入 payload 的規格（樣式擷取範圍、佈局策略、token 綁定正確性、payload schema v2 欄位）
- `figma-import-reconstruction`: Figma plugin 端——從 payload 重建 Figma 圖層的規格（欄位套用、變數綁定、字型與色彩解析、向前向後相容規則）

### Modified Capabilities

（無——目前 openspec/specs/ 為空，無既有 capability）

## Impact

- Affected specs: `figma-export-capture`（新增）、`figma-import-reconstruction`（新增）
- Affected code:
  - Modified:
    - `design-system-to-storybook/assets/figma-export-addon/src/domExport.ts`
    - `design-system-to-storybook/assets/figma-export-addon/src/types.ts`
    - `design-system-to-storybook/assets/figma-export-addon/src/tokenExport.ts`
    - `design-system-to-storybook/assets/figma-export-addon/src/FigmaCodeExporter.tsx`
    - `design-system-to-storybook/assets/figma-export-addon/src/pluginCode.ts`
    - `design-system-to-storybook/assets/figma-export-addon/src/index.ts`
    - `design-system-to-storybook/assets/figma-export-addon/package.json`
    - `design-system-to-storybook/assets/figma-export-addon/README.md`
    - `design-system-to-storybook/assets/figma-export-addon/dist/`（重建）
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/code.ts`
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/code.js`（重建）
    - `design-system-to-storybook/assets/figma-plugin-code-to-design/README.md`
    - `design-system-to-storybook/storybook-template/vendor/figma-export/`（自 assets 同步）
    - `design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/`（自 assets 同步）
    - `design-system-to-storybook/storybook-template/figma/storybook-code-to-design/`（同步重建後的 plugin）
    - `design-system-to-storybook/scripts/validate_figma_export_payload.mjs`
    - `design-system-to-storybook/references/figma-export-readiness.md`
  - New:
    - `design-system-to-storybook/assets/figma-export-addon/test/export-fixture.html`
  - Removed: （無）
- 相依性：不新增 runtime 相依；建置使用各套件既有的 tsup / tsc。payload 維持 version 2，新欄位皆 optional——舊 plugin 讀新 payload 會忽略新欄位（優雅降級），新 plugin 讀舊 payload 行為不變。
