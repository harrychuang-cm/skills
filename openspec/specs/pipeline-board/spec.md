# pipeline-board Specification

## Purpose

Define a read-only, designer-facing pipeline board skill that derives automation status entirely from on-disk evidence — declared artifact paths, audit exit codes, machine-readable review counts, and the orchestrator's durable run summaries — and renders it as a single self-contained HTML file that opens over the file protocol with no server, port, installation, or network dependency, never starts an execution, and never displays progress it cannot observe.

## Requirements

### Requirement: The board renders from a self-contained file with no service dependency

The skill SHALL produce a single HTML file that opens over the file protocol and requires no server, network port, access code, package installation, or terminal session to read. The generated file MUST NOT reference any external resource, so it renders identically on a machine with no network access.

#### Scenario: A designer opens the board without installing anything

- **WHEN** a designer opens the generated HTML file directly in a browser
- **THEN** the full pipeline renders
- **AND** no request to any external host is required for it to display

#### Scenario: The board works on a project with no automation installed

- **WHEN** the build and render commands run in a project that has never installed the orchestrator and has no run history
- **THEN** both commands exit zero
- **AND** every stage renders as not started
- **AND** the execution section reports that no run data exists


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Source nodes are evidence-driven and not fixed to one design tool

The pipeline definition SHALL declare a set of candidate sources, each with a designer-readable name and the evidence that establishes its presence. The board SHALL render only those sources whose evidence exists in the project. When no candidate source has evidence, the board SHALL state that no source is present yet and list the source kinds that are accepted. The board MUST NOT hardcode any single design tool as the required entry point.

#### Scenario: Only sources with evidence appear

- **WHEN** a project contains evidence for one candidate source and not for others
- **THEN** only the source with evidence is rendered as present
- **AND** the remaining candidates are not shown as active entry points

##### Example: source selection by evidence

| Evidence present in project | Rendered sources |
| --- | --- |
| screenshot directory only | screenshots |
| design tool export only | that design tool |
| screenshot directory and an existing app project | screenshots, existing app project |
| none of the candidates | none, plus the list of accepted source kinds |


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Every handoff cites the downstream condition it mirrors

Each handoff in the pipeline definition SHALL record the downstream script that refuses to proceed without the handed-off artifact, and the artifact path that script requires. The definition checker SHALL reject a handoff whose cited script does not exist, or which cites a script that does not reference the declared artifact path. A handoff that only declares a path without citing its enforcement point SHALL be rejected.

#### Scenario: A handoff citing a missing script is rejected

- **WHEN** the definition declares a handoff whose cited downstream script is absent from the repository
- **THEN** the build command exits non-zero with a stable error code
- **AND** no output file is produced

#### Scenario: A handoff citing a script that ignores the artifact is rejected

- **WHEN** the definition cites a script that exists but contains no reference to the declared artifact path
- **THEN** the build command exits non-zero with a stable error code
- **AND** no output file is produced


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Edge state distinguishes satisfied, blocked, and stale

Each edge SHALL carry exactly one of three states with a designer-readable reason. An edge is satisfied when the handed-off artifact exists. An edge is blocked when it does not exist. An edge is stale when the artifact exists but its modification time is later than the completion time of the downstream stage's most recent successful run, meaning the downstream output was produced from older input.

#### Scenario: An edge becomes stale after upstream changes

- **WHEN** the downstream stage completed successfully at a point in time
- **AND** the upstream artifact is modified after that point
- **THEN** the edge state is stale
- **AND** the reason states that the downstream output was built before the upstream change

##### Example: edge state by evidence

| Artifact exists | Upstream modified after downstream run | Edge state |
| --- | --- | --- |
| no | not applicable | blocked |
| yes | no | satisfied |
| yes | yes | stale |
| yes | downstream never ran | satisfied |


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Stage state separates produced files from verified results

Stage state SHALL distinguish an artifact existing on disk from an audit command having actually passed. A stage whose files exist but whose audit has not run or has not passed MUST NOT be presented as verified. The absence of an audit result SHALL render as not verified rather than as passing.

#### Scenario: Files present without an audit result

- **WHEN** a stage's declared output files exist
- **AND** no audit result is recorded for that stage
- **THEN** the stage reports its files as produced
- **AND** the stage reports its verification as not verified


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Execution progress is derived and never implies motion it cannot observe

The board SHALL read execution state from the durable run summaries the orchestrator already writes, and SHALL NOT display an animated or incrementing progress indicator, because the durable record does not change while an agent is running. When a run is recorded as in progress and the time since its last update exceeds that task's configured timeout plus a grace period, the board SHALL render it as possibly stopped and ask for human confirmation.

The count of checks that did not run SHALL be derived by subtracting the number of recorded verification results from the number of configured verification commands, because recording stops at the first failure.

#### Scenario: A stalled run is reported honestly

- **WHEN** a run summary reports an in-progress phase
- **AND** the elapsed time since its last update exceeds the configured timeout plus the grace period
- **THEN** the stage renders as possibly stopped with a prompt to confirm manually
- **AND** no progress indicator implying ongoing work is shown

##### Example: verification counts when recording stops early

- **GIVEN** a task configured with 3 verification commands
- **AND** a run summary containing 1 recorded result, which failed
- **WHEN** the board derives verification counts
- **THEN** it reports 0 passed, 1 failed, and 2 not run

#### Scenario: Missing run data does not break the board

- **WHEN** no run summary exists or the summary cannot be parsed
- **THEN** the execution section reports that no run data exists
- **AND** the remaining board content still renders
- **AND** the build command exits zero


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Pending decisions are read from a machine-readable review output

The design-system review generator SHALL provide a machine-readable output mode that emits its existing counts and its needs-review rows, without altering its existing HTML output. The board SHALL display each stage's pending decision count from that output rather than re-deriving it, so a single set of resolution rules governs both surfaces.

#### Scenario: The existing HTML output is unchanged

- **WHEN** the review generator runs in its existing HTML mode after the machine-readable mode is added
- **THEN** the produced HTML is byte-for-byte identical to the output before the change

#### Scenario: A stage shows how many decisions await the designer

- **WHEN** the machine-readable review output reports unresolved decisions for a stage
- **THEN** that stage displays the count of decisions awaiting the designer


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Board output is sanitized and contains no execution secrets

The generated board and the derived status object SHALL contain only stage identities, designer-readable titles, file paths inside the project, states, reasons, counts, runner identifiers and labels, and timestamps. They MUST NOT contain access codes, credential values, expanded runner arguments, raw prompts, raw agent output, or environment values.

#### Scenario: Run identity appears without run secrets

- **WHEN** the board renders a completed run that selected a runner
- **THEN** the runner identifier and label are shown
- **AND** no prompt, argument list, agent output, or environment value appears in the derived status object or the HTML


<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->

---
### Requirement: Path containment is enforced for every declared path

Every path in the pipeline definition SHALL resolve inside the project root after symbolic link resolution. An absolute path, a parent-directory escape, or a symlink escape SHALL cause the build command to exit non-zero with a stable error code and produce no output file.

#### Scenario: A path escaping the project root is rejected

- **WHEN** the definition declares a path that resolves outside the project root
- **THEN** the build command exits non-zero with a stable error code
- **AND** no output file is produced

<!-- @trace
source: add-pipeline-board
updated: 2026-08-03
code:
  - pipeline-board/references/pipeline-definition.md
  - pipeline-board/SKILL.md
  - design-system-extractor/scripts/generate_review_html.mjs
  - .spectra.yaml
  - pipeline-board/agents/openai.yaml
  - README.md
  - pipeline-board/scripts/render-pipeline-board.mjs
  - pipeline-board/scripts/build-pipeline-status.mjs
  - pipeline-board/assets/default-pipeline.json
  - pipeline-board/scripts/check-pipeline-board.mjs
-->