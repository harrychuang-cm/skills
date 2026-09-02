## ADDED Requirements

### Requirement: Coordinator resolves a local dispatch binding and falls back to standalone

The Coordinator SHALL resolve a task board dispatch binding from environment variables first and from an untracked local binding file below the project's design automation directory second. A binding is complete only when the control plane URL, the project slug, and the control plane token are all present. When any of the three is absent, the Coordinator SHALL treat the project as unbound and SHALL keep the standalone execution path unchanged, including scheduling local analysis immediately after task creation.

When the binding file omits the project slug, the Coordinator SHALL derive the default slug from the project root directory name using the same normalization the worker uses: lowercase, every character outside the set of lowercase letters, digits, and hyphen replaced by a hyphen, and leading and trailing hyphens removed.

The Coordinator SHALL NOT read the control plane token from the project profile, SHALL NOT write the token or the control plane URL into any HTTP response body, installer receipt, or process output, and SHALL report binding problems using stable error codes only.

#### Scenario: Unbound project keeps today's behavior

- **WHEN** a project has no dispatch binding in the environment and no binding file
- **THEN** creating a cleanup task schedules local analysis in the Coordinator process
- **AND** the health endpoint reports the extraction queue as false and the dispatch flag as false

#### Scenario: Environment overrides the binding file

- **WHEN** both the environment variables and the binding file supply a control plane URL
- **THEN** the Coordinator uses the environment value

#### Scenario: Incomplete binding is treated as unbound

- **WHEN** the binding file supplies a control plane URL and project slug but no token
- **THEN** the Coordinator treats the project as unbound and runs the standalone path

#### Scenario: Binding errors never expose the token

- **WHEN** the Coordinator fails to reach the control plane during dispatch
- **THEN** the failure recorded on the task carries a stable error code and a message containing neither the control plane URL nor the token

##### Example: default project slug derivation

| Project root directory name | Derived project slug |
| --- | --- |
| app-alpha | app-alpha |
| Project Aurora | project-aurora |
| my_app.v2 | my-app-v2 |

### Requirement: Bound Coordinator dispatches cleanup instead of analyzing locally

When the binding is complete, the Coordinator SHALL respond to a newly created cleanup task by materializing the task-scoped runtime input inside the project's runtime directory, creating one card on the control plane, and leaving the task in the queued status. The Coordinator MUST NOT spawn the generic automation runner for a dispatched task.

The created card SHALL carry the project slug from the binding, the task id `figma-cleanup`, the automation task id, and a note equal to the exact request string the generic runner needs to locate the task-scoped input and result paths. When card creation fails, the Coordinator SHALL transition the task from queued to blocked with a stable dispatch failure code and SHALL leave the materialized runtime input in place.

#### Scenario: Dispatched task does not run locally

- **WHEN** a bound project receives a cleanup task creation request that produces a new task
- **THEN** the task-scoped input file exists in the project runtime directory
- **AND** one card is created on the control plane
- **AND** no generic automation subprocess is started by the Coordinator

#### Scenario: Card note carries the runner request

- **WHEN** the Coordinator creates a card for a dispatched task
- **THEN** the card note is the request string naming the task-scoped input path and result path for that automation task id

#### Scenario: Control plane unreachable blocks the task

- **WHEN** card creation fails because the control plane is unreachable
- **THEN** the task moves from queued to blocked with a stable dispatch failure code
- **AND** the Plugin shows the task as blocked rather than as running

### Requirement: Dispatched task status advances from durable runtime evidence

For every queued task carrying a dispatch record, the Coordinator SHALL reconcile the task before answering a task list or task detail read. When a valid result exists for the task in its runtime directory, the Coordinator SHALL advance the task through the existing queued to analyzing and analyzing to plan-ready transitions, recording the plan and the generic run id from that result. When the result is present but fails validation, the Coordinator SHALL advance the task to blocked using the existing cleanup analysis failure codes.

When no result exists, the Coordinator SHALL query the card status on the control plane; a card reported as needing attention SHALL move the task to blocked, and any other card state SHALL leave the task queued with the last known card state recorded on the dispatch record. A failed card status query SHALL NOT change the task status and SHALL NOT fail the read.

The Coordinator SHALL NOT add any status to the cleanup task state machine and SHALL NOT introduce a transition that the local analysis path does not already use.

#### Scenario: Worker result promotes the task to plan-ready

- **WHEN** a worker has finished a dispatched card and a valid result exists in the task runtime directory
- **THEN** the next Plugin read reports the task as plan-ready with the operations from that result

#### Scenario: Invalid result blocks the task

- **WHEN** the result in the task runtime directory fails cleanup result validation
- **THEN** the next Plugin read reports the task as blocked with a cleanup analysis failure code

#### Scenario: Control plane unavailable during reconcile

- **WHEN** no result exists and the card status query fails
- **THEN** the task remains queued and the Plugin read succeeds with the last known dispatch information

### Requirement: Plugin apply outcome is written back to the board

After the Plugin completes a dispatched task, the Coordinator SHALL report the applied outcome to the control plane for that task's card. After the Plugin records a failure for a dispatched task, the Coordinator SHALL report the failed outcome carrying only a stable error code. Write-back SHALL be best effort: a failed write-back MUST NOT change the Plugin response, MUST NOT change the cleanup task status, and SHALL be surfaced as one process output line containing no credential and no control plane URL.

#### Scenario: Apply completion closes the card

- **WHEN** the Plugin completes a dispatched task and the card is awaiting review
- **THEN** the Coordinator reports the applied outcome and the card moves to done

#### Scenario: Apply failure sends the card back to the human inbox

- **WHEN** the Plugin records a failure for a dispatched task whose card is awaiting review
- **THEN** the Coordinator reports the failed outcome with a stable error code and the card moves to needs attention

#### Scenario: Write-back failure does not break apply

- **WHEN** the control plane is unreachable at the moment the Plugin completes a dispatched task
- **THEN** the Plugin still receives the successful completion response and the cleanup task is still completed

### Requirement: Plugin workflow status explains dispatch state

For a dispatched task, the Plugin workflow status SHALL present the dispatch state in addition to the task status, distinguishing at least: waiting for board approval, waiting to be claimed, claimed and running, and needing attention. When a dispatched task has remained queued and unclaimed beyond the configured stall threshold, the Plugin SHALL state that no machine has claimed the task and that only a machine able to read this project's task runtime directory is eligible.

The Plugin MUST NOT present a dispatched task as completed before its cleanup task reaches the completed status.

#### Scenario: Waiting for approval is visible in the Plugin

- **WHEN** a designer opens workflow status while the dispatched card is unapproved
- **THEN** the task is shown as queued with an explanation that it is waiting for board approval

#### Scenario: Nobody can claim the task

- **WHEN** a dispatched task has been queued past the stall threshold with no claim recorded
- **THEN** the Plugin states that no machine has claimed the task and names the machine eligibility rule
- **AND** neither the Plugin nor the task status reports success
