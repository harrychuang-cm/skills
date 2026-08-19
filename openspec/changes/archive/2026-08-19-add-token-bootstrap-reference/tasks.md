## 1. 建立 token-bootstrap 參考文件

- [x] 1.1 建立 `frontend-product-implementation/references/token-bootstrap.md` 並撰寫「Prototype token source discovery order」章節：定義 prototype 端 token 來源的優先順序（design-system-to-storybook 產出的 token 檔 → design-system-extractor 的 token 架構文件 → Figma Variables 匯出）、要求記錄所選來源與檔案層級證據、明文禁止捏造任何來源中不存在的 token 值。驗證：內容審查對照 spec 的「Multiple sources available」與「No source found」兩個 scenario，確認每一條都有對應指引。
- [x] 1.2 在同一文件撰寫「Minimal token subset derivation」章節：定義以 in-scope handoff 文件與 prototype 元件實際引用的 token 推導最小子集，保留 ref → sys → comp 分層——被移植的 comp/sys token 必須能解析到已移植的 ref token，無依賴的 ref token 排除並記為 deferred。驗證：內容審查確認章節包含與 spec「dependency closure」example 一致的依賴閉包推導範例。
- [x] 1.3 在同一文件撰寫「Target styling technology adaptation」章節：定義由 repo 證據選擇輸出格式的對應表（plain CSS / CSS-in-JS → CSS custom properties；Tailwind repo → Tailwind theme 擴充；SCSS repo → SCSS variables 或 map；React Native 等非 CSS runtime → typed theme object）、token 檔案依目標框架原生慣例放置、樣式技術混用或不明時停下詢問。驗證：內容審查確認四種對應與 ambiguous-stack 詢問關卡皆已明文寫出。
- [x] 1.4 在同一文件撰寫「Reverse-inventory fallback with approval」章節：定義無任何 token 來源時的逆向盤點程序——從 handoff UI spec 與 prototype 樣式檔盤點視覺值、正規化為 ref → sys 層、在建立任何 token 檔前先呈交候選 token 集取得使用者核准，且不得改以硬編碼視覺值繞過。驗證：內容審查確認程序含「呈交後等待核准」的明確停點。
- [x] 1.5 在同一文件撰寫「Bootstrap completion reporting」章節：定義完成回報必含項目——所選來源與證據、按層分組的移植 token 清單、輸出格式與檔案位置、deferred/排除的 token、prototype 與 production 命名對照，以及命名刻意分歧時更新 implementation notes 的要求。驗證：內容審查對照 spec「Completion report content」scenario 逐項核對。

## 2. 接線至 skill 主流程

- [x] 2.1 實作「Token bootstrap reference activation」：在 `frontend-product-implementation/SKILL.md` 的 Reference Loading 清單加入 token-bootstrap 參考及其載入時機（governance gate 判定無 token 系統且使用者同意建立時），並在 `frontend-product-implementation/references/implementation-workflow.md` 的 Design-System Governance Gate 章節與 Greenfield Mode 的無 design system 分支指向該參考。驗證：以 grep 確認兩個檔案都出現 token-bootstrap.md，且內容審查確認「已有 token 系統時不載入」的既有流程未被改動。

## 3. 同步與驗證

- [x] 3.1 執行 node scripts/install_agent_skills.mjs --agent claude --scope user --skill frontend-product-implementation --force，使 ~/.claude/skills/ 的已安裝副本包含新參考文件與更新後的 SKILL.md。驗證：對 repo 與 ~/.claude/skills/frontend-product-implementation 執行遞迴 diff，確認無差異。
- [x] 3.2 全文審查 token-bootstrap.md 與被修改檔案：確認遵循 skill 既有文風（英文、祈使句、與其他 references 相同的章節結構）、無殘留 placeholder、SKILL.md description 若有必要一併補述 token bootstrap 能力。驗證：人工內容審查加上 grep 確認文件無 TODO/TBD 字樣。
