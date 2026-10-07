## 1. 前置條件

- [ ] 1.1 依 design 決策「先歸檔 generalize-storybook-template，再套用本 change」確認主規格 `openspec/specs/prototype-ui-flow/spec.md` 存在，且其中的 Static Flow Export 需求仍含「Static flow matches UI Flow visual conventions」情境（本 change 的 MODIFIED delta 以它為基準）。不存在時，向使用者確認後執行 `/spectra-archive generalize-storybook-template`；使用者拒絕時停止，在本項下方記錄日期與原因，本 change 維持 park。驗證：`ls openspec/specs/prototype-ui-flow/spec.md` 成功，且 `grep -n "Static flow matches UI Flow visual conventions" openspec/specs/prototype-ui-flow/spec.md` 有結果。

## 2. 驗證程式與文件已符合新規格

- [ ] 2.1 [after: 1.1] 確認 Static Flow Export 的幾何一致需求在 template 文件中已成立：`src/pages/prototypes/README.md` 與 example-prototype 的 `docs/FLOW_SPEC.md`、`docs/ACCEPTANCE.md`、`docs/IMPLEMENTATION_GUIDE.md` 都只要求位置與框尺寸一致，不再要求畫布背景、框外觀、連線與標籤樣式相同。驗證：在 template 根目錄執行 `grep -rn "dotted canvas" src/pages/prototypes/README.md src/pages/prototypes/example-prototype/docs/` 沒有結果，並以內容審閱確認四份文件各有一處寫到 geometry（positions 與 frame sizes）。若有遺漏，回報上游 cm-skills 修正，不在 template 端自行改寫。
- [ ] 2.2 [after: 1.1] 依 design 決策「同步規則以資料夾為單位」確認「Inspector runtime copies stay in sync with the skill asset」需求目前成立：`.storybook/prototype-inspector/` 的六個檔案、`src/pages/prototypes/prototypeFlowLayout.ts` 與 `scripts/prototype-review/fingerprint.mjs` 都與 skill asset 副本逐位元組相同，且兩邊資料夾的檔案集合相同。驗證：在 cm-skills 根目錄執行 `python3 storybook-product-prototype/scripts/test_scaffold_validate.py`，以零碼結束，輸出包含以「inspector mirror: 6 runtime files plus the flow layout helper and fingerprint are byte-identical」開頭的那一行。

## 3. 規格驗證

- [ ] 3.1 [after: 2.1, 2.2] 確認兩份 delta spec 可以歸檔：`prototype-ui-flow` 的 MODIFIED Static Flow Export 需求保留原本四個情境並以「Static flow keeps UI Flow geometry」取代視覺一致情境；`viewport-token-tier` 的 MODIFIED 同步需求含三個情境。驗證：在 template 根目錄執行 `spectra validate align-template-flow-parity` 通過，且 `spectra archive align-template-flow-parity --preview --json` 沒有回報阻擋歸檔的錯誤。
