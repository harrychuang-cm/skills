# production-data-integration Specification

## Purpose

TBD - created by archiving change 'prototype-production-family'. Update Purpose after archive.

## Requirements

### Requirement: Third-stage skill scope and boundary

production-data-integration SHALL own real clients, auth/session, cache, storage, persistence and environment configuration behind assembled DataSource seams. Inputs SHALL include the handoff API contracts and semantics, implementation seam map, fixtures for UI/mock reference, and Data Spec schemas with Data Authority evidence. Only confirmed transport sources SHALL authorize DTOs and real wiring. UI behavior, routes, components and tokens SHALL remain outside scope. Unknown endpoints, auth or semantics SHALL block the affected seam and be assigned to its named owner; independent confirmed seams SHALL continue.

#### Scenario: Contract mismatch discovered during wiring
- **WHEN** a real DTO shape differs from a prototype UI-model schema
- **THEN** the skill SHALL map the confirmed transport DTO to the UI model and SHALL NOT require the service to match the fake fixture; missing business semantics SHALL become an explicit decision

#### Scenario: Unknown endpoint
- **WHEN** a seam has no confirmed endpoint
- **THEN** the skill SHALL request the named decision and SHALL NOT invent a path


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
### Requirement: Data wiring workflow

The data-wiring-workflow reference SHALL define the replacement procedure: inventory every seam from the Data Adapter Seams table; confirm endpoint, auth, and semantics per contract row with the named owner; implement the real DataSource per the target repo's existing client conventions (the repo's fetch/query layer on web, URLSession-based clients on iOS, Retrofit/Ktor-style clients on Android); swap the injection point from Mock to real; and keep the mock implementation in place for tests. Completion SHALL be defined as: every seam has a real implementation and swapped injection, contract tests pass, every AC-P criterion tagged integration is settled, and the IMPLEMENTATION_MAP seams table gains the real implementation path.

#### Scenario: Seam replacement

- **WHEN** the seams table maps the alertsRoutes group to MockAlertsDataSource
- **THEN** the pass implements the real AlertsDataSource against the confirmed endpoint, swaps the injection point, keeps the mock for tests, and records the real path in the seams table

---
### Requirement: Contract test gate

Contract tests SHALL validate responses against the confirmed transport contract, assert the DTO-to-UI mapping, cover documented error classes and behavior for each recorded semantics entry, and use fake fixtures only to verify UI/mock expectations. Raw response fields SHALL NOT be required to equal fake fixture fields. Required fields and type mismatches SHALL fail according to the real schema; additional fields SHALL be governed by that schema. Tests SHALL use existing repo tools without adding a test framework.

#### Scenario: Schema-validated response
- **WHEN** the real source returns data.items and nextCursor while the UI model contains state and rows
- **THEN** the transport test SHALL validate the source schema and the mapper test SHALL verify rows without asserting raw shape equality

#### Scenario: Retryable error mapping
- **WHEN** the confirmed error taxonomy marks timeouts retryable
- **THEN** a test SHALL assert the documented retry state rather than a terminal error

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