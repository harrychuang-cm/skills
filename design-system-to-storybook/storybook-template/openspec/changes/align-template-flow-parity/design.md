## Context

cm-skills 根目錄的 change `rebuild-flow-canvas-camera` 已經把 UI Flow 改成相機畫布，並同步更新了 template 的 Inspector 副本（六個模組）、`src/pages/prototypes/README.md` 與 example-prototype 的三份文件，改寫為「Static Flow 與 UI Flow 幾何一致」。上游的 smoke test（storybook-product-prototype 的 test_scaffold_validate.py）會走訪兩個 Inspector 資料夾，並比對 flow layout helper 與 fingerprint，任何一邊多出或不同的檔案都會失敗。

template 自己 Spectra root 的規格尚未跟上：

- 「Static flow matches UI Flow visual conventions」情境位於 change `generalize-storybook-template` 的 delta spec `prototype-ui-flow`。該 change 的 20 個任務都已完成，但尚未歸檔，所以 `openspec/specs/prototype-ui-flow/spec.md` 還不存在。
- `openspec/specs/viewport-token-tier/spec.md` 的「Inspector runtime copies stay in sync with the skill asset」只列 `preview.js` 與 `prototype-inspector.css`。

## Goals / Non-Goals

**Goals:**

- 讓 template 的規格描述目前的行為：Static Flow 只要求幾何一致；Inspector 同步規則涵蓋整個資料夾、flow layout helper 與 fingerprint。
- 實作階段以既有的上游檢查與 grep 驗證程式和文件已符合新規格。

**Non-Goals:**

- 修改 template 的程式、Inspector 檔案或文件（上游 change 已完成）。
- 修改 `generalize-storybook-template` 的 delta spec 內容；它照原樣歸檔，再由本 change 的 MODIFIED delta 覆寫。
- 把 UI Flow 相機畫布的導覽規格（手勢、快捷鍵、相機記憶）複製到 template 的規格；那些規格屬於 cm-skills 根目錄的 `flow-canvas-navigation`。

## Decisions

### 先歸檔 generalize-storybook-template，再套用本 change

本 change 對 `prototype-ui-flow` 使用 MODIFIED delta，前提是主規格已存在。實作的第一個任務先確認 `openspec/specs/prototype-ui-flow/spec.md` 存在；不存在時，經使用者同意後執行 `/spectra-archive generalize-storybook-template`。替代方案「直接修改 generalize-storybook-template 的 delta spec」被否決：那會改寫另一個已完成 change 的紀錄，歸檔後無法看出規格何時、為何改變。替代方案「改用 ADDED 新增一條幾何需求」被否決：舊的視覺一致情境仍會留在主規格中，兩條需求互相矛盾。

### 同步規則以資料夾為單位

同步需求改寫成「資料夾內每個檔案都要相同，兩邊檔案集合也要相同」，現有六個檔案只列為目前內容。這與上游 smoke test 的行為一致（它走訪整個資料夾），之後新增 Inspector 模組不必再改規格。

## Implementation Contract

- 行為：本 change 不改變執行期行為。歸檔後，主規格 `prototype-ui-flow` 的 Static Flow Export 需求以幾何一致取代視覺一致情境，`viewport-token-tier` 的同步需求涵蓋 Inspector 資料夾全部檔案、flow layout helper 與 fingerprint。
- 驗收：
  - `spectra validate align-template-flow-parity` 通過。
  - 在 template 根目錄執行 grep，`src/pages/prototypes/README.md` 與 example-prototype 的 `docs/FLOW_SPEC.md`、`docs/ACCEPTANCE.md`、`docs/IMPLEMENTATION_GUIDE.md` 找不到「dotted canvas」，且四份文件都寫到幾何一致（positions 與框尺寸）。
  - 在 cm-skills 根目錄執行 storybook-product-prototype 的 smoke test，輸出包含 inspector mirror 檢查通過的那一行（六個 runtime 檔案、helper 與 fingerprint 相同），且以零碼結束。
- 範圍內：本 change 的兩份 delta spec、歸檔前置確認、上述驗證。
- 範圍外：Non-Goals 所列項目。

## Risks / Trade-offs

- [generalize-storybook-template 長期不歸檔] → 本 change 無法歸檔；第一個任務就處理這個前置條件，使用者拒絕時本 change 維持 park 狀態，並在 tasks.md 記下原因。
- [上游之後再新增 Inspector 模組] → 規格以資料夾為單位，不需要修改；smoke test 會抓到只在一邊的檔案。
