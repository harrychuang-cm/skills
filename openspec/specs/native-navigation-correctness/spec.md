# native-navigation-correctness Specification

## Purpose

TBD - created by archiving change 'native-skill-hardening'. Update Purpose after archive.

## Requirements

### Requirement: Return transitions respect their kind

Native ingestion SHALL extract kind, presentation, backBehavior, motion and motionRef for each transition. A return transition SHALL execute its confirmed backBehavior and SHALL never push a copy of the destination. Missing navigation or motion requirements SHALL be recorded as unresolved for the affected edge, and SHALL NOT default to push, single-step back or platform animation without existing explicit authorization. Independent confirmed work SHALL continue.

#### Scenario: Return transition without presentation
- **WHEN** a return transition declares backBehavior dismiss and confirmed motion
- **THEN** it SHALL dismiss the presented surface rather than push a new destination

#### Scenario: Forward transition without presentation
- **WHEN** a non-return transition lacks presentation and no explicit authorized default applies
- **THEN** its implementation SHALL await the named decision instead of assuming push

##### Example: resolution
| kind | presentation | backBehavior | Result |
| --- | --- | --- | --- |
| return | absent | dismiss | dismiss using declared motion |
| return | absent | absent | unresolved return action |
| primary | absent | absent | unresolved presentation |
| primary | sheet | dismiss | sheet with declared dismissal and motion |


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
### Requirement: Executable navigation mapping

The navigation mapping tables SHALL express each cell as the actual API call shape for its platform rather than a conceptual label, and SHALL be technically correct: returning to the flow root SHALL be expressed as popping up to the start destination without inclusive removal, while a root replacement SHALL be expressed as navigating with inclusive removal of the previous root. Each table SHALL state that the shapes are the contract's intent and must be adapted to the app's existing router rather than introducing a second navigation system.

#### Scenario: Pop to root versus replace

- **WHEN** one transition declares back behavior popToRoot and another declares presentation replace
- **THEN** the first maps to popping up to the start destination while keeping it, and the second maps to navigating with the previous root removed — the two are not expressed with the same call

#### Scenario: App with an existing router

- **WHEN** the target app routes through its own coordinator or router abstraction
- **THEN** the mapping is applied through that abstraction instead of adding a parallel navigation stack

---
### Requirement: Flow skeleton usage

The skill SHALL document how to use the generated native navigation skeletons: the command that produces them, where their output belongs in the target project, that they are scaffolding to adapt into the existing router rather than finished code, and when to regenerate them — whenever the flow metadata changes in a newer handoff version.

#### Scenario: Handoff updated with new routes

- **WHEN** a newer handoff version adds routes to the flow metadata
- **THEN** the skeleton is regenerated and the differences are reconciled with the app's router, rather than the new routes being hand-added