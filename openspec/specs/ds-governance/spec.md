# ds-governance Specification

## Purpose

Maintain repository-owned design-system governance that can be consumed consistently across agents, platforms and existing project conventions.

## Requirements

### Requirement: Portable repository skill identity

The repository SHALL own ds-governance with matching folder and frontmatter names, a non-empty description, self-contained Markdown instructions, relative supporting references, and optional Codex interface metadata. The shared installer SHALL discover and copy the same skill to Claude Code, Codex, and Cursor project destinations. The workflow SHALL remain usable by explicitly reading its SKILL.md without host-specific tools or mandatory MCP dependencies.

#### Scenario: Three agent installation

- **WHEN** the installer runs with agent all and skill ds-governance into an empty temporary project
- **THEN** all three installed folders match the repository source and their relative references resolve

### Requirement: Evidence-based platform governance

The skill SHALL discover the selected target's tokens, components, layout, motion, localization and verification evidence before UI mutation. It SHALL preserve existing token layers and naming, including two-layer themes, and adapt to Web, SwiftUI, Compose and other discovered runtimes. It SHALL derive visual style from project evidence instead of mandating saturated colors, rounded geometry, fixed typography, breakpoints or animation timing. It SHALL require only applicable interaction states and record unavailable runtime checks.

#### Scenario: Existing two-layer native theme

- **WHEN** a SwiftUI project has primitive and semantic tokens with previews and no Storybook
- **THEN** the skill reuses that theme and native previews without adding a component-token layer or installing Storybook

### Requirement: Scoped authorization gates

The skill SHALL reuse prior authorization for the same token or shared-component change and ask only for unresolved scope. A generic feature request SHALL NOT imply approval for new shared design-system APIs. Missing evidence SHALL pause only affected mutations while allowing independent discovery. Feature-local composition using existing tokens and components SHALL NOT itself require new shared-component approval.

#### Scenario: Approved component creation

- **WHEN** the current session explicitly authorizes a named shared component and its token changes
- **THEN** governance records that decision and proceeds within its scope without requesting the same approval again

#### Scenario: Unapproved missing token

- **WHEN** an in-scope state requires an undiscovered semantic token and no creation approval exists
- **THEN** the agent presents the missing role and concrete options, asks for a decision, and writes no affected UI using invented values

### Requirement: Current consumer migration

Current skills, templates, documentation and normative specs SHALL resolve the repository ds-governance companion instead of the legacy external skill. Required consumers SHALL report an unavailable companion rather than silently loading an old global copy. The prototype's existing optional fallback SHALL remain supported. Historical archive documents and unrelated local settings SHALL remain unchanged.

#### Scenario: Required companion unavailable

- **WHEN** a required consumer cannot resolve ds-governance through its catalog, sibling installation or explicitly located repository checkout
- **THEN** it reports the missing source and pauses affected UI mutations while continuing independent read-only discovery

### Requirement: Managed coverage template integrity

The coverage prompt and implement skill SHALL name ds-governance. The template manifest SHALL record the normalized implement-skill SHA-256 and version 0.10.2. The checker SHALL validate both per-tool and legacy flat manifests and reject missing copies, content hash drift and missing companion instructions.

#### Scenario: Both manifest shapes

- **WHEN** matching installed skill copies are checked against either tools.component-coverage or flat installTargets and skillContentSha256
- **THEN** the checker succeeds for both shapes and fails after an installed copy is removed or modified
