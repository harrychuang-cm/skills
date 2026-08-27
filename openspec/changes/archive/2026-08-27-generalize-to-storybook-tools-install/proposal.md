## Why

component-coverage-install 目前只安裝單一工具（Component Coverage Analyzer），但 ds-lab 已驗證了第二個值得帶到所有 Storybook 專案的通用工具頁（Component Timeline：以 git 歷史呈現元件何時誕生、串接 catalog 與 live story 預覽）。skill 的名稱、SKILL.md 敘述與 template 結構都綁死在 coverage 這個單一工具上，繼續往裡面塞新工具會讓名稱與內容物脫節，因此需要一次到位：改名為多工具安裝器，並把 template 依工具模組化，讓未來的通用工具頁能持續加入同一個安裝器。

## What Changes

- **BREAKING**：skill 目錄與名稱由 component-coverage-install 改為 storybook-tools-install。SKILL.md 的 name、description 與觸發條件改寫為「安裝一組 Storybook Tools 頁面」的多工具安裝器；對外的安裝與更新入口只剩新名稱。
- template 依工具模組化：TEMPLATE_MANIFEST.json 從單一扁平檔案清單改為「shared core（componentCatalog 契約、catalog check、story 掛載慣例）＋ per-tool 模組（component-coverage、component-timeline，各自帶 verbatim/adaptable/generated 檔案清單、installTargets 與驗證腳本）」，manifest 版本升級，更新流程須能讀懂既有安裝專案裡的舊版單工具 manifest 並升級之。
- 新增 component-timeline 工具模組，內容由 ds-lab 現有實作通用化而來，去除三處 ds-lab 專屬耦合：
  - build 腳本不再寫死元件都住在 src/components 之下，改由 componentCatalog 每筆 entry 的 componentPath 推導該路徑在 git 的首次 commit（日期、hash、subject）。
  - 頁面 UI 移除對 ds-lab figma-extraction pipeline stats 模組的 import，改為 self-contained；專案想加自己的統計面板時，透過 adaptable 的擴充插槽注入（比照 coverage 工具的 compositionPreviewRegistry 模式）。
  - 文案不再依賴 ds-lab 的共用 copy 模組，字串內建於工具檔案內。
- 隨附 timeline 的 drift check 腳本：generated 的 timeline 資料檔與 git 歷史不一致、或 timeline id 對不到 catalog entry 時，check 失敗並指示重新產生。
- 文件與引用同步改名：README.md、docs/skills-usage.md 的 skill 條目，openspec/specs/component-coverage-review/spec.md 內的檔案路徑引用（機械性替換，無需求變更），以及 componentCatalog.template.ts 註解中提到的產生者名稱。
- 配套 skills（component-coverage-analyze、component-coverage-implement）名稱與內容不變，manifest 中歸屬到 component-coverage 工具模組之下。

## Capabilities

### New Capabilities

- `storybook-tools-installer`: 多工具 Storybook Tools 安裝器的行為契約 — skill 命名與觸發、shared core 加 per-tool 模組的 template 結構、manifest 版本與升級規則、安裝與更新流程的驗證要求。
- `component-timeline-tool`: 通用 Component Timeline 工具頁的行為契約 — git 推導的 timeline 資料檔、catalog join 與 live story 預覽、drift check、專案擴充插槽。

### Modified Capabilities

（無 — component-coverage-review 的行為不變，該 spec 只做檔案路徑引用的機械性更新）

## Impact

- Affected specs：新增 storybook-tools-installer 與 component-timeline-tool 兩個 capability spec；openspec/specs/component-coverage-review/spec.md 僅路徑引用更新。
- Affected code：
  - Renamed（整棵樹以 git mv 方式搬移，其下所有檔案路徑前綴由 component-coverage-install/ 變為 storybook-tools-install/）：
    - component-coverage-install/ → storybook-tools-install/
  - Modified（以搬移後的新路徑表示）：
    - storybook-tools-install/SKILL.md
    - storybook-tools-install/template/TEMPLATE_MANIFEST.json
    - storybook-tools-install/template/src/storybook/componentCatalog.template.ts
    - README.md
    - docs/skills-usage.md
    - openspec/specs/component-coverage-review/spec.md
  - New：
    - storybook-tools-install/template/src/storybook/component-timeline/ComponentTimeline.tsx
    - storybook-tools-install/template/src/storybook/component-timeline/component-timeline.css
    - storybook-tools-install/template/src/storybook/component-timeline/timelineExtrasRegistry.tsx
    - storybook-tools-install/template/src/storybook/component-timeline/index.ts
    - storybook-tools-install/template/src/stories/tools/ComponentTimeline.stories.tsx
    - storybook-tools-install/template/scripts/component-timeline/build-component-timeline.mjs
    - storybook-tools-install/template/scripts/check-component-timeline.mjs
  - Removed：（無）
- 外部影響：ds-lab 等既有安裝專案需在後續各自的變更中依 rsync 慣例同步新 template；本變更不動任何目標專案。
