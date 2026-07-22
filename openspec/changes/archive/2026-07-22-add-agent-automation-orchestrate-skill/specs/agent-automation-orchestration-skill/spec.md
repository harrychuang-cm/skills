## ADDED Requirements

### Requirement: The skill separates reusable orchestration from project-specific contracts

The repository SHALL provide an `agent-automation-orchestrate` skill whose core workflow covers bootstrap, run, resume, and status modes. The skill MUST keep vendor-neutral runner control, validation, fallback, and durable summaries reusable while requiring project-specific instructions, verification commands, artifacts, and optional companion skills to live in a project contract.

#### Scenario: Bootstrap a previously unsupported project

- **WHEN** an operator invokes the skill in a repository without `.agent-automation/config.json`
- **THEN** the skill inspects the repository before proposing a project contract
- **AND** the proposed contract contains project-specific tasks and verification instead of framework assumptions
- **AND** no paid agent process starts during bootstrap

#### Scenario: Use a project-specific companion skill

- **WHEN** a task contract names a project skill such as `component-coverage-implement`
- **THEN** the orchestration prompt instructs the selected runner to load that skill
- **AND** the generic orchestration scripts do not duplicate the companion skill's domain rules

### Requirement: Project inspection is deterministic and read-only

The skill SHALL provide `inspect-project.mjs` with a required project root input. The command MUST emit one JSON object containing the resolved root, detected manifest and package manager, available package scripts, instruction files, project-scoped skills, and warnings. Inspection MUST NOT create, edit, or delete files in the inspected repository.

#### Scenario: Inspect a JavaScript repository

- **WHEN** the command inspects a repository containing `package.json`, `pnpm-lock.yaml`, `AGENTS.md`, and two project-scoped skill folders
- **THEN** its JSON identifies pnpm, the package scripts, the instruction file, and both skill names
- **AND** the repository filesystem remains unchanged

#### Scenario: Inspect a repository without a supported manifest

- **WHEN** the command finds no supported project manifest
- **THEN** it exits successfully with a warning in the JSON result
- **AND** it does not invent build or verification commands

### Requirement: Project contracts are validated before execution

The skill SHALL provide `validate-project-config.mjs` for schema version 1 contracts. Validation MUST require a project-contained state directory, one to three uniquely identified ordered runners, non-empty task definitions, safe command arrays, positive timeouts, exactly one `{prompt}` and one `{workspace}` placeholder in each runner argv, project-contained artifact paths, and no credential values. Invalid contracts MUST return a non-zero exit before any runner starts or runtime state is written.

#### Scenario: Accept a valid multi-runner contract

- **WHEN** the contract defines ordered Claude and Codex runners, one implementation task, array-form verification commands, and project-relative artifacts
- **THEN** validation exits zero with `valid` equal to true
- **AND** the result reports runner order and task IDs without credential data

##### Example: Valid runner order

| Runner ID | Priority | Prompt placeholders | Workspace placeholders | Expected result |
| ----- | ----- | ----- | ----- | ----- |
| `claude` | 0 | 1 | 1 | valid |
| `codex` | 1 | 1 | 1 | valid |

#### Scenario: Reject unsafe or ambiguous configuration

- **WHEN** a contract contains a duplicate runner ID, a state path outside the project, a shell command string, a missing prompt placeholder, or a credential value
- **THEN** validation exits non-zero with `valid` equal to false
- **AND** each error names the failing field path
- **AND** no runtime state file is created

### Requirement: Task execution uses ordered headless runner fallback

The skill SHALL provide `run-task.mjs` to execute one configured task. The command MUST validate configuration before execution, run preflight and agent processes with `shell: false`, inherit only minimal operating-system variables plus allowlisted names, replace prompt and workspace placeholders without shell expansion, and try runners in configured order. A preflight failure, spawn error, timeout, or non-zero agent exit MUST produce a sanitized attempt outcome and select the next runner. A successful agent exit MUST stop runner fallback and start verification and artifact checks.

#### Scenario: First runner completes the task

- **WHEN** the first runner passes preflight and exits zero
- **THEN** no lower-priority runner starts
- **AND** verification and artifact checks run against the resulting workspace
- **AND** the run becomes completed only when every check passes

#### Scenario: Unavailable runner falls back

- **WHEN** the first runner's preflight exits non-zero and the second runner exits zero
- **THEN** the first attempt is recorded as unavailable
- **AND** the second runner is recorded as the completing runner
- **AND** the durable summary contains neither prompt text nor raw process output

#### Scenario: Verification failure does not switch AI providers

- **WHEN** an agent exits zero but a configured verification command fails
- **THEN** the run phase becomes `verification-failed`
- **AND** no lower-priority AI runner starts
- **AND** the process exits non-zero

#### Scenario: Dry-run performs no execution

- **WHEN** an operator invokes `run-task.mjs` with `--dry-run`
- **THEN** the output reports task ID, runner order, verification commands, and required artifacts
- **AND** no preflight, agent, verification, or state write occurs

### Requirement: Durable status remains resumable and sanitized

Each non-dry task run MUST persist a summary under the configured state directory. The summary SHALL contain run ID, task ID, phase, selected runner, sanitized attempt outcomes, verification results, artifact results, and timestamps. The summary MUST NOT contain prompts, expanded argv values, raw stdout or stderr, tokens, API keys, or complete environment values. The skill SHALL provide `status.mjs` to return the latest or requested run summary.

#### Scenario: Query the latest completed run

- **WHEN** multiple summaries exist and status is invoked without a run ID
- **THEN** it returns the most recently updated summary
- **AND** it identifies the runner that completed the task

#### Scenario: Query an unknown run

- **WHEN** status is invoked with a run ID that does not exist
- **THEN** it exits non-zero with a machine-readable not-found error
- **AND** it does not modify runtime state

### Requirement: The shared installer discovers the new skill

The new skill folder MUST contain a valid `SKILL.md` and matching folder name so the existing multi-agent installer discovers it without installer interface changes. The skill MUST provide OpenAI UI metadata whose default prompt explicitly invokes `$agent-automation-orchestrate`.

#### Scenario: Dry-run installation for all agents

- **WHEN** the installer runs with agent `all`, project scope, and skill filter `agent-automation-orchestrate`
- **THEN** it reports Claude, Codex, and Cursor project destinations
- **AND** it does not copy files during dry-run
