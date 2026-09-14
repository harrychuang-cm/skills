## Summary

將 executive-presentation 調整為 UIUX 產品總監視角的白話簡報助手，主動補齊可追溯的產品案例，協助設計師分享新功能的價值與驗證方向。

## Motivation

現有 skill 使用商業顧問術語與偏重 ROI 的模板，增加 UIUX 設計師的閱讀負擔。使用者需要以產品價值為主軸，並在生成時檢查主張是否有案例支持、主動查找缺少的文件，以及詢問可引用的截圖或連結。

## Proposed Solution

- 用簡單標題與短句表達建議、使用者問題、產品價值及下一步；保留結論先行、來源可追溯與可執行行動。
- 預設四頁依序說明改善建議與價值、問題與優先原因、方案與參考案例、執行與驗證。
- 先檢查已有資料，針對關鍵證據缺口查詢可用文件或公開來源；優先整理一至兩個相關案例，不做無止境研究。
- 案例附可讀來源、可借鏡做法、適用限制與畫面素材狀態；區分做法參考、成效證據與未驗證構想。
- 素材不足時詢問使用者可引用的截圖或連結，同時推進不依賴回答的草稿。搜尋不可用、文件無權限或使用者限制搜尋時，標示缺口並調整結論強度。
- 同步 Codex 顯示資訊與 README 中此 skill 的介紹與範例。

## Non-Goals

本次不生成實際簡報、不安裝搜尋連接器、不登入公司服務、不更新各 agent 的使用者安裝副本、不提交或推送 Git，也不修改其他 skill 或既有未提交內容。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `executive-presentation-skill`: 改善產品導向白話敘事，加入有範圍的主動查證、可分享案例與素材詢問流程。

## Impact

- Affected specs: executive-presentation-skill。
- Affected code:
  - Modified: `executive-presentation/SKILL.md`
  - Modified: `executive-presentation/agents/openai.yaml`
  - Modified: `README.md`（僅 executive-presentation 小節）
- 不增加執行時相依；查詢及產檔能力沿用目前環境可用工具。
