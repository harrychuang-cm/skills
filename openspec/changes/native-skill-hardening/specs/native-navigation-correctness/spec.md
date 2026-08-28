## ADDED Requirements

### Requirement: Return transitions respect their kind

The ingestion contract SHALL extract each transition's kind alongside its trigger, presentation, and back behavior. The implementation rules SHALL implement a transition whose kind is return as a return action driven by its back behavior, defaulting to a single-step back when the back behavior is absent. The push default for a missing presentation SHALL apply only to transitions whose kind is not return.

#### Scenario: Return transition without presentation

- **WHEN** a transition declares kind return, back behavior dismiss, and no presentation
- **THEN** it is implemented as dismissing the presented surface, not as pushing a new destination

#### Scenario: Forward transition without presentation

- **WHEN** a non-return transition declares no presentation
- **THEN** it is implemented as a push and the assumption is recorded as a divergence

##### Example: default resolution

| kind | presentation | backBehavior | Implemented as |
| ---- | ------------ | ------------ | -------------- |
| return | absent | dismiss | dismiss the sheet or cover |
| return | absent | absent | single-step back |
| primary | absent | — | push, recorded as a divergence |
| primary | sheet | dismiss | sheet presentation dismissed by gesture |

### Requirement: Executable navigation mapping

The navigation mapping tables SHALL express each cell as the actual API call shape for its platform rather than a conceptual label, and SHALL be technically correct: returning to the flow root SHALL be expressed as popping up to the start destination without inclusive removal, while a root replacement SHALL be expressed as navigating with inclusive removal of the previous root. Each table SHALL state that the shapes are the contract's intent and must be adapted to the app's existing router rather than introducing a second navigation system.

#### Scenario: Pop to root versus replace

- **WHEN** one transition declares back behavior popToRoot and another declares presentation replace
- **THEN** the first maps to popping up to the start destination while keeping it, and the second maps to navigating with the previous root removed — the two are not expressed with the same call

#### Scenario: App with an existing router

- **WHEN** the target app routes through its own coordinator or router abstraction
- **THEN** the mapping is applied through that abstraction instead of adding a parallel navigation stack

### Requirement: Flow skeleton usage

The skill SHALL document how to use the generated native navigation skeletons: the command that produces them, where their output belongs in the target project, that they are scaffolding to adapt into the existing router rather than finished code, and when to regenerate them — whenever the flow metadata changes in a newer handoff version.

#### Scenario: Handoff updated with new routes

- **WHEN** a newer handoff version adds routes to the flow metadata
- **THEN** the skeleton is regenerated and the differences are reconciled with the app's router, rather than the new routes being hand-added
