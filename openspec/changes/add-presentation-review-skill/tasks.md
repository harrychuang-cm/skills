## 1. 規則集與審查流程

- [x] 1.1 建立 presentation-review/references/rules.md：Rule-driven slide-by-slide review、Evidence quality assessment、Versioned iterable rule set 所需的規則 ID（T／S／E／D 四組）、來源標記、通過條件、常見失敗、嚴重度定義與版本紀錄。
- [x] 1.2 建立 presentation-review/SKILL.md：輸入處理、逐頁審查步驟、證據四要素與強度判定、報告產出、改寫不捏造原則、規則迭代方式與交付前自檢；以規格中的主題式標題、合規頁、證據過多、證據缺成果來源、證據不支持結論、改寫佔位、整份改寫、新增規則、停用規則、無法讀檔情境逐項審閱。
- [x] 1.3 完成 Structured review report with severity and non-fabricated rewrites：建立 presentation-review/references/review-report-template.md 與 references/examples.md，定義報告結構（總評、標題故事線、逐頁表、必改清單、改寫建議、待補證據、未檢查項目）與前後對照示例，示例標明為構想且不含捏造數據。

## 2. 跨工具使用與驗證

- [x] 2.1 完成 Input handling and honest limits 的打包部分：新增 presentation-review/agents/openai.yaml，更新 README.md 的 skill 小節、呼叫範例、安裝命令與目錄樹；以 skill-creator quick_validate、YAML 解析與短說明長度檢查、共用安裝器 dry-run 驗證。
- [x] 2.2 執行 Spectra validate／analyze 與限定檔案的 git diff --check，將情境審閱結果、通過的自動檢查與未執行的實際生成驗收記錄在本 change 的 verification.md。
