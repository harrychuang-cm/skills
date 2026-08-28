# native-component-governance Specification

## Purpose

TBD - created by archiving change 'native-skill-hardening'. Update Purpose after archive.

## Requirements

### Requirement: Governance companion binding

The native-product-implementation SKILL.md SHALL bind `$design-system-governance` in three places, mirroring frontend-product-implementation: the frontmatter description SHALL state that the skill always follows design-system-governance, a `Required Companion Skill` section SHALL instruct the agent to load and follow it before implementing UI, and the First Actions list SHALL include loading it before any UI implementation. The section SHALL preserve verbatim the two Traditional Chinese ask templates that trigger the token gate and the composition gate.

#### Scenario: Agent reads only SKILL.md

- **WHEN** an implementation pass reads SKILL.md and begins work without opening the references
- **THEN** it has already been told to load `$design-system-governance` and to stop and ask before creating a missing token or shared component

#### Scenario: Missing shared component

- **WHEN** the in-scope routes need a component that the native app does not provide
- **THEN** the agent asks the composition-gate question verbatim instead of creating the component silently

---
### Requirement: Governance platform tailoring

The Required Companion Skill section SHALL state which design-system-governance rules have native counterparts and which do not apply, covering at minimum: Storybook stories map to SwiftUI `#Preview` and Compose `@Preview`; hover states map to pressed and focused states; CSS keyframes and cubic-bezier curves map to SwiftUI animation curves and Compose `AnimationSpec`; pixel breakpoints map to size classes and window size classes; and the shared component directory maps to the native component library locations defined in repo discovery. The section SHALL state that governance still applies despite its web-oriented wording.

#### Scenario: Agent encounters web-only governance rules

- **WHEN** the agent loads design-system-governance and finds rules referencing Storybook, hover states, and CSS breakpoints
- **THEN** the tailoring guidance tells it the native counterpart for each, and it applies governance instead of concluding the skill does not apply to native work

---
### Requirement: Native shared component discovery

The repo discovery lists SHALL include a shared component library entry for each platform, naming where native component libraries actually live: for iOS, local Swift packages under a packages directory, `.library` products declared in `Package.swift`, dedicated design-system or UI-component targets, and preview declarations used as a component catalog; for Android, dedicated Gradle modules such as core-ui or design-system, module includes in the settings file, and preview composables or snapshot catalogs. The discovery section SHALL state that the shared component library usually lives outside the app module, so dependency declarations are read before deciding the scan scope.

#### Scenario: Component library in a separate package

- **WHEN** the app module contains only feature screens while the reusable components live in a local Swift package
- **THEN** discovery reads the package manifest, locates the component library, and lists its components for the composition gate

#### Scenario: Composition gate with a populated inventory

- **WHEN** the governance gate asks whether the handoff's components can be composed from existing ones
- **THEN** the answer is based on an inventory that actually covers the app's component library, not on the app module alone

---
### Requirement: Handoff component mapping consumption

The handoff ingestion reference SHALL name the handoff's component sources and how to read them: the `Design System Continuity` section of the production handoff, the Component Map, Component Gaps, and Token Binding sections of the UI spec, and the per-entry `targets` field of the component metadata. The `targets` semantics SHALL be documented as three states: a string names an existing production counterpart to reuse, an explicit null means the platform counterpart must be built, and an absent key means the platform is out of scope for that entry. The ingestion contract list SHALL include components to reuse, missing components or tokens, reusable prototype source files to port, and tests or previews to add.

#### Scenario: Entry with an existing native counterpart

- **WHEN** a component entry declares an iOS target naming an existing SwiftUI view
- **THEN** the implementation reuses that view and does not raise a composition-gate question for it

#### Scenario: Entry explicitly marked as needing a new component

- **WHEN** a component entry declares an iOS target of null
- **THEN** the implementation treats it as a missing shared component and takes it through the composition gate

##### Example: targets interpretation

| targets value | Native reading |
| ------------- | -------------- |
| { "ios": "AlertRowView" } | reuse the existing AlertRowView |
| { "ios": null } | counterpart must be built — composition gate |
| { "web": "AlertRow" } (no ios key) | entry out of scope for iOS |

---
### Requirement: Conditional localization rule

The implementation rules SHALL make the localization requirement conditional on the target app having a localization system, matching the web sibling's phrasing, and SHALL define the gate for when it does not: the agent stops and asks whether to establish one rather than treating hardcoded display strings as a violation with no path forward.

#### Scenario: App with no localization catalog

- **WHEN** the target app is single-language with no string catalog or string resources
- **THEN** the agent asks whether to establish localization instead of blocking on an unsatisfiable rule
