## Purpose

Define how the Code Layer dev server runs a headless coding agent on behalf of a person: when that is allowed at all, how each run is confirmed outside the browser, how the agent is kept away from the real project files until its changes pass a scope gate, and how accepted changes become one undoable write. Launching an agent permits unbounded source edits, so every safeguard here is enforced by the server and none depends on the agent behaving well.

## ADDED Requirements

### Requirement: Agent runs need two enablements

Agent runs SHALL be available only when the project binding explicitly enables them and a machine-local runner file exists in the state directory in which every referenced executable is present. In every other case each agent route SHALL answer that agent runs are disabled, with the reason, and SHALL start no process. A status route SHALL report readiness, the configured runner names, the confirmation mode, and each reason for not being ready. Installing, updating, checking and deriving a binding SHALL never start an agent process and SHALL never enable agent runs.

#### Scenario: A binding alone does not enable runs

- **WHEN** the binding enables agent runs and the machine has no runner file
- **THEN** a run request is refused as disabled, the reason names the missing runner file, and no process is started

#### Scenario: Readiness names what is missing

- **WHEN** the runner file names a command line tool that is not installed
- **THEN** the status route reports not ready and names that tool

### Requirement: Out-of-browser confirmation

Before any agent process starts, the server SHALL obtain approval for that specific request through a channel that scripts in the page cannot operate. The default channel SHALL be a native operating-system dialog that shows the project, the selected element, the request text, the runner and the paths the agent is allowed to change. Where no native dialog is available the channel SHALL be a one-time code printed to the dev server's terminal together with the same summary, which the person types into the page; the code SHALL be bound to that request and SHALL approve no other. A denial, a wrong code or no answer within the time limit SHALL end the run as denied with no working copy created and no process started. Confirmation SHALL be skippable only when the binding says so explicitly, and the status route and the panel SHALL then state that runs are unconfirmed.

#### Scenario: Denial starts nothing

- **WHEN** a person submits a request and declines the native dialog
- **THEN** the run ends as denied, no agent process was started, and no file in the project or the state directory's working-copy area was created

#### Scenario: A code approves only its own request

- **WHEN** a one-time code was issued for one request and is submitted for a different request
- **THEN** the second request is not approved

### Requirement: Isolated working copy

The agent SHALL work on a copy of the workspace created for the run inside the state directory, and SHALL never be given the real workspace as its working directory. The copy SHALL exclude dependency directories, version-control data, build output and state directories, and SHALL be refused, with the measured numbers, when the workspace exceeds the configured file-count or size limit. The copy SHALL be removed when the run reaches a final state. While a run is in progress the real project files SHALL be changed by nothing in the tool.

#### Scenario: The project is untouched during a run

- **WHEN** an agent run is executing
- **THEN** every file in the real workspace has the same hash as when the run started

#### Scenario: An oversized workspace is refused before copying

- **WHEN** the workspace has more files than the configured limit
- **THEN** the run ends as refused with the count and the limit, and no agent process is started

### Requirement: Runner launch

The server SHALL start the agent through the repository's agent-automation runner without modifying it, using a run contract that the server writes inside the working copy, with exactly one task whose identifier contains no credential-like word. Runner commands SHALL be absolute paths taken from the machine-local runner file. The prompt passed on the command line SHALL be a fixed sentence that names the request file and the result file; the person's text SHALL NOT appear in any process argument. The configured runner recipes SHALL give the agent no shell tool where the tool allows that, and SHALL confine its file access to the working copy. Standard input SHALL be closed, and the whole process group SHALL be terminated on timeout or cancellation.

#### Scenario: The request text is not in the process list

- **WHEN** a run is executing for a request whose text contains a distinctive phrase
- **THEN** no running process has that phrase in its arguments

#### Scenario: The project needs no agent contract file

- **WHEN** a run completes in a project that has no agent-automation contract of its own
- **THEN** the run works, and no agent-automation file was created in the real workspace

### Requirement: Request and result files

For each run the server SHALL write one request file inside the working copy containing the fixed rules, the person's text, and the object reference marked as data. The rules SHALL state: change only files in the allowed set; create, delete or rename no file; add or remove no design token; introduce no new shared component interface; edit token source-of-truth files and never their mirrors; and, when the request cannot be met within these rules, change nothing and report what decision is needed. The agent SHALL report through exactly one result file bound to the run identifier, with a status of done, needs-decision or cannot, a short summary, and a question when a decision is needed. A missing, duplicated or malformed result file SHALL make the run failed regardless of the runner's exit status.

#### Scenario: A run without a result file fails

- **WHEN** the runner exits successfully and no result file exists for the run
- **THEN** the run is failed and nothing is imported

#### Scenario: A needs-decision result imports nothing

- **WHEN** the result file's status is needs-decision
- **THEN** the run ends as needs-decision with the agent's question, and any change in the working copy is discarded

### Requirement: Scope gate

After the runner exits with a done result, the server SHALL compare the working copy with the snapshot taken when it was created and SHALL accept the run only when every difference is a modification of an existing file in the allowed set. The allowed set SHALL be the writable token source files, the files under the component roots, and the component specification files, narrowed by the binding's allow-list when present. A created, deleted or renamed file, a change outside the allowed set, a change to a token mirror, a change in the set of declared token names, or a changed stylesheet that no longer parses SHALL make the run rejected, with every offending path and reason listed, and nothing SHALL be imported.

#### Scenario: Gate outcomes

- **WHEN** the working copy differs from its snapshot
- **THEN** the run is accepted or rejected as in the table

##### Example: differences and outcomes

| Difference in the working copy | Outcome |
| --- | --- |
| a declaration changed in a component stylesheet | accepted |
| a component source file and its specification both modified | accepted |
| `package.json` modified | rejected: outside the allowed set |
| a new stylesheet created under a component root | rejected: file created |
| a token declaration added to a token file | rejected: token set changed |
| a token mirror edited | rejected: mirrors are written by the server |
| a component stylesheet left with an unclosed block | rejected: does not parse |

### Requirement: Import as one undoable apply

Accepted changes SHALL be imported into the real workspace as one transaction of the write-back capability: every file to be replaced SHALL still equal its snapshot, the project's checks SHALL pass against the working copy before any project file is written, each replaced file SHALL be backed up and journaled, a changed token source file SHALL be copied to its mirror in the same transaction, and written files SHALL be announced for hot update. The import SHALL appear on the undo stack and SHALL be undone exactly, by restoring the backed-up bytes. A failed check or a file that changed since the snapshot SHALL make the run rejected with zero writes. While a run is between confirmation and its final state, the server SHALL refuse every other apply, undo, reverse apply and mirror synchronization with a reason that names the active run.

#### Scenario: An import is undone like any apply

- **WHEN** a run's changes to two stylesheets were imported and the person undoes them
- **THEN** both files have their exact previous bytes

#### Scenario: The project moved on during the run

- **WHEN** a file the agent modified was also edited in the real workspace while the run was executing
- **THEN** the run is rejected as stale and no project file is written

#### Scenario: Other writes wait for the run

- **WHEN** a run is executing and a person applies staged token changes
- **THEN** the apply is refused with a reason naming the active run, and it succeeds after the run has finished

### Requirement: Run lifecycle

A run SHALL be in exactly one state at a time: awaiting confirmation, preparing, running, checking, and then one final state — imported, needs-decision, rejected, failed, denied or cancelled. At most one run SHALL be active per state directory. A person SHALL be able to cancel a run that is not final, which terminates the agent and discards the working copy. Every run SHALL have an overall time limit after which it is failed. When the dev server stops it SHALL terminate the agent of an active run, and at the next start a run that never reached a final state SHALL be marked interrupted and its working copy removed. The state of a run SHALL be queryable after a browser reload.

#### Scenario: Cancelling discards everything

- **WHEN** a person cancels a run while the agent is working
- **THEN** the agent's process group is gone, the working copy is removed, the run is cancelled, and the project is unchanged

#### Scenario: A second request waits its turn

- **WHEN** a run is active and another request is submitted
- **THEN** the second request is refused with a reason naming the active run

### Requirement: Run records

The journal SHALL record for every run its identifiers, runner, states with times, the hash of the request, the changed files with their hashes, and the outcome. The journal, the state route and every agent route response SHALL NOT contain the request text, expanded process arguments, raw agent output or environment values. The request text SHALL be kept only in the run's private directory with owner-only permissions. Output captured from the agent SHALL be held in memory only, for the failure message of the current run, and SHALL NOT be written to disk.

#### Scenario: Records carry no request text

- **WHEN** a run completes for a request containing a distinctive phrase
- **THEN** that phrase appears in the run's private request file and nowhere else in the state directory

### Requirement: Request guard for agent routes

Every agent route SHALL apply the request guard of the write-back capability, including the session header on writing routes, and SHALL additionally limit the request text and the object reference to configured sizes and refuse a request whose element reference names a stylesheet that is not in the index.

#### Scenario: A request from another origin is refused

- **WHEN** a page on another localhost port posts a run request
- **THEN** it is refused before any confirmation is shown
