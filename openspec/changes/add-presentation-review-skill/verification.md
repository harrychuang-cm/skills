# 修改與驗證記錄

本次新增 `presentation-review` skill、Codex 顯示資訊、README 對應小節與本 change 的 Spectra 文件。工作樹修改前為乾淨狀態；本次未提交或推送 Git。

## 情境審閱

下表是逐項閱讀 SKILL.md 與 rules.md 的結果，確認規格情境都有對應條文：

| 規格情境 | 對應條文 | 審閱結果 |
| --- | --- | --- |
| 主題式標題「新手引導優化策略」 | rules.md T1 常見失敗、S1 常見失敗、E1 零證據；examples.md 示例 1 | 判為必改，改寫用【待補】不填數字 |
| 合規頁通過 | T1／S1／E1 通過條件、E4 強度標示 | 逐項通過並列證據強度 |
| 超過 3 個證據 | E1 處理方式 | 建議保留最直接的 1–3 個，其餘移附錄或拆頁 |
| 證據缺成果與來源（Duolingo 提醒） | E2 四要素、E4 做法參考；示例 2 | 標做法參考、列缺項、不推論成效 |
| 證據不支持結論（定價頁 vs 縮短引導） | E3、T2；示例 3 | 判 E3 缺少，該頁仍無證據 |
| 改寫不捏造 | SKILL.md 改寫原則、E5 | 缺的證據一律【待補：需要什麼】 |
| 使用者要整份改寫 | SKILL.md 三種模式、模板整份改寫版 | 每頁輸出改寫行並附待補清單 |
| 使用者新增規則 | SKILL.md 規則迭代步驟 1–3 | 新 ID、標使用者規則、升版本、複述確認 |
| 使用者停用衍生規則 | 規則迭代步驟 1、rules.md 已停用規則區 | 標日期原因、ID 保留 |
| 無法讀取 Keynote 檔 | SKILL.md 輸入段 | 明說無法讀取並請提供文字版 |
| 三個 agent 安裝 | 共用安裝器自動探索 | dry-run 與實際安裝皆解析三個目的地 |

## 自動檢查

- skill-creator quick_validate：通過（PyYAML 安裝於 scratchpad 臨時 venv，未新增 skill 或全域依賴）。
- Codex metadata：YAML 解析通過；short_description 35 字元，落在 25–64 範圍；default_prompt 含 `$presentation-review`。
- 共用安裝器：`--skill presentation-review --agent all --scope user` dry-run 通過；三個目的地原先皆不存在，實際安裝未使用 `--force`，安裝後 `diff -rq` 三份副本皆與來源一致。
- Spectra validate：通過。
- Spectra analyze：0 Critical、0 Warning（初版有一項「Structured review report 需求無對應任務」Warning，已在 tasks 1.3 補上對應後消除）；11 項 Suggestion 均為建議新增 Example 區塊，既有 WHEN/THEN 已描述可觀察情境，未為消除提示重複內容。
- `git diff --check`（README.md）與新檔案行尾空白檢查：通過。
- SKILL.md 內部相對連結（rules.md、review-report-template.md）皆存在。
- README：以修改前副本比對，本次只改簡介一句、新增 presentation-review 小節與目錄樹五行，其餘段落未動。

## 實際行為測試（Claude Code）

以一個獨立 subagent 讀取已安裝的 `~/.claude/skills/presentation-review/SKILL.md`，審查一份三頁測試簡報（口說練習回饋改語音示範；內容為構想，不是 examples.md 裡的示例）。結果：

- 有讀取 rules.md 1.0.0 與報告模板，輸出依模板結構完整：總評、標題故事線、逐頁表、證據清單、必改清單、待補證據清單、限制。
- 判定符合預期：第 1 頁主題式標題判 T1 缺少；第 2 頁三個證據通過 E1、ELSA 標為做法參考；第 3 頁定價頁證據判 E3 無關、整頁有效證據為 0 判必改；D1 指出故事線缺開頭。
- 改寫建議沒有出現原稿以外的數字、產品或來源；缺口全用【待補】。
- subagent 回報 12 處條文讓判定不確定，已在同日以 rules.md 1.0.1 澄清（見下）。未在 Codex、Cursor 實跑。

## 依實測回饋的規則迭代（1.0.0 → 1.0.1）

只改 rules.md 條文與版本紀錄、SKILL.md 兩句、報告模板三處；規則 ID 未變：

- 新增「整體判定門檻」與「必改清單排序」定義。
- T1：決策條件式標題算通過；標題缺結論時 E1 仍計數並判需修改、E3 標無法判定。
- S2：只在 S1 通過時才判，避免與 S1 重複報。
- E1：多產品同一主張且皆無成果合算一項；被 E3 判無關的證據不計入。
- E3：分直接支持／部分相關／無關三級，部分相關為建議、無關為必改。
- E4：強度與「證明什麼」分開；自家數據標「已驗證（自家數據）」；未量化的他人回報補齊前算做法參考。
- E5：只在有捏造或誇大跡象時觸發，單純缺來源歸 E2。
- SKILL.md：判定拿不準時讀 examples.md 校準、以 rules.md 為準；有內文主張的開場頁一律照審。
- 模板：E2／E3／E4 拆成三列；整體判定與必改排序註明依 rules.md。

迭代後重新執行 quick_validate（通過）、行尾空白與內部連結檢查（通過），並以 `--force` 重新安裝三個使用者目錄；安裝前 diff 只有本次修改的三個檔案，安裝後三份副本皆與來源一致。

## 使用者補充規則（1.0.1 → 1.0.2）

使用者同日補充：「標題一個結論，而這個結論會有觀點＋行動，然後用理由來做補充。」依 SKILL.md 規則迭代流程處理：

- rules.md：T1 改名為「標題是一個結論：觀點＋行動」，新增結構說明（觀點＝判斷、行動＝所以要做什麼、理由放副標）、檢查問題改為「觀點是什麼／要我們做什麼」、常見失敗新增「把理由塞進標題」；S1 改名為「副標用理由補充結論」並說明理由與證據的分工；版本 1.0.2，規則 ID 未變。
- 用語對齊：SKILL.md、報告模板、examples.md、openai.yaml、README、本 change 的 proposal／design／spec 一律改用「結論（觀點＋行動）」「理由」；全域搜尋已無舊用語。
- 重新執行 quick_validate（通過）、YAML 解析（short_description 37 字元）、行尾空白與 `git diff --check`（通過）；以 `--force` 重新安裝三個使用者目錄，安裝後三份副本與來源一致。

## 驗證邊界

- 未在 Codex、Cursor 實跑；未測試 pptx／pdf／圖片輸入的擷取路徑；未測試「整份改寫」與「依規則起草」模式。
- 1.0.1 與 1.0.2 的修訂尚未再跑一次完整實測；下次審查時如仍有判定不一致，依 SKILL.md 規則迭代流程續修 rules.md。
- 未執行 Git commit 或 push；change 未歸檔，保留給使用者試用後決定。
