# component-coverage-review Specification

## Purpose

TBD - created by archiving change 'improve-coverage-review-ux'. Update Purpose after archive.

## Requirements

### Requirement: Section-scoped review decision sets

The review UI SHALL derive the decisions offered for a block from its coverage classification, and the decision sets SHALL be: missing → build-new | use-existing | skip; extend → extend | no-extend | use-existing | skip; reusable → approve | use-existing | skip. The dev API and the report check script SHALL accept exactly the same section-scoped decision sets, and both companion skills (analyze, implement) SHALL document the same sets. The report confirmation gate SHALL remain unchanged: a report can be confirmed only when every extend or missing block carries a review decision, and reusable blocks SHALL NOT block confirmation regardless of their review state.

#### Scenario: Extend block offers use-existing

- **WHEN** a reviewer opens the review panel of a block classified extend
- **THEN** the decision buttons offered are 同意擴充, 不需擴充, 改用現有元件, and 不實作

#### Scenario: Reusable block offers skip

- **WHEN** a reviewer opens the review panel of a block classified reusable
- **THEN** the decision buttons offered are 確認可用, 改用現有元件, and 不實作

#### Scenario: Dev API accepts the expanded sets

- **WHEN** a review update assigns use-existing (with an overrideComponentId) to an extend block, or skip to a reusable block
- **THEN** the dev API persists the review without error

#### Scenario: Out-of-section decision rejected

- **WHEN** a review update assigns a decision outside the block's section set (for example approve on an extend block)
- **THEN** the dev API rejects the update and the report check script reports a disallowed-decision error

#### Scenario: Reusable blocks never block confirmation

- **WHEN** every extend and missing block has a review decision and some reusable blocks have none
- **THEN** the report can be set to confirmed


<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->

---
### Requirement: use-existing overrides require a catalog component

A review with decision use-existing SHALL carry an overrideComponentId that names an existing catalog component. The UI SHALL keep the save action disabled until a component is selected, the dev API SHALL reject a use-existing review without a non-empty overrideComponentId, and the report check script SHALL reject an overrideComponentId that does not exist in the component catalog. The composition preview SHALL render the overridden component for a block whose saved review is use-existing, in every section.

#### Scenario: Save gated until a component is picked

- **WHEN** a reviewer selects 改用現有元件 but has not yet picked a component
- **THEN** the save button stays disabled

#### Scenario: Unknown override id fails validation

- **WHEN** a stored report carries a use-existing review whose overrideComponentId is not a catalog id
- **THEN** the report check script fails with an unknown-overrideComponentId error and the preview slot shows the catalog-entry-not-found unavailable state

#### Scenario: Override wins over the analyzer match

- **WHEN** an extend block with a saved use-existing review is rendered in the composition preview
- **THEN** the slot renders the component named by overrideComponentId instead of the analyzer's matched component


<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->

---
### Requirement: Skipped blocks collapse in the preview and are excluded from implementation

A block whose saved review decision is skip SHALL be rendered in the composition preview as a collapsed excluded row that shows the 不實作 badge and the block label, SHALL NOT render the component preview body, SHALL keep the block's grid position and span, and SHALL remain selectable so the reviewer can change the decision in the inspector. The analysis tab SHALL continue to list skipped blocks in full. The implementation skill SHALL exclude skipped blocks from the produced work list and composed screens. The composition JSON SHALL continue to reference every report block exactly once; skip handling SHALL be render-time only and SHALL NOT require report data migration.

#### Scenario: Skip collapses the preview slot

- **WHEN** a reviewer saves 不實作 on a block shown in the composition preview
- **THEN** the block's slot collapses to an excluded row with the 不實作 badge and no component preview, occupying the same grid cell

#### Scenario: Skipped block can be re-reviewed

- **WHEN** the reviewer clicks a collapsed excluded row
- **THEN** the block becomes the selected block and its review panel opens in the inspector with the saved skip decision editable

#### Scenario: Implementation excludes skipped blocks

- **WHEN** the implementation skill processes a confirmed report containing a skip-decided block
- **THEN** the work list contains no work item for that block and the composed screen omits it


<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->

---
### Requirement: Searchable component picker

When a reviewer selects use-existing, the review panel SHALL show a search input and an inline scrollable option list instead of a native select. Typing SHALL filter catalog entries case-insensitively against name, id, category, and keywords. The list SHALL show the block's analyzer match candidates first as a distinct leading group, followed by the remaining catalog entries grouped by category. A component SHALL only be chosen by picking a list option; free-text values SHALL NOT be submittable as overrideComponentId. Picking an option SHALL trigger the existing draft-override live preview flow before saving. The list SHALL support ArrowUp/ArrowDown movement, Enter to pick, and Escape to clear the search, and SHALL show an empty state when no entry matches.

#### Scenario: Search filters the catalog

- **WHEN** the reviewer types a query into the picker search input
- **THEN** the option list shows only entries whose name, id, category, or keywords contain the query, ignoring case

##### Example: filter fields

| Catalog entry | Query | Listed |
| ------------- | ----- | ------ |
| id action-button, name Action Button, category Actions, keywords cta 按鈕 | BUTTON | yes (name, ignoring case) |
| id action-button, name Action Button, category Actions, keywords cta 按鈕 | 按鈕 | yes (keyword) |
| id stat-card, name Stat Card, category Data Display, keywords kpi | button | no |

#### Scenario: Analyzer candidates listed first

- **WHEN** the picker opens for a block whose matches contain candidate components
- **THEN** those candidates appear as the first group of the list, before the category-grouped remainder

#### Scenario: Picking previews before saving

- **WHEN** the reviewer picks a component in the list without saving
- **THEN** the composition preview shows that component for the block in the draft try-out state

#### Scenario: No free-text override

- **WHEN** the reviewer's search text matches no catalog entry
- **THEN** the list shows an empty state, nothing is selectable, and the save button stays disabled


<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->

---
### Requirement: Progressive disclosure of the review form

The review form SHALL show only the panel title and the decision buttons while no decision is chosen. The note field and the save and cancel actions SHALL appear only after a decision is chosen. The component picker SHALL appear only when the chosen decision is use-existing. The saved-review summary presentation SHALL remain unchanged.

#### Scenario: Initial form shows only decisions

- **WHEN** a reviewer opens the review form of an unreviewed block
- **THEN** only the decision buttons are visible, with no note field and no save action

#### Scenario: Choosing a decision reveals the rest

- **WHEN** the reviewer chooses any decision
- **THEN** the note field and save and cancel actions appear, and the picker appears additionally when the decision is use-existing


<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->

---
### Requirement: Template release contract synchronization

The template release SHALL keep the review contract mirrors synchronized in the same change: the decision sets in the contract types module, the dev API plugin, the report check script, and both companion skill documents SHALL be identical; the preview-contract check script's guard strings SHALL match the shipped UI source including the picker and the collapsed skip row; the template manifest version SHALL be bumped to 0.8.0; the manifest skill hashes SHALL equal the SHA-256 of the updated skill documents after CRLF-to-LF normalization; and the installer skill document SHALL describe the 0.7.x to 0.8.0 migration.

#### Scenario: Check scripts pass on the shipped template

- **WHEN** the four coverage check scripts run in a verification harness against fixture reports covering the expanded decision sets
- **THEN** all scripts pass, and negative fixtures (use-existing without overrideComponentId, unknown overrideComponentId, out-of-section decision) fail with their specific errors

#### Scenario: Skill hash verification passes

- **WHEN** the agent-skills check script verifies the installed skill copies against the updated manifest
- **THEN** every copy matches the recomputed SHA-256 hashes

<!-- @trace
source: improve-coverage-review-ux
updated: 2026-08-04
code:
  - component-coverage-install/template/scripts/check-component-coverage-preview-contract.mjs
  - component-coverage-install/template/src/storybook/component-coverage/coverageTypes.ts
  - component-coverage-install/SKILL.md
  - component-coverage-install/template/scripts/component-coverage/vite-plugin.mjs
  - component-coverage-install/template/src/storybook/component-coverage/ReportView.tsx
  - component-coverage-install/template/src/storybook/component-coverage/component-coverage.css
  - component-coverage-install/template/skills/component-coverage-analyze/SKILL.md
  - component-coverage-install/template/src/storybook/component-coverage/CompositionPreview.tsx
  - component-coverage-install/template/skills/component-coverage-implement/SKILL.md
  - component-coverage-install/template/scripts/check-component-coverage-reports.mjs
  - .spectra.yaml
  - component-coverage-install/template/TEMPLATE_MANIFEST.json
  - component-coverage-install/template/src/stories/tools/ComponentCoverageAnalyzer.stories.tsx
-->