# flow-codegen Specification

## Purpose

TBD - created by archiving change 'prototype-production-family'. Update Purpose after archive.

## Requirements

### Requirement: Flow JSON export

The standard-library export_flow.py script SHALL parse *PrototypeFlow.ts with existing validation helpers and write docs/flow.json with flowSchemaVersion 1, feature, routes, nodes and transitions. Routes SHALL preserve id, title, navigationId and declared component, description, params, deepLink and viewport. Nodes SHALL preserve id, title, shape and declared tone and description. Transitions SHALL preserve from, to, trigger, label and declared kind, presentation, backBehavior, motion and motionRef. Declared top-level viewport SHALL be retained and absent viewport SHALL remain omitted. Layout-only flowPosition, sourceAnchor and flowLine SHALL be excluded. Missing flow files or routes SHALL produce a named error and non-zero exit. Skeleton comments SHALL preserve motion intent and keep unspecified navigation unasserted.

#### Scenario: Export strips layout fields
- **WHEN** flow metadata contains layout fields alongside motion custom and a motionRef
- **THEN** JSON SHALL preserve motion and motionRef and omit the three layout-only fields

#### Scenario: Missing flow file
- **WHEN** no *PrototypeFlow.ts exists
- **THEN** the command SHALL name the expected pattern and exit non-zero

#### Scenario: Viewport included for declaring flows and omitted for legacy flows
- **WHEN** one flow declares desktop 1280 by 800 and another declares no viewport
- **THEN** only the first export SHALL contain that top-level viewport and both SHALL keep flowSchemaVersion 1


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
### Requirement: Swift navigation skeleton generation

With --swift <path>, the script SHALL generate a Swift file containing an enum named after the feature with a Route suffix, conforming to Hashable, with one case per route: kebab-case route ids become camelCase case names, and declared params become associated values using the type mapping string to String, number to Double, boolean to Bool, and any other type to String. The file SHALL carry a generated-by header naming the regeneration command, a deep-link table comment for routes that declare deepLink, and a navigation scaffold comment grouping transitions by their presentation value (push, sheet, fullscreen, modal, replace).

#### Scenario: Route with parameters

- **WHEN** the flow declares route alert-detail with params name alertId type string
- **THEN** the Swift output contains a case named alertDetail with an associated value alertId of type String

##### Example: case naming and typing

| Route id | params | Swift case |
| -------- | ------ | ---------- |
| price-watch | none | case priceWatch |
| alert-detail | alertId: string | case alertDetail(alertId: String) |
| history | days: number | case history(days: Double) |

---
### Requirement: Kotlin navigation skeleton generation

With --kotlin <path>, the script SHALL generate a Kotlin file containing a sealed class named after the feature with a Route suffix: routes without params become objects, routes with params become data classes using the same type mapping (string to String, number to Double, boolean to Boolean, other to String), each carrying a route pattern string derived from the route id and params for NavHost registration, with deepLink patterns preserved where declared and a NavHost scaffold comment grouping transitions by presentation.

#### Scenario: Sealed class output

- **WHEN** the flow declares routes price-watch and alert-detail (alertId param)
- **THEN** the Kotlin output contains a sealed class with an object for PriceWatch and a data class AlertDetail with alertId of type String and a route pattern containing the alertId placeholder

---
### Requirement: Codegen regression coverage

test_scaffold_validate.py SHALL exercise export_flow.py against the scaffolded prototype in both framework rounds' shared flow file: it SHALL assert that docs/flow.json is written and contains none of the three layout keys, that the --swift output contains the enum declaration and at least one case, and that the --kotlin output contains the sealed class declaration. Compilation of the generated files is out of scope for the smoke test.

#### Scenario: Smoke test coverage

- **WHEN** test_scaffold_validate.py runs
- **THEN** an export_flow round runs against a scaffolded prototype and the structural assertions above pass in the same run that validates scaffolding