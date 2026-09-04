## ADDED Requirements

### Requirement: Coordinator boots and operates without dispatch modules present

The Coordinator SHALL start and serve every standalone feature when the task-board dispatch modules (the dispatch orchestration module, the task-board binding loader, and the task-board client) are absent from the installed project. The Coordinator SHALL NOT statically import any dispatch module at startup; it SHALL load them lazily, and only after the dispatch precondition holds. The dispatch precondition holds when the binding file `.design-automation/task-board.json` exists in the project, or when `DESIGN_AUTOMATION_TASK_BOARD_URL` or `DESIGN_AUTOMATION_TASK_BOARD_TOKEN` is defined in the environment, even as an empty or invalid value — a misconfigured environment MUST fail or warn loudly rather than silently disable dispatch. When the precondition does not hold, the Coordinator SHALL NOT read, parse, or load the binding file or any dispatch module.

#### Scenario: Default install boots standalone

- **WHEN** the Coordinator starts in a project installed without the task-board dispatch module, with no binding file and no dispatch environment variables
- **THEN** startup succeeds and the health endpoint reports `dispatch` as `false`
- **AND** a submitted cleanup task is analyzed locally exactly as in standalone mode

#### Scenario: Binding present but modules absent degrades loudly to standalone

- **WHEN** the dispatch precondition holds but the dispatch module files are not installed
- **THEN** the Coordinator starts successfully, emits one warning line stating that a dispatch binding exists but the task-board module is not installed, and analyzes tasks locally
- **AND** the Coordinator MUST NOT crash or refuse startup in this configuration

#### Scenario: Unconfigured project never touches the binding path

- **WHEN** the Coordinator starts with no binding file and neither dispatch credential environment variable defined
- **THEN** no dispatch module is loaded and the binding file path is not read or parsed
- **AND** startup output contains no dispatch-mode line

#### Scenario: Misconfigured environment fails loudly when modules are installed

- **WHEN** a dispatch credential environment variable is defined with an empty value, no binding file exists, and the dispatch modules are installed
- **THEN** startup fails with the same binding validation error as the statically imported implementation, naming the offending variable without printing its value

#### Scenario: Bound project with modules installed is behaviorally unchanged

- **WHEN** the dispatch precondition holds, the dispatch modules are installed, and the binding resolves to a complete URL and token
- **THEN** the Coordinator wires dispatch exactly as the existing hub-dispatch contract defines, with no observable behavioral difference from the statically imported implementation
- **AND** a malformed binding file in this configuration produces the same startup error as before

### Requirement: Skill documentation keeps the task board silent unless explicitly requested

The install skill's mainline instructions SHALL NOT contain task-board setup steps; the dispatch binding documentation SHALL live in a dedicated reference document that the mainline references in at most two sentences. The skill SHALL instruct agents that the task board MUST NOT be mentioned, offered, configured, or explained unless the user explicitly requests it, and that install reports and next-step suggestions MUST NOT include the task board. The installation contract SHALL state that a project with no binding is reported without any board mention. The orchestration skill's ecosystem documentation SHALL describe external consumers of durable run summaries generically and SHALL NOT recommend specific board tools.

#### Scenario: Mainline skill read surfaces no board setup

- **WHEN** an agent reads the install skill's mainline instructions end to end
- **THEN** it encounters no binding JSON structure, no worker-token instructions, and no dispatch environment-variable walkthrough
- **AND** it encounters an explicit directive forbidding proactive task-board mention

#### Scenario: Install report for an unbound project is board-free

- **WHEN** an agent completes an install, update, or check for a project with no dispatch binding and reports the outcome
- **THEN** the report and any suggested next steps contain no task-board mention

#### Scenario: Orchestration ecosystem docs stay tool-neutral

- **WHEN** a reader consults the orchestration skill's documentation about downstream consumers
- **THEN** external trackers and status tools are described only as read-only consumers of the durable run summaries in the state directory, without naming board skills as recommendations
