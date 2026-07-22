## 1. Skill 結構與使用契約

- [x] 1.1 依「Keep orchestration policy in the Skill and deterministic behavior in scripts」與「The skill separates reusable orchestration from project-specific contracts」建立 `agent-automation-orchestrate/SKILL.md`、`agents/openai.yaml` 及必要資源目錄，讓 bootstrap、run、resume、status 有明確 gate、companion skill 邊界與「Scope boundaries」；以 Skill Creator `quick_validate.py` 與 metadata content review 驗證。
- [x] 1.2 依「Use one project contract with layered project-specific adapters」撰寫 `references/project-contract.md`、`references/runner-contract.md` 與 config example，完整定義「Project contract shape」且不硬編碼 Figma、Storybook 或框架；以範例 JSON parse 與 validator valid fixture 驗證。

## 2. Deterministic project bootstrap

- [x] 2.1 實作「Project inspection is deterministic and read-only」及「Bootstrap remains explicit and non-destructive」的 `inspect-project.mjs`，輸出 resolved root、manifest、package manager、scripts、instruction files、project skills 與 warnings，且不寫目標 repo；以 temporary JavaScript fixture 與 manifest-less fixture 的 before/after file inventory 驗證。

## 3. Contract validation

- [x] 3.1 實作「Project contracts are validated before execution」的 `validate-project-config.mjs`，對 unsafe path、runner 數量與 uniqueness、placeholder、command arrays、timeouts、tasks、verification、artifacts 與 credential-shaped values 回報 field-path errors，符合「Failure modes」且失敗時不寫 state；以 valid multi-runner 與 invalid boundary fixtures 驗證 exit code 和 JSON shape。

## 4. Headless runner execution

- [x] 4.1 依「Execute commands without a shell and minimize inherited environment」及「Task execution uses ordered headless runner fallback」實作 `run-task.mjs` 的 validation、dry-run、preflight、ordered fallback、timeout、minimal environment、verification 與 artifact checks，使「Observable behavior」及 runner 成功後不再切換的規則可觀察；以 fake runner success、unavailable fallback、exhausted 與 verification-failed fixtures 驗證。

## 5. Durable run status

- [x] 5.1 依「Treat run summaries as state, not raw transcripts」及「Durable status remains resumable and sanitized」實作 sanitized summary persistence 與 `status.mjs` latest/by-id query，確保 prompt、expanded argv、raw output、token、key 與 environment value 不落盤；以 summary forbidden-key scan、latest ordering 與 unknown-run fixture 驗證。

## 6. End-to-end verification

- [x] 6.1 實作 `check-agent-automation-skill.mjs`，以 temporary fixtures 一次覆蓋 inspect、validate、dry-run、fallback、verification、artifact、status 與 sanitization，滿足「Acceptance criteria」；執行該 check 並確認 exit 0。
- [x] 6.2 驗證「The shared installer discovers the new skill」，讓既有 installer 在不修改介面的情況下找到新目錄並列出 Claude、Codex、Cursor project targets；執行 installer dry-run、Skill Creator `quick_validate.py`、`spectra analyze` 與 `spectra validate`，並確認 diff 未觸及既有 dirty changes。
