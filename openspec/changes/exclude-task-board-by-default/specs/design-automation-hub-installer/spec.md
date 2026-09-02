## ADDED Requirements

### Requirement: Optional template modules partition the manifest inventory

`TEMPLATE_MANIFEST.json` SHALL support an optional per-file `module` field defaulting to `core`, and a top-level `modules` declaration that marks non-core modules as optional. The task-board dispatch module SHALL comprise exactly three template files: the dispatch orchestration module, the task-board binding loader, and the task-board client. The manifest generator SHALL assign module membership deterministically from a source-path mapping so that regeneration never silently reclassifies a file. Template validation MUST reject a file entry that references a module absent from the `modules` declaration, and a rejected manifest MUST prevent installation.

#### Scenario: Undeclared module reference is rejected

- **WHEN** a manifest file entry declares a `module` value that the top-level `modules` declaration does not contain
- **THEN** template validation fails with a stable issue code identifying the entry
- **AND** no installation proceeds from the rejected manifest

#### Scenario: Entries without a module field are core

- **WHEN** a manifest file entry omits the `module` field
- **THEN** the entry is treated as belonging to `core` and is installed in every installation

### Requirement: Default installation excludes the task-board dispatch module

A fresh installation invoked without module flags SHALL NOT copy any file belonging to the optional task-board dispatch module into the target project. The installer SHALL accept a `--with-task-board-dispatch` flag; when supplied, the module's files SHALL be installed, hashed, and verified exactly like every other managed entry, and the resulting dispatch behavior SHALL be identical to the pre-modularization installation.

#### Scenario: Default install omits dispatch files and passes check

- **WHEN** a project is installed without `--with-task-board-dispatch`
- **THEN** the installed Coordinator scripts directory contains no dispatch orchestration module, no task-board binding loader, and no task-board client
- **AND** an installed-project check run immediately after reports zero findings

#### Scenario: Flagged install carries the module in full

- **WHEN** a project is installed with `--with-task-board-dispatch`
- **THEN** all three module files are present with digests recorded in the receipt
- **AND** the installed-project check verifies them as managed entries

### Requirement: Receipt records the module selection and verification honors it

The install receipt SHALL record the set of modules installed. Installed-project verification SHALL derive the expected managed inventory from the module selection recorded in the receipt, and a module absent from that selection SHALL NOT produce drift or inventory findings. A receipt that predates module recording SHALL be treated as selecting all modules, so existing installations verify and update exactly as before. An update SHALL reuse the receipt's recorded selection: it SHALL NOT install files of an excluded module and SHALL NOT remove files of a module the receipt records as installed.

#### Scenario: Legacy receipt verifies as a full selection

- **WHEN** an installed-project check runs against a receipt without a module record in a project containing every managed file
- **THEN** the check passes with the same result as before module support existed

#### Scenario: Update preserves the exclusion

- **WHEN** an update runs in a project whose receipt records only the core module
- **THEN** no task-board dispatch file is created by the update
- **AND** a subsequent installed-project check reports zero findings

#### Scenario: Missing file of a selected module is still drift

- **WHEN** the receipt records the task-board dispatch module as installed and one of its files is deleted from the project
- **THEN** the installed-project check reports `managed-file-drift` for that file

##### Example: Selection-driven expected inventory

| Receipt module record | Dispatch files on disk | Check result |
|-----------------------|------------------------|--------------|
| absent (legacy receipt) | all present | pass |
| `core` only | none present | pass |
| `core` only | none present, update was run | pass, update added nothing |
| `core` + `task-board-dispatch` | one file deleted | `managed-file-drift` |
