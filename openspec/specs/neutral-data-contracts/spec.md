# neutral-data-contracts Specification

## Purpose

TBD - created by archiving change 'prototype-production-readiness'. Update Purpose after archive.

## Requirements

### Requirement: JSON Schema sections in DATA_SPEC

The DATA_SPEC.md template SHALL contain a Data Schemas (JSON Schema) section holding one fenced json code block per fixture group, describing the group's entity, request, response, and error shapes together with its state enumeration. The storybook-product-prototype data-contract reference SHALL require authoring these schema blocks whenever fixture groups are created or changed.

#### Scenario: Fixture group with schema block

- **WHEN** a prototype defines a fixture group for route content
- **THEN** DATA_SPEC.md contains a fenced json block for that group that parses as JSON and names its state enumeration values

---
### Requirement: Fixture JSON export

The storybook-product-prototype workflow SHALL require that every fixture group defined in the TypeScript fixture file is also authored as a JSON file at fixtures/<group>.json inside the prototype folder, containing the same deterministic data. Each JSON file SHALL parse as valid JSON.

#### Scenario: Fixture authored in both carriers

- **WHEN** the fixture file exports a routeContent fixture group
- **THEN** fixtures/routeContent.json exists in the prototype folder and parses as valid JSON

---
### Requirement: Structural fixture consistency validation

In --handoff-ready mode, validate_prototype.py SHALL check that every fixture export name in the TypeScript fixture file has a corresponding fixtures/<group>.json file and the reverse, that every fixtures/*.json file parses, and that every route id referenced inside a fixture JSON file exists in the flow metadata. A mismatch between the set of route ids referenced by the TypeScript fixtures and the set referenced by the JSON files SHALL be reported as a warning; a missing or unparseable JSON file, or an unknown route id, SHALL be reported as an error.

#### Scenario: Missing JSON counterpart

- **WHEN** the fixture file exports a quotes group and fixtures/quotes.json does not exist
- **THEN** --handoff-ready reports an error naming the quotes group

#### Scenario: Route id set difference

- **WHEN** the TypeScript fixtures reference route ids entry and settings while the JSON files reference only entry
- **THEN** --handoff-ready reports a warning listing settings as present only in the TypeScript carrier

##### Example: consistency verdicts

| Condition | Verdict |
| --------- | ------- |
| Export names match JSON files, ids valid | pass |
| fixtures/alerts.json is not valid JSON | error |
| JSON references route id unknown-route absent from flow | error |
| TS references one more route id than JSON | warning |
