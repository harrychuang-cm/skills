# 驗證筆記：任務 7.1 實際演練

## (a) discover 演練（2026-11-27）

方式：以只讀過 `uiux-director/SKILL.md` 與其 references／assets、沒有本次對話脈絡的全新 agent，在 scratchpad 的空 git repo 觸發 `/uiux-director 我想做一個給退休族看存股的 App`。第一輪回覆讓它停下等待；之後提供預先寫好的 PM 回答清單，清單以外的問題要求它停下來問。

| 對照的規格情境 | 觀察結果 | 結果 |
| --- | --- | --- |
| Mode resolution：第一句說出模式 | 第一句為「這次用 `discover`（探索）模式」 | 通過 |
| Document language selection：先問語言、繁中為第一個推薦預設 | 第一輪只問語言，選項順序為繁體中文（建議預設）、English、其他；記錄 `Document Language: zh-Hant (繁體中文)` | 通過 |
| Heading form：英文正規標題加全形括號註記 | 例如 `## Direction Summary（方向摘要）` | 通過 |
| Discovery interview：一次一題 | 第 2～10 則訊息各只問一題，每題附建議答案；已被回答的題目會說明採用哪個答案後跳過 | 通過 |
| 摘要確認後才寫入 | 摘要經「確認」後才寫 `PRODUCT_BRIEF.md`；研究經確認後才補研究摘要 | 通過 |
| Research：來源連結、不捏造、打不開的不引用 | 使用 WebSearch／WebFetch，所有參考產品與慣例附 URL；403 的來源未引用並列入研究限制 | 通過 |
| Design direction comparison：2～3 個候選、同一畫面、每個至少兩個參考產品 | 三個候選，皆以「持股總覽」示範並附參考產品；anti-ai-style 掃描 0 個候選 | 通過 |
| Density profile：由 TA 推導、有數值 | 選定方向 C：內文 20px、全產品最小字 18px；首屏可見項目以 headless Chrome 實測 | 通過 |
| Material Design 3 token method：不沿用 baseline | 主色 `#155A8F`，由受眾與台股慣例推導；`#6750A4` 只出現在 Not Doing；palette 來源記錄為 `@material/material-color-utilities`（版本已記錄） | 通過 |
| Durable documents：四份文件、未確認標示 | 四份文件與比較頁皆產生；推論內容標 `unconfirmed` 並列入 Open Questions | 通過 |
| Agent instruction pointer：兩個檔都不存在時先問 | 停在「要建立 `AGENTS.md`、`CLAUDE.md` 還是兩個都建？」，未寫入任何指引檔 | 通過 |
| 範圍 | 所有產出都在演練 repo 的 `product-design/` 內，cm-skills 未被修改 | 通過 |

### 演練發現並已回頭修正的問題

| 問題 | 修正 | 對應任務 |
| --- | --- | --- |
| 訪談停止條件在第 8 題就成立，但品牌證據、參考產品、不做什麼是後續步驟的輸入 | `references/discovery-interview.md` 停止條件加入第 5 條：第 9～12 題各問一次，可跳過 | 3.1 |
| `EXPERIENCE_MAP.template.md` 的 Screens And States 表缺 Confirmation 欄 | 補上 Confirmation 欄 | 2.1 |
| discover 第 5 步（體驗地圖）沒有 PM 確認 | SKILL.md Discover 第 5 步改為先給摘要與核心任務計算路徑，確認後才寫入 | 3.1 |
| 比較頁範例截斷長名稱，與大字方向衝突 | 模板說明加註：大字或寬鬆方向改為換行 | 3.4 |
| `price-rise` 與 `error` 色值可能幾乎相同 | `references/md3-token-method.md` 加註：兩者保留各自角色，且不可只靠顏色區分 | 3.2 |

演練 agent 另回報 `@material/material-color-utilities` 0.4.0 在 Node 22 無法以 ESM 載入、改用 0.3.0；此為單次觀察，未另行驗證，reference 已要求記錄實際使用的版本。

## (b) review 演練

待使用者提供 Vibe Coding 做到一半的專案路徑。
