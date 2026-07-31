# agent-automation-orchestration-skill Specification

## Purpose

Define a portable, vendor-neutral Skill contract for inspecting project evidence, validating project-specific automation, executing ordered headless AI runners, verifying artifacts, and reporting resumable sanitized status across repositories.

## Requirements

### Requirement: The skill separates reusable orchestration from project-specific contracts

The repository SHALL provide an `agent-automation-orchestrate` skill whose core workflow covers bootstrap, guide, run, resume, and status modes. The skill MUST keep vendor-neutral runner control, validation, fallback, and durable summaries reusable while requiring project-specific instructions, verification commands, artifacts, and optional companion skills to live in a project contract. The guide mode MUST produce the same project contract schema as bootstrap and MUST NOT alter the behavior of the other four modes.

#### Scenario: Bootstrap a previously unsupported project

- **WHEN** an operator invokes the skill in a repository without `.agent-automation/config.json`
- **THEN** the skill inspects the repository before proposing a project contract
- **AND** the proposed contract contains project-specific tasks and verification instead of framework assumptions
- **AND** no paid agent process starts during bootstrap

#### Scenario: Use a project-specific companion skill

- **WHEN** a task contract names a project skill such as `component-coverage-implement`
- **THEN** the orchestration prompt instructs the selected runner to load that skill
- **AND** the generic orchestration scripts do not duplicate the companion skill's domain rules

#### Scenario: A designer request routes to guide mode

- **WHEN** a user describes a desired automation in scenario language without naming a technical mode
- **THEN** the skill resolves the request to guide mode instead of bootstrap
- **AND** the produced contract validates with the same validation script bootstrap output uses
- **AND** an operator request naming bootstrap, run, resume, or status still resolves to that mode unchanged


<!-- @trace
source: orchestrate-designer-ux
updated: 2026-07-22
code:
  - agent-automation-orchestrate/references/designer-guide.md
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/run-task.mjs
  - agent-automation-orchestrate/assets/scenario-templates/figma-ready-to-storybook.json
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/assets/scenario-templates/README.md
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/scenario-templates/screenshot-to-component.json
  - agent-automation-orchestrate/assets/scenario-templates/visual-parity-audit.json
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/assets/scenario-templates/design-system-extraction.json
-->

---
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


<!-- @trace
source: add-agent-automation-orchestrate-skill
updated: 2026-07-22
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
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


<!-- @trace
source: add-agent-automation-orchestrate-skill
updated: 2026-07-22
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
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


<!-- @trace
source: add-agent-automation-orchestrate-skill
updated: 2026-07-22
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
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


<!-- @trace
source: add-agent-automation-orchestrate-skill
updated: 2026-07-22
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
### Requirement: The shared installer discovers the new skill

The new skill folder MUST contain a valid `SKILL.md` and matching folder name so the existing multi-agent installer discovers it without installer interface changes. The skill MUST provide OpenAI UI metadata whose default prompt explicitly invokes `$agent-automation-orchestrate`.

#### Scenario: Dry-run installation for all agents

- **WHEN** the installer runs with agent `all`, project scope, and skill filter `agent-automation-orchestrate`
- **THEN** it reports Claude, Codex, and Cursor project destinations
- **AND** it does not copy files during dry-run

<!-- @trace
source: add-agent-automation-orchestrate-skill
updated: 2026-07-22
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - agent-automation-orchestrate/scripts/inspect-project.mjs
  - agent-automation-orchestrate/SKILL.md
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/validate-project-config.mjs
  - agent-automation-orchestrate/agents/openai.yaml
  - agent-automation-orchestrate/scripts/status.mjs
  - agent-automation-orchestrate/assets/agent-automation.config.example.json
  - agent-automation-orchestrate/references/project-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
### Requirement: Child processes never inherit the caller's standard input

Task execution SHALL start every preflight, agent, and verification child process with a standard input stream that is closed to the caller's own standard input. A runner CLI that reads standard input MUST observe end of input immediately instead of blocking on an inherited open pipe. Standard output and standard error SHALL continue to reach the caller's terminal so diagnostic output remains visible during interactive runs.

#### Scenario: A runner that reads standard input settles without a terminal

- **WHEN** `run-task.mjs` is started by a parent process that is not a terminal
- **AND** the selected runner reads its standard input to end of input before exiting
- **THEN** the runner exits on its own
- **AND** the recorded attempt outcome reflects the runner's own exit status rather than `timeout`

##### Example: stdin-reading runner under a non-terminal parent

- **GIVEN** a runner whose command reads all of standard input and then exits zero
- **AND** a configured `timeoutMs` of 600000
- **WHEN** the task runs from a parent with a piped standard input
- **THEN** the attempt settles in under 10000 milliseconds
- **AND** the attempt outcome is `success`, not `timeout`

#### Scenario: Interactive diagnostic output stays visible

- **WHEN** `run-task.mjs` runs from an interactive terminal
- **AND** the runner writes progress text to standard output or standard error
- **THEN** that text appears in the caller's terminal
- **AND** the durable run summary contains no prompt, argv, standard output, standard error, or environment values


<!-- @trace
source: fix-runner-spawn-hygiene
updated: 2026-07-31
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - .spectra.yaml
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
### Requirement: Timed-out and interrupted runs terminate the entire process group

When an attempt exceeds its configured timeout, task execution SHALL signal the child's whole process group so that processes the runner itself started are terminated. Termination SHALL keep the existing two-stage sequence: a termination signal first, then a forced kill after a grace period, settling the attempt as `timeout`. When the parent receives an interrupt or termination signal, it SHALL forward that signal to the child's process group before exiting, so an interactive interrupt still stops a running agent.

#### Scenario: Descendant processes do not survive a timeout

- **WHEN** a runner starts a descendant process that would outlive the configured timeout
- **AND** the attempt exceeds `timeoutMs`
- **THEN** the attempt outcome is `timeout`
- **AND** no descendant process started by that runner is still running after the attempt settles

##### Example: grandchild cleanup on timeout

- **GIVEN** a runner that spawns a descendant sleeping for 600 seconds and then waits
- **AND** a configured `timeoutMs` of 3000
- **WHEN** the attempt times out
- **THEN** the descendant process is no longer running
- **AND** the recorded attempt outcome is `timeout`

#### Scenario: Interrupting the parent stops the runner

- **WHEN** `run-task.mjs` is running an agent and the parent process receives an interrupt signal
- **THEN** the same signal is forwarded to the child's process group
- **AND** the agent process stops rather than continuing after the parent exits

#### Scenario: Signalling an already finished child is not an error

- **WHEN** the timeout fires after the child has already exited
- **THEN** the failed group signal is ignored
- **AND** the recorded attempt outcome is unchanged by the failed signal


<!-- @trace
source: fix-runner-spawn-hygiene
updated: 2026-07-31
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - .spectra.yaml
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
### Requirement: Documented runner recipes declare a preflight that fails when unauthenticated

The runner contract SHALL document each supported command-line agent as a complete runner recipe, and each recipe's preflight command MUST exit non-zero when the tool is installed but not authenticated. The contract SHALL state that a preflight which exits zero while unauthenticated is invalid, because the affected runner can never be classified `unavailable` and instead consumes a fallback position before failing. The contract SHALL record argument-order constraints for any documented command whose flags are variadic, and SHALL record additional flags a documented command requires outside a version-controlled repository.

#### Scenario: A documented recipe rejects an always-zero preflight

- **WHEN** a maintainer adds a runner recipe to the runner contract
- **AND** the proposed preflight command exits zero while the tool is unauthenticated
- **THEN** the contract requires selecting a different preflight command that exits non-zero in that state

##### Example: preflight selection evidence

| Command | Unauthenticated exit code | Valid preflight | Evidence |
| ------- | ------------------------- | --------------- | -------- |
| `cursor-agent status` | 0, prints `Not logged in` | no | directly observed |
| `cursor-agent models` | 1, prints `Authentication required` | yes | directly observed |


<!-- @trace
source: fix-runner-spawn-hygiene
updated: 2026-07-31
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - .spectra.yaml
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->

---
### Requirement: Runner recipes record how each preflight claim was established

Each documented runner recipe SHALL record whether its unauthenticated exit behavior was directly observed or is carried over from vendor documentation. A recipe whose unauthenticated behavior has not been observed SHALL be marked unconfirmed rather than presented as verified, so a maintainer can tell which claims still need an unauthenticated account to check.

#### Scenario: An unobserved preflight claim is marked unconfirmed

- **WHEN** a recipe is documented on a machine where that tool is already authenticated
- **AND** its unauthenticated exit code therefore cannot be observed
- **THEN** the recipe records the claim as unconfirmed
- **AND** the recipe does not present that exit code as verified

#### Scenario: Each documented recipe carries exactly one prompt and one workspace placeholder

- **WHEN** the skill self-check reads the runner recipes in the runner contract
- **THEN** each recipe's argument list contains exactly one prompt placeholder and exactly one workspace placeholder

#### Scenario: Order-sensitive arguments are recorded

- **WHEN** a documented command accepts a variadic flag that consumes following arguments
- **THEN** the contract states that the argument order is significant for that command
- **AND** the contract states that placeholder counting alone does not detect an incorrect order

<!-- @trace
source: fix-runner-spawn-hygiene
updated: 2026-07-31
code:
  - agent-automation-orchestrate/scripts/check-agent-automation-skill.mjs
  - .spectra.yaml
  - agent-automation-orchestrate/references/runner-contract.md
  - agent-automation-orchestrate/scripts/run-task.mjs
-->