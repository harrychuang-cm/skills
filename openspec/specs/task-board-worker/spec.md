# task-board-worker Specification

## Purpose

TBD - created by archiving change 'add-ai-task-board-platform'. Update Purpose after archive.

## Requirements

### Requirement: Worker registration

The worker daemon SHALL register with the control plane using a worker token issued to a member, reporting a stable machine identifier, the runner ids available on the machine, and the project roots present locally. Before advertising a project root, the worker SHALL verify the root contains a valid automation config at .agent-automation/config.json; invalid roots SHALL be excluded from the advertisement and reported in the registration response summary.

#### Scenario: Only valid projects are advertised

- **WHEN** a worker starts with two configured project roots, one containing a valid .agent-automation/config.json and one without
- **THEN** the registration advertises only the valid root and reports the invalid one as excluded

---
### Requirement: Poll and claim within capacity

The worker SHALL poll the control plane over outbound HTTP only, SHALL attempt to claim only cards belonging to its advertised projects, and SHALL execute at most one task at a time per machine. While a task is executing, the worker SHALL NOT claim additional cards.

#### Scenario: Busy worker does not claim

- **WHEN** a worker is executing a claimed card and its poll returns additional claimable cards
- **THEN** the worker claims nothing further until the current execution finishes

---
### Requirement: Execution wraps run-task

The worker SHALL execute a claimed card by spawning the agent-automation-orchestrate launcher script run-task.mjs as a subprocess, passing the card's task id and, when the card carries a rerun directive, the previous run id and adjustment note as the resume request. The worker SHALL NOT modify orchestrate scripts, schemas, or the project automation config. The authoritative outcome SHALL be the newest run summary for the task id in the project's state directory, not the subprocess exit code alone.

#### Scenario: Outcome reported from the run summary

- **WHEN** the run-task subprocess exits and the newest matching run summary records phase verification-failed
- **THEN** the worker reports verification-failed with the summary's run id and verification counts, even though it also observed the subprocess exit code

---
### Requirement: Heartbeats during execution

While executing a claimed card, the worker SHALL send heartbeats to the control plane at the configured interval so the lease stays active for the duration of the run.

#### Scenario: Long run stays leased

- **WHEN** a run lasts longer than the lease expiry window
- **THEN** periodic heartbeats keep the card in Running for the entire execution

---
### Requirement: Log capture and masking

The worker SHALL capture the combined stdout and stderr of the run-task subprocess and upload it to the control plane in ordered chunks. Before upload, the worker SHALL mask the values of every environment variable passed to the subprocess and any substring matching credential patterns (keys or values suggesting api key, token, secret, password, or private key). The worker SHALL NOT upload raw environment variable values and SHALL NOT persist unmasked log content to disk.

#### Scenario: Token value in output is masked

- **WHEN** the subprocess prints a line containing the value of an inherited environment variable
- **THEN** the uploaded chunk shows the line with that value replaced by a redaction marker

##### Example: masking rules

| Captured content | Uploaded content |
| --- | --- |
| line containing value of inherited env var FIGMA_TOKEN | value replaced with [redacted] |
| "api_key=sk-abc123" | "api_key=[redacted]" |
| ordinary build output | unchanged |

---
### Requirement: Resilient reporting

When the control plane is unreachable, the worker SHALL retry heartbeats, log uploads, and result reports with backoff instead of crashing. Result reports SHALL be idempotent, keyed by run id, and the final result SHALL be cached locally until the control plane acknowledges it.

#### Scenario: Result delivered after an outage

- **WHEN** a run finishes while the control plane is unreachable and connectivity returns later
- **THEN** the worker delivers the cached result exactly once and the card transitions according to the reported phase
