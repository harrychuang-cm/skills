## 1. 資料權威與文件產生

- [x] 1.1 建立 Data Authority registry 共通 reference 與 Data Spec 模板，分開 fake values／UI model／confirmed transport，涵蓋 JSON Schema sections in DATA_SPEC；以 React／Vue 生成文件與原始案例檢查兩維度不混淆。
- [x] 1.2 實作 Decision Review 與 Remote Config intent handoff 文件契約，補 review 證據、建議／作廢分類與關聯同步清單；以 reason 埋點提案、文字 Remote Config 兩例確認不產生正式參數或 key。
- [x] 1.3 在 validator 實作 Data Authority registry 的 schema／source／owner／group／reference 檢查與 handoff-ready review 證據門檻；以 Fake-only pass、無來源 confirmed fail、legacy draft warning／handoff fail 與 malformed／duplicate 正反例驗證。
- [x] 1.4 實作 Authority display and consumption 的 Inspector 顯示端，從 raw Data Spec 顯示 Fake、schema scope、source、owner、status，缺失或損壞保持 unverified；驗證三種 registry render 與兩份 preview.js byte-identical。

## 2. 下游消費與正式接線

- [x] 2.1 更新 frontend 的 Authority display and consumption，Data Adapter Seams 記錄 UI model、authority/source、injection site、integration owner/status，Fake-only 可完成 assembly；以文件對照檢查不再由 UI fixture 建正式 DTO。
- [x] 2.2 更新 native 的 Authority display and consumption 與 Return transitions respect their kind，保留 fixture provenance 而移除 backend golden reference、缺值 push／back 預定；以 confirmed dismiss 與未知 forward 兩例審查受影響邊界。
- [x] 2.3 修改 Third-stage skill scope and boundary 與 Contract test gate，使正式 DTO 按來源契約驗證並映射至 UI model；以 data.items／nextCursor 轉 rows 的案例確認無 raw fixture shape equality 要求。

## 3. 轉場契約與匯出

- [x] 3.1 完成 Navigation Motion 與 Navigation metadata fields on the flow contract、Presentation coverage check for app targets：模板／文件加入 motion 和 motionRef，驗證器要求 visible route 導頁／返回／custom reference 明確；以 none／platform-default／custom 及缺漏正反例驗證。
- [x] 3.2 更新 Flow JSON export 與 skeleton 註解保留 motion／motionRef，未定 presentation 維持 unspecified，仍排除 layout-only fields；用既有 export_flow 測試驗證 JSON／Swift／Kotlin 輸出。

## 4. 快照與同步

- [x] 4.1 完成 Artifact Integrity、Handoff manifest generation 與 Manifest drift verification：新增 v2 artifacts hash／digest 與集合差異檢查；驗證 carrier-only 修改、增刪 fixture、docs 修改、無 drift、legacy manifest 六種行為。
- [x] 4.2 更新 Manifest consumption record，web／native 在 ingestion 及完成前核對兩份 digest 與來源完整性，回寫列出受影響文件／載體／測試；用新 manifest 與舊 handoff 審查確認不把 hash pass 宣稱為語意正確。

## 5. Repo 技能交付

- [x] 5.1 實作 Project Skill Delivery 的 opt-in record-usage 旗標、required／support 依賴 closure 與寫入前檢查；以 Node 測試驗證 native closure、缺來源／cycle／user scope 失敗零寫入及 dry-run 零寫入。
- [x] 5.2 實作 Skill usage provenance 的來源／內容 hash、累積紀錄、CLAUDE.md／AGENTS.md 受管區塊，更新 skill 與使用說明；以 Node 測試驗證既有 bytes、冪等、dirty source、多次選取及隔離 repo clone 可攜性。

## 6. 整合驗證

- [x] 6.1 完成 React／Vue scaffold、authority、review、motion、export、manifest 與 Inspector 整合回歸，執行 test_scaffold_validate.py 與 test_install_agent_skills.mjs，修正任何受本 change 影響的失敗。
- [x] 6.2 用 skill-creator 驗證四個修改 skill 與獨立 agent 行為案例，檢查新舊規則衝突、文件引用與變更範圍，執行 spectra analyze／validate，確認全部任務驗收後記錄結果。
