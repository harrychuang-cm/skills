## ADDED Requirements

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
