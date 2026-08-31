## ADDED Requirements

### Requirement: Worker advertises locally readable hub inputs

When claiming work, the worker SHALL advertise the Hub automation task ids that are readable on its machine. For each advertised project root, the worker SHALL collect the names of the directories below that project's design automation runtime directory that contain a readable task input file. The worker SHALL cap the advertised list at a fixed maximum, keeping the most recently modified entries first, and SHALL send an empty list when no such directory exists.

Scanning SHALL be resilient: an unreadable or missing runtime directory SHALL produce no entries for that project rather than failing the poll.

#### Scenario: Ids from the local runtime directory are advertised

- **WHEN** a project root contains two runtime directories that each hold a task input file
- **THEN** the worker's claim request advertises both directory names as Hub automation task ids

#### Scenario: Missing runtime directory does not break polling

- **WHEN** an advertised project root has no design automation runtime directory
- **THEN** the worker still polls successfully and advertises no ids for that project

#### Scenario: Advertisement is capped

- **WHEN** a project root contains more runtime directories with inputs than the advertised maximum
- **THEN** the worker advertises exactly the maximum number, choosing the most recently modified directories

### Requirement: Worker verifies the hub input before executing

Before spawning the generic automation runner for a claimed card that carries a Hub automation task id, the worker SHALL verify that the corresponding task input file exists, is a regular file, and resolves to a path inside the claimed project's root. When any of these conditions fails, the worker MUST NOT spawn the runner.

For a card without a Hub automation task id, the worker SHALL execute exactly as it does today.

#### Scenario: Missing input prevents execution

- **WHEN** the worker claims a card whose Hub automation task id has no task input file on this machine
- **THEN** no runner subprocess is started

#### Scenario: Input outside the project root prevents execution

- **WHEN** the task input path for a claimed Hub card resolves outside the claimed project's root
- **THEN** no runner subprocess is started

#### Scenario: Non-hub cards are unaffected

- **WHEN** the worker claims a card with no Hub automation task id
- **THEN** the worker spawns the runner with the card's task id and note exactly as before

### Requirement: Worker reports a missing hub input as a clear attention failure

When the worker refuses to execute a claimed Hub card because its task input is unavailable, the worker SHALL report a terminal result that places the card in Needs Attention and SHALL supply the hub-input-missing attention reason. The report SHALL follow the worker's existing resilient reporting rules, including local caching when the control plane is unreachable.

The worker SHALL NOT invent a new run phase for this case and SHALL NOT modify the generic automation scripts, schemas, or project automation config.

#### Scenario: Card lands in the human inbox with a clear reason

- **WHEN** the worker refuses a claimed Hub card because its task input is missing
- **THEN** the card moves to Needs Attention with the attention reason hub-input-missing

#### Scenario: Refusal report survives an outage

- **WHEN** the control plane is unreachable at the moment the worker refuses a claimed Hub card
- **THEN** the report is cached locally and delivered once connectivity returns

### Requirement: Hub cards execute through the unchanged runner invocation

The worker SHALL execute an approved Hub card by spawning the generic automation launcher with the card's task id and the card's note as the request, using the same invocation it uses for every other card. The authoritative outcome SHALL remain the newest run summary for that task id in the project's state directory.

#### Scenario: Hub card runs through the standard invocation

- **WHEN** the worker executes a Hub card whose task id is the cleanup task and whose note is the runner request string
- **THEN** the runner is invoked with that project root, that task id, and that request
- **AND** the reported phase comes from the newest matching run summary
