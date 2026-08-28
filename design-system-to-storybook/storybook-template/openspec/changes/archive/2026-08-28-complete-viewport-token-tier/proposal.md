## Why

cm-skills 根層的 add-flow-viewport-contract change 讓 storybook-product-prototype 的 UI Flow 支援 phone/tablet/desktop viewport 宣告，其 Prototype Inspector 依 form-factor tier 解析 `--sbt-sys-size-viewport-*` token——但本模板的 token 層只完成一半：`--sbt-sys-size-viewport-medium-width`（768px）與 `wide-width`（1280px）已宣告卻缺對應 height、無任何消費者，治理文案也仍把 viewport token 描述為單一 mobile-first shell。同時 `.storybook/prototype-inspector/` 的 runtime 是 skill asset 的 byte-identical 副本，root change 修改 asset 後本側必須同步，否則兩邊 Inspector 行為分岔（root 側冒煙測試以 byte-diff 守門）。

## What Changes

- tokens/tokens-ref.css 新增 `--sbt-ref-size-800: 800px` 與 `--sbt-ref-size-1024: 1024px`（加入既有 375/768/812/1280 行列）。
- tokens/tokens-sys.css 補完 viewport tier：`--sbt-sys-size-viewport-medium-height: var(--sbt-ref-size-1024)`、`--sbt-sys-size-viewport-wide-height: var(--sbt-ref-size-800)`，形成 compact＝phone 375×812、medium＝tablet 768×1024、wide＝desktop 1280×800 三階完整對。
- src/stories/_shared/copy.ts 的 size 治理文案改寫：viewport token 描述為三個 form-factor 參考 shell（compact/medium/wide），由 prototype 的 flow.viewport 逐一消費；保留「不是響應式斷點 token」規則；Viewport And Regions 表新增 medium/wide 的 width 與 height 列。
- `.storybook/prototype-inspector/preview.js` 與 `prototype-inspector.css` 與 root change 更新後的 skill asset 副本逐 byte 同步（解析鏈、scope 修正、medium/wide 橋接、active-viewport 變數、徽章）。

## Non-Goals

- 不重新指向 tokens/tokens-comp.css 中 alias `--sbt-sys-size-viewport-compact-width` 的元件 token（約 18 處；寬元件的桌面適配是獨立的後續 change）。
- 不改動 compact tier 的值或語意（compact 維持 phone 375×812）。
- 不在本側修改 inspector runtime 的行為——行為變更由 root change 在 skill asset 定義，本側只做逐 byte 同步。
- 不新增響應式斷點 token 系統。

## Capabilities

### New Capabilities

- `viewport-token-tier`: 三階 viewport token（compact/medium/wide 各含 width 與 height）的完整定義、ref token 支撐、治理文案的 form-factor 語意，以及 prototype-inspector runtime 副本與 skill asset 的逐 byte 同步契約。

### Modified Capabilities

（無——本子樹 openspec 尚無既有 spec）

## Impact

- Affected specs: viewport-token-tier（新）
- Affected code:
  - New: （無）
  - Modified:
    - tokens/tokens-ref.css
    - tokens/tokens-sys.css
    - src/stories/_shared/copy.ts
    - .storybook/prototype-inspector/preview.js
    - .storybook/prototype-inspector/prototype-inspector.css
  - Removed: （無）
- 相依變更：cm-skills 根層 openspec 的 add-flow-viewport-contract change 是本 change 的上游——inspector 副本的新內容由該 change 產出，兩者必須同批實作與 commit；root 側 test_scaffold_validate.py 以 byte-diff 斷言兩份副本一致。
