## Why

design-system-extractor 目前產出的萃取報告（design-system/*.md）一律是英文，非英語團隊閱讀與審閱成本高。skill 需要在第一次萃取時讓使用者選擇報告語言，並在後續 session 沿用，同時不能破壞三支 audit scripts 依賴英文章節標題、表頭與決策關鍵字的解析行為。

## What Changes

- 在 SKILL.md 的工作流程中新增「Report Language 解析」步驟：第一次萃取（design-system/SESSION_STATE.md 無 Report Language 紀錄）時詢問使用者報告語言，預設選項為使用者當下的對話語言，另提供 English、日本語與自訂語言選項。
- 語言選擇記入 SESSION_STATE.md 的 Report Language 欄位；後續 session、Component Expansion Pass、Late-Arriving Authoritative Source Pass、Collaboration Review 皆沿用不重問，使用者可隨時明確要求切換。
- 新增「雙語標題註記」規則：audit scripts 與文件產生器解析的章節標題、表頭維持英文正典形式，後方以全形括號附上報告語言註記（例如「## Source Inventory（來源清單）」）；狀態值、決策關鍵字、token 名稱、檔名、CSS 註記標記維持純英文，敘述性內文使用選定語言。報告語言為英文時不加註記。
- 更新 assets/design-system-template/design-system/SESSION_STATE.md 模板，加入 Report Language 欄位。
- generate_docs_html.mjs 新增 locale 參數：報告語言可對應到 zh-Hant、en、ja 之一時，以其作為 HTML docs 預設 UI locale；無對應時退回 en。SKILL.md 的 HTML Documentation 步驟同步帶入該參數。
- 更新 references/html-documentation.md，記載 locale 參數與報告語言連動規則。

## Capabilities

### New Capabilities

- `extractor-report-language`: design-system-extractor 萃取報告的語言選擇、持久化、雙語標題註記與 HTML docs 預設 UI locale 連動。

### Modified Capabilities

(none)

## Impact

- Affected specs: `extractor-report-language`（新增）
- Affected code:
  - New: (none)
  - Modified: `design-system-extractor/SKILL.md`, `design-system-extractor/references/html-documentation.md`, `design-system-extractor/assets/design-system-template/design-system/SESSION_STATE.md`, `design-system-extractor/scripts/generate_docs_html.mjs`
  - Removed: (none)
- 不修改 audit scripts：`design-system-extractor/scripts/audit_sources.mjs`、`audit_tokens.mjs`、`audit_components.mjs` 以子字串比對解析英文標題與表頭，雙語註記為附加形式，不影響解析。
