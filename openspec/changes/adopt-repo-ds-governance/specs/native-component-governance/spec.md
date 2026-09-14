## MODIFIED Requirements

### Requirement: Governance companion binding

The native-product-implementation SKILL.md SHALL bind `$ds-governance` in three places, mirroring frontend-product-implementation: the frontmatter description SHALL state that the skill always follows ds-governance, a `Required Companion Skill` section SHALL instruct the agent to load and follow it before implementing UI, and the First Actions list SHALL include loading it before any UI implementation. The section SHALL preserve the two Traditional Chinese ask templates as localized examples for unresolved token and composition decisions, reuse existing authorization for the same scope, and permit equivalent phrasing in the user's language.

#### Scenario: Agent reads only SKILL.md

- **WHEN** an implementation pass reads SKILL.md and begins work without opening the references
- **THEN** it has already been told to load `$ds-governance` and to resolve authorization before creating a missing token or shared component

#### Scenario: Missing shared component

- **WHEN** the in-scope routes need a component that the native app does not provide and its creation has not been authorized
- **THEN** the agent asks the composition-gate question in the user's language instead of creating the component silently

#### Scenario: Existing scoped authorization

- **WHEN** the user has already approved the required token or shared component in the current task
- **THEN** the native pass records that decision and continues without asking for the same approval again

### Requirement: Governance platform tailoring

The Required Companion Skill section SHALL state which ds-governance rules have native counterparts and which do not apply, covering at minimum: Storybook stories map to SwiftUI `#Preview` and Compose `@Preview`; hover states map to pressed and focused states; CSS keyframes and cubic-bezier curves map to SwiftUI animation curves and Compose `AnimationSpec`; pixel breakpoints map to size classes and window size classes; and the shared component directory maps to the native component library locations defined in repo discovery. The section SHALL state that governance still applies across platforms without requiring web-specific tools.

#### Scenario: Agent implements a native target

- **WHEN** the agent loads ds-governance and applies governance to SwiftUI or Compose
- **THEN** the tailoring guidance tells it the native counterpart for each, and it applies governance instead of concluding the skill does not apply to native work
