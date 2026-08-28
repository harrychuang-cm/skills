## MODIFIED Requirements

### Requirement: Presentation coverage check for app targets

In --handoff-ready mode, when an app target is in scope, validate_prototype.py SHALL check every transition whose kind is not return for a presentation value. The app-target determination SHALL prefer the typed meta surface declaration: a surface target of app or hybrid puts the app target in scope, and a surface target of web or package does not. When the meta declares no surface, the validator SHALL fall back to the legacy behavior of parsing the PRODUCTION_HANDOFF Target Surfaces section for a native app, hybrid app, or cross-platform target. A missing presentation SHALL be reported as a warning, and --strict-style SHALL upgrade it to an error. When no app target is in scope, the check SHALL not run.

#### Scenario: App target with uncovered transitions

- **WHEN** Target Surfaces declares a native app and three primary transitions have no presentation value
- **THEN** --handoff-ready reports three warnings naming the transitions, and adding --strict-style turns them into errors

#### Scenario: Web-only target

- **WHEN** Target Surfaces declares web only
- **THEN** transitions without presentation produce no finding

#### Scenario: Typed surface wins over prose

- **WHEN** the meta declares surface target web while the PRODUCTION_HANDOFF prose still mentions a native app target
- **THEN** the typed declaration governs and the presentation coverage check does not run

#### Scenario: Hybrid surface puts the app target in scope

- **WHEN** the meta declares surface target hybrid and a non-return transition lacks presentation
- **THEN** --handoff-ready reports the warning without consulting the PRODUCTION_HANDOFF prose
