## MODIFIED Requirements

### Requirement: Navigation metadata fields on the flow contract

Route params and deepLink SHALL remain optional. Transition presentation SHALL accept push, modal, sheet, fullscreen or replace, and backBehavior SHALL accept pop, popToRoot, dismiss or none. Transition motion SHALL accept none, platform-default or custom with an optional motionRef. Draft legacy flows SHALL remain readable. The ui-flow-contract reference SHALL document every field and distinguish navigation semantics from animation intent.

#### Scenario: Legacy flow file without navigation fields
- **WHEN** ordinary draft validation reads a legacy flow without navigation or motion fields
- **THEN** the missing fields SHALL NOT by themselves make the draft unreadable or imply default values

#### Scenario: Transition with presentation semantics
- **WHEN** a transition declares presentation sheet, backBehavior dismiss and motion platform-default
- **THEN** the fields SHALL remain readable as independent navigation and motion choices

### Requirement: Presentation coverage check for app targets

In handoff-ready mode, validate_prototype.py SHALL require presentation for every non-return transition when an app target is in scope. App target detection SHALL prefer the typed app/hybrid declaration and fall back to legacy Target Surfaces prose when no typed declaration exists. Missing presentation SHALL be an error without requiring strict-style. Independently of platform, transitions entering a visible route SHALL require motion, non-return presentation, and return backBehavior. Custom motion SHALL reference an existing explicit anchor in FLOW_SPEC.md. Non-screen branch targets SHALL not require motion solely for branch evaluation.

#### Scenario: App target with uncovered transitions
- **WHEN** an app handoff has three non-return transitions without presentation
- **THEN** handoff-ready SHALL report errors identifying all three transitions

#### Scenario: Web-only target
- **WHEN** a web-only transition enters a visible route without motion or presentation
- **THEN** handoff-ready SHALL fail for the missing visible-route intent

#### Scenario: Typed surface wins over prose
- **WHEN** typed surface is web and stale prose mentions app
- **THEN** typed surface SHALL govern app-only checks while visible-route checks SHALL still apply

#### Scenario: Custom and return motion
- **WHEN** custom motion lacks a valid FLOW_SPEC anchor or a return edge lacks explicit backBehavior
- **THEN** handoff-ready SHALL fail rather than inventing navigation or motion
