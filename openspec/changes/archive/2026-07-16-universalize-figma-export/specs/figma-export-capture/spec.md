## ADDED Requirements

### Requirement: Shadow DOM traversal capture

The exporter SHALL traverse open shadow roots: when an element has an open shadowRoot, its exported children come from the shadowRoot's element children; slot elements SHALL be expanded in place to their assignedElements with flatten true (falling back to the slot's own element children when nothing is assigned) and MUST NOT produce nodes themselves. Style rules for token bindings SHALL be collected per root: document styleSheets plus document adoptedStyleSheets form the base set, and each open shadowRoot contributes its own styleSheets and adoptedStyleSheets for elements inside it. Closed shadow roots stay unexported.

#### Scenario: web component content is exported

- **WHEN** a custom element hosts an open shadowRoot containing a styled div
- **THEN** the exported host node's children include a node for that div with its computed size and background

#### Scenario: adopted stylesheet token binds inside shadow

- **WHEN** a shadowRoot's adoptedStyleSheet declares background-color with var(--fx-sys-color-primary) on an inner element
- **THEN** that element's exported bindings.backgroundColor is --fx-sys-color-primary

### Requirement: Token-less degraded export

When no CSS custom property matches the `--<prefix>-<layer>-*` pattern for any detectable prefix, the exporter SHALL complete the export instead of throwing: detectTokenSystem returns an empty token system (empty catalog, empty prefix), every node's bindings are empty, payload.tokens is an empty array, and payload.tokenSystem.prefix is an empty string. Projects with an explicitly configured tokenPrefix keep their existing behavior.

#### Scenario: export succeeds without tokens

- **WHEN** a story page defines no layered design tokens and the export action runs
- **THEN** the export resolves with payload.tokens equal to an empty array and no "Unable to detect a CSS token prefix" error
