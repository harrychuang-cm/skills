## MODIFIED Requirements

### Requirement: Pre-implementation component resolution gate

The frontend-product-implementation and native-product-implementation workflows SHALL require a Component Reuse Map to be drafted after ds-governance Phase 0 discovery and before the first UI source file is written. Every row SHALL either carry a terminal resolution or have raised its governance gate question (the Composition Gate ask for a missing component, the Token Gate ask when the blocker is a missing token) before UI implementation proceeds. At completion, no row SHALL remain unresolved. The SKILL.md First Actions list of each skill SHALL name this step explicitly between governance loading and implementation.

#### Scenario: Unresolved component blocks UI work

- **WHEN** a handoff component in scope cannot be matched to any existing production component or composition of existing components
- **THEN** the pass raises the Composition Gate ask for that row and writes no UI code for the affected surfaces until the user decides

#### Scenario: Fully resolved map allows implementation

- **WHEN** every in-scope handoff component row carries one of the terminal resolutions
- **THEN** UI implementation proceeds and the map is carried into IMPLEMENTATION_MAP.md as the Component Map section
