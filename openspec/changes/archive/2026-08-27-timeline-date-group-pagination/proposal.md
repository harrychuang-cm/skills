## Summary

Component Timeline 的分頁改為以「完整日期群組」打包：日期永不跨頁，每個日期標頭顯示的新增數量永遠等於該日真實總量。

## Motivation

目前分頁是對扁平元件清單每 30 個切一刀，單一日期的元件會被頁界切開；而且日期標頭的「{count} new」只計算本頁內該日期的元件——例如 8/24 實際新增 30 個元件時，第 1 頁顯示「7 new」、第 2 頁顯示「23 new」，真實的 30 從頭到尾沒有出現在任何地方，使用者無法確認每個日期實際新增了多少元件。

## Proposed Solution

頁面建構改為貪婪式群組打包，並將每頁元件預算由 30 提高到 36：由最新日期起，依序把「整個日期群組」放入當前頁；若加入下一個群組會使本頁元件數超過 36，就開新頁再放。單一日期本身超過 36 個元件時自成一頁、不拆群組。日期群組因此永不跨頁，標頭 count 自然等於該日全量；同時掛載的 story iframe 數量上限由「固定 30」變為「max(36, 最大單日群組數)」，仍受控。分頁按鈕與其餘 UI 行為不變。

## Non-Goals (optional)

- 不做日期範圍頁碼標籤（頁碼按鈕仍是數字；那是另一個可疊加的優化，需要時另開變更）。
- 不取消分頁改單頁滾動（IntersectionObserver 控制 iframe 掛載的方案改動較大、DOM 隨元件數成長，已否決）。
- 不動 build/check 腳本與 componentTimeline.ts 資料形狀。
- 不在本變更同步 ds-lab 等既有安裝專案（照慣例由各專案的更新流程或另開變更處理）。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `component-timeline-tool`: Timeline page rendering requirement 的分頁語意由「每頁固定 30 個元件」改為「以完整日期群組打包（每頁預算 36）、日期不跨頁、單日超過 36 自成一頁、count 顯示該日全量」。

## Impact

- Affected specs: `component-timeline-tool`（MODIFIED: Timeline page rendering）
- Affected code:
  - Modified:
    - storybook-tools-install/template/src/storybook/component-timeline/ComponentTimeline.tsx
    - storybook-tools-install/template/TEMPLATE_MANIFEST.json（version 0.10.0 → 0.10.1）
    - storybook-tools-install/README.md（第 3 節分頁行為描述）
  - New:（無）
  - Removed:（無）
