## Context

ToastEnglish 的 `toastenglish-platform-parity-handoff`（2026-09-17，change `add-platform-parity-handoff-skill`）已通過回測：以 iOS 合併提交的 first-parent diff 產出九章 manifest，腳本從凍結版本列出檔案分類、字串 key、事件與 RemoteConfig key、素材 hash 與兩端 mapping 交叉比對。它的專案綁定點有：iOS 字串存取 `LocalizedString.<key>` 與 SwiftGen 產生檔路徑、LocalizationKit 的五個 `.lproj`、`string_mapping.json` 的 `ios_id`／`android_id`／`module`／`file` 欄位、Android `values*` 目錄與 module res 解析、RemoteConfigProvider 路徑、輸出目錄 `docs/features/<feature-id>/handoff/`、媒體目錄 `apps/ios/artifacts/android-handoff/`、SKILL.md 對 AI_START_HERE／CROSS_PLATFORM_WORKFLOW／AI_TASK_TEMPLATE 的相對連結，以及「一次 spectra-ingest」的決策回寫方式。

cm-skills 的慣例：頂層資料夾即 skill，`SKILL.md` frontmatter 的 `name` 必須等於資料夾名；`agents/openai.yaml` 供 Codex；README 每個 skill 一節；`scripts/install_agent_skills.mjs` 複製整個資料夾到三個 agent 的使用者或專案目錄；`scripts/skill-dependencies.json` 宣告 required／support 相依。

## Goals / Non-Goals

**Goals:**

- 一份不含專案路徑的通用 skill，透過 project profile 套到任何「先端已合入整合分支、次端要對齊」的雙平台專案。
- 腳本行為與 ToastEnglish 專案版一致：用範例 profile 對 ToastEnglish repos 執行，inventory 內容相同。
- 依 cm-skills 慣例打包，能用共用安裝器安裝到 Cursor、Codex、Claude Code。

**Non-Goals:**

- 不修改 ToastEnglish 專案版的行為或名稱；不把專案版改成安裝副本（使用者 2026-09-17 選擇 A：兩份並存）。
- 不修改共用安裝器、其他 skills 或既有規格；不 commit、push。
- 不自建視覺比對；不查詢翻譯後台；腳本不連網、不建置、不寫入 repo。

## Decisions

### 專案差異全部進 project profile，腳本與 SKILL.md 不含專案路徑

一個 JSON profile 描述先端／次端 repo、整合分支、輸出與媒體目錄、字串存取 regex、產生檔與資源目錄、語系清單與配對、mapping 欄位、RemoteConfig 與事件的搜尋 pattern、分類補充規則。腳本用 `--profile` 讀取，SKILL.md 只描述流程並要求先確認 profile。替代方案是每個專案複製一份改常數，會重演「兩份 cmoney-biz 漸漸分歧」的問題，排除。

### 未給 profile 時退回範例 profile 並提示

`assets/profile.example.json` 是 ToastEnglish 的實際值（已在該專案回測通過）。腳本未收到 `--profile` 時載入它並在 stderr 印「using bundled example profile」，讓 skill 開箱可跑、又不會把 ToastEnglish 的路徑誤當成通用預設。替代方案是強制 `--profile`，對第一次試用不友善。

### 與 ToastEnglish 專案版並存，互相註明

專案版 `toastenglish-platform-parity-handoff` 保留為綁定實例（已通過該專案 change 驗收）；通用版 SKILL.md 註明「以 ToastEnglish 專案版為原型」，專案版加一句「通用版在 cm-skills」。兩邊各自維護，通用版的腳本改動不自動回流。這是使用者的選擇；drift 風險寫進 Risks。

### 沿用 cm-skills 打包慣例

資料夾名 `platform-parity-handoff` = frontmatter `name`；`agents/openai.yaml` 提供 display_name／short_description／default_prompt；README 新增小節與安裝命令；`skill-dependencies.json` 把兩個視覺 skill 列為 support（安裝器 `--record-usage` 時會一併帶入，一般安裝不強制）。

## Implementation Contract

#### profile 結構（`profileVersion: 1`）

| 區段 | 欄位 | 用途 |
|---|---|---|
| `project` | 名稱、說明 | 只供標示 |
| `lead` | `platform`、`repo`、`integrationBranch` | export 的來源 repo 與凍結分支 |
| `follower` | `platform`、`repo` | audit 的目標 repo |
| `handoff` | `outputDir`（含 `{feature}`、`{date}` 佔位）、`mediaRoot`、`decisionSystem` | 交接包位置、媒體本機位置、決策回寫方式的文字說明 |
| `ios` | `stringAccessorPattern`、`generatedStringsFile`、`generatedKeyPattern`、`stringsDir`、`locales`、`mappingFile`、`mappingIdField`、`remoteConfigFiles`、`remoteConfigKeyPattern`、`eventNamePattern`、`logCallPattern` | list_string_keys、find_config_event_keys、cross_check 的來源 |
| `android` | `mappingFile`、`mappingIdField`、`localeDirs`、`overrideDirs`、`localePairs`、`moduleResCandidates`（含 `{module}` 佔位）、`defaultModule`、`resDir` | list_string_keys、cross_check、hash_assets 的目標 |
| `classify` | `extraRules`（`{class, pattern, rule}` 陣列，優先於內建規則） | classify_diff |

#### 腳本介面

與專案版相同的參數，加 `--profile <json>`；CLI 明確給的路徑優先於 profile，profile 優先於內建預設。未給 `--profile` 時載入 `assets/profile.example.json` 並在 stderr 提示。`--out` 不得落在任何輸入 repo 內。輸出 JSON 增加 `profile` 欄（路徑與 `project` 名稱）。

#### 驗收

1. `python3 scripts/<name>.py --help` 五支可用；以範例 profile 對 ToastEnglish 的 `apps/ios`（合併提交 `212356d0e`）與 `apps/android` 執行，五份 inventory 與 ToastEnglish 專案版 `docs/features/toeic-proficiency-test/handoff/2026-09-17-ios-to-android/inventory/` 的內容一致（忽略 `generatedAt`、`repo` 絕對路徑與 `profile` 欄）。
2. `grep` 通用版 SKILL.md、references、templates 不含 `AI_START_HERE`、`CROSS_PLATFORM_WORKFLOW`、`apps/ios`、`LocalizationKit`、`toeic` 等專案字串（範例 profile 與 project-profile.md 的範例值除外）。
3. frontmatter 可解析且 `name` 等於資料夾名；相對連結全部可解析。
4. `node scripts/install_agent_skills.mjs --agent all --scope user --skill platform-parity-handoff --dry-run` 列出三個目的地；實際安裝後三份與來源 hash 一致。
5. `spectra analyze` 無 Critical，`spectra validate` 通過。

#### 範圍邊界

In scope：`platform-parity-handoff/` 全部、`README.md` 的小節與目錄樹、`scripts/skill-dependencies.json`、本 change artifacts、使用者目錄的安裝副本（依使用者指示）。Out of scope：安裝器、其他 skills、ToastEnglish 專案版的行為（只加一句關係註記）、Git commit／push。

## Risks / Trade-offs

- [兩份來源漂移] → 兩邊 SKILL.md 互相註明；通用版改動時提醒回看專案版。
- [profile 欄位對新專案不足] → 腳本對缺欄位回內建預設並在輸出 `notes` 註明；project-profile.md 要求從原始碼確認字串存取方式，不假設。
- [範例 profile 被誤當通用預設] → stderr 提示與輸出 `profile.project` 欄標示。
- [安裝副本與來源不同步] → README 寫明只改 cm-skills 來源後用 `--force` 重裝。
