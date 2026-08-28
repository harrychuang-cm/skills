# native-handoff-consumption Specification

## Purpose

TBD - created by archiving change 'native-skill-hardening'. Update Purpose after archive.

## Requirements

### Requirement: Cross-repository handoff access

The handoff ingestion reference SHALL cover obtaining the handoff when the native target lives in a different repository from the prototype, which is the normal case. It SHALL name the ways the docs and fixtures reach the native repo, require recording the source location and the consumed manifest digest with the copied material, and define the re-sync rule: a newer handoff is detected by the manifest verification mode and the fixtures are re-copied from the prototype rather than edited in place, because editing the copy destroys its value as the contract-test reference.

#### Scenario: Fixtures copied into an app bundle

- **WHEN** fixture JSON files are copied into the native app's resources
- **THEN** their source path and the consumed manifest digest are recorded alongside them

#### Scenario: Handoff updated after copying

- **WHEN** the prototype's handoff changes after the fixtures were copied
- **THEN** the drift is detected against the manifest and the fixtures are re-copied, not hand-patched in the app

---
### Requirement: Delegation resilience

Where the skill delegates a contract or a script to frontend-product-implementation by name, it SHALL state what happens when that sibling skill is not installed: the delegated rules are followed manually and the substitution is recorded in the final report. The delegated items SHALL be enumerated so a reader can tell what depends on the sibling being present.

#### Scenario: Native skill installed alone

- **WHEN** only the native skill is installed and the shared audit script is unavailable
- **THEN** the same four audit conditions are checked by hand and the final report records that the audit was manual

#### Scenario: Both skills installed

- **WHEN** the sibling skill is present
- **THEN** the delegated script runs and the report cites its result
