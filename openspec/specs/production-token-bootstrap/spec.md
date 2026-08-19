# production-token-bootstrap Specification

## Purpose

TBD - created by archiving change 'add-token-bootstrap-reference'. Update Purpose after archive.

## Requirements

### Requirement: Token bootstrap reference activation

The frontend-product-implementation skill SHALL instruct the agent to read `frontend-product-implementation/references/token-bootstrap.md` when the design-system governance gate determines the selected production target root has no design token system and the user approves establishing one. The SKILL.md Reference Loading list and the implementation-workflow reference (Design-System Governance Gate section and the Greenfield Mode no-design-system branch) SHALL both name this activation point.

#### Scenario: No token system and user approves

- **WHEN** governance Phase 0 discovery finds no token system in the target root and the user answers that a token system is wanted before continuing
- **THEN** the agent reads token-bootstrap.md and follows its procedure instead of improvising a token setup

#### Scenario: Token system already exists

- **WHEN** governance Phase 0 discovery finds an existing token system in the target root
- **THEN** the token-bootstrap reference is not loaded and the existing governance flow continues unchanged


<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->

---
### Requirement: Prototype token source discovery order

The token-bootstrap reference SHALL define a prioritized discovery order for prototype-side token sources and SHALL require the agent to record which source was selected together with its file-level evidence. The order SHALL be: (1) token files in the prototype Storybook repo produced by design-system-to-storybook, (2) the design-system-extractor token architecture and component token spec documents, (3) Figma Variables exports. The reference SHALL forbid inventing token values that appear in no discovered source.

#### Scenario: Multiple sources available

- **WHEN** the prototype Storybook repo contains generated token files and an older design-system-extractor package also exists
- **THEN** the agent selects the Storybook token files as the source of truth and records the chosen source and its path in the implementation notes

#### Scenario: No source found

- **WHEN** none of the three source types can be located
- **THEN** the agent switches to the reverse-inventory fallback procedure instead of fabricating token values


<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->

---
### Requirement: Minimal token subset derivation

The token-bootstrap reference SHALL require deriving the ported token set from the tokens actually referenced by the in-scope handoff documents and prototype components, not from the full prototype token catalog. The derived subset SHALL preserve the ref → sys → comp layering rules of design-system-governance: every ported comp or sys token SHALL resolve to a ported ref token, and ref tokens with no dependent in the subset SHALL be excluded.

#### Scenario: Subset derivation from handoff scope

- **WHEN** the handoff UI spec references only a subset of the prototype's semantic tokens
- **THEN** the agent ports that subset plus the ref tokens they resolve to, and lists excluded token groups in the implementation notes

##### Example: dependency closure

- **GIVEN** prototype tokens: `ref-color-blue-500`, `ref-color-red-500`, `sys-color-primary` → `ref-color-blue-500`, `sys-color-danger` → `ref-color-red-500`; handoff scope uses only `sys-color-primary`
- **WHEN** the subset is derived
- **THEN** ported tokens are `ref-color-blue-500` and `sys-color-primary`; `ref-color-red-500` and `sys-color-danger` are excluded and recorded as deferred


<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->

---
### Requirement: Target styling technology adaptation

The token-bootstrap reference SHALL require selecting the token output format from repo evidence of the production styling stack, and SHALL define at minimum these mappings: CSS custom properties for plain CSS or CSS-in-JS stacks, Tailwind theme configuration for Tailwind repos, SCSS variables or maps for SCSS repos, and a typed theme object for React Native or similar non-CSS runtimes. Token files SHALL be placed following the target framework's native conventions. When the styling stack is ambiguous or mixed, the agent SHALL stop and ask which format to use before writing token files.

#### Scenario: Tailwind repo detected

- **WHEN** the production root contains a Tailwind configuration consumed by the build
- **THEN** ported tokens are expressed as Tailwind theme extensions while preserving the layered token names

#### Scenario: Ambiguous styling stack

- **WHEN** the repo shows both SCSS variables and CSS custom properties with no dominant convention
- **THEN** the agent stops and asks the user to choose the token output format before writing files


<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->

---
### Requirement: Reverse-inventory fallback with approval

The token-bootstrap reference SHALL define a fallback procedure for when no prototype token source exists: the agent SHALL compile a proposed minimal token set by inventorying visual values from the handoff UI spec and prototype style files, normalize them into ref → sys layers, and present the proposed set to the user for approval before creating any token file. The fallback SHALL NOT silently hardcode visual values into product components.

#### Scenario: Fallback inventory requires approval

- **WHEN** no token source is found and the handoff UI spec plus prototype styles yield a candidate set of colors, spacing, radius, and typography values
- **THEN** the agent presents the normalized candidate token set and waits for user approval before writing token files or component code


<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->

---
### Requirement: Bootstrap completion reporting

The token-bootstrap reference SHALL require the final response to report: the selected token source and evidence, the ported token list grouped by layer, the chosen output format and file locations, tokens deferred or excluded, and any naming translations between prototype and production. It SHALL also require updating implementation notes when production token names intentionally diverge from prototype names.

#### Scenario: Completion report content

- **WHEN** the token bootstrap procedure finishes and implementation continues
- **THEN** the final response lists source, ported tokens by layer, output format, file paths, deferred tokens, and naming translations

<!-- @trace
source: add-token-bootstrap-reference
updated: 2026-08-19
code:
  - frontend-product-implementation/references/token-bootstrap.md
  - frontend-product-implementation/references/implementation-workflow.md
  - frontend-product-implementation/SKILL.md
-->