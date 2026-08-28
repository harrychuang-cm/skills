# component-reuse-map Specification

## Purpose

TBD - created by syncing change 'add-component-reuse-map'. Update Purpose after archive.

## Requirements

### Requirement: Pre-implementation component resolution gate

The frontend-product-implementation and native-product-implementation workflows SHALL require a Component Reuse Map to be drafted after design-system-governance Phase 0 discovery and before the first UI source file is written. Every row SHALL either carry a terminal resolution or have raised its governance gate question (the Composition Gate ask for a missing component, the Token Gate ask when the blocker is a missing token) before UI implementation proceeds. At completion, no row SHALL remain unresolved. The SKILL.md First Actions list of each skill SHALL name this step explicitly between governance loading and implementation.

#### Scenario: Unresolved component blocks UI work

- **WHEN** a handoff component in scope cannot be matched to any existing production component or composition of existing components
- **THEN** the pass raises the Composition Gate ask for that row and writes no UI code for the affected surfaces until the user decides

#### Scenario: Fully resolved map allows implementation

- **WHEN** every in-scope handoff component row carries one of the terminal resolutions
- **THEN** UI implementation proceeds and the map is carried into IMPLEMENTATION_MAP.md as the Component Map section


<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->

---
### Requirement: Component map row source

The Component Reuse Map rows SHALL be the deduplicated set of components named for in-scope routes (Scope B rows, plus U rows resolved into work) by the PRODUCTION_HANDOFF.md Per-screen composition echo; when the handoff has no composition echo, rows SHALL be derived from the UI_SPEC.md per-route component composition; when neither source exists, the map SHALL record the literal lead-in bullet `- source: none` and row-level obligations are waived. Components belonging only to Scope A routes SHALL NOT produce rows. A component discovered during implementation that no source listed SHALL be appended as a row marked with source `discovered`.

#### Scenario: Rows derived from composition echo

- **WHEN** the handoff's Per-screen composition echo lists components for two Scope B routes and one Scope A route
- **THEN** the map contains one row per distinct component of the two Scope B routes and none from the Scope A route

#### Scenario: Legacy handoff without component inventory

- **WHEN** the handoff predates the composition echo and UI_SPEC.md carries no per-route composition
- **THEN** the map section records `- source: none` and the machine audit skips row-level checks


<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->

---
### Requirement: Resolution vocabulary

Each Component Reuse Map row SHALL resolve to exactly one of five terminal values: `reused` — an existing production component is used directly; `composed` — the surface is assembled from existing production components, including the case where a prototype-local component becomes feature-local code composed from existing shared components; `extended` — an existing shared component gains an approved variant or state; `created` — a new shared component is created with approval, following the Approved Component Porting procedure when a prototype counterpart exists; `deferred` — the component is not built in this pass, with a reason. `extended` and `created` rows SHALL exist only after the user approved them through the governance gates.

#### Scenario: Resolution values recorded

- **WHEN** the implementation completes
- **THEN** every row's Resolution cell holds one of `reused`, `composed`, `extended`, `created`, or `deferred`, and no other value

##### Example: resolution outcomes

| Handoff component | Situation | Resolution |
| ----------------- | --------- | ---------- |
| primary-button | production SharedButton matches | reused |
| stat-card | assembled from Card + Badge | composed |
| list-row | existing ListRow gains approved compact variant | extended |
| flow-stepper | no counterpart; user approved new shared component | created |
| onboarding-banner | route deferred to a later pass | deferred |


<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->

---
### Requirement: Targets metadata as verified seed

When a handoff component's meta.components entry carries a targets value naming a production component for the implementing platform, the pass SHALL treat that name as a candidate, verify the named component exists under the production root, and record its repo-relative path as the row's evidence; a stale or wrong name SHALL be resolved by repo search, not copied as evidence. An explicit null targets value for the platform SHALL be treated as a pre-signal that the row requires the `created` path, which still requires the Composition Gate approval.

#### Scenario: Stale targets name

- **WHEN** targets names a production component that no longer exists under the production root
- **THEN** the pass resolves the row by searching the repo and records the actual match or raises the Composition Gate ask, and does not record the stale name as evidence


<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->

---
### Requirement: Native inheritance of the component map contract

The native-product-implementation SKILL.md Inherited Shared Contracts list SHALL name the Component Reuse Map contract — same section name, same table columns, same resolution vocabulary, same audit — and its implementation-workflow Design-System Governance Gate SHALL require the map resolution against native component sources, with evidence paths pointing into the native modules (Swift packages, Gradle modules) that discovery located.

#### Scenario: Native pass produces the same section

- **WHEN** a native implementation pass completes
- **THEN** its IMPLEMENTATION_MAP.md carries a Component Map section with the shared columns and vocabulary, and evidence paths resolve inside the native repo


<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->

---
### Requirement: Final response references the map

The verification-reporting Final Response Contract of both skills SHALL require the prototype-to-production component report to reference the IMPLEMENTATION_MAP.md Component Map section as the single source of the mapping instead of restating an independent list.

#### Scenario: No duplicate mapping truth

- **WHEN** the final response reports component reuse
- **THEN** it points at the Component Map section and summarizes it, and any discrepancy between response text and map rows is resolved in favor of the map

<!-- @trace
source: add-component-reuse-map
updated: 2026-08-28
code:
  - frontend-product-implementation/references/verification-reporting.md
  - native-product-implementation/references/implementation-workflow.md
  - native-product-implementation/SKILL.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
  - frontend-product-implementation/scripts/validate_implementation.py
  - native-product-implementation/references/verification-reporting.md
-->