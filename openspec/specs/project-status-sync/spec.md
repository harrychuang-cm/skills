# project-status-sync Specification

## Purpose

TBD - created by archiving change 'add-project-status-sync'. Update Purpose after archive.

## Requirements

### Requirement: Worker produces evidence snapshots

For each advertised project, the worker SHALL produce a disk-evidence snapshot by invoking the pipeline-board status builder script from the configured skills checkout as a subprocess, and SHALL upload the resulting status JSON to the control plane. The worker SHALL NOT reimplement stage derivation and SHALL NOT modify pipeline-board scripts. When a project has no pipeline definition sidecar, the worker SHALL report the project as having no definition instead of failing the sync.

#### Scenario: Snapshot uploaded for a project with a pipeline definition

- **WHEN** the worker syncs a project whose root contains .pipeline-board/pipeline.json
- **THEN** the control plane receives a status snapshot containing the project's stages with their derived states, and the project page reflects those states

#### Scenario: Project without a pipeline definition

- **WHEN** the worker syncs a project whose root has no .pipeline-board/pipeline.json
- **THEN** the sync succeeds, the control plane records that the project has no definition, and the project page states that no pipeline definition exists

---
### Requirement: Worker reports external runs

The worker SHALL scan each advertised project's automation state directory for run summaries and report them to the control plane with sanitized fields only: run id, task id, phase, selected runner id, and timestamps. The worker SHALL NOT upload prompts, instructions, or any other summary content.

#### Scenario: Externally launched run becomes visible

- **WHEN** a run summary exists in a project's state directory for a run that was launched outside the board
- **THEN** after the next sync the run appears in the project's external activity list with its task id, phase, and timestamps

---
### Requirement: Control plane deduplicates reported runs

The control plane SHALL ignore reported runs whose run id already exists among board-initiated run records, and SHALL upsert the remainder as external runs keyed by run id, so repeated syncs never create duplicates.

#### Scenario: Board-initiated run is not shown as external

- **WHEN** the worker reports a run whose run id matches a run already recorded through board-initiated execution
- **THEN** the control plane ignores it and the external activity list does not show it

#### Scenario: Repeated sync is idempotent

- **WHEN** the worker reports the same external run in two consecutive syncs, the second time with an updated phase
- **THEN** exactly one external run record exists for that run id and it shows the updated phase

---
### Requirement: Sync cadence

The worker SHALL sync each advertised project at three moments: upon successful registration, on a fixed interval (configurable, default 10 minutes), and after each board-initiated execution finishes. Sync failures SHALL NOT interrupt polling or execution.

#### Scenario: Onboarding an existing project shows its state immediately

- **WHEN** a worker registers a project that already has produced artifacts and historical run summaries
- **THEN** after registration completes, the project page shows the evidence-derived stage states and the historical runs as external activity, without any card having been created

#### Scenario: Sync failure does not break the worker

- **WHEN** a snapshot subprocess fails or the control plane rejects a sync upload
- **THEN** the worker logs the failure locally and continues polling and executing normally

---
### Requirement: Project status page

The board SHALL provide a per-project page showing the latest snapshot's stage overview (stage title and derived state for each stage, with the snapshot's generation time) and the external activity list ordered by most recent first. The page SHALL update via the same server-sent refresh mechanism as the board without a page reload. External runs SHALL be read-only: the page SHALL NOT offer rerun or any command on them.

#### Scenario: Stage overview reflects disk evidence

- **WHEN** a member opens the project page after a snapshot reports stage extract-design-system as verified and stage build-storybook-foundation as produced
- **THEN** the page shows both stages with those states and the snapshot timestamp

#### Scenario: External activity is read-only

- **WHEN** a member views an external run entry
- **THEN** no rerun, approve, or undo action is offered on it
