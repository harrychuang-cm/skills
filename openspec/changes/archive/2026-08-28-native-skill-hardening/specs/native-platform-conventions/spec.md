## ADDED Requirements

### Requirement: Platform conventions reference

A new reference, native-product-implementation/references/platform-conventions.md, SHALL cover the native concerns that have no web equivalent, and the implementation workflow SHALL name it as the reference to load during UI implementation. Every topic SHALL follow the same three-part shape: which handoff field describes it, how iOS implements it, and how Android implements it. A topic that maps to no handoff field SHALL NOT be included, so the reference stays a handoff-consumption guide rather than a general native tutorial.

#### Scenario: Implementer reaches UI work

- **WHEN** the workflow arrives at implementing screens
- **THEN** it loads the platform conventions reference and can trace each native concern back to the handoff field that specified it

### Requirement: Covered native concerns

The platform conventions reference SHALL cover: safe area and window insets including edge-to-edge layout; dark mode; dynamic type and font scaling; orientation, state restoration, multi-window, and large-screen adaptation; predictive back on Android including the correct treatment when a transition declares no user-initiated back; accessibility implementation rules with a statement that the UI spec's web accessibility vocabulary does not port directly; permission prompt flows with an explicit ruling on what falls inside this skill's scope; and previews as a deliverable.

#### Scenario: Handoff declares safe-area constraints

- **WHEN** the app implementation notes describe safe-area and orientation constraints
- **THEN** the reference gives the iOS and Android implementation for them rather than leaving them as acceptance-only items

#### Scenario: Transition declaring no user-initiated back

- **WHEN** a transition declares back behavior none on Android
- **THEN** the reference gives a treatment compatible with predictive back rather than one that breaks the system gesture

### Requirement: Previews as a deliverable

The platform conventions reference SHALL require preview declarations for implemented screens and shared components, driven by the mock data source so that every documented branch state is previewable. Previews SHALL be listed as an expected output of the implementation rather than an optional extra.

#### Scenario: Screen with branch states

- **WHEN** a screen documents loading, empty, and error states backed by fixture state values
- **THEN** previews exist that render those states through the mock data source
