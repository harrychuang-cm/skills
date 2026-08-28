## ADDED Requirements

### Requirement: Handoff manifest generation

When every --handoff-ready check passes, validate_prototype.py SHALL write docs/HANDOFF_MANIFEST.json containing: manifestSchemaVersion (integer, starting at 1), feature name, generatedAt date, reviewStatus with status and confirmedOn, a docs object mapping each handoff document filename to its sha256 content hash, a flow object with routeIds, flowNodeIds, and transitionCount, a fixtures object with the fixture export names, a scopeDigest holding the sha256 of the Prototype To Frontend Map section text, and a changelog array of version, date, and summary entries. On regeneration the version SHALL increment and the summary SHALL come from a --changelog argument, defaulting to the literal text "regenerated" when the argument is absent.

#### Scenario: First successful handoff-ready run

- **WHEN** validate_prototype.py --handoff-ready passes for a prototype folder with no existing manifest
- **THEN** docs/HANDOFF_MANIFEST.json is created with manifestSchemaVersion 1 and a changelog containing exactly one entry with version 1

#### Scenario: Regeneration after a document edit

- **WHEN** a handoff document changes and validate_prototype.py --handoff-ready --changelog "tightened error states" passes again
- **THEN** the manifest is rewritten with updated hashes and a new changelog entry whose version is the previous version plus one and whose summary is "tightened error states"

### Requirement: Manifest drift verification

validate_prototype.py SHALL provide a --verify-manifest mode that recomputes the hash of every document listed in docs/HANDOFF_MANIFEST.json and compares it with the stored value. When every hash matches, the command SHALL exit with code 0. When any hash differs or a listed document is missing, the command SHALL list each drifted or missing filename and exit with a non-zero code.

#### Scenario: No drift

- **WHEN** --verify-manifest runs and every document hash matches the manifest
- **THEN** the command reports no drift and exits with code 0

#### Scenario: Drift after a post-confirmation edit

- **WHEN** PRD.md is edited after the manifest was generated and --verify-manifest runs
- **THEN** the output names PRD.md as drifted and the command exits with a non-zero code

### Requirement: Ingestion review status gate

The frontend-product-implementation handoff-ingestion reference and SKILL.md first actions SHALL require checking the PRODUCTION_HANDOFF Review Status before treating the handoff documents as an implementation brief. When the status is pending or the section is missing, the agent SHALL stop and ask the user whether the team demo confirmation happened, and SHALL NOT proceed with implementation until the user confirms.

#### Scenario: Pending review status

- **WHEN** the frontend-product-implementation pass reads a PRODUCTION_HANDOFF.md whose Review Status is pending
- **THEN** the agent stops and asks the user for confirmation instead of starting implementation

#### Scenario: Confirmed review status

- **WHEN** the Review Status section records status confirmed with a confirmation date
- **THEN** ingestion continues without an extra question about review state

### Requirement: Manifest consumption record

The frontend-product-implementation handoff-ingestion reference SHALL require recording, in the implementation map, the sha256 hash of the docs object of the consumed HANDOFF_MANIFEST.json, together with the manifest changelog version. When no manifest exists, the ingestion SHALL record that the handoff was consumed unversioned and list this as a traceability limitation in the final report.

#### Scenario: Manifest present at ingestion

- **WHEN** the handoff folder contains docs/HANDOFF_MANIFEST.json at ingestion time
- **THEN** the implementation map records the consumed docs hash and changelog version

#### Scenario: Manifest absent at ingestion

- **WHEN** the handoff folder contains no manifest
- **THEN** the implementation map records the handoff as unversioned and the final report lists the missing manifest as a traceability limitation
