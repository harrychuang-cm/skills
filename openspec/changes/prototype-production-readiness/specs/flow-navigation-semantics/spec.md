## ADDED Requirements

### Requirement: Navigation metadata fields on the flow contract

The flow template's Route type SHALL gain two optional fields: params, an array of name and type pairs describing route parameters, and deepLink, a string pattern for deep-link entry. The Transition type SHALL gain two optional fields: presentation, restricted to the values push, modal, sheet, fullscreen, and replace, and backBehavior, restricted to the values pop, popToRoot, dismiss, and none. Existing prototypes that define none of these fields SHALL remain valid without modification. The ui-flow-contract reference SHALL document the semantics of each field.

#### Scenario: Legacy flow file without navigation fields

- **WHEN** validate_prototype.py runs against a prototype whose flow file predates these fields
- **THEN** validation passes with no new errors attributable to the absent fields

#### Scenario: Transition with presentation semantics

- **WHEN** a transition declares presentation sheet and backBehavior dismiss
- **THEN** the flow contract validates and downstream consumers can read both values from the transitions array

### Requirement: Production navigation map table

The FLOW_SPEC.md template's Production Navigation Map section SHALL be a table with one row per route id and columns for the web path, the iOS destination, and the Android route, replacing the previous prose placeholder. Rows for platforms out of scope SHALL record the literal text Not in scope.

#### Scenario: Filling the navigation map for a web-only product

- **WHEN** the product targets web only
- **THEN** every row maps its route id to a web path and records Not in scope in the iOS and Android columns

### Requirement: Presentation coverage check for app targets

In --handoff-ready mode, when the PRODUCTION_HANDOFF Target Surfaces section declares a native app, hybrid app, or cross-platform target, validate_prototype.py SHALL check every transition whose kind is not return for a presentation value. A missing presentation SHALL be reported as a warning, and --strict-style SHALL upgrade it to an error. When no app target is declared, the check SHALL not run.

#### Scenario: App target with uncovered transitions

- **WHEN** Target Surfaces declares a native app and three primary transitions have no presentation value
- **THEN** --handoff-ready reports three warnings naming the transitions, and adding --strict-style turns them into errors

#### Scenario: Web-only target

- **WHEN** Target Surfaces declares web only
- **THEN** transitions without presentation produce no finding
