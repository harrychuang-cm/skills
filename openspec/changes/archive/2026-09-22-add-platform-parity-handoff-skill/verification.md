# add-platform-parity-handoff-skill 驗證紀錄

日期：2026-09-17 Asia/Taipei。cm-skills：main／f5ebe945，開工前 63 筆既有 dirty（含 README.md 與 Spectra skill 重生），本 change 只新增 `platform-parity-handoff/`、本 change artifacts，並在 README.md 加一節與目錄樹一項、在 `scripts/skill-dependencies.json` 加一組 support 條目；未 commit、未 push。

| 檢查 | 狀態 | 證據 |
|---|---|---|
| 範例 profile 重現 ToastEnglish inventory | 通過 | 在 cm-english-toast 根目錄以通用版五支腳本、未給 `--profile`（退回範例並印 notice）對 `apps/ios` 合併提交 `212356d0e` 與 `apps/android` 執行；五份 JSON 與專案版 `docs/features/toeic-proficiency-test/handoff/2026-09-17-ios-to-android/inventory/` 逐份比對（忽略 generatedAt、絕對路徑、profile 欄）全部 IDENTICAL |
| `--out` 防呆 | 通過 | `--out apps/ios/x` → exit 2、未建目錄 |
| 腳本唯讀 | 通過 | 只用 `git show`／`diff`／`ls-tree` 與讀檔；唯一寫入在 `_common.emit` 受 `guard_out` 保護；三個 ToastEnglish 子 repo `git status` 前後相同 |
| 不含專案字串 | 通過 | `grep` SKILL.md、references（project-profile.md 除外）、templates：AI_START_HERE、CROSS_PLATFORM_WORKFLOW、apps/ios、LocalizationKit、toeic、EnglishWidget、zh-rTW 皆 0 筆；ToastEnglish 只出現在 SKILL.md 原型說明與 project-profile.md 的範例值 |
| frontmatter | 通過 | ruby YAML 解析；`name` = `platform-parity-handoff` = 資料夾名；description 818 字元 |
| 相對連結 | 通過 | 26 條、0 缺失 |
| `agents/openai.yaml`、`scripts/skill-dependencies.json` | 通過 | YAML／JSON 可解析；support 條目 `ui-pixel-align-report`、`ui-compare-to-reference` |
| 安裝器 dry-run | 通過 | 列出 Claude Code、Codex、Cursor 三個使用者目錄，無錯誤，未複製 |
| 實際安裝（使用者 2026-09-17 指示） | 通過 | `--agent all --scope user --skill platform-parity-handoff`（無 `--force`）；`diff -rq` 三份與來源相同；安裝後在 cm-english-toast 根目錄執行 `~/.claude/skills/platform-parity-handoff/scripts/classify_diff.py` 可用 |
| ToastEnglish 專案版關係註記 | 通過 | `toastenglish-platform-parity-handoff/SKILL.md` 加一句（通用版位置、各自維護）；symlink `readlink`／`cmp` 與 24 條連結重新通過；該專案 change design 的交接紀錄補後續說明 |
| Claude Code runtime 探索 | 觀察到 | 安裝後本 session 的可用 skill 清單出現 `platform-parity-handoff`；這不是獨立新 session 驗收 |
| Codex／Cursor 新 session 探索 | 未執行 | 依 cm-skills README 的安裝說明由使用者另測 |
| 先端為 Android 的情境 | 未執行 | 腳本的字串／事件／config 掃描目前以 Swift 先端為主，project-profile.md 已標明 |
| spectra analyze／validate | 通過 | 全部 dimension Clean；validate valid |
| docs 同步（2026-09-17 使用者指示） | 通過 | `docs/skills-usage.md`、`docs/skills-guide.html`、`docs/designer-guide-storybook-to-production.html` 加入 `platform-parity-handoff`；兩份 HTML 內嵌 script `node --check` 通過；旅程 id、related 與 journey 參照無懸空 |
