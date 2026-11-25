## Purpose

Define how the storybook-code-layer skill installs, checks, updates and removes Code Layer in a Storybook project, how the project binding is derived and confirmed, and how the skill itself is packaged and registered in this repository. The installer never overwrites work it does not own and never leaves a project half-changed.

## ADDED Requirements

### Requirement: Template manifest

The skill SHALL ship a manifest that lists every template file with its SHA-256 and size, and the template version. The manifest SHALL be built deterministically, so rebuilding an unchanged template yields identical bytes. Every installer mode SHALL refuse to run when the manifest is missing or does not match the template files.

#### Scenario: A stale manifest stops the installer

- **WHEN** a template file was edited and the manifest was not rebuilt
- **THEN** every installer mode exits with a failure status, names the manifest, and writes nothing

### Requirement: Command-line contract

The installer SHALL accept the Storybook project root and one mode: install (the default), check, update or uninstall. A dry-run flag SHALL be accepted with every mode that writes and SHALL produce the same plan while writing nothing. Unknown flags and incompatible flag combinations SHALL be rejected before any work is done. A JSON output flag SHALL print one object with a stable result code, the planned or performed actions, and issues with stable codes; the human-readable output SHALL carry the same information. The exit status SHALL be zero only when the mode completed without conflict or failure.

#### Scenario: A mistyped flag does nothing

- **WHEN** the installer is run with a flag it does not know
- **THEN** it exits with a failure status, names the flag, and writes nothing

#### Scenario: Dry run equals the real plan

- **WHEN** an update is run as a dry run and then for real on the same project
- **THEN** the dry run lists exactly the files the real run writes or deletes, and the dry run itself changes no file's content or modification time

### Requirement: Platform prerequisites

Before planning any write the installer SHALL verify that the target is a Storybook project using a Vite-based framework, that its main and preview configuration do not use CSF factories, that the project binding is valid for the template being installed, that every path the binding refers to exists, and that the state directory lies outside the Storybook project root. A failed prerequisite SHALL stop the run with zero writes and a message that says what to change.

#### Scenario: A state directory inside the project is refused

- **WHEN** the binding places the state directory inside the Storybook project root
- **THEN** the installer refuses, explains that journals and backups would be served by the dev server, and writes nothing

### Requirement: Install

Install SHALL copy the template files into the project's Storybook configuration directory, keep an existing project binding untouched, add the preset as one element at the end of the main configuration's addons array, add the install directory to the project's TypeScript exclude list when the project's include list covers it, and write a receipt. The preset SHALL be wired after all template files exist, and the receipt SHALL be written last. The receipt SHALL record the template version, the hash of every installed file, and exactly which wiring edits the installer made, as distinct from wiring it found already present. Running install again on an unchanged installation SHALL write nothing. Install SHALL NOT create a binding by itself: when none exists and none is supplied, it SHALL refuse and point to binding derivation.

#### Scenario: Install on a clean project

- **WHEN** install runs on a project without Code Layer and with a supplied binding
- **THEN** the template files, the binding, the two wiring edits and the receipt exist, and the main configuration differs from before by the one added array element

#### Scenario: A second install is a no-op

- **WHEN** install runs twice in a row
- **THEN** the second run reports that everything is current and no file's content or modification time changes

### Requirement: Check

Check SHALL be read-only and SHALL report whether every template file is present and identical to the manifest, whether the receipt matches the installation, whether the binding is valid and its paths exist, and whether the wiring is in place. Editing the project-owned binding SHALL NOT make check fail as long as the binding stays valid.

#### Scenario: Check after a legitimate binding edit

- **WHEN** a person adds a check command to the binding and runs check
- **THEN** check reports the installation as complete

### Requirement: Update

Update SHALL decide per managed file from three hashes — the new template's, the receipt's and the file's current one — and SHALL write nothing at all when any file is in conflict. A file a person modified SHALL be a conflict unless the person passes the explicit force flag for managed files, which SHALL be accepted only together with update or uninstall. Update SHALL validate the existing binding against the new template before any write and SHALL never write the binding. Update SHALL refuse to install an older template over a newer installation, and SHALL refuse to run while the Code Layer write lock is held or its journal needs recovery. An installation that has no receipt and whose files are identical to a template version SHALL be adopted and then updated. After a successful update the installer SHALL say that Storybook must be restarted.

#### Scenario: Per-file decisions

- **WHEN** update plans its actions
- **THEN** each managed file gets the action in the table below

##### Example: three-way decision

| Current file | Compared with receipt | Compared with new template | Action |
| --- | --- | --- | --- |
| missing | — | — | install |
| present | any | identical | unchanged |
| present | identical | different | update |
| present | different | different | conflict: locally modified |
| present | no receipt entry | different | conflict: unmanaged file in the way |
| present, no longer in the template | identical | — | delete |
| present, no longer in the template | different | — | conflict: locally modified |
| present, never in any manifest | — | — | keep and warn |

#### Scenario: One conflict blocks everything

- **WHEN** one managed file was modified locally and forty others are merely outdated
- **THEN** update reports the conflict and none of the forty-one files changes

#### Scenario: A proof-phase installation is adopted

- **WHEN** update runs on an installation made by the development sync, without a receipt, whose files equal the previous template version
- **THEN** update treats those files as managed, updates them, and writes a receipt

### Requirement: Uninstall

Uninstall SHALL require a receipt. It SHALL remove the preset element from the addons array and SHALL remove an import or a TypeScript exclude entry only when the receipt records that the installer added it. It SHALL delete managed files that are identical to the receipt, treat modified managed files as conflicts under the same rule as update, and leave unknown files in place. It SHALL keep the project binding and the state directory with its journal and backups. The receipt SHALL be deleted last, and the install directory SHALL be removed only when it is empty. Uninstall SHALL refuse to run while the write lock is held.

#### Scenario: Uninstall returns the wiring to what the project had

- **WHEN** Code Layer was installed into a project whose TypeScript configuration already excluded the install directory, and is then uninstalled
- **THEN** the preset element is gone from the addons array and the pre-existing exclude entry is still there

#### Scenario: History survives uninstall

- **WHEN** uninstall completes
- **THEN** the project binding and the state directory are unchanged

### Requirement: Atomic installer runs

A run that writes SHALL stage its changes and SHALL restore every file it touched and remove every file it created when any step fails, so a failed run leaves the project as it was. Deletions SHALL be confined to the install directory, which SHALL NOT be a symbolic link.

#### Scenario: A failure midway is rolled back

- **WHEN** an update fails after half of its files were written
- **THEN** every file has its content from before the run and the receipt is unchanged

### Requirement: Binding derivation

The skill SHALL provide a read-only derivation that inspects a Storybook project and proposes a binding together with the evidence for each value: the token prefix from the token files, the tier files from the entry file's imports in order, the component roots from the story globs, the class prefixes from the project configuration, candidate check commands from the project's scripts, and a component specification directory when one exists beside the token source. Values that the evidence does not settle — which token directory is the source of truth and which the mirror, the workspace root, the state directory, and check commands outside the project — SHALL be listed as needing confirmation instead of being guessed. A separate write step SHALL validate the confirmed binding, SHALL refuse to overwrite an existing binding, and SHALL be the only way the skill creates one. Derivation SHALL NOT start any agent process or any network request.

#### Scenario: Ambiguity is surfaced, not resolved silently

- **WHEN** a project has token files both inside and outside the Storybook root with identical content
- **THEN** the proposal lists the source-of-truth question as needing confirmation and names both directories

#### Scenario: An existing binding is never replaced

- **WHEN** the write step is run and the project already has a binding
- **THEN** it refuses and the existing binding is unchanged

### Requirement: The shared installer discovers storybook-code-layer

The skill folder SHALL contain a skill definition whose frontmatter name equals the folder name and whose description is non-empty, and agent interface metadata whose default prompt invokes `$storybook-code-layer`. The repository's shared skill installer SHALL list the skill for each supported agent, and installing the skill SHALL NOT change the installation of any other skill. The installer scripts SHALL work from an installed copy of the skill in any location. The repository's skill overview, usage guide and visual guide SHALL each describe the skill.

#### Scenario: The shared installer lists the skill

- **WHEN** the shared installer is run as a dry run for all agents selecting this skill
- **THEN** it lists one destination per supported agent and exits successfully

#### Scenario: The installer works from an installed copy

- **WHEN** the skill folder is copied to another directory and its installer is run from there in check mode
- **THEN** it reads the template next to its own location and reports the same result as from the repository
