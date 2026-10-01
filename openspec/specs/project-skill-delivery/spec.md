# project-skill-delivery Specification

## Purpose

TBD - created by archiving change 'clarify-prototype-handoff-authority'. Update Purpose after archive.

## Requirements

### Requirement: Project Skill Delivery

The installer SHALL support opt-in --record-usage only with project scope and an explicit skill list excluding all. Selected skills SHALL be recorded as declared used, required dependencies as dependencies with roles. Dependency closure SHALL include ds-governance for frontend and ds-governance plus frontend support for native, and SHALL NOT install next-stage skills merely because they are named receivers. Missing selections, missing dependencies, cycles, malformed managed markers and nonportable symlinks SHALL fail before writes. Without the flag existing installation behavior SHALL remain unchanged. Dry-run SHALL write nothing.

#### Scenario: Native delivery closure
- **WHEN** native-product-implementation is selected with record-usage
- **THEN** the delivery SHALL contain native, frontend support and ds-governance, and SHALL NOT add production-data-integration

#### Scenario: Invalid selection
- **WHEN** a selected skill is missing or record-usage uses user scope
- **THEN** the installer SHALL report an error without changing any destination files


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
### Requirement: Skill usage provenance

Successful recorded installation SHALL upsert docs/SKILL_USAGE.json with source identity, Git commit or null, dirty state, content hashes, roles and project-relative installation paths. Source and installed content hashes SHALL match before success is recorded. Subsequent runs SHALL preserve prior records and upgrade a dependency explicitly selected as used. CLAUDE.md and AGENTS.md SHALL use bounded managed blocks linking repo copies, preserve all other bytes, and avoid duplicate blocks on rerun. Identical runs SHALL be idempotent. Delivery SHALL NOT auto-commit or claim publication.

#### Scenario: Repeated delivery and new clone
- **WHEN** recorded skills are installed twice and the generated files are committed in an isolated test repo then cloned elsewhere
- **THEN** the second install SHALL leave identical content and all skill, support and managed-block relative links SHALL resolve in the clone

#### Scenario: Local source edits
- **WHEN** source bytes change without a new commit
- **THEN** the recorded content hash SHALL change and SHALL NOT present the Git commit as an exact description of the modified content

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