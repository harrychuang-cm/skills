## ADDED Requirements

### Requirement: Exported flow carrier freshness

With `--handoff-ready`, validate_prototype.py SHALL compare `docs/flow.json`, when the file exists, with a fresh export of the prototype flow source produced by the same document builder that export_flow.py uses. Validation SHALL fail when the two differ and SHALL name the flow source file and the export command in the error. Validation SHALL fail when `docs/flow.json` is not valid JSON. A prototype without `docs/flow.json` SHALL NOT be checked, and validation without `--handoff-ready` SHALL NOT report flow carrier freshness.

#### Scenario: Fresh export passes

- **WHEN** `docs/flow.json` was written by export_flow.py from the current flow source
- **THEN** the flow carrier check reports no error

#### Scenario: Stale carrier fails handoff-ready validation

- **WHEN** `validate_prototype.py --handoff-ready` runs against a prototype whose `docs/flow.json` lists a route id that the flow source no longer declares
- **THEN** validation exits non-zero
- **THEN** one error states that `docs/flow.json` is out of date and names the flow source file

#### Scenario: Unreadable carrier fails

- **WHEN** `docs/flow.json` is not valid JSON
- **THEN** the flow carrier check reports one error stating that the file is not valid JSON

#### Scenario: Missing carrier is not checked

- **WHEN** the prototype has no `docs/flow.json`
- **THEN** the flow carrier check reports nothing

#### Scenario: Drafts are not checked

- **WHEN** `validate_prototype.py` runs without `--handoff-ready` against a prototype whose `docs/flow.json` is stale
- **THEN** no flow carrier message is reported
