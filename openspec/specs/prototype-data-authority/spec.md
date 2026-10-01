# prototype-data-authority Specification

## Purpose

TBD - created by archiving change 'clarify-prototype-handoff-authority'. Update Purpose after archive.

## Requirements

### Requirement: Data Authority registry

The prototype SHALL keep DATA_SPEC as its single entry point with separate Fake Data and Real Data Contract sections and one Data Authority fenced JSON registry. Registry schemaVersion SHALL be 1 with fixtures and contracts arrays. Fixture records SHALL declare group, values=fake, schemaScope=ui-model|transport, status=proposed|open|confirmed|superseded, source, and owner, with an optional contractId. Contract records SHALL declare id, kind=api|analytics|remote-config|storage|static, status, source, and owner. Confirmed records SHALL carry source reference, revision, confirmedBy, and confirmedOn. Confirmation of a UI model SHALL NOT confer transport authority. Fake values SHALL remain fake when their transport schema is confirmed.

#### Scenario: Fake-only handoff
- **WHEN** every fixture is fake with a proposed UI model, a named owner, and an empty contracts array
- **THEN** data authority validation SHALL pass without requiring an endpoint

#### Scenario: Unsupported confirmation
- **WHEN** a record is confirmed without complete source evidence
- **THEN** validation SHALL fail and SHALL NOT infer evidence from demo confirmation

#### Scenario: Registry structure failures
- **WHEN** the registry has malformed JSON, an unsupported version, invalid enum, duplicate group or id, empty owner, or an unknown contractId
- **THEN** validation SHALL report the offending record and fail

#### Scenario: Legacy and active coverage
- **WHEN** a legacy prototype lacks the registry
- **THEN** draft validation SHALL warn and handoff-ready SHALL fail until all fixture groups are classified; active fixtures SHALL NOT depend on superseded records


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
### Requirement: Decision Review

The producer and receiving skills SHALL distinguish confirmed, proposed, open, and superseded decisions with source, owner, and scope. Builder suggestions SHALL NOT become normative acceptance criteria. Unknowns SHALL identify the affected behavior and owner; unrelated confirmed work SHALL continue. Product demo confirmation SHALL NOT confirm API or analytics contracts. Handoff-ready SHALL require named, dated, scoped demo confirmation and a Semantic Review record. Semantic review SHALL check suggestion promotion, superseded active clauses, and updates to affected docs, flow, fixtures, metadata and tests. Mechanical checks SHALL NOT claim external source truth or semantic correctness.

#### Scenario: Analytics suggestion
- **WHEN** Builder suggests a reason parameter absent from the confirmed delete_email_failed analytics specification
- **THEN** receivers SHALL retain it only as a proposed decision and SHALL NOT add it to the formal event or acceptance criteria


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
### Requirement: Remote Config intent handoff

A prototype SHALL describe the controlled region, intended product behavior, demonstrated states, unresolved decisions, and RD owner for Remote Config. Technical keys, providers, polling, cache, permissions and rollout details SHALL remain open without confirmed sources. Explicitly open technical details SHALL NOT prevent independent UI and mock assembly, and SHALL block dependent real integration.

#### Scenario: Text-only Remote Config
- **WHEN** a requirement states that a named region is remotely shown or hidden and names its RD owner without a key
- **THEN** the prototype SHALL demonstrate declared states without inventing a production key or default


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
### Requirement: Authority display and consumption

The Inspector SHALL read the registry from the existing raw Data Spec, show fixture values as FAKE separately from schema scope and confirmation, and expose source and owner. Missing or invalid authority SHALL display unverified. Frontend and native receivers SHALL create UI models and mocks from UI schema, generate transport DTOs only from confirmed transport evidence, and record authority, injection site, UI model and integration owner/status in Data Adapter Seams. Unclassified legacy data SHALL have no transport authority.

#### Scenario: Confirmed UI data display
- **WHEN** a fake fixture has a confirmed UI-model schema
- **THEN** the Inspector and receiver SHALL distinguish UI confirmation from a confirmed real transport contract

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
### Requirement: Tracking comment ingestion

When a producer or receiving skill records an analytics requirement that originates from a `tracking` visual comment into the Data Authority registry, the contract record SHALL declare kind `analytics`, status `proposed`, source `null`, and a named owner. A tracking comment, a product demo confirmation, a passing validation run, or an implemented tracking call SHALL NOT change that status to `confirmed`; confirmation SHALL require a complete source object with reference, revision, confirmedBy, and confirmedOn. Event names, parameters, recording timing, and value definitions that the comment does not state SHALL NOT be added to the contract, the formal event payload, or the acceptance criteria. The handoff authority reference SHALL document this rule and SHALL name the four event fields.

#### Scenario: Tracking comment becomes a proposed analytics contract

- **WHEN** a developer's tracking comment `點擊送出按鈕時送 order_submit_click，帶 stock_id` is recorded for a prototype that keeps a Data Authority registry
- **THEN** the contracts array gains one record with kind `analytics`, status `proposed`, source `null`, and a named owner, and data authority validation passes

#### Scenario: Implemented tracking call does not confirm the contract

- **WHEN** the tracking call for a proposed analytics contract is implemented and its tests pass while no source evidence exists
- **THEN** the contract status remains `proposed`

#### Scenario: Source evidence confirms the contract

- **WHEN** the owner supplies a tracking specification with reference, revision, confirmedBy, and confirmedOn
- **THEN** the contract status becomes `confirmed` with that complete source object

#### Scenario: Unstated parameter stays out of the contract

- **WHEN** an implementer suggests a `reason` parameter that the tracking comment does not state
- **THEN** the parameter is retained only as a separate proposed decision and is absent from the formal event payload and acceptance criteria

<!-- @trace
source: add-tracking-visual-comments
updated: 2026-10-01
code:
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentReport.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-Diazst2e.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/package.json
  - design-system-to-storybook/assets/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/assets/figma-export-addon/package.json
  - design-system-to-storybook/assets/figma-export-addon/README.md
  - design-system-to-storybook/assets/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.js
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/assets/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.css
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/assets/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.css
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualCommentStore.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-Ft_w0vbm.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-Diazst2e.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/src/review.css
  - design-system-to-storybook/assets/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/reviewController.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentStore.ts
  - README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js
  - design-system-to-storybook/references/figma-export-review-setup.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/reviewController.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.d.ts
  - storybook-product-prototype/references/handoff-authority.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/index.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-BycGBdfI.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/visualCommentReport.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/package.json
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/src/review-server.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-server.js
  - design-system-to-storybook/assets/figma-export-addon/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js.map
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-Diazst2e.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-store.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.js.map
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/README.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.css
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/index.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/review-server.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review-controller.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review-server.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/preview.js
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/SKILL.md
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/visualComment-DawOAq7P.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/README.md
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/preview.d.ts
  - design-system-to-storybook/storybook-template/.storybook/vendor/figma-export-addon/dist/visual-comment-store.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/index.js
  - design-system-to-storybook/storybook-template/vendor/figma-export/src/review.ts
  - design-system-to-storybook/assets/figma-export-addon/src/visualComment.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/review-controller.js.map
  - design-system-to-storybook/assets/figma-export-addon/dist/visual-comment-report.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/preview.js
  - design-system-to-storybook/assets/figma-export-addon/dist/options-Ft_w0vbm.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/review.d.ts
  - design-system-to-storybook/storybook-template/vendor/figma-export/dist/options-Ft_w0vbm.d.ts
  - design-system-to-storybook/assets/figma-export-addon/dist/index.js
tests:
  - design-system-to-storybook/assets/figma-export-addon/test/visual-comment-fixture-entry.ts
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-store-test.mjs
  - storybook-product-prototype/scripts/test_scaffold_validate.py
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-report-test.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-renderer-parity.mjs
  - design-system-to-storybook/assets/figma-export-addon/test/run-visual-comment-http-test.mjs
-->