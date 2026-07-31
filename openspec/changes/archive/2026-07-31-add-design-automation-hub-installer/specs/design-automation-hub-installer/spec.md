## ADDED Requirements

### Requirement: Installer preflight resolves an exact safe target and dry-run performs zero writes

The installer SHALL require an absolute project root and an explicit host mode. It MUST reject the filesystem root, the current user's home directory, a missing directory, a non-directory, a symlink-resolved target outside the supplied project root, unknown flags, and incompatible option combinations before creating any file or directory. The installer SHALL inspect the target's applicable instruction files and existing automation configuration before building a complete install plan.

A `--dry-run --json` invocation SHALL return the same planned installed, updated, merged, unchanged, conflict, manifest, and manual-action entries that a real invocation would evaluate. Dry-run MUST NOT create staging directories, backups, receipts, config files, runtime files, or any other filesystem change.

#### Scenario: Dry-run plans a clean standalone install

- **WHEN** the installer receives an absolute empty temporary project root, `--host-mode standalone`, `--dry-run`, and `--json`
- **THEN** it exits zero with result `planned`
- **AND** it lists the Plugin manifest, portable Coordinator, companion skill mirrors, generic dependency mirrors, config merge, and manual Figma import action
- **AND** the target filesystem remains byte-for-byte unchanged

#### Scenario: Home directory is rejected

- **WHEN** the supplied project root resolves to the current user's home directory
- **THEN** the installer exits non-zero with `unsafe-project-root`
- **AND** it performs zero writes

### Requirement: Versioned manifest defines a complete and contained template inventory

The installer package SHALL contain `TEMPLATE_MANIFEST.json` with schema version 1, a semantic `templateVersion`, a `minimumAgentAutomationVersion`, a `files` array, and a `manualActions` array. Every file entry SHALL contain one template-relative source, one project-relative target, a lowercase SHA-256 digest, and exactly one ownership value from `managed`, `merge`, or `generated`. The Figma import handoff SHALL be represented as a `manual` action rather than a managed file.

The template checker MUST reject duplicate source or target entries, absolute paths, empty paths, `..` traversal, symlink escape, unknown ownership, malformed digest, listed-but-missing files, unlisted template files, hash mismatch, and an unsupported manifest schema. A rejected manifest MUST prevent installation.

#### Scenario: Traversing target path is rejected

- **WHEN** a manifest entry targets `../outside/main.js`
- **THEN** template validation fails with `unsafe-template-target`
- **AND** no target project is modified

#### Scenario: Complete version 1 inventory validates

- **WHEN** every regular template file is listed exactly once with its actual digest and a contained target
- **THEN** template validation returns `valid`
- **AND** it reports the manifest template version and file count

### Requirement: Generic orchestrator dependency comes from the existing canonical sibling source

The installer SHALL treat top-level `agent-automation-orchestrate` in the same complete `cm-skills` checkout as the only canonical generic runtime source. It SHALL resolve that checkout from one unambiguous ancestor containing both skill roots or from explicit absolute `--skills-source-root`. It SHALL install byte-identical project-local mirrors under `.agents/skills`, `.claude/skills`, and `.cursor/skills`. The Design Automation Hub template MUST NOT contain a vendored or renamed copy of the generic skill and MUST NOT create a skill named `figma-automation-orchestrate`.

Before target writes, the installer SHALL verify the sibling source's `SKILL.md`, runtime scripts, and self-check contract. Missing or invalid canonical source SHALL fail with `missing-agent-automation-source` or `invalid-agent-automation-source` and SHALL provide a remediation that uses a complete `cm-skills` checkout.

#### Scenario: Complete source installs three mirrors

- **WHEN** installation runs from a complete `cm-skills` checkout whose generic skill self-check passes
- **THEN** all three target skill surfaces contain byte-identical `agent-automation-orchestrate` files
- **AND** the installed Coordinator runtime points to the project-local `.agents` runtime script

#### Scenario: Isolated installer copy has no sibling source

- **WHEN** the installer package is copied without the top-level canonical generic skill
- **THEN** preflight fails with `missing-agent-automation-source`
- **AND** no template or config file is written to the target

#### Scenario: Explicit source root resolves an isolated installer

- **WHEN** an isolated installer is given an absolute `--skills-source-root` containing one valid canonical generic skill
- **THEN** dependency preflight uses that source and reports its resolved root
- **AND** it does not search the network or another checkout

### Requirement: Managed installation and update preserve local work and remain recoverable

A clean install SHALL write only manifest-listed managed or generated targets plus approved merge changes and SHALL create `.design-automation/install.json` only after every validation and write succeeds. The receipt SHALL record template version, installed managed hashes, and every managed merge fragment's id, target, and normalized hash without secrets. Reinstalling the same version over unchanged files SHALL be idempotent and SHALL report those files and fragments as `unchanged`.

An update SHALL overwrite a managed target only when its current digest equals the digest recorded by the prior receipt or when the operator explicitly supplies `--force-managed`. A locally modified managed file SHALL produce `locally-modified-managed-file` by default. `--force-managed` MUST affect only manifest-listed managed targets and MUST NOT replace merge-owned unknown content.

The installer SHALL stage all planned files inside the project root. If commit fails after any target changes, it MUST restore every preexisting touched file, remove every file newly created by that failed attempt, leave the previous receipt unchanged, and return a recoverable failure record.

#### Scenario: Identical reinstall is idempotent

- **WHEN** the same template version is installed twice without target edits
- **THEN** the second run reports no installed, updated, or merged changes
- **AND** every managed target and receipt remains byte-identical

##### Example: Reinstall version 1.0.0

- **GIVEN** receipt version `1.0.0` records managed digest `sha256-managed-a` and fragment digest `sha256-fragment-a`
- **WHEN** version `1.0.0` with the same two digests is installed again
- **THEN** installed, updated, and merged are empty and unchanged contains both managed and fragment entries

#### Scenario: Local managed edit blocks update

- **WHEN** a developer edits the installed Plugin UI after version 1.0.0 and then runs update to 1.1.0 without `--force-managed`
- **THEN** update exits non-zero with `locally-modified-managed-file`
- **AND** neither that UI file nor any other planned target is changed

#### Scenario: Mid-commit failure rolls back the attempt

- **WHEN** a fixture injects a write failure after two managed files were committed
- **THEN** both touched files return to their exact pre-run bytes
- **AND** new files from the failed attempt are absent
- **AND** the prior receipt remains unchanged

##### Example: Failure on third managed file

- **GIVEN** `main.js` contains bytes A, `ui.html` contains bytes B, and receipt version is `1.0.0`
- **WHEN** update writes two replacements and the third managed write raises `EIO`
- **THEN** `main.js` is A, `ui.html` is B, and the receipt still reports `1.0.0`

### Requirement: Agent automation task merge is additive, validated, and bootstrap-aware

The installer SHALL merge exactly one `figma-cleanup` task into a schema version 1 `.agent-automation/config.json`. It MUST preserve the existing state directory, runner objects and order, unrelated tasks, and unknown non-conflicting content accepted by the existing validator. The merged task SHALL set `skill` to `figma-design-automation`, SHALL use the installed deterministic cleanup-result checker as verification, and SHALL keep `requiredArtifacts` as an empty array because the result path is task-scoped.

If the config is absent, the installer SHALL return `needs-agent-automation-bootstrap` without claiming completion. The installer skill SHALL then use the existing generic bootstrap or guide workflow to create a valid runner contract from repository evidence before repeating the merge. An existing `figma-cleanup` task SHALL be unchanged only when its normalized value equals the current template fragment or the prior receipt fragment hash; every other value SHALL fail with `conflicting-figma-cleanup-task` and MUST NOT be overwritten by `--force-managed`. Every merged config MUST pass the existing `validate-project-config.mjs` before commit.

#### Scenario: Existing runners and tasks survive merge

- **WHEN** a valid project contract contains ordered runners `claude` then `codex` and task `implement`
- **THEN** installation preserves both runners in the same order and preserves `implement`
- **AND** it adds one valid `figma-cleanup` task naming `figma-design-automation`

##### Example: Additive task keys

| Before tasks | After tasks | Runner order |
| --- | --- | --- |
| `implement` | `implement`, `figma-cleanup` | `claude`, `codex` |

#### Scenario: Missing config requests bootstrap

- **WHEN** the target has no `.agent-automation/config.json`
- **THEN** the script returns result `needs-bootstrap` with code `needs-agent-automation-bootstrap`
- **AND** it does not invent runner commands or credentials
- **AND** the installer skill routes the next step through the generic bootstrap or guide contract

#### Scenario: Conflicting cleanup task is preserved

- **WHEN** the target contains a `figma-cleanup` task with a different skill or verification command
- **THEN** installation fails with `conflicting-figma-cleanup-task`
- **AND** the existing config remains byte-identical

### Requirement: Project identity is explicit, non-secret, and never inferred from repository names

Initial installation SHALL require either explicit `--project-id`, `--project-name`, and at least one `--figma-file-key`, or one project-relative `--project-profile` file containing the equivalent schema version 1 values. The installer MUST NOT infer project identity or Figma file keys from a directory name, Git remote, package name, Figma file name, node name, or Plugin data. Missing values SHALL return result `needs-profile` with `needs-project-profile` before any write.

Project profile validation MUST reject empty identity, duplicate file keys, one file key mapped to multiple project ids, unknown schema, path escape, and credential-like keys or values. It SHALL preserve unknown non-conflicting safe fields during update.

#### Scenario: Explicit profile values generate one project binding

- **WHEN** install receives project id `aurora`, project name `Project Aurora`, and file keys `file-a` and `file-b`
- **THEN** the generated profile contains exactly that identity and both keys
- **AND** no value is derived from the target folder or Git remote

#### Scenario: Missing file key requests profile setup

- **WHEN** initial install has project id and name but no Figma file key or profile file
- **THEN** it returns `needs-project-profile` with result `needs-profile`
- **AND** the target remains unchanged

### Requirement: Portable Coordinator exposes only features supported by its host mode

The installed runtime SHALL provide one Coordinator core for authenticated plugin context, durable cleanup tasks, generic-agent delegation, plan validation, workflow status, and session authentication. In `standalone` mode, cleanup and workflow status SHALL be enabled and review MUST be false; the runtime MUST NOT create, imitate, or report an extraction queue.

In `compatible` mode, the supplied project-relative host module SHALL export `designAutomationHubHostAdapter` with `contractVersion: 1`, `resolveProject(context)`, and `resolveMember(context)`. Review SHALL be enabled only when its `review` object provides `listPendingReviews(context)`, `submitReviewDecision(context, decision)`, and `getWorkflowOverview(context)`, and a no-write fixture smoke check passes. An absent review object SHALL force review false. A partial review method group, failed smoke check, unsupported host contract version, or missing required base method SHALL fail preflight with zero writes.

#### Scenario: Standalone project receives two real features

- **WHEN** a project installs with `--host-mode standalone`
- **THEN** authenticated plugin context enables cleanup and workflow status
- **AND** review is false
- **AND** no extraction queue endpoint or state is created

#### Scenario: Complete compatible review adapter enables review

- **WHEN** a version-compatible host implements project resolution, member resolution, pending review, decision submission, and workflow overview
- **THEN** installed context can enable all three Plugin entries according to member permission
- **AND** the portable core uses the host's durable review truth rather than copying it

##### Example: Contract version 1 review descriptor

- **GIVEN** `contractVersion: 1`, base methods `resolveProject` and `resolveMember`, and review methods `listPendingReviews`, `submitReviewDecision`, and `getWorkflowOverview`
- **WHEN** the no-write adapter smoke check succeeds for project `aurora`
- **THEN** authenticated context can return `review: true` and no review record is copied into portable storage

#### Scenario: Partial review adapter cannot expose review

- **WHEN** the host implements pending review but omits decision submission
- **THEN** compatible-mode preflight fails with `incomplete-review-adapter`
- **AND** the target remains unchanged

### Requirement: Installer output is sanitized and preserves manual Figma import as an explicit handoff

With `--json`, installer and checker commands SHALL emit one JSON object containing schema version, mode, result, absolute project root, template version, host mode, installed, updated, merged, unchanged and conflict summaries, stable issues, absolute Plugin manifest path, manual actions, and next actions. Every non-success or setup-required result SHALL include at least one stable issue code. The output MUST NOT include session codes, bearer or provider credentials, expanded runner arguments, raw prompts, raw AI output, or environment values.

A successful filesystem install SHALL include manual action `import-figma-manifest` with `completed: false`. The installer MUST NOT claim that Figma Desktop imported the Plugin and MUST NOT automate the Figma GUI. Fixed Plugin identity and copy SHALL use `Design Automation Hub` and MUST NOT contain a project name; authenticated Coordinator context SHALL provide the project display name.

#### Scenario: Successful install reports one honest manual action

- **WHEN** all standalone filesystem installation checks pass
- **THEN** result is `installed` and `manifestPath` is an absolute existing file
- **AND** manual actions contain `import-figma-manifest` with `completed: false`
- **AND** no field claims that the Plugin is installed in Figma Desktop

#### Scenario: Output contains no runtime secrets

- **WHEN** process environment contains session and provider credentials during install
- **THEN** serialized JSON contains none of their names' values, raw commands, prompts, or AI output

##### Example: Literal secret values are absent

- **GIVEN** environment values `session-secret-42` and `provider-secret-99`
- **WHEN** install emits its JSON result
- **THEN** neither literal value occurs in the serialized output

### Requirement: Template, installed-project, source-sync, and smoke checks prove distribution health

The package SHALL provide one deterministic checker with template-only, installed-project, and optional source-sync modes. Template-only mode SHALL validate inventory, hashes, ownership, project-neutral copy, Figma ES2018 main-thread compatibility, skill metadata, and absence of a duplicated generic source. Installed-project mode SHALL validate receipt parity, managed hashes, config merge, project profile, three skill mirrors, runtime containment, host-mode capability projection, and the absolute manifest handoff. Source-sync mode SHALL compare only a declared portable inventory against the product source and MUST NOT require the product repo for normal installation.

A standalone smoke fixture SHALL use fake generic runners to prove unavailable-runner fallback, task-scoped result verification, durable `plan-ready`, and zero Figma mutation before Plugin confirmation. Checker failure SHALL use a non-zero exit and stable issue codes.

#### Scenario: Installed-project check detects mirror drift

- **WHEN** one byte in the Cursor `figma-design-automation` mirror differs from the template and other mirrors
- **THEN** installed-project check fails with `skill-mirror-drift`
- **AND** it identifies the relative target without printing file contents

#### Scenario: Source-sync compares declared portable files only

- **WHEN** the product repo contains unrelated Storybook and report artifacts in addition to the declared Hub sources
- **THEN** source-sync ignores the unrelated artifacts
- **AND** it fails only when a declared portable source contract or digest differs

##### Example: Three declared and two unrelated files

- **GIVEN** the portable inventory declares Plugin main, Plugin UI, and Coordinator core while the product repo also contains `storybook-static/index.html` and `design-system/report.json`
- **WHEN** all three declared digests match
- **THEN** compared file count is 3, ignored unrelated count is 2, and source-sync passes

#### Scenario: Fake runner fallback reaches a validated plan

- **WHEN** the first fake runner is unavailable and the second writes a valid task-scoped cleanup result
- **THEN** the generic run reaches `completed`
- **AND** the durable automation task reaches `plan-ready`
- **AND** the Figma document mutation count remains zero
