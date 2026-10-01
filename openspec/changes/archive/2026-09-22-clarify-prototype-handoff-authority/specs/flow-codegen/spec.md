## MODIFIED Requirements

### Requirement: Flow JSON export

The standard-library export_flow.py script SHALL parse *PrototypeFlow.ts with existing validation helpers and write docs/flow.json with flowSchemaVersion 1, feature, routes, nodes and transitions. Routes SHALL preserve id, title, navigationId and declared component, description, params, deepLink and viewport. Nodes SHALL preserve id, title, shape and declared tone and description. Transitions SHALL preserve from, to, trigger, label and declared kind, presentation, backBehavior, motion and motionRef. Declared top-level viewport SHALL be retained and absent viewport SHALL remain omitted. Layout-only flowPosition, sourceAnchor and flowLine SHALL be excluded. Missing flow files or routes SHALL produce a named error and non-zero exit. Skeleton comments SHALL preserve motion intent and keep unspecified navigation unasserted.

#### Scenario: Export strips layout fields
- **WHEN** flow metadata contains layout fields alongside motion custom and a motionRef
- **THEN** JSON SHALL preserve motion and motionRef and omit the three layout-only fields

#### Scenario: Missing flow file
- **WHEN** no *PrototypeFlow.ts exists
- **THEN** the command SHALL name the expected pattern and exit non-zero

#### Scenario: Viewport included for declaring flows and omitted for legacy flows
- **WHEN** one flow declares desktop 1280 by 800 and another declares no viewport
- **THEN** only the first export SHALL contain that top-level viewport and both SHALL keep flowSchemaVersion 1
