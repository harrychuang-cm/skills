# neutral-data-contracts Specification

## Purpose

TBD - created by archiving change 'prototype-production-readiness'. Update Purpose after archive.

## Requirements

### Requirement: JSON Schema sections in DATA_SPEC

The DATA_SPEC.md template SHALL contain a Data Schemas (JSON Schema) section holding one fenced JSON code block per fixture group, describing the UI entity and state enumeration or the source-backed transport shape identified by Data Authority. The data-contract reference SHALL require authoring schema blocks whenever fixture groups change. UI schemas SHALL generate UI and mock types only; request, response and error DTOs SHALL require confirmed transport evidence. Fake sample values SHALL NOT determine a backend schema.

#### Scenario: Fixture group with schema block
- **WHEN** a prototype defines a fixture group for route content
- **THEN** DATA_SPEC SHALL contain a parseable JSON schema for that group with its state enumeration and Data Authority classification

#### Scenario: Fake values under confirmed transport schema
- **WHEN** fixture values are fake and their transport schema has confirmed source evidence
- **THEN** receivers SHALL use the confirmed schema for transport types while retaining fake classification for the fixture values


<!-- @trace
source: clarify-prototype-handoff-authority
updated: 2026-09-22
code:
  - .agents/skills/spectra-debug/SKILL.md
  - platform-parity-handoff/references/project-profile.md
  - platform-parity-handoff/scripts/list_string_keys.py
  - .agents/skills/spectra-archive/SKILL.md
  - .agents/skills/spectra-discuss/SKILL.md
  - platform-parity-handoff/references/audit-checklist.md
  - .agents/skills/spectra-review/SKILL.md
  - .agents/skills/spectra-analyze/SKILL.md
  - .agents/skills/spectra-ask/SKILL.md
  - .agents/skills/spectra-commit/SKILL.md
  - docs/skills-guide.html
  - presentation-review/references/rules.md
  - .agents/skills/spectra-apply/SKILL.md
  - .agents/skills/spectra-ingest/SKILL.md
  - presentation-review/SKILL.md
  - AGENTS.md
  - platform-parity-handoff/templates/audit-report.md
  - platform-parity-handoff/templates/media-index.json
  - docs/skills-usage.md
  - presentation-review/references/examples.md
  - presentation-review/references/review-report-template.md
  - platform-parity-handoff/agents/openai.yaml
  - platform-parity-handoff/scripts/find_config_event_keys.py
  - platform-parity-handoff/templates/handoff-manifest.md
  - platform-parity-handoff/assets/profile.example.json
  - .agents/skills/spectra-propose/SKILL.md
  - platform-parity-handoff/references/manifest-chapters.md
  - presentation-review/agents/openai.yaml
  - platform-parity-handoff/SKILL.md
  - platform-parity-handoff/references/scripts.md
  - platform-parity-handoff/scripts/_common.py
  - platform-parity-handoff/scripts/hash_assets.py
  - scripts/skill-dependencies.json
  - CLAUDE.md
  - docs/designer-guide-storybook-to-production.html
  - .agents/skills/spectra-verify/SKILL.md
  - .cursorrules
  - .agents/skills/spectra-audit/SKILL.md
  - .agents/skills/spectra-drift/SKILL.md
  - platform-parity-handoff/scripts/classify_diff.py
  - README.md
  - platform-parity-handoff/scripts/cross_check_string_mapping.py
-->

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