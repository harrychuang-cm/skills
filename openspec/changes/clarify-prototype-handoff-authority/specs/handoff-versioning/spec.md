## MODIFIED Requirements

### Requirement: Handoff manifest generation

After all handoff-ready checks pass, validate_prototype.py SHALL write HANDOFF_MANIFEST.json with manifestSchemaVersion 2, feature, generatedAt, reviewStatus, per-document docs hashes, docsDigest, flow routeIds/flowNodeIds/transitionCount, fixture export names, scopeDigest, and versioned changelog entries. It SHALL additionally record artifacts hashes keyed by prototype-relative paths and artifactsDigest, covering required docs, selected Flow/Data/Meta files, fixture JSON files, and existing flow.json and TOKENS.json exports, excluding the manifest itself. Regeneration SHALL increment the changelog version and use --changelog or regenerated as the summary.

#### Scenario: First successful handoff-ready run
- **WHEN** a fully reviewed handoff passes validation with no prior manifest
- **THEN** a version 2 manifest SHALL be written with changelog version 1 and all artifact hashes

#### Scenario: Regeneration after a document edit
- **WHEN** a changed handoff passes renewed review and handoff-ready with a changelog summary
- **THEN** both digests SHALL reflect the current artifacts and the changelog SHALL increment with that summary

### Requirement: Manifest drift verification

The --verify-manifest command SHALL compare current artifacts and their file set with the recorded snapshot. Missing, added or changed covered artifacts SHALL be named and return non-zero. Version 1 manifests SHALL be reported as lacking carrier integrity coverage and SHALL require republication for complete verification.

#### Scenario: No drift
- **WHEN** all version 2 artifact contents and paths match
- **THEN** verification SHALL exit zero

#### Scenario: Carrier-only changes
- **WHEN** a fixture value or transition destination changes without editing docs or changing route ids or transition count
- **THEN** verification SHALL name the carrier and exit non-zero

#### Scenario: Added or removed fixture
- **WHEN** a fixture file is added or removed after publication
- **THEN** verification SHALL report the changed artifact set and exit non-zero

### Requirement: Manifest consumption record

Frontend and native receivers SHALL record the consumed docsDigest, artifactsDigest when present, and latest changelog version. They SHALL check reachable source integrity at ingestion and before completion, compare consumed digests with republished snapshots, and surface affected work on drift. An absent or legacy manifest SHALL be recorded as incomplete provenance without upgrading data authority.

#### Scenario: Manifest present at ingestion
- **WHEN** a version 2 manifest accompanies the handoff
- **THEN** both digests and the version SHALL be recorded and checked against the source

#### Scenario: Manifest absent at ingestion
- **WHEN** the handoff has no manifest
- **THEN** the receiver SHALL record unversioned and report the missing integrity evidence
